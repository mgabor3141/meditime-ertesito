import {sendEmails} from './email'
import {getData} from './get'
import {populateCalendars} from './calendar'

const main = async () => {
  const data = await getData()

  const diff = await populateCalendars(data)

  await sendEmails(diff)
}

main()
