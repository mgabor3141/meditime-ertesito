import pino from 'pino'
import {options} from './options'

export const log = pino({
  transport: {
    target: 'pino-pretty',
  },
  level: options.logLevel,
})
