import asyncRetry from 'async-retry'
import {log} from './logger'

export const retry = async <T>(fn: asyncRetry.RetryFunction<T>) =>
  await asyncRetry(fn, {
    onRetry: (error, retry) => log.debug(`${error} Retrying... #${retry} `),
  })
