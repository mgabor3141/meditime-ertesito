import axiosCookieJarSupport from 'axios-cookiejar-support'
import axios from 'axios'
import tough from 'tough-cookie'
import {Entry, parse, parseNight, parseWardIds} from './parse'
import {promises as fs} from 'fs'
import _ from 'lodash'

export type WardIds = Record<string, string>

export type Data = {
  entries: Entry[]
  wardIds: WardIds
}

const getDateForMonth = (month: number) => {
  const date = new Date()
  date.setDate(1)
  date.setMonth(date.getMonth() + month)
  return date.toISOString().split('T')[0].replace(/-/g, '.')
}

export const getData = async (): Promise<Data> => {
  if (process.env.DEVELOPMENT === 'true')
    return {
      entries: JSON.parse((await fs.readFile('data/entries.json')).toString()),
      wardIds: JSON.parse((await fs.readFile('data/ward_ids.json')).toString()),
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

  process.stdout.write(`Retrieving shifts for current month... `)
  const {data: currentMonthHtml} = await meditime.post(
    'WardSchedule/MonthlyInitGrouped?doctor=True',
    'X-Requested-With=XMLHttpRequest',
    {
      headers: {
        referer: 'https://meditime.today/Main/Default',
      },
    },
  )

  let entries = parse(currentMonthHtml)
  console.log(`Done! ${entries.length} entries so far`)

  const wardIds = parseWardIds(currentMonthHtml)

  for (let month = 0; true; ++month) {
    process.stdout.write(`Retrieving ${month + 1} month ahead... `)

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
    process.stdout.write('Done!')

    if (!newEntries.length) {
      process.stdout.write('\n')
      break
    }

    entries = [...entries, ...newEntries]
    process.stdout.write(` ${entries.length} entries so far\n`)
  }

  // Night shift schedule
  const {data: currentMonthNightShiftHtml} = await meditime.post(
    'GlobalSchedule/Init?isMonthly=True',
    'X-Requested-With=XMLHttpRequest',
    {
      headers: {
        referer: 'https://meditime.today/Main/Default',
      },
    },
  )

  entries = [...entries, ...parseNight(currentMonthNightShiftHtml)]

  for (let month = 0; true; ++month) {
    process.stdout.write(
      `Retrieving night shifts for ${month + 1} month ahead... `,
    )

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
    process.stdout.write('Done!')

    if (!newEntries.length) {
      process.stdout.write('\n')
      break
    }

    entries = [...entries, ...newEntries]
    process.stdout.write(` ${entries.length} entries so far\n`)
  }

  entries = _.uniqBy(entries, ({Id}) => Id)

  await fs.writeFile('data/entries.json', JSON.stringify(entries))

  return {entries, wardIds}
}
