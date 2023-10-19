import {options} from './options'

export type User = {
  name?: string
  email: string
}

export type Users = Record<string, User>

export const users: Users = options.users

export const isUser = (id: string) => Object.keys(users).includes(id)

export const getUser = (id: string) => users[id]
