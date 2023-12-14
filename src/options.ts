import {readFileSync} from 'fs'
import {User} from './users'

export type Options = {
  logLevel: string
  users: (User & {id: number})[]
  onePerDay: string[]
  rollbarAccessToken: string
}

// This is different to root/data, this is a special volume mounted by HA
const OPTIONS_PATH = process.env.HA_OPTIONS_PATH || '/data/options.json'

export const options: Options =
  process.env.READ_FROM_ENV === 'true'
    ? {
        logLevel: process.env.LOG_LEVEL,
        rollbarAccessToken: process.env.ROLLBAR_ACCESS_TOKEN,
        onePerDay: JSON.parse(process.env.ONE_PER_DAY || '[]'),
        users: JSON.parse(process.env.USERS || '[]'),
      }
    : {
        ...JSON.parse(readFileSync(OPTIONS_PATH).toString()),
      }
