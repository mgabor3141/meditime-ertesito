import {Data} from './get'
import {google} from 'googleapis'
import {users} from './users'
import {
  CalendarEvent,
  calendarTimeToDate,
  entryToEvent,
  processEvents,
} from './events'
import {retry} from './helpers'
import _ from 'lodash'
import {scriptStartDate} from './dates'

const auth = new google.auth.GoogleAuth({
  keyFile: `${process.env.DATA_PATH}/calendar-service-account.json`,
  scopes: ['https://www.googleapis.com/auth/calendar'],
})

const calendar = google.calendar({version: 'v3', auth})

const errorCode = (error: unknown, code: number) =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === code

const addEvent = async (calendarId: string, event: CalendarEvent) => {
  console.log(
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
  console.log('Removing', eventId)

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
  const {
    data: {items: calendars},
  } = await calendar.calendarList.list({
    fields: 'items(id,summary,description)',
  })

  const diff: Diff = {}
  const calendarIds: Record<string, string> = {}

  for (const [userId, {email, name}] of Object.entries(users)) {
    diff[userId] = {added: [], removed: []}

    let calendarId = calendars?.find(({description}) =>
      description?.startsWith(userId.toString()),
    )?.id

    // Create calendar if it doesn't exist yet
    if (!calendarId) {
      console.log('Creating calendar for', email)

      const {
        data: {id: newCalendarId},
      } = await calendar.calendars.insert({
        requestBody: {
          summary: `Meditime - ${name}`,
          description: userId,
        },
      })

      if (!newCalendarId) throw new Error('Could not create calendar')

      console.log('New calendar ID:', newCalendarId)

      await calendar.acl.insert({
        calendarId: newCalendarId,
        requestBody: {
          scope: {type: 'user', value: process.env.SENDER_EMAIL},
          role: 'owner',
        },
      })

      calendarId = newCalendarId
    }

    calendarIds[userId] = calendarId

    console.log(`Processing calendar for ${name} ${userId}`)

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
