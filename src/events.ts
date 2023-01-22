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
  const day = new Date(`${date}Z`)
  const nextDay = new Date(`${date}Z`)
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

const dateFormat = (
  date: string | Date,
  time: string,
  dayOffset?: number,
): CalendarTime => {
  if (typeof date === 'string') date = new Date(`${date}Z`)

  if (dayOffset) date.setDate(date.getDate() + dayOffset)

  return {
    dateTime: `${date.toISOString().split('T')[0]}T${time}`,
    timeZone: 'Europe/Budapest',
  }
}

const muszak = (Type: LabelTypes, date: string): CalendarTiming => {
  const day = new Date(`${date}Z`)

  let delelott =
    day.getDay() === 5 ? !(weekNumber(day) % 2) : !(day.getDay() % 2)

  if (Type === 'M2') delelott = !delelott

  return delelott
    ? {
        start: dateFormat(day, '07:30:00'),
        end: dateFormat(day, '13:30:00'),
      }
    : {
        start: dateFormat(day, '13:30:00'),
        end: dateFormat(day, '19:30:00'),
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

  return _.get(
    {
      M1: muszak(Type, date),
      M2: muszak(Type, date),
      HM: {
        start: dateFormat(date, '07:30:00'),
        end: dateFormat(date, '19:30:00'),
      },
      ÜGY: {
        start: dateFormat(date, '19:30:00'),
        end: dateFormat(date, '07:30:00', 1),
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
  const {Type, Text, WardId} = entry
  const wardName = WardId
    ? _.get(wardIds, WardId, (id: number) => {
        console.log(
          `No ward name found for ID: ${id}\nEvent details: ${JSON.stringify(
            entry,
          )}`,
        )
        return `ID${WardId}`
      })
    : '???'

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
    description: `${Text}\nOsztály: ${wardName}`,
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
