import {getData} from './get'
import {populateCalendars} from './calendar'

const main = async () => {
  const data = await getData()

  const diff = await populateCalendars(data)

  console.log(JSON.stringify(diff))
}

main()
