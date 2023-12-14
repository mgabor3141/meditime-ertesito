import {options} from './options'

export type User = {
  name?: string
  email: string
}

export type Users = Record<string, User>

// @ts-expect-error old types
export const users: Users = options.users.reduce
  ? options.users.reduce((acc, {id, ...rest}) => {
      acc[id] = rest
      return acc
    }, {} as Users)
  : options.users
