import {readFileSync} from 'fs'
import {User} from './users'

export type Options = {
  logLevel: string
  users: (User & {id: number})[]
  onePerDay: string[]
}

// This is different to root/data, this is a special volume mounted by HA
const OPTIONS_PATH = process.env.HA_OPTIONS_PATH || '/data/options.json'

export const options: Options = JSON.parse(
  readFileSync(OPTIONS_PATH).toString(),
)
