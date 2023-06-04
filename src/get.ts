import _ from 'lodash'
import puppeteer, {ElementHandle, Page} from 'puppeteer'
import {LabelTypes} from './events'
import {filterFunction, mapFunction} from './filter'
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

  if (res.length === 0) throw new Error(`Not found: ${path}`)

  return res[0] as ElementHandle<Element>
}

const clickXPath = async (page: Page, path: string) =>
  await (await xPath(page, path)).click()

export const getData = async (): Promise<Entry[]> => {
  if (process.env.LOCAL_SOURCE === 'true') {
    console.log('Retrieving shifts from file instead of Meditime')
    return JSON.parse(
      (await fs.readFile(`${process.env.DATA_PATH}/entries.json`)).toString(),
    )
  }

  if (!process.env.MEDITIME_USERNAME || !process.env.MEDITIME_PASSWORD)
    throw new Error('No username/password found in env')

  console.log(`[${Math.floor(process.uptime())}s] Opening Meditime`)

  // Prepare page
  const browser = await puppeteer.launch({
    defaultViewport: {width: 1080, height: 700},
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    headless: process.env.HEADLESS === 'false' ? false : 'new',
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

    console.log(`[${Math.floor(process.uptime())}s] Preparing`)

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

    if (entries.length === 0) throw new Error('No shift entries found!')
    const shiftEntries = entries.length

    process.stdout.write(
      ` [${Math.floor(process.uptime())}s] Done! ${
        entries.length
      } entries so far\n[${Math.floor(
        process.uptime(),
      )}s] Retrieving night shifts`,
    )

    // Night shifts
    await page.goto('https://meditime.today/dutySchedule')

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

    if (entries.length === shiftEntries)
      throw new Error('No night entries found!')

    console.log(
      ` [${Math.floor(process.uptime())}s] Done! ${
        entries.length
      } entries total`,
    )

    // Labels to deduplicate within a given day
    const onePerDay: LabelTypes[] = JSON.parse(
      (
        await fs.readFile(`${process.env.DATA_PATH}/one_per_day.json`)
      ).toString(),
    )
    const filteredEntries = _.uniqWith(entries, filterFunction(onePerDay)).map(
      mapFunction(onePerDay),
    )

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

    return filteredEntries
  } catch (e) {
    const time = new Date().toUTCString()
    await page.screenshot({
      path: `${process.env.DATA_PATH}/screenshots/error_${time}.jpg`,
    })
    await fs.writeFile(
      `${process.env.DATA_PATH}/screenshots/error_${time}.txt`,
      e instanceof Error ? e.stack : e,
    )
    throw e
  } finally {
    await browser.close()
  }
}

type DocumentWithState = Document & {
  ___numTBody___?: number
  ___seenTBodyIncrease___?: true
}

const loadEverything = async (page: Page) => {
  // Wait for small spinner that replaces the month arrow button to disappear
  await page.waitForXPath('//button/div/i[contains(@class, "fa-spinner")]', {
    hidden: true,
  })

  await page.waitForXPath('//div[text()="Adatok betöltése folyamatban"]')
  await page.waitForFunction(
    () => {
      const table = document.getElementById('scheduleSimpleView')
      if (!table) return false

      const numTBody = table.getElementsByTagName('tbody').length

      if (
        (document as DocumentWithState).___numTBody___ !== undefined &&
        numTBody > (document as Required<DocumentWithState>).___numTBody___
      )
        (document as DocumentWithState).___seenTBodyIncrease___ = true
      ;(document as DocumentWithState).___numTBody___ = numTBody

      if (!(document as DocumentWithState).___seenTBodyIncrease___) return false

      const spinnerQuery = Array.from(
        table.querySelectorAll('div.text-center'),
      ).filter((div) => div.innerHTML === 'Adatok betöltése folyamatban')

      if (spinnerQuery.length === 0) {
        // True if we've seen an increase
        return (document as DocumentWithState).___seenTBodyIncrease___
      }

      document.scrollingElement?.scrollTo({
        left: 0,
        top: document.scrollingElement.scrollHeight,
      })
      const scrollBox = document.getElementById('dragToScrollContent')
      if (!scrollBox) return false

      scrollBox.scroll({
        left: 0,
        top: scrollBox.scrollHeight,
        behavior: 'smooth',
      })
      return false
    },
    {polling: 'mutation', timeout: 60_000},
  )
}
