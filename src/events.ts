import hash from 'object-hash'
import {Entry} from './parse'
import {WardIds} from './get'
import _ from 'lodash'
import {weekNumber} from 'weeknumber'

type CalendarTime = {
  date?: string | null
  dateTime?: string | null
  timeZone?: string | null
}

type CalendarTiming = {
  start: CalendarTime
  end: CalendarTime
  transparency?: 'opaque' | 'transparent'
  eventType?: 'outOfOffice'
}

export type CalendarEvent = CalendarTiming & {
  summary: string
  id: string
  description: string
}

export const calendarTimeToDate = (calendarTime: CalendarTime) =>
  calendarTime.dateTime
    ? new Date(calendarTime.dateTime?.replace(/Z$/, ''))
    : new Date(`${calendarTime.date}T00:00`)

const allDay = ({Date: date}: Entry): CalendarTiming => {
  const day = formatDate(date)
  const nextDay = formatDate(date)
  nextDay.setDate(day.getDate() + 1)

  return {
    start: {
      date: day.toISOString().split('T')[0],
    },
    end: {
      date: nextDay.toISOString().split('T')[0],
    },
    // // This doesn't work for some reason
    // ...(free && {
    //   transparency: 'transparent',
    //   eventType: 'outOfOffice',
    // }),
  }
}

const formatDate = (date: string | Date): Date => {
  let formattedDate: string | Date = date

  if (typeof date === 'string' && date.match(/^\d{8}$/))
    formattedDate = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(
      6,
      8,
    )}`

  if (typeof formattedDate === 'string' && formattedDate.includes('-'))
    formattedDate = new Date(`${formattedDate}Z`)

  if (!(formattedDate instanceof Date))
    throw `Not sure how to format this "date": ${date}`

  return formattedDate
}

const dateToCalendarTime = (
  date: Date,
  time: string,
  dayOffset?: number,
): CalendarTime => {
  if (dayOffset) date.setDate(date.getDate() + dayOffset)

  return {
    dateTime: `${date.toISOString().split('T')[0]}T${time}`,
    timeZone: 'Europe/Budapest',
  }
}

const muszak = (Type: LabelTypes, day: Date): CalendarTiming => {
  let delelott =
    day.getDay() === 5 ? !(weekNumber(day) % 2) : !(day.getDay() % 2)

  if (Type === 'M2') delelott = !delelott

  return delelott
    ? {
        start: dateToCalendarTime(day, '07:30:00'),
        end: dateToCalendarTime(day, '13:30:00'),
      }
    : {
        start: dateToCalendarTime(day, '13:30:00'),
        end: dateToCalendarTime(day, '19:30:00'),
      }
}

export type LabelTypes =
  | 'BET'
  | 'HM'
  | 'KGY'
  | 'M1'
  | 'M2'
  | 'NSZB'
  | 'PIH'
  | 'SZAB'
  | 'SZB'
  | 'TAN'
  | 'ÜGY'

const getTiming = (entry: Entry): CalendarTiming => {
  const {Type, Date: date} = entry
  const formattedDate = formatDate(date)

  return _.get(
    {
      M1: muszak(Type, formattedDate),
      M2: muszak(Type, formattedDate),
      HM: {
        start: dateToCalendarTime(formattedDate, '07:30:00'),
        end: dateToCalendarTime(formattedDate, '19:30:00'),
      },
      ÜGY: {
        start: dateToCalendarTime(formattedDate, '19:30:00'),
        end: dateToCalendarTime(formattedDate, '07:30:00', 1),
      },
    },
    Type,
    allDay(entry),
  )
}

export const entryToEvent = (
  entry: Entry,
  wardIds: WardIds,
): CalendarEvent | null => {
  const {Type, WardId} = entry
  let wardName
  if (WardId && WardId in wardIds) {
    wardName = wardIds[WardId]
  } else {
    console.log(
      `No ward name found for ID: ${WardId}\n  Event details: ${JSON.stringify(
        entry,
      )}`,
    )
    wardName = `ID${WardId}`
  }

  if (
    !(
      WardId === 121 ||
      WardId === 122 ||
      WardId === 123 ||
      WardId === 156 ||
      WardId === 135
    ) &&
    (Type === 'M1' || Type === 'M2')
  )
    return null

  let summary: string = Type

  if (WardId && (Type === 'M1' || Type === 'M2' || Type === 'HM'))
    summary = `[${Type}] ${wardName}`

  const event = {
    ...getTiming(entry),
    id: '',
    summary,
    description: `Osztály: ${wardName}`,
  }

  event.id = hash(event, {excludeKeys: (key) => key === 'id'})

  return event
}

export const processEvents = (events: CalendarEvent[]): CalendarEvent[] => {
  return _.reduce(
    _.uniqBy(events, ({id}) => id),
    (accumulator, currentValue) => {
      if (!accumulator.length) return [currentValue]

      const indexForAdjacentEvent = _.findLastIndex(
        accumulator,
        (addedValue) =>
          !!addedValue.end.date &&
          addedValue.end.date === currentValue.start.date &&
          addedValue.summary === currentValue.summary,
      )

      if (indexForAdjacentEvent !== -1) {
        accumulator[indexForAdjacentEvent].end.date = currentValue.end.date
      } else {
        accumulator.push(currentValue)
      }

      return accumulator
    },
    [] as CalendarEvent[],
  )
}
