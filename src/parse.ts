import cheerio from 'cheerio'
import {LabelTypes} from './events'
import {WardIds} from './get'

export type Entry = {
  Id: number
  UserId: number
  WardId: number
  Date: string
  Text: string
  Type: LabelTypes
}

export const parse = (html: string): Entry[] => {
  const $ = cheerio.load(html)

  return $('table#monthlyViewedGroupedTable')
    .find('span.allowdragdrop')
    .toArray()
    .map((element) => {
      const entryData = JSON.parse(element.attribs.dragproperties)
      entryData.Type = $(element).parent().children('span.scheduleType').text()

      return entryData
    })
}

export const parseWardIds = (html: string): WardIds => {
  const $ = cheerio.load(html)

  return Object.fromEntries(
    $('select#ddWardIds')
      .find('option')
      .toArray()
      .map((node) => {
        const entry = $(node)
        return [
          entry.attr('value'),
          `${entry.parent().attr('label')} ${entry.text()}`.trim(),
        ]
      }),
  )
}
