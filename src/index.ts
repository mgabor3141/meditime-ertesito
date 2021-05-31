import dotenv from 'dotenv'
import axios from 'axios'
import axiosCookieJarSupport from 'axios-cookiejar-support'
import tough from 'tough-cookie'
import cheerio from 'cheerio'

dotenv.config()
axiosCookieJarSupport(axios)

const cookieJar = new tough.CookieJar()

const main = async () => {
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

  const {data: dailyHtml} = await meditime.post(
    'https://meditime.today/DailySchedule/Init',
    null,
    {
      params: {
        date: encodeURIComponent(new Date().toLocaleString()),
      },
      headers: {
        referer: 'https://meditime.today/Main/Default',
      },
    },
  )

  console.log(JSON.stringify(dailyHtml))

  console.log('\n\n=============################=============\n\n\n')

  const {data: monthlyHtml} = await meditime.post(
    'https://meditime.today/WardSchedule/MonthlyInitGrouped?doctor=True',
    'X-Requested-With=XMLHttpRequest',
    {
      headers: {
        referer: 'https://meditime.today/Main/Default',
      },
    },
  )

  const $ = cheerio.load(monthlyHtml)

  console.log($('#monthlyViewedGroupedTable').html())
}

main()
