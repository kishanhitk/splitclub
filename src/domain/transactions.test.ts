import { describe, expect, test } from 'bun:test'
import { inferTransactionCategory, parseImportedTransactions } from './transactions'

describe('transaction import', () => {
  test('parses common CSV headers and keeps quoted merchant names intact', () => {
    const transactions = parseImportedTransactions([
      'Transaction Date,Merchant,Amount,Currency',
      '2026-05-04,"Airport cab, terminal 2",-2400,INR',
      '2026-05-05,Dinner at Martins,-6800,INR',
    ].join('\n'))

    expect(transactions).toHaveLength(2)
    expect(transactions[0]).toMatchObject({
      date: '2026-05-04',
      description: 'Airport cab, terminal 2',
      amount: 2400,
      currency: 'INR',
      category: 'Transport',
    })
    expect(transactions[1]).toMatchObject({ category: 'Food' })
  })

  test('supports debit and credit statement variants', () => {
    const transactions = parseImportedTransactions([
      'Posted Date,Description,Debit,Credit,CCY',
      '05/06/2026,Beach villa stay,24000,,INR',
      '05/07/2026,Refund from hotel,,5000,INR',
    ].join('\n'))

    expect(transactions).toHaveLength(2)
    expect(transactions[0]).toMatchObject({ date: '2026-05-06', amount: 24000, category: 'Lodging' })
    expect(transactions[1]).toMatchObject({ date: '2026-05-07', amount: 5000, category: 'Lodging' })
  })

  test('parses headerless rows with a default currency', () => {
    const transactions = parseImportedTransactions('13/05/2026,Movie tickets,1800', 'USD')

    expect(transactions).toEqual([
      expect.objectContaining({
        date: '2026-05-13',
        description: 'Movie tickets',
        amount: 1800,
        currency: 'USD',
        category: 'Tickets',
      }),
    ])
  })

  test('infers fallback category for unknown merchants', () => {
    expect(inferTransactionCategory('Shared craft supplies')).toBe('General')
  })
})
