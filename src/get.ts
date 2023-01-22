import puppeteer, {ElementHandle, Page} from 'puppeteer'
import {Entry, parse, parseNight, parseWardIds} from './parse'
import {promises as fs} from 'fs'
import {scriptStartDate} from './dates'

export type WardIds = Record<string, string>

export type Data = {
  entries: Entry[]
  wardIds: WardIds
}

const zeroPad = (num: number, places: number = 2) =>
  String(num).padStart(places, '0')

const xPath = async (
  page: Page,
  path: string,
): Promise<ElementHandle<Element>> => {
  await page.waitForXPath(path)

  const res = await page.$x(path)

  if (res.length === 0) throw `Not found: ${path}`

  return res[0] as ElementHandle<Element>
}

const clickXPath = async (page: Page, path: string) =>
  await (await xPath(page, path)).click()

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
      entries: JSON.parse(
        (await fs.readFile(`${process.env.DATA_PATH}/entries.json`)).toString(),
      ),
      wardIds: JSON.parse(
        (
          await fs.readFile(`${process.env.DATA_PATH}/ward_ids.json`)
        ).toString(),
      ),
    }
  }

  if (!process.env.MEDITIME_USERNAME || !process.env.MEDITIME_PASSWORD)
    throw 'No username/password found in env'

  console.log('Opening Meditime')

  // Prepare page
  const browser = await puppeteer.launch({
    defaultViewport: {width: 1280, height: 1600},
    // headless: false,
  })
  const page = await browser.newPage()

  try {
    await page.goto('https://meditime.today/wardSchedule')
    await page.waitForSelector('div.login input[type="text"]')

    // Log in
    console.log('Logging in')
    await page.type(
      'div.login input[type="text"]',
      process.env.MEDITIME_USERNAME,
    )
    await page.type(
      'div.login input[type="password"]',
      process.env.MEDITIME_PASSWORD,
    )
    await page.click('div.login input[type="checkbox"]')
    await page.click('div.login button.rz-button.btn-primary')
    await page.waitForSelector('table#scheduleSimpleView')

    // Prepare filters
    await clickXPath(
      page,
      "//div[contains(@class, 'rz-selectbutton')]/div/span[contains(text(), 'Orvos')]",
    )
    await clickXPath(
      page,
      "//div[contains(@class, 'rz-selectbutton')]/div/span[contains(text(), 'Havi')]",
    )

    process.stdout.write('Retrieving shifts')
    await page.waitForSelector('tbody')
    await clickXPath(page, '//button[@title="Egy hónapot vissza"]')

    await page.screenshot({path: 'screenshots/state.jpg'})
    await page.waitForSelector('button.buttonicons.loading')
    await page.waitForSelector('tbody')

    await page.screenshot({path: 'screenshots/state2.jpg'})

    // // Go back a month
    // const {data: firstMonthHtml} = await meditime.post(
    //   'WardSchedule/MoveCalendar',
    //   null,
    //   {
    //     params: {
    //       date: getDateForMonth(0),
    //       way: -1,
    //       isMonthly: true,
    //       isGrouped: true,
    //       isDoctor: true,
    //     },
    //     headers: {
    //       referer: 'https://meditime.today/Main/Default',
    //     },
    //   },
    // )
    //
    // let entries = parse(firstMonthHtml)
    // const wardIds = parseWardIds(firstMonthHtml)
    //
    // for (let month = -1; true; ++month) {
    //   process.stdout.write('.')
    //
    //   const {data: nextMonthHtml} = await meditime.post(
    //     'WardSchedule/MoveCalendar',
    //     null,
    //     {
    //       params: {
    //         date: getDateForMonth(month),
    //         way: 1,
    //         isMonthly: true,
    //         isGrouped: true,
    //         isDoctor: true,
    //       },
    //       headers: {
    //         referer: 'https://meditime.today/Main/Default',
    //       },
    //     },
    //   )
    //
    //   const newEntries = parse(nextMonthHtml)
    //
    //   if (!newEntries.length) break
    //
    //   entries = [...entries, ...newEntries]
    // }
    //
    // process.stdout.write(
    //   ` Done! ${entries.length} entries so far\nRetrieving night shifts`,
    // )
    //
    // // Night shift schedule
    // await meditime.post(
    //   'GlobalSchedule/Init?isMonthly=True',
    //   'X-Requested-With=XMLHttpRequest',
    //   {
    //     headers: {
    //       referer: 'https://meditime.today/Main/Default',
    //     },
    //   },
    // )
    //
    // const {data: firstMonthNightShiftHtml} = await meditime.post(
    //   'GlobalSchedule/MoveCalendar',
    //   null,
    //   {
    //     params: {
    //       date: getDateForMonth(0),
    //       way: -1,
    //       isMonthly: true,
    //     },
    //     headers: {
    //       referer: 'https://meditime.today/Main/Default',
    //     },
    //   },
    // )
    //
    // entries = [...entries, ...parseNight(firstMonthNightShiftHtml)]
    //
    // for (let month = -1; true; ++month) {
    //   process.stdout.write('.')
    //   const {data: nextMonthHtml} = await meditime.post(
    //     'GlobalSchedule/MoveCalendar',
    //     null,
    //     {
    //       params: {
    //         date: getDateForMonth(month),
    //         way: 1,
    //         isMonthly: true,
    //       },
    //       headers: {
    //         referer: 'https://meditime.today/Main/Default',
    //       },
    //     },
    //   )
    //
    //   const newEntries = parseNight(nextMonthHtml)
    //
    //   if (!newEntries.length) break
    //
    //   entries = [...entries, ...newEntries]
    // }
    //
    //   entries = [...entries, ...newEntries]
    // }
    //
    // console.log(` Done! ${entries.length} entries total`)
    // entries = _.uniqBy(entries, ({Id}) => Id)
    // console.log(`${entries.length} entries after filtering`)
    // if (process.env.WRITE_ENTRIES === 'true')
    //   await fs.writeFile(`${process.env.DATA_PATH}/entries.json`, JSON.stringify(entries))
    //
    // return {entries, wardIds}

    console.log('Got here')
    return {entries: [], wardIds: {}}
  } catch (e) {
    await page.screenshot({path: 'screenshots/error.jpg'})
    throw e
  }
}
