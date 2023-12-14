import {readFileSync} from 'fs'
import {WardIds} from './get'
import {User} from './users'

export type Options = {
  logLevel: string
  users: (User & {id: number})[]
  onePerDay: string[]
  wardIds: WardIds
  rollbarAccessToken: string
  googleAuthCredentials: unknown
}

// This is different to root/data, this is a special volume mounted by HA
const OPTIONS_PATH = process.env.HA_OPTIONS_PATH || '/data/options.json'

const error = () => {
  throw new Error('Environment variable not set')
}

export const options: Options =
  process.env.READ_FROM_ENV === 'true'
    ? {
        logLevel: process.env.LOG_LEVEL,
        onePerDay: JSON.parse(process.env.ONE_PER_DAY || '[]'),
        users: JSON.parse(process.env.USERS || error()),
        wardIds: JSON.parse(process.env.WARD_IDS || error()),
        rollbarAccessToken: process.env.ROLLBAR_ACCESS_TOKEN,
        googleAuthCredentials: JSON.parse(
          process.env.GOOGLE_AUTH_CREDENTIALS || error(),
        ),
      }
    : {
        ...JSON.parse(readFileSync(OPTIONS_PATH).toString()),
      }
