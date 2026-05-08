import type { UpcomingRecurringExpense } from '../domain/split'

export type ReminderNotificationPlan = {
  identifier: string
  sourceExpenseId: string
  title: string
  body: string
  triggerAt: string
}

export function buildReminderNotifications(
  upcoming: UpcomingRecurringExpense[],
  options: { hour?: number; minute?: number } = {},
): ReminderNotificationPlan[] {
  const hour = options.hour ?? 9
  const minute = options.minute ?? 0
  return upcoming
    .filter((expense) => Boolean(expense.reminderDate))
    .map((expense) => {
      const triggerAt = new Date(`${expense.reminderDate}T00:00:00.000Z`)
      triggerAt.setUTCHours(hour, minute, 0, 0)
      return {
        identifier: `recurring:${expense.sourceExpenseId}:${expense.reminderDate}`,
        sourceExpenseId: expense.sourceExpenseId,
        title: `Upcoming bill: ${expense.description}`,
        body: `${expense.currency} ${expense.amount.toFixed(2)} due ${expense.dueDate}`,
        triggerAt: triggerAt.toISOString(),
      }
    })
}

export function countScheduledForExpense(plans: ReminderNotificationPlan[], sourceExpenseId: string) {
  return plans.filter((plan) => plan.sourceExpenseId === sourceExpenseId).length
}
