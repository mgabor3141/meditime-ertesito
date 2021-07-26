import {sendEmails} from './email'
import {getData} from './get'
import {populateCalendars} from './calendar'

const main = async () => {
  const data = await getData()

  const {diff, calendarIds} = await populateCalendars(data)

  await sendEmails(diff, calendarIds)
}

main()
