import {Data} from './get'
import {google} from 'googleapis'
import {users} from './users'
import {CalendarEvent, entryToEvent, processEvents} from './events'
import {retry} from './helpers'
import _ from 'lodash'

const auth = new google.auth.GoogleAuth({
  keyFile: 'credentials/calendar-service-account.json',
  scopes: ['https://www.googleapis.com/auth/calendar'],
})

const calendar = google.calendar({version: 'v3', auth})

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
      if (error.code === 409)
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
      } catch (e) {
        if (e.code !== 403) bail(e)
      }
    })
  } catch (e) {
    if (e.code !== 409) throw e

    // Id already exists
    await retry(async (bail) => {
      try {
        return await calendar.events.update({
          calendarId,
          eventId: event.id,
          requestBody: event,
        })
      } catch (e) {
        if (e.code !== 403) bail(e)
      }
    })
  }
}

const removeEvent = async (calendarId: string, eventId: string) => {
  console.log('Removing', eventId)

  await retry(async (bail) => {
    try {
      return await calendar.events.delete({calendarId, eventId})
    } catch (e) {
      if (e.code !== 403) bail(e)
    }
  })
}

export const populateCalendars = async ({entries, wardIds}: Data) => {
  const {
    data: {items: calendars},
  } = await calendar.calendarList.list({
    fields: 'items(id,summary,description)',
  })

  for (const [id, {email}] of Object.entries(users)) {
    const calendarId = calendars?.find(({description}) =>
      description?.startsWith(id.toString()),
    )?.id

    if (!calendarId) throw new Error('Calendar not found')

    /**
     * # Create calendar if it doesn't exist yet
     if not calendar_id:
     print("Creating calendar for", name)

     new_calendar = calendar.calendars().insert(body={
                "summary": name
            }).execute()

     print("New calendar ID:", new_calendar["id"])

     calendar.acl().insert(calendarId=new_calendar["id"], body={
                'scope': {
                    'type': 'user',
                    'value': os.getenv("SENDER_EMAIL")
                },
                'role': 'owner'
            }).execute()

     calendar_id = new_calendar["id"]
     */

    console.log(`Processing calendar for ${id} ${email}`)

    const userEntries = processEvents(
      _.compact(
        entries
          .filter(({UserId}) => UserId.toString() === id)
          .map((entry) => entryToEvent(entry, wardIds)),
      ),
    )

    // Local events
    const localIds = new Set(userEntries.map((event) => event.id))

    console.log({localIds})

    // Get events from calendar
    const inCalendarIds = new Set(
      (
        await calendar.events.list({
          calendarId,
          maxResults: 2500,
          fields: 'items(id)',
        })
      ).data.items?.map(({id}) => id),
    )

    console.log({inCalendarIds})

    if (process.env.FORCE_REFRESH_EVENTS === 'true') {
      // Remove all events then add all events
      for (const eventId of [...inCalendarIds]) {
        eventId && (await removeEvent(calendarId, eventId))
      }
      for (const event of userEntries) {
        await addEvent(calendarId, event)
      }
      return
    }

    // Add missing entries
    for (const event of userEntries.filter(({id}) => !inCalendarIds.has(id))) {
      await addEvent(calendarId, event)
    }

    // Remove entries that are no longer valid
    for (const eventId of [...inCalendarIds].filter(
      (eventId) => eventId && !localIds.has(eventId),
    )) {
      eventId && (await removeEvent(calendarId, eventId))
    }
  }
}