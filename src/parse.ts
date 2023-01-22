import {Page} from 'puppeteer'
import {LabelTypes} from './events'

export type Entry = {
  Id?: number // Id now optional, as we can't guarantee to find it
  UserId: number
  Date: string
  Type: LabelTypes
  Text?: string
  WardId?: number
}

export const parseMonth = async (page: Page): Promise<Entry[]> =>
  await page.$$eval('td:not(.noschedule)', async (cells) =>
    (
      await Promise.all(
        cells.map(async (cell) => {
          // See reference folder to see what cells look like
          const idString = cell.querySelector('div.moreScheduleTd')?.id
          if (!idString) throw `No idString found in event:\n${cell.innerHTML}`
          const [Date, Id, UserId, WardId] = idString?.split('_')

          return Array.from(cell.querySelectorAll('div.dropzone span').values())
            .map((span) => span.textContent)
            .map((Type) => {
              if (!Type)
                throw `No labeltype (M1, TAN, etc) found in cell:\n${cell.innerHTML}`

              return {
                Type: Type.trim() as LabelTypes,
                Date,
                UserId: parseInt(UserId),
                WardId: parseInt(WardId),
              }
            })
        }),
      )
    ).flat(),
  )
