import { describe, expect, test } from 'bun:test'
import { seedLedger } from '../data/seed'
import { calculateBalances, calculateOwedShares, searchExpenses, simplifyDebts } from './split'

describe('split engine', () => {
  test('splits percentages and preserves the total', () => {
    const dinner = seedLedger.expenses.find((expense) => expense.id === 'e2')
    expect(dinner).toBeDefined()

    const shares = calculateOwedShares(dinner!)
    expect(shares.reduce((sum, share) => sum + share.amount, 0)).toBe(6800)
    expect(shares.find((share) => share.memberId === 'dev')?.amount).toBe(2040)
  })

  test('calculates group balances in the requested currency', () => {
    const balances = calculateBalances(seedLedger, 'goa', 'INR')
    const kishan = balances.find((balance) => balance.memberId === 'kishan')
    expect(kishan?.amount).toBe(16300)
  })

  test('simplifies balances into minimal settlement suggestions', () => {
    const settlements = simplifyDebts(calculateBalances(seedLedger, 'goa', 'INR'), 'INR')
    expect(settlements).toHaveLength(3)
    expect(settlements[0]).toMatchObject({ to: 'kishan', currency: 'INR' })
  })

  test('finds expenses by notes, category, and currency', () => {
    expect(searchExpenses(seedLedger, 'recurring')).toHaveLength(1)
    expect(searchExpenses(seedLedger, 'usd')).toHaveLength(1)
    expect(searchExpenses(seedLedger, 'food')).toHaveLength(1)
  })
})
