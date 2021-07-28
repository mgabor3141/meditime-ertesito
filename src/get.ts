import axiosCookieJarSupport from 'axios-cookiejar-support'
import axios from 'axios'
import tough from 'tough-cookie'
import {Entry, parse, parseNight, parseWardIds} from './parse'
import {promises as fs} from 'fs'
import _ from 'lodash'
import {scriptStartDate} from './dates'

export type WardIds = Record<string, string>

export type Data = {
  entries: Entry[]
  wardIds: WardIds
}

const zeroPad = (num: number, places: number = 2) =>
  String(num).padStart(places, '0')

const getDateForMonth = (month: number) => {
  const date = new Date(scriptStartDate)
  date.setDate(1)
  date.setMonth(date.getMonth() + month)
  return `${date.getFullYear()}.${zeroPad(date.getMonth() + 1)}.${zeroPad(
    date.getDate(),
  )}`
}

export const getData = async (): Promise<Data> => {
  if (process.env.LOCAL_SOURCE === 'true') {
    console.log('Retrieving shifts from file instead of Meditime')
    return {
      entries: JSON.parse((await fs.readFile('data/entries.json')).toString()),
      wardIds: JSON.parse((await fs.readFile('data/ward_ids.json')).toString()),
    }
  }

  axiosCookieJarSupport(axios)

  const cookieJar = new tough.CookieJar()

  const meditime = axios.create({
    baseURL: 'https://meditime.today/',
    withCredentials: true,
    jar: cookieJar,
  })

  await meditime.post('Login/LoggedIn', null, {
    params: {
      username: process.env.MEDITIME_USERNAME,
      password: process.env.MEDITIME_PASSWORD,
      rememberMe: false,
    },
  })

  process.stdout.write('Retrieving shifts')

  // Go to page
  await meditime.post(
    'WardSchedule/MonthlyInitGrouped?doctor=True',
    'X-Requested-With=XMLHttpRequest',
    {
      headers: {
        referer: 'https://meditime.today/Main/Default',
      },
    },
  )

  // Go back a month
  const {data: firstMonthHtml} = await meditime.post(
    'WardSchedule/MoveCalendar',
    null,
    {
      params: {
        date: getDateForMonth(0),
        way: -1,
        isMonthly: true,
        isGrouped: true,
        isDoctor: true,
      },
      headers: {
        referer: 'https://meditime.today/Main/Default',
      },
    },
  )

  let entries = parse(firstMonthHtml)
  const wardIds = parseWardIds(firstMonthHtml)

  for (let month = -1; true; ++month) {
    process.stdout.write('.')

    const {data: nextMonthHtml} = await meditime.post(
      'WardSchedule/MoveCalendar',
      null,
      {
        params: {
          date: getDateForMonth(month),
          way: 1,
          isMonthly: true,
          isGrouped: true,
          isDoctor: true,
        },
        headers: {
          referer: 'https://meditime.today/Main/Default',
        },
      },
    )

    const newEntries = parse(nextMonthHtml)

    if (!newEntries.length) break

    entries = [...entries, ...newEntries]
  }

  process.stdout.write(
    ` Done! ${entries.length} entries so far\nRetrieving night shifts`,
  )

  // Night shift schedule
  await meditime.post(
    'GlobalSchedule/Init?isMonthly=True',
    'X-Requested-With=XMLHttpRequest',
    {
      headers: {
        referer: 'https://meditime.today/Main/Default',
      },
    },
  )

  const {data: firstMonthNightShiftHtml} = await meditime.post(
    'GlobalSchedule/MoveCalendar',
    null,
    {
      params: {
        date: getDateForMonth(0),
        way: -1,
        isMonthly: true,
      },
      headers: {
        referer: 'https://meditime.today/Main/Default',
      },
    },
  )

  entries = [...entries, ...parseNight(firstMonthNightShiftHtml)]

  for (let month = -1; true; ++month) {
    process.stdout.write('.')
    const {data: nextMonthHtml} = await meditime.post(
      'GlobalSchedule/MoveCalendar',
      null,
      {
        params: {
          date: getDateForMonth(month),
          way: 1,
          isMonthly: true,
        },
        headers: {
          referer: 'https://meditime.today/Main/Default',
        },
      },
    )

    const newEntries = parseNight(nextMonthHtml)

    if (!newEntries.length) break

    entries = [...entries, ...newEntries]
  }

  console.log(` Done! ${entries.length} entries total`)
  entries = _.uniqBy(entries, ({Id}) => Id)
  console.log(`${entries.length} entries after filtering`)
  await fs.writeFile('data/entries.json', JSON.stringify(entries))

  return {entries, wardIds}
}
