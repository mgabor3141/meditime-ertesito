import pino from 'pino'
import {options} from './options'

export const log = pino({
  transport: {
    targets: [
      {
        level: options.logLevel,
        target: 'pino-pretty',
        options: {},
      },
      {
        level: 'info',
        target: '@t-botz/pino-rollbar-transport',
        options: {
          rollbarOpts: {
            accessToken: options.rollbarAccessToken,
            captureUncaught: true,
            captureUnhandledRejections: true,
          },
        },
      },
    ],
  },
})
