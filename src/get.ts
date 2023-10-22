import _ from 'lodash'
import puppeteer, {ElementHandle, Page} from 'puppeteer'
import {LabelTypes} from './events'
import {filterFunction, mapFunction} from './filter'
import {options} from './options'
import {Entry, parseMonth} from './parse'
import {promises as fs} from 'fs'
import {log} from './logger'

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
    log.info('Retrieving shifts from file instead of Meditime')
    return JSON.parse(
      (await fs.readFile(`${process.env.DATA_PATH}/entries.json`)).toString(),
    )
  }

  if (!process.env.MEDITIME_USERNAME || !process.env.MEDITIME_PASSWORD)
    throw new Error('No username/password found in env')

  log.info('Opening Meditime')

  // Prepare page
  const browser = await puppeteer.launch({
    defaultViewport: {width: 1080, height: 700},
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    headless: process.env.HEADLESS === 'false' ? false : 'new',
    protocolTimeout: 5 * 60_000,
  })
  const page = await browser.newPage()
  // await page.emulateCPUThrottling(16)

  try {
    await page.goto('https://meditime.today/')
    await page.waitForSelector('div.login input[type="text"]')

    // Log in
    log.info('Logging in')
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

    // Wait a bit to make sure that the home page is done loading
    await new Promise((r) => setTimeout(r, 20_000))

    await page.click('a[title="Részleg modul"]')
    await page.waitForSelector('a[href="/wardSchedule"]')
    await page.click('a[href="/wardSchedule"]')
    await page.waitForSelector('table#scheduleSimpleView')

    log.info('Preparing')

    log.trace('Prepare "Orvos" filter')
    // Prepare filters
    await clickXPath(
      page,
      '//div[contains(@class, "rz-selectbutton")]/div/span[contains(text(), "Orvos")]',
    )
    log.trace('Prepare "Havi" filter')
    await clickXPath(
      page,
      '//div[contains(@class, "rz-selectbutton")]/div/span[contains(text(), "Havi")]',
    )

    log.trace(
      'Click "fa-history" (jump to today) button and wait for page to scroll load',
    )
    // Not strictly necessary to load everything here
    await loadEverything(page, () =>
      clickXPath(page, '//button/div/i[contains(@class, "fa-history")]'),
    )

    log.trace('Click left button and wait for page to scroll load')
    await loadEverything(page, () =>
      clickXPath(
        page,
        '//button/div/i[contains(@class, "fa-angle-double-left")]',
      ),
    )

    const entries = []
    log.info('Retrieving shifts')
    for (;;) {
      log.trace('Starting to parse next month')
      const newEntries = await parseMonth(page)
      if (newEntries.length === 0) break
      entries.push(...newEntries)
      await loadEverything(page, () =>
        clickXPath(
          page,
          '//button/div/i[contains(@class, "fa-angle-double-right")]',
        ),
      )
    }

    if (entries.length === 0) throw new Error('No shift entries found!')
    const shiftEntries = entries.length

    log.info(`Done! ${entries.length} entries so far`)
    log.info('Retrieving night shifts')

    // Night shifts
    await page.click('a[title="Ügyelet modul"]')
    await page.waitForSelector('a[href="/dutySchedule"]')
    await page.click('a[href="/dutySchedule"]')
    await page.waitForSelector('table#scheduleSimpleView')

    await clickXPath(
      page,
      '//button/div/i[contains(@class, "fa-angle-double-left")]',
    )

    for (;;) {
      log.trace('Starting to parse next month')
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

    log.info(`Done! ${entries.length} entries total`)

    // Labels to deduplicate within a given day
    const onePerDay = options.onePerDay as LabelTypes[]
    const filteredEntries = _.uniqWith(entries, filterFunction(onePerDay)).map(
      mapFunction(onePerDay),
    )

    log.info(`${filteredEntries.length} entries after filtering`)
    if (process.env.WRITE_ENTRIES === 'true')
      await fs.writeFile(
        `${process.env.DATA_PATH}/entries.json`,
        JSON.stringify(filteredEntries),
      )

    return filteredEntries
  } catch (e) {
    log.fatal('Error')
    const time = new Date().toISOString()
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

const loadEverything = async (
  page: Page,
  interaction: () => Promise<unknown> = async () => {},
) => {
  await interaction()
  log.trace("Waiting for 'Adatok betöltése folyamatban' to appear")
  await page.waitForXPath('//div[text()="Adatok betöltése folyamatban"]')

  log.trace('Scroll loading page')
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
    {polling: 'mutation', timeout: 5 * 60_000},
  )

  // Wait until page becomes active after the above function
  await new Promise((r) => setTimeout(r, 3_000))
}
