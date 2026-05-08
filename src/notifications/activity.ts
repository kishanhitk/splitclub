import type { Expense, Ledger } from '../domain/split'

export type AccountActivityEvent = {
  id: string
  actorId?: string
  entityType: string
  entityId: string
  action: string
  payload?: unknown
  createdAt: string
}

export type AccountNotification = {
  id: string
  splitwiseType: number
  type: string
  title: string
  body: string
  actorId?: string
  entityType: string
  entityId: string
  createdAt: string
  read: boolean
}

const splitwiseTypes: Record<string, number> = {
  expense_added: 0,
  expense_updated: 1,
  expense_deleted: 2,
  comment_added: 3,
  group_added: 4,
  group_removed: 5,
  group_deleted: 6,
  group_updated: 7,
  friend_added: 8,
  friend_removed: 9,
  news: 10,
  debt_simplification: 11,
  group_restored: 12,
  expense_restored: 13,
  group_currency_conversion: 14,
  friend_currency_conversion: 15,
  payment_recorded: 16,
  receipt_uploaded: 17,
}

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}

const textFromPayload = (payload: unknown, keys: string[]) => {
  const record = asRecord(payload)
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

const nestedText = (payload: unknown, parent: string, keys: string[]) => {
  const value = asRecord(payload)[parent]
  return textFromPayload(value, keys)
}

export function notificationTypeForEvent(event: Pick<AccountActivityEvent, 'entityType' | 'action'>) {
  if (event.entityType === 'expense') {
    if (event.action === 'created') return 'expense_added'
    if (event.action === 'updated') return 'expense_updated'
    if (event.action === 'deleted') return 'expense_deleted'
    if (event.action === 'restored') return 'expense_restored'
    if (event.action === 'commented') return 'comment_added'
    if (event.action === 'converted') return 'group_currency_conversion'
  }
  if (event.entityType === 'settlement' && event.action === 'recorded') return 'payment_recorded'
  if (event.entityType === 'group') {
    if (event.action === 'created') return 'group_added'
    if (event.action === 'deleted') return 'group_deleted'
    if (event.action === 'restored') return 'group_restored'
    return 'group_updated'
  }
  if (event.entityType === 'group_invite' || event.entityType === 'membership') {
    if (event.action === 'removed') return 'group_removed'
    return 'group_added'
  }
  if (event.entityType === 'friendship' || event.entityType === 'user') {
    if (event.action === 'removed') return 'friend_removed'
    return 'friend_added'
  }
  if (event.entityType === 'receipt') return 'receipt_uploaded'
  return 'news'
}

export function notificationCopyForEvent(event: AccountActivityEvent) {
  const type = notificationTypeForEvent(event)
  const expenseName =
    textFromPayload(event.payload, ['description', 'summary']) ??
    nestedText(event.payload, 'after', ['description']) ??
    nestedText(event.payload, 'before', ['description'])
  const groupName = textFromPayload(event.payload, ['name', 'groupName'])
  const commentBody = textFromPayload(event.payload, ['body'])

  if (type === 'expense_added') return { title: 'Expense added', body: expenseName ?? 'A new expense was added.' }
  if (type === 'expense_updated') return { title: 'Expense updated', body: expenseName ?? 'An expense was changed.' }
  if (type === 'expense_deleted') return { title: 'Expense deleted', body: expenseName ?? 'An expense was deleted.' }
  if (type === 'expense_restored') return { title: 'Expense restored', body: expenseName ?? 'An expense was restored.' }
  if (type === 'comment_added') return { title: 'Comment added', body: commentBody ?? expenseName ?? 'A comment was added.' }
  if (type === 'group_currency_conversion') return { title: 'Currency conversion', body: expenseName ?? groupName ?? 'Expenses were converted.' }
  if (type === 'payment_recorded') return { title: 'Payment recorded', body: expenseName ?? 'A settlement was recorded.' }
  if (type === 'group_added') return { title: 'Group activity', body: groupName ?? 'Group membership changed.' }
  if (type === 'group_removed') return { title: 'Removed from group', body: groupName ?? 'A group member was removed.' }
  if (type === 'friend_added') return { title: 'Friend added', body: textFromPayload(event.payload, ['name']) ?? 'A friend was added.' }
  if (type === 'friend_removed') return { title: 'Friend removed', body: textFromPayload(event.payload, ['name']) ?? 'A friend was removed.' }
  if (type === 'receipt_uploaded') return { title: 'Receipt uploaded', body: textFromPayload(event.payload, ['fileName']) ?? 'A receipt was attached.' }
  return { title: 'Recent activity', body: textFromPayload(event.payload, ['summary']) ?? event.action }
}

export function mapEventToNotification(event: AccountActivityEvent, readIds: Set<string> = new Set()): AccountNotification {
  const type = notificationTypeForEvent(event)
  const copy = notificationCopyForEvent(event)
  return {
    id: event.id,
    splitwiseType: splitwiseTypes[type] ?? splitwiseTypes.news,
    type,
    title: copy.title,
    body: copy.body,
    actorId: event.actorId,
    entityType: event.entityType,
    entityId: event.entityId,
    createdAt: event.createdAt,
    read: readIds.has(event.id),
  }
}

const expenseCreatedEvent = (expense: Expense): AccountActivityEvent => ({
  id: `expense-${expense.id}-created`,
  actorId: expense.paidBy,
  entityType: expense.kind === 'settlement' ? 'settlement' : 'expense',
  entityId: expense.id,
  action: expense.kind === 'settlement' ? 'recorded' : 'created',
  payload: expense,
  createdAt: `${expense.date}T00:00:00.000Z`,
})

export function buildLedgerNotifications(ledger: Ledger, readIds: Set<string> = new Set()): AccountNotification[] {
  const events: AccountActivityEvent[] = []
  for (const expense of ledger.expenses) {
    if (!expense.deletedAt) events.push(expenseCreatedEvent(expense))
    for (const event of expense.history ?? []) {
      events.push({
        id: event.id,
        actorId: event.memberId,
        entityType: 'expense',
        entityId: expense.id,
        action: event.action,
        payload: { ...expense, summary: event.summary },
        createdAt: event.createdAt,
      })
    }
    for (const comment of expense.comments ?? []) {
      events.push({
        id: comment.id,
        actorId: comment.memberId,
        entityType: 'expense',
        entityId: expense.id,
        action: 'commented',
        payload: comment,
        createdAt: comment.createdAt,
      })
    }
  }
  return events
    .map((event) => mapEventToNotification(event, readIds))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
