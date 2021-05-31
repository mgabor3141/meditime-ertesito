import dotenv from 'dotenv'
import axios from 'axios'
import axiosCookieJarSupport from 'axios-cookiejar-support'
import tough from 'tough-cookie'
import cheerio from 'cheerio'
import fs from 'fs'

dotenv.config()

const main = async () => {
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

  const {data: monthlyHtml} = await meditime.post(
    'https://meditime.today/WardSchedule/MonthlyInitGrouped?doctor=True',
    'X-Requested-With=XMLHttpRequest',
    {
      headers: {
        referer: 'https://meditime.today/Main/Default',
      },
    },
  )

  fs.writeFile('monthlyHtml.html', monthlyHtml, () => {})
}

// main()

fs.readFile('monthlyHtml.html', 'utf8', (err, data) => {
  const $ = cheerio.load(data)

  console.log(
    $('table#monthlyViewedGroupedTable')
      .find('span.allowdragdrop')
      .toArray()
      .map((element) => {
        const entryData = JSON.parse(element.attribs.dragproperties)
        entryData.Type = $(element)
          .parent()
          .children('span.scheduleType')
          .text()

        return entryData
      }),
  )

  console.log(
    Object.fromEntries(
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
    ),
  )
})
