import { describe, expect, test } from 'bun:test'
import { seedLedger } from '../data/seed'
import {
  calculateBalances,
  calculateOwedShares,
  convertExpensesToCurrency,
  getNextDueDate,
  getReminderDate,
  listUpcomingRecurringExpenses,
  searchExpenses,
  simplifyDebts,
  spendingTrend,
  summarizeCurrencyExposure,
} from './split'

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
    expect(searchExpenses(seedLedger, 'kishan')).toHaveLength(4)
    expect(searchExpenses(seedLedger, '2026-05-03')).toHaveLength(1)
    expect(searchExpenses(seedLedger, '60000')).toHaveLength(1)
  })

  test('builds spending trend by month', () => {
    expect(spendingTrend(seedLedger, 'goa', 'INR')).toEqual([{ month: '2026-05', amount: 30800 }])
    expect(spendingTrend(seedLedger, null, 'INR')[0].amount).toBe(1500)
  })

  test('summarizes and applies currency conversion without touching deleted expenses', () => {
    const ledger = {
      ...seedLedger,
      expenses: [
        ...seedLedger.expenses,
        {
          ...seedLedger.expenses[3],
          id: 'deleted-usd',
          groupId: 'goa',
          deletedAt: '2026-05-06T00:00:00.000Z',
        },
      ],
    }
    const exposure = summarizeCurrencyExposure(ledger, 'goa', 'USD')
    expect(exposure.find((item) => item.currency === 'INR')).toMatchObject({
      expenseCount: 3,
      convertedAmount: 384,
    })
    expect(exposure.find((item) => item.currency === 'USD')).toBeUndefined()

    const converted = convertExpensesToCurrency(ledger, 'goa', 'USD', 'kishan', '2026-05-08T00:00:00.000Z')
    expect(converted.defaultCurrency).toBe('USD')
    expect(converted.groups.find((group) => group.id === 'goa')?.defaultCurrency).toBe('USD')
    expect(converted.expenses.find((expense) => expense.id === 'e1')).toMatchObject({
      amount: 288,
      currency: 'USD',
    })
    expect(converted.expenses.find((expense) => expense.id === 'e2')?.receiptItems?.[0].amount).toBe(14.4)
    expect(converted.expenses.find((expense) => expense.id === 'e2')?.history?.[0]).toMatchObject({
      action: 'converted',
      memberId: 'kishan',
    })
    expect(converted.expenses.find((expense) => expense.id === 'deleted-usd')?.currency).toBe('USD')
  })

  test('generates upcoming recurring bills with reminder dates', () => {
    expect(getNextDueDate('2026-05-03', 'weekly')).toBe('2026-05-10')
    expect(getNextDueDate('2026-05-03', 'monthly')).toBe('2026-06-03')
    expect(getNextDueDate('2026-05-03', 'yearly')).toBe('2027-05-03')
    expect(getReminderDate('2026-06-03', 3)).toBe('2026-05-31')

    const upcoming = listUpcomingRecurringExpenses(seedLedger)
    expect(upcoming).toHaveLength(1)
    expect(upcoming[0]).toMatchObject({
      sourceExpenseId: 'e3',
      dueDate: '2026-06-03',
      reminderDate: '2026-05-31',
      recurrence: 'monthly',
    })
    expect(listUpcomingRecurringExpenses(seedLedger, ['e3'])).toHaveLength(0)
  })
})
