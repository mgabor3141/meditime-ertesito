import {promises as fs} from 'fs'
import {sendEmails} from './email'
import {getData} from './get'
import {populateCalendars} from './calendar'

const main = async () => {
  const data = await getData()

  const diff = await populateCalendars(data)

  // await fs.writeFile('data/diff.json', JSON.stringify(diff))
  // const diff = JSON.parse((await fs.readFile('data/diff.json')).toString())

  await sendEmails(diff)
}

main()
