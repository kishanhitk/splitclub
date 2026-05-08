import { describe, expect, test } from 'bun:test'
import { buildReminderNotifications, countScheduledForExpense } from './reminders'

describe('reminder notification plans', () => {
  test('builds stable recurring bill notification identifiers', () => {
    const plans = buildReminderNotifications([
      {
        sourceExpenseId: 'rent',
        description: 'Monthly rent',
        dueDate: '2026-06-03',
        reminderDate: '2026-06-01',
        amount: 60000,
        currency: 'INR',
        recurrence: 'monthly',
      },
    ])

    expect(plans).toEqual([
      {
        identifier: 'recurring:rent:2026-06-01',
        sourceExpenseId: 'rent',
        title: 'Upcoming bill: Monthly rent',
        body: 'INR 60000.00 due 2026-06-03',
        triggerAt: '2026-06-01T09:00:00.000Z',
      },
    ])
    expect(countScheduledForExpense(plans, 'rent')).toBe(1)
  })
})
