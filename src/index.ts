import {getData} from './get'
import {populateCalendars} from './calendar'

const main = async () => {
  const data = await getData()

  populateCalendars(data)
}

main()
