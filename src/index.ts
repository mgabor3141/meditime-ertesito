import {promises as fs} from 'fs'
import {sendEmails} from './email'
import {getData} from './get'
import {populateCalendars} from './calendar'
import {log} from './logger'

const main = async () => {
  log.info('Starting...')
  const entries = await getData()

  const wardIds = JSON.parse(
    (await fs.readFile(`${process.env.DATA_PATH}/ward_ids.json`)).toString(),
  )

  const {diff, calendarIds} = await populateCalendars({entries, wardIds})

  await sendEmails(diff, calendarIds)

  log.info('Done!')
}

main()
