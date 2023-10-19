import {readFileSync} from 'fs'
import {User} from './users'

export type Options = {
  logLevel: string
  users: (User & {id: number})[]
  onePerDay: string[]
}

const OPTIONS_PATH = `${process.env.DATA_PATH}/options.json`

export const options: Options = JSON.parse(
  readFileSync(OPTIONS_PATH).toString(),
)
