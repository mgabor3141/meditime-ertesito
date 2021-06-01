import {getData} from './get'
import {populateCalendars} from './calendar'

const main = async () => {
  const data = await getData()

  await populateCalendars(data)
}

main()
