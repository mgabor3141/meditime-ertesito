import {Entry} from './parse'
import {WardIds} from './get'
import _ from 'lodash'
// @ts-expect-error No types
import {weekNumber} from 'weeknumber'

type CalendarTime = {
  date?: string
  dateTime?: string
  timeZone?: string
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

const allDay = ({Date: date}: Entry): CalendarTiming => {
  const day = new Date(date)
  const nextDay = new Date(date)
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

const dateFormat = (date: string | Date, time: string): CalendarTime => {
  if (typeof date === 'string') date = new Date(date)

  return {
    dateTime: `${date.toISOString().split('T')[0]}T${time}`,
    timeZone: 'Europe/Budapest',
  }
}

const muszak = (Type: LabelTypes, date: string): CalendarTiming => {
  const day = new Date(date)

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

const getTiming = (entry: Entry): CalendarTiming => {
  const {Type, Date: date} = entry

  const timing = _.get(
    {
      M1: muszak(Type, date),
      M2: muszak(Type, date),
      HM: {
        start: dateFormat(date, '07:30:00'),
        end: dateFormat(date, '19:30:00'),
      },
    },
    Type,
    allDay(entry),
  )

  if (!timing) return allDay(entry)

  return timing
}

export const entryToEvent = (
  entry: Entry,
  wardIds: WardIds,
): CalendarEvent | null => {
  const {Id, Type, Text, WardId} = entry

  if (
    !(WardId === 121 || WardId === 122 || WardId === 123 || WardId === 156) &&
    (Type === 'M1' || Type === 'M2')
  )
    return null

  let summary: string = Type

  if (Type === 'M1' || Type === 'M2' || Type === 'HM')
    summary = `[${Type}] ${wardIds[WardId]}`

  return {
    ...getTiming(entry),
    id: Id.toString(),
    summary,
    description: `${Text}\nid: ${Id}`,
  }
}

export const processEvents = (events: CalendarEvent[]): CalendarEvent[] => {
  return _.reduce(
    _.uniqBy(events, ({id}) => id),
    (accumulator, currentValue) => {
      if (!accumulator.length) return [currentValue]

      const indexForAdjacentEvent = _.findLastIndex(
        accumulator,
        (addedValue) =>
          addedValue.end.date === currentValue.start.date &&
          addedValue.summary === currentValue.summary,
      )

      if (indexForAdjacentEvent !== -1) {
        accumulator[indexForAdjacentEvent].end.date = currentValue.end.date
      } else {
        accumulator[accumulator.length] = currentValue
      }

      return accumulator
    },
    [] as CalendarEvent[],
  )
}