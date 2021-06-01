import asyncRetry from 'async-retry'

export const retry = async <T>(fn: asyncRetry.RetryFunction<T>) =>
  await asyncRetry(fn, {
    minTimeout: 5000,
    onRetry: (error, retry) => console.log(`${error} Retrying... #${retry} `),
  })
