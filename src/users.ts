import {options} from './options'

export type User = {
  name?: string
  email: string
}

export type Users = Record<string, User>

export const users: Users = options.users.reduce((acc, {id, ...rest}) => {
  acc[id] = rest
  return acc
}, {} as Users)
