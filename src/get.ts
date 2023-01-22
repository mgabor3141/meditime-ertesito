import _ from 'lodash'
import puppeteer, {ElementHandle, Page} from 'puppeteer'
import {Entry, parseMonth} from './parse'
import {promises as fs} from 'fs'

export type WardIds = Record<string, string>

export type Data = {
  entries: Entry[]
  wardIds: WardIds
}

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

  console.log(`[${Math.floor(process.uptime())}s] Opening Meditime`)

  // Prepare page
  const browser = await puppeteer.launch({
    defaultViewport: {width: 1080, height: 800},
    args: ['--no-sandbox'],
    // headless: false,
  })
  const page = await browser.newPage()

  try {
    await page.goto('https://meditime.today/wardSchedule')
    await page.waitForSelector('div.login input[type="text"]')

    // Log in
    console.log(`[${Math.floor(process.uptime())}s] Logging in`)
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
      '//div[contains(@class, "rz-selectbutton")]/div/span[contains(text(), "Orvos")]',
    )
    await clickXPath(
      page,
      '//div[contains(@class, "rz-selectbutton")]/div/span[contains(text(), "Havi")]',
    )

    await clickXPath(page, '//button/div/i[contains(@class, "fa-history")]')
    // Not strictly necessary to load everything here
    await loadEverything(page)
    await clickXPath(
      page,
      '//button/div/i[contains(@class, "fa-angle-double-left")]',
    )

    const entries = []
    process.stdout.write(`[${Math.floor(process.uptime())}s] Retrieving shifts`)
    for (;;) {
      process.stdout.write('.')
      await loadEverything(page)
      const newEntries = await parseMonth(page)
      if (newEntries.length === 0) break
      entries.push(...newEntries)
      await clickXPath(
        page,
        '//button/div/i[contains(@class, "fa-angle-double-right")]',
      )
    }

    process.stdout.write(
      ` [${Math.floor(process.uptime())}s] Done! ${
        entries.length
      } entries so far\n[${Math.floor(
        process.uptime(),
      )}s] Retrieving night shifts`,
    )

    // Night shifts
    await page.goto('https://meditime.today/dutySchedule')

    await clickXPath(page, '//button/div/i[contains(@class, "fa-history")]')
    // Not strictly necessary to load everything here
    await loadEverything(page)
    await clickXPath(
      page,
      '//button/div/i[contains(@class, "fa-angle-double-left")]',
    )

    for (;;) {
      process.stdout.write('.')
      await loadEverything(page)
      const newEntries = await parseMonth(page)
      if (newEntries.length === 0) break
      entries.push(...newEntries)
      await clickXPath(
        page,
        '//button/div/i[contains(@class, "fa-angle-double-right")]',
      )
    }

    console.log(
      ` [${Math.floor(process.uptime())}s] Done! ${
        entries.length
      } entries total`,
    )
    const filteredEntries = _.uniqWith(entries, _.isEqual)
    console.log(
      `[${Math.floor(process.uptime())}s] ${
        filteredEntries.length
      } entries after filtering`,
    )
    if (process.env.WRITE_ENTRIES === 'true')
      await fs.writeFile(
        `${process.env.DATA_PATH}/entries.json`,
        JSON.stringify(entries),
      )

    return {
      entries: filteredEntries,
      wardIds: JSON.parse(
        (
          await fs.readFile(`${process.env.DATA_PATH}/ward_ids.json`)
        ).toString(),
      ),
    }
  } catch (e) {
    await page.screenshot({path: 'screenshots/error.jpg'})
    throw e
  }
}

const loadEverything = async (page: Page) => {
  const spinnerPath = '//div[text()="Adatok betöltése folyamatban"]'
  await page.waitForXPath(spinnerPath)

  for (;;) {
    const spinnerResults = await page.$x(spinnerPath)

    if (spinnerResults.length === 0) return

    const spinner = spinnerResults[0] as ElementHandle<Element>

    const numTBody = (await page.$x('tbody')).length
    const watchDog = page.waitForXPath(`//tbody[${numTBody + 1}]`) // XPath indexes from 1

    try {
      // This is sometimes not found by the time we get here so we ust return
      await spinner.click() // Scrolls into view
    } catch {
      // This may swallow unrelated exceptions...
      return
    }

    await watchDog
  }
}
