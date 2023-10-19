import asyncRetry from 'async-retry'
import {log} from './logger'

export const retry = async <T>(fn: asyncRetry.RetryFunction<T>) =>
  await asyncRetry(fn, {
    minTimeout: 5000,
    onRetry: (error, retry) => log.debug(`${error} Retrying... #${retry} `),
  })
