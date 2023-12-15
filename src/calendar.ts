import {Data} from './get'
import {calendar_v3, google} from 'googleapis'
import {log} from './logger'
import {options} from './options'
import {User, users} from './users'
import {
  CalendarEvent,
  calendarTimeToDate,
  entryToEvent,
  processEvents,
} from './events'
import {retry} from './helpers'
import _ from 'lodash'
import {scriptStartDate} from './dates'
import Schema$CalendarListEntry = calendar_v3.Schema$CalendarListEntry

const auth = new google.auth.GoogleAuth({
  credentials: options.googleAuthCredentials as any,
  scopes: ['https://www.googleapis.com/auth/calendar'],
})

const calendar = google.calendar({version: 'v3', auth})

const errorCode = (error: unknown, code: number) =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === code

const addEvent = async (calendarId: string, event: CalendarEvent) => {
  log.debug(
    `Adding ${event.summary} (${
      event.start.date ? event.start.date : event.start.dateTime
    } - ${event.end.date ? event.end.date : event.end.dateTime}) [${event.id}]`,
  )

  await retry(async () => {
    try {
      await calendar.events.insert({calendarId, requestBody: event})
    } catch (error) {
      if (errorCode(error, 409))
        calendar.events.update({
          calendarId,
          eventId: event.id,
          requestBody: event,
        })
      else throw error
    }
  })

  try {
    await retry(async (bail) => {
      try {
        return await calendar.events.insert({calendarId, requestBody: event})
      } catch (error) {
        if (!errorCode(error, 403)) bail(error as Error)
      }
    })
  } catch (error) {
    if (!errorCode(error, 409)) throw error

    // Id already exists
    await retry(async (bail) => {
      try {
        return await calendar.events.update({
          calendarId,
          eventId: event.id,
          requestBody: event,
        })
      } catch (error) {
        if (!errorCode(error, 403)) bail(error as Error)
      }
    })
  }
}

const removeEvent = async (calendarId: string, eventId: string) => {
  log.debug('Removing', eventId)

  await retry(async (bail) => {
    try {
      return await calendar.events.delete({calendarId, eventId})
    } catch (error) {
      if (!errorCode(error, 403)) bail(error as Error)
    }
  })
}

export type Diff = Record<
  string,
  {added: CalendarEvent[]; removed: CalendarEvent[]}
>

export const populateCalendars = async ({entries, wardIds}: Data) => {
  log.debug(`Processing calendars`)
  const {
    data: {items: calendars},
  } = await calendar.calendarList.list({
    fields: 'items(id,summary,description)',
  })

  const diff: Diff = {}
  const calendarIds: Record<string, string> = {}

  for (const user of Object.entries(users)) {
    const [userId] = user
    diff[userId] = {added: [], removed: []}

    const calendarId = await getCalendarId(calendars, user)
    calendarIds[userId] = calendarId

    log.trace(`Processing calendar for ${userId}`)

    const userEntries = processEvents(
      _.compact(
        entries
          .filter(({UserId}) => UserId.toString() === userId)
          .map((entry) => entryToEvent(entry, wardIds)),
      ),
    )

    // Local events
    const localIds = new Set(userEntries.map((event) => event.id))

    const beginningOfMonth = new Date(
      scriptStartDate.getFullYear(),
      scriptStartDate.getMonth(),
      1,
      0,
      0,
      0,
      0,
    )

    // Get events from calendar
    const inCalendarEvents = (
      await calendar.events.list({
        calendarId,
        timeMin: beginningOfMonth.toISOString(),
        maxResults: 2500,
        fields: 'items(id,start,end,summary,description)',
      })
    ).data.items?.filter(
      ({start}) => start && calendarTimeToDate(start) >= beginningOfMonth,
    )

    const inCalendarIds = new Set(inCalendarEvents?.map(({id}) => id))

    // Add missing entries
    for (const event of userEntries.filter(
      ({id, start}) =>
        !inCalendarIds.has(id) &&
        start &&
        calendarTimeToDate(start) >= beginningOfMonth,
    )) {
      await addEvent(calendarId, event)
      diff[userId].added.push(event)
    }

    // Remove entries that are no longer valid
    if (inCalendarEvents)
      for (const event of inCalendarEvents.filter(
        ({id}) => id && !localIds.has(id),
      )) {
        event.id && (await removeEvent(calendarId, event.id))
        diff[userId].removed.push(event as CalendarEvent)
      }
  }

  return {diff, calendarIds}
}

const getCalendarId = async (
  calendars: Schema$CalendarListEntry[] | undefined,
  user: [string, User],
): Promise<string> => {
  const [userId] = user
  const matchingCalendars = calendars?.filter(
    ({description}) => description?.startsWith(userId.toString()),
  )

  if (!matchingCalendars) {
    log.error("Couldn't get calendars")
    throw new Error("Couldn't get calendars")
  }

  if (matchingCalendars.length > 1) {
    log.warn(
      `Multiple calendars found for ${user[1].name}:\n${JSON.stringify(
        matchingCalendars,
      )}`,
    )
  }

  if (matchingCalendars.length >= 1 && matchingCalendars[0].id)
    return matchingCalendars[0].id
  else return await createCalendar(user)
}

const createCalendar = async ([userId, {name}]: [
  string,
  User,
]): Promise<string> => {
  log.debug('Creating calendar for', userId)

  const {
    data: {id: newCalendarId},
  } = await calendar.calendars.insert({
    requestBody: {
      summary: `Meditime - ${name}`,
      description: userId,
    },
  })

  if (!newCalendarId) throw new Error('Could not create calendar')

  log.info('New calendar ID:', newCalendarId)

  await calendar.acl.insert({
    calendarId: newCalendarId,
    requestBody: {
      scope: {type: 'user', value: process.env.SENDER_EMAIL},
      role: 'owner',
    },
  })

  return newCalendarId
}
