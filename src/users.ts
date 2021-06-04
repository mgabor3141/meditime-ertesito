import fs from 'fs'

export type User = {
  name?: string
  email: string
}

export type Users = Record<string, User>

export const users: Users = JSON.parse(
  fs.readFileSync('data/users.json').toString(),
)

export const isUser = (id: string) => Object.keys(users).includes(id)

export const getUser = (id: string) => users[id]
