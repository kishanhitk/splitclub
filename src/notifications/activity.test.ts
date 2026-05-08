import { describe, expect, test } from 'bun:test'
import { seedLedger } from '../data/seed'
import { buildLedgerNotifications, mapEventToNotification, notificationTypeForEvent } from './activity'

describe('account activity notifications', () => {
  test('maps audit events to Splitwise-style notification categories', () => {
    expect(notificationTypeForEvent({ entityType: 'expense', action: 'created' })).toBe('expense_added')
    expect(notificationTypeForEvent({ entityType: 'expense', action: 'commented' })).toBe('comment_added')
    expect(notificationTypeForEvent({ entityType: 'expense', action: 'converted' })).toBe('group_currency_conversion')
    expect(notificationTypeForEvent({ entityType: 'settlement', action: 'recorded' })).toBe('payment_recorded')
    expect(notificationTypeForEvent({ entityType: 'membership', action: 'removed' })).toBe('group_removed')
  })

  test('builds newest-first ledger notifications with read state', () => {
    const notifications = buildLedgerNotifications(seedLedger, new Set(['expense-e5-created']))
    expect(notifications[0]).toMatchObject({
      id: 'expense-e5-created',
      type: 'payment_recorded',
      title: 'Payment recorded',
      read: true,
    })
    expect(notifications.some((item) => item.type === 'expense_added')).toBe(true)
  })

  test('uses human copy from event payloads', () => {
    const notification = mapEventToNotification({
      id: 'audit-1',
      actorId: 'kishan',
      entityType: 'expense',
      entityId: 'e1',
      action: 'commented',
      payload: { body: 'Please check the receipt.' },
      createdAt: '2026-05-08T00:00:00.000Z',
    })
    expect(notification).toMatchObject({
      splitwiseType: 3,
      title: 'Comment added',
      body: 'Please check the receipt.',
      read: false,
    })
  })
})
