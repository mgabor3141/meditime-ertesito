import {describe, expect, test} from '@jest/globals'
import {getData} from './get'

describe('getData function', () => {
  test('returns the same thing when run twice', async () => {
    const data1 = await getData()
    const data2 = await getData()
    expect(data1).toEqual(data2)
  })
})
