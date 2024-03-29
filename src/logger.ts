import pino from 'pino'
import Rollbar from 'rollbar'
import {options} from './options'

export const log = pino({
  transport: {
    targets: [
      {
        level: options.logLevel,
        target: 'pino-pretty',
        options: {
          colorize: false,
        },
      },
      ...(options.rollbarAccessToken
        ? [
            {
              level: 'warn',
              target: '@t-botz/pino-rollbar-transport',
              options: {
                rollbarOpts: {
                  accessToken: options.rollbarAccessToken,
                },
              },
            },
          ]
        : []),
    ],
  },
})

if (options.rollbarAccessToken) {
  new Rollbar({
    accessToken: options.rollbarAccessToken,
    captureUncaught: true,
    captureUnhandledRejections: true,
    payload: {
      version: process.env.npm_package_version,
    },
  })
}
