import { describe, expect, test } from 'bun:test'
import { currencyCodes, priorityCurrencyCodes } from './currencies'

describe('currency catalog', () => {
  test('keeps common currencies first for the mobile picker', () => {
    expect(currencyCodes.slice(0, priorityCurrencyCodes.length)).toEqual([...priorityCurrencyCodes])
    expect(priorityCurrencyCodes).toEqual([
      'INR',
      'USD',
      'EUR',
      'GBP',
      'CAD',
      'AUD',
      'SGD',
      'AED',
      'JPY',
      'THB',
      'IDR',
      'MYR',
      'PHP',
      'HKD',
      'CHF',
      'SEK',
      'NOK',
      'DKK',
      'NZD',
      'ZAR',
    ])
  })

  test('covers a Splitwise-scale set of unique currency codes', () => {
    const uniqueCodes = new Set(currencyCodes)

    expect(currencyCodes.length).toBeGreaterThanOrEqual(100)
    expect(uniqueCodes.size).toBe(currencyCodes.length)
    expect([...uniqueCodes].every((code) => /^[A-Z]{3}$/.test(code))).toBe(true)
  })
})
