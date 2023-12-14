import {sendEmails} from './email'
import {getData} from './get'
import {populateCalendars} from './calendar'
import {log} from './logger'
import {options} from './options'

const main = async () => {
  log.info('Starting...')
  const entries = await getData()

  const wardIds = options.wardIds

  const {diff, calendarIds} = await populateCalendars({entries, wardIds})

  await sendEmails(diff, calendarIds)

  log.info('Done!')
}

main()
