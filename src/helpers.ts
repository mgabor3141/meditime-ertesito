import asyncRetry from 'async-retry'

export const getDateForMonth = (month: number) => {
  const date = new Date()
  date.setDate(1)
  date.setMonth(date.getMonth() + month)
  return date.toISOString().split('T')[0].replace(/-/g, '.')
}

export const retry = async <T>(fn: asyncRetry.RetryFunction<T>) =>
  await asyncRetry(fn, {
    minTimeout: 5000,
    onRetry: (error, retry) => console.log(`${error} Retrying... #${retry} `),
  })
