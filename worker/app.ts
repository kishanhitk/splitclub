/// <reference types="@cloudflare/workers-types" />

import { Hono, type Context } from 'hono'
import { ZodError } from 'zod'
import {
  accountUpdateSchema,
  expenseSchema,
  expenseCommentSchema,
  expenseUpdateSchema,
  groupDefaultsSchema,
  friendSchema,
  groupSchema,
  groupInviteSchema,
  membershipSchema,
  memberSchema,
  searchSchema,
  settlementSchema,
} from '../src/contracts/api'
import type { Expense, Group, Ledger, Member } from '../src/domain/split'
import {
  calculateBalances,
  calculateDirectSettlements,
  calculateFriendBalanceSummaries,
  exportCsv,
  exportJsonBackup,
  listUpcomingRecurringExpenses,
  roundMoney,
  simplifyDebts,
  validateGroupDefaultSplits,
} from '../src/domain/split'
import { mapEventToNotification } from '../src/notifications/activity'
import { AuthError, authenticateRequest, getAuthProviderStatus, type AuthBindings } from './auth'
import { extractReceiptItems, type OcrBindings } from './ocr'
import { createD1LedgerStore, type LedgerStore } from './store'

export type Bindings = AuthBindings & OcrBindings & {
  DB: D1Database
  RECEIPTS: R2Bucket
  SYNC_QUEUE: Queue
  TEST_STORE?: LedgerStore
}

export type RecurringSchedulerResult = {
  asOf: string
  scanned: number
  queued: number
}

type RecurringDueQueueMessage = {
  type: 'recurring.due'
  notificationId: string
  sourceExpenseId: string
  description: string
  dueDate: string
  reminderDate?: string
  amount: number
  currency: string
  createdAt: string
}

type Variables = {
  authMember: Member
}

const getStore = (env: Bindings) => env.TEST_STORE ?? createD1LedgerStore(env.DB)
const currentMember = (member: Member | undefined) => {
  if (!member) throw new AuthError('Authenticated member was not loaded')
  return member
}

function scopeLedger(ledger: Ledger, userId: string): Ledger {
  const visibleGroups = ledger.groups.filter((group) => !group.deletedAt && group.memberIds.includes(userId))
  const visibleGroupIds = new Set(visibleGroups.map((group) => group.id))
  const visibleExpenses = ledger.expenses.filter((expense) => {
    if (expense.deletedAt) return false
    if (expense.groupId) return visibleGroupIds.has(expense.groupId)
    return expense.paidBy === userId || expense.participants.includes(userId) || (expense.payments ?? []).some((payment) => payment.memberId === userId)
  })
  const visibleMemberIds = new Set<string>([userId])
  visibleGroups.forEach((group) => group.memberIds.forEach((memberId) => visibleMemberIds.add(memberId)))
  visibleExpenses.forEach((expense) => {
    visibleMemberIds.add(expense.paidBy)
    ;(expense.payments ?? []).forEach((payment) => visibleMemberIds.add(payment.memberId))
    expense.participants.forEach((memberId) => visibleMemberIds.add(memberId))
  })
  return {
    ...ledger,
    groups: visibleGroups,
    expenses: visibleExpenses,
    members: ledger.members.filter((member) => visibleMemberIds.has(member.id)),
  }
}

async function requireGroupAccess(store: LedgerStore, userId: string, groupId: string) {
  const ledger = await store.getLedger()
  const group = ledger.groups.find((candidate) => candidate.id === groupId)
  if (!group || !group.memberIds.includes(userId)) {
    throw new AuthError('Group is not visible to this user', 403)
  }
  return group
}

async function requireExpenseAccess(store: LedgerStore, userId: string, expenseId: string) {
  const ledger = scopeLedger(await store.getLedger(), userId)
  const expense = ledger.expenses.find((candidate) => candidate.id === expenseId)
  if (!expense) throw new AuthError('Expense is not visible to this user', 403)
  return expense
}

function scopedAuditEvents(ledger: Ledger, events: Awaited<ReturnType<LedgerStore['listAuditEvents']>>, userId: string) {
  const visibleGroups = ledger.groups.filter((group) => group.memberIds.includes(userId))
  const groupIds = new Set(visibleGroups.map((group) => group.id))
  const visibleExpenses = ledger.expenses.filter((expense) => {
    if (expense.groupId) return groupIds.has(expense.groupId)
    return expense.paidBy === userId || expense.participants.includes(userId) || (expense.payments ?? []).some((payment) => payment.memberId === userId)
  })
  const expenseIds = new Set(visibleExpenses.map((expense) => expense.id))
  const memberIds = new Set<string>([userId])
  visibleGroups.forEach((group) => group.memberIds.forEach((memberId) => memberIds.add(memberId)))
  visibleExpenses.forEach((expense) => {
    memberIds.add(expense.paidBy)
    ;(expense.payments ?? []).forEach((payment) => memberIds.add(payment.memberId))
    expense.participants.forEach((memberId) => memberIds.add(memberId))
  })
  return events.filter((event) => {
    if (event.entityType === 'expense' || event.entityType === 'settlement') return expenseIds.has(event.entityId)
    if (event.entityType === 'recurring') return expenseIds.has(event.entityId)
    if (event.entityType === 'group' || event.entityType === 'group_invite') return groupIds.has(event.entityId) || groupIds.has(String((event.payload as { groupId?: unknown })?.groupId ?? ''))
    if (event.entityType === 'membership') {
      const [groupId, memberId] = event.entityId.split(':')
      return groupIds.has(groupId) || memberIds.has(memberId)
    }
    if (event.entityType === 'friendship' || event.entityType === 'user') return memberIds.has(event.entityId) || event.actorId === userId
    return event.actorId === userId
  })
}

function expenseRevision(expense: Expense) {
  return expense.updatedAt ?? expense.deletedAt ?? expense.history?.[0]?.createdAt ?? expense.date
}

function groupRevision(group: Group) {
  return group.updatedAt ?? group.deletedAt ?? group.name
}

function memberRevision(member: Member) {
  return member.updatedAt ?? [member.name, member.email ?? '', member.phone ?? '', member.preferredPayment].join('|')
}

function baseRevisionHeader(c: Context) {
  return c.req.header('x-splitclub-base-revision') ?? c.req.header('if-unmodified-since')
}

function expenseConflictResponse(c: Context, expense: Expense) {
  const baseRevision = baseRevisionHeader(c)
  const currentRevision = expenseRevision(expense)
  if (!baseRevision || !currentRevision || baseRevision === currentRevision) return null
  return c.json({
    error: 'expense_conflict',
    message: 'Expense changed in the cloud before this mutation was pushed.',
    conflict: {
      entity: 'expense',
      recordId: expense.id,
      baseRevision,
      currentRevision,
      remoteRecord: expense,
    },
  }, 409)
}

function groupConflictResponse(c: Context, group: Group) {
  const baseRevision = baseRevisionHeader(c)
  const currentRevision = groupRevision(group)
  if (!baseRevision || !currentRevision || baseRevision === currentRevision) return null
  return c.json({
    error: 'group_conflict',
    message: 'Group changed in the cloud before this mutation was pushed.',
    conflict: {
      entity: 'group',
      recordId: group.id,
      baseRevision,
      currentRevision,
      remoteRecord: group,
    },
  }, 409)
}

function memberConflictResponse(c: Context, member: Member) {
  const baseRevision = baseRevisionHeader(c)
  const currentRevision = memberRevision(member)
  if (!baseRevision || !currentRevision || baseRevision === currentRevision) return null
  return c.json({
    error: 'member_conflict',
    message: 'Account changed in the cloud before this mutation was pushed.',
    conflict: {
      entity: 'member',
      recordId: member.id,
      baseRevision,
      currentRevision,
      remoteRecord: member,
    },
  }, 409)
}

export async function runRecurringScheduler(env: Bindings, asOf = new Date().toISOString().slice(0, 10)): Promise<RecurringSchedulerResult> {
  const ledger = await getStore(env).getLedger()
  const schedules = listUpcomingRecurringExpenses(ledger)
  const dueSchedules = schedules.filter((schedule) => (schedule.reminderDate ?? schedule.dueDate) <= asOf)

  await Promise.all(dueSchedules.map((schedule) =>
    env.SYNC_QUEUE?.send({
      type: 'recurring.due',
      notificationId: `recurring:${schedule.sourceExpenseId}:${schedule.dueDate}`,
      sourceExpenseId: schedule.sourceExpenseId,
      description: schedule.description,
      dueDate: schedule.dueDate,
      reminderDate: schedule.reminderDate,
      amount: schedule.amount,
      currency: schedule.currency,
      createdAt: new Date().toISOString(),
    }),
  ))

  return {
    asOf,
    scanned: schedules.length,
    queued: dueSchedules.length,
  }
}

export async function deliverQueueMessages(env: Bindings, messages: unknown[]) {
  const store = getStore(env)
  const delivered: RecurringDueQueueMessage[] = []
  for (const message of messages) {
    if (!isRecurringDueMessage(message)) continue
    await store.recordAuditEvent({
      id: message.notificationId,
      entityType: 'recurring',
      entityId: message.sourceExpenseId,
      action: 'due',
      payload: message,
      createdAt: message.createdAt,
    })
    const ledger = await store.getLedger()
    const expense = ledger.expenses.find((candidate) => candidate.id === message.sourceExpenseId)
    const recipientIds = expense ? visibleMemberIdsForExpense(ledger, expense) : []
    const subscriptions = await store.listPushSubscriptions(recipientIds)
    await deliverExpoPushNotifications(subscriptions.map((subscription) => ({
      to: subscription.token,
      title: 'Recurring bill due',
      body: `${message.description} · ${message.currency} ${message.amount.toFixed(2)}`,
      data: {
        notificationId: message.notificationId,
        sourceExpenseId: message.sourceExpenseId,
        dueDate: message.dueDate,
      },
    })))
    delivered.push(message)
  }
  return { delivered: delivered.length }
}

function visibleMemberIdsForExpense(ledger: Ledger, expense: Expense) {
  const memberIds = new Set<string>([expense.paidBy, ...expense.participants])
  ;(expense.payments ?? []).forEach((payment) => memberIds.add(payment.memberId))
  if (expense.groupId) {
    const group = ledger.groups.find((candidate) => candidate.id === expense.groupId)
    group?.memberIds.forEach((memberId) => memberIds.add(memberId))
  }
  return [...memberIds]
}

async function deliverExpoPushNotifications(messages: Array<{ to: string; title: string; body: string; data: Record<string, string> }>) {
  if (!messages.length) return
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(messages),
  }).catch(() => undefined)
}

function isRecurringDueMessage(value: unknown): value is RecurringDueQueueMessage {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Partial<RecurringDueQueueMessage>
  return record.type === 'recurring.due' &&
    typeof record.notificationId === 'string' &&
    typeof record.sourceExpenseId === 'string' &&
    typeof record.description === 'string' &&
    typeof record.dueDate === 'string' &&
    typeof record.amount === 'number' &&
    typeof record.currency === 'string' &&
    typeof record.createdAt === 'string'
}

export function createApp() {
  const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

  app.onError((error, c) => {
    if (error instanceof AuthError) {
      const status = error.status === 403 ? 403 : 401
      return c.json({ error: status === 403 ? 'forbidden' : 'unauthorized', message: error.message }, status)
    }
    if (error instanceof ZodError) {
      return c.json({ error: 'validation_error', issues: error.issues }, 400)
    }
    return c.json({ error: 'internal_error', message: error.message }, 500)
  })

  app.get('/api/health', (c) =>
    c.json({
      ok: true,
      app: 'SplitClub',
      targets: ['android', 'web'],
      storage: ['Cloudflare D1', 'Cloudflare R2', 'Worker Queue'],
    }),
  )

  app.get('/api/features', (c) =>
    c.json({
      free: true,
      features: [
        'groups and friends',
        'friend-level balances across groups and private expenses',
        'non-group expenses',
        'equal, exact, percent, share, and adjustment splits',
        'settlements and simplified debts',
        'recurring expenses and reminders',
        'offline-first sync',
        'multiple currencies and conversion',
        'categories, notes, and attachments',
        'receipt scanning and itemization',
        'search, charts, totals, and CSV export',
      ],
    }),
  )

  app.get('/api/auth/config', (c) => c.json(getAuthProviderStatus(c.env)))

  app.get('/invite/:token', (c) => {
    const rawToken = c.req.param('token')
    const token = rawToken.replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[char] ?? char)
    const deepLink = `splitclub://invite/${encodeURIComponent(rawToken)}`
    return c.html(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SplitClub invite</title>
    <style>
      body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; color: #09090b; background: #fafafa; }
      main { max-width: 560px; margin: 0 auto; padding: 48px 20px; }
      code { display: inline-block; padding: 8px 10px; border: 1px solid #e4e4e7; border-radius: 8px; background: #fff; }
      a { display: inline-flex; margin: 18px 0 10px; min-height: 44px; align-items: center; justify-content: center; padding: 0 16px; border-radius: 8px; background: #09090b; color: #fff; text-decoration: none; font-weight: 700; }
      p { color: #52525b; line-height: 1.5; }
    </style>
  </head>
  <body>
    <main>
      <h1>SplitClub invite</h1>
      <p>Open SplitClub on Android or web to accept this invite.</p>
      <a href="${deepLink}">Open SplitClub</a>
      <p>Or paste this token inside Groups > Invites.</p>
      <code>${token}</code>
    </main>
  </body>
</html>`)
  })

  app.use('/api/*', async (c, next) => {
    const store = getStore(c.env)
    const authUser = await authenticateRequest(c.req.raw, c.env)
    const member = await store.ensureAuthenticatedMember(authUser)
    c.set('authMember', member)
    await next()
  })

  app.get('/api/auth/session', (c) => c.json({ user: currentMember(c.get('authMember')) }))

  app.put('/api/account', async (c) => {
    const store = getStore(c.env)
    const member = currentMember(c.get('authMember'))
    const conflict = memberConflictResponse(c, member)
    if (conflict) return conflict
    const account = await store.updateMember(member.id, accountUpdateSchema.parse(await c.req.json()), member.id)
    await c.env.SYNC_QUEUE?.send({ type: 'account.updated', memberId: account.id, createdAt: new Date().toISOString() })
    return c.json({ user: account })
  })

  app.get('/api/members', async (c) => {
    const store = getStore(c.env)
    const member = currentMember(c.get('authMember'))
    const ledger = scopeLedger(await store.getLedger(), member.id)
    return c.json({ members: ledger.members })
  })

  app.post('/api/members', async (c) => {
    const member = await getStore(c.env).createMember(memberSchema.parse(await c.req.json()))
    return c.json({ member }, 201)
  })

  app.get('/api/friends', async (c) => {
    const store = getStore(c.env)
    const member = currentMember(c.get('authMember'))
    const ledger = scopeLedger(await store.getLedger(), member.id)
    return c.json({ friends: ledger.members.filter((candidate) => candidate.id !== member.id) })
  })

  app.get('/api/friends/balances', async (c) => {
    const store = getStore(c.env)
    const member = currentMember(c.get('authMember'))
    const ledger = scopeLedger(await store.getLedger(), member.id)
    const currency = c.req.query('currency') ?? ledger.defaultCurrency
    return c.json({ balances: calculateFriendBalanceSummaries(ledger, member.id, currency) })
  })

  app.post('/api/friends', async (c) => {
    const member = currentMember(c.get('authMember'))
    const friend = await getStore(c.env).createFriend(friendSchema.parse(await c.req.json()), member.id)
    await c.env.SYNC_QUEUE?.send({ type: 'friend.created', friendId: friend.id, createdAt: new Date().toISOString() })
    return c.json({ friend }, 201)
  })

  app.put('/api/friends/:id', async (c) => {
    const store = getStore(c.env)
    const member = currentMember(c.get('authMember'))
    const ledger = scopeLedger(await store.getLedger(), member.id)
    const friend = ledger.members.find((candidate) => candidate.id === c.req.param('id') && candidate.id !== member.id)
    if (!friend) throw new AuthError('Friend is not visible to this user', 403)
    const conflict = memberConflictResponse(c, friend)
    if (conflict) return conflict
    const payload = friendSchema.parse({ ...(await c.req.json()), id: friend.id })
    const updated = await store.updateMember(friend.id, payload, member.id)
    await c.env.SYNC_QUEUE?.send({ type: 'friend.updated', friendId: updated.id, createdAt: new Date().toISOString() })
    return c.json({ friend: updated })
  })

  app.delete('/api/friends/:id', async (c) => {
    const store = getStore(c.env)
    const member = currentMember(c.get('authMember'))
    const ledger = scopeLedger(await store.getLedger(), member.id)
    const friend = ledger.members.find((candidate) => candidate.id === c.req.param('id') && candidate.id !== member.id)
    if (!friend) throw new AuthError('Friend is not visible to this user', 403)
    const conflict = memberConflictResponse(c, friend)
    if (conflict) return conflict
    const balance = calculateFriendBalanceSummaries(ledger, member.id, ledger.defaultCurrency).find((item) => item.friendId === friend.id)
    if (balance && Math.abs(balance.amount) >= 0.01) {
      return c.json({ error: 'friend_has_balance', message: 'Settle this friend before removing them.', balance }, 409)
    }
    await store.removeFriend(friend.id, member.id)
    await c.env.SYNC_QUEUE?.send({ type: 'friend.removed', friendId: friend.id, createdAt: new Date().toISOString() })
    return c.json({ ok: true })
  })

  app.get('/api/groups', async (c) => {
    const store = getStore(c.env)
    const member = currentMember(c.get('authMember'))
    const ledger = scopeLedger(await store.getLedger(), member.id)
    return c.json({ groups: ledger.groups })
  })

  app.post('/api/groups', async (c) => {
    const member = currentMember(c.get('authMember'))
    const payload = groupSchema.parse(await c.req.json())
    const group = await getStore(c.env).createGroup({ ...payload, memberIds: [...new Set([member.id, ...payload.memberIds])] })
    await c.env.SYNC_QUEUE?.send({ type: 'group.created', groupId: group.id, createdAt: new Date().toISOString() })
    return c.json({ group }, 201)
  })

  app.get('/api/groups/deleted', async (c) => {
    const store = getStore(c.env)
    const member = currentMember(c.get('authMember'))
    return c.json({ groups: await store.listDeletedGroups(member.id) })
  })

  app.delete('/api/groups/:id', async (c) => {
    const store = getStore(c.env)
    const member = currentMember(c.get('authMember'))
    const existing = await requireGroupAccess(store, member.id, c.req.param('id'))
    const conflict = groupConflictResponse(c, existing)
    if (conflict) return conflict
    const group = await store.deleteGroup(c.req.param('id'), member.id)
    await c.env.SYNC_QUEUE?.send({ type: 'group.deleted', groupId: group.id, createdAt: new Date().toISOString() })
    return c.json({ group })
  })

  app.post('/api/groups/:id/restore', async (c) => {
    const store = getStore(c.env)
    const member = currentMember(c.get('authMember'))
    const deletedGroups = await store.listDeletedGroups(member.id)
    const existing = deletedGroups.find((group) => group.id === c.req.param('id'))
    if (!existing) throw new AuthError('Group is not restorable by this user', 403)
    const conflict = groupConflictResponse(c, existing)
    if (conflict) return conflict
    const group = await store.restoreGroup(c.req.param('id'), member.id)
    await c.env.SYNC_QUEUE?.send({ type: 'group.restored', groupId: group.id, createdAt: new Date().toISOString() })
    return c.json({ group })
  })

  app.put('/api/groups/:id/defaults', async (c) => {
    const store = getStore(c.env)
    const member = currentMember(c.get('authMember'))
    const group = await requireGroupAccess(store, member.id, c.req.param('id'))
    const conflict = groupConflictResponse(c, group)
    if (conflict) return conflict
    const payload = groupDefaultsSchema.parse(await c.req.json())
    const validation = validateGroupDefaultSplits(payload.defaultSplitMode, group.memberIds, payload.defaultSplits)
    if (!validation.valid) return c.json({ error: 'invalid_group_defaults', message: validation.message }, 400)
    const updated = await store.updateGroupDefaults(group.id, {
      simplifyDebts: payload.simplifyDebts,
      defaultSplitMode: payload.defaultSplitMode,
      defaultSplits: payload.defaultSplitMode === 'equal' ? [] : payload.defaultSplits,
    }, member.id)
    await c.env.SYNC_QUEUE?.send({ type: 'group.defaults.updated', groupId: updated.id, createdAt: new Date().toISOString() })
    return c.json({ group: updated })
  })

  app.get('/api/groups/:id/invites', async (c) => {
    const store = getStore(c.env)
    await requireGroupAccess(store, currentMember(c.get('authMember')).id, c.req.param('id'))
    return c.json({ invites: await store.listGroupInvites(c.req.param('id')) })
  })

  app.post('/api/groups/:id/invites', async (c) => {
    const store = getStore(c.env)
    const member = currentMember(c.get('authMember'))
    const group = await requireGroupAccess(store, member.id, c.req.param('id'))
    const conflict = groupConflictResponse(c, group)
    if (conflict) return conflict
    const payload = groupInviteSchema.parse({ ...(await c.req.json()), groupId: c.req.param('id'), createdBy: member.id })
    const invite = await store.createGroupInvite(payload)
    await c.env.SYNC_QUEUE?.send({ type: 'group_invite.created', inviteId: invite.id, groupId: invite.groupId, createdAt: new Date().toISOString() })
    return c.json({ invite }, 201)
  })

  app.post('/api/invites/:token/accept', async (c) => {
    const store = getStore(c.env)
    const member = currentMember(c.get('authMember'))
    const body = await c.req.json().catch(() => ({})) as { groupId?: string }
    if (body.groupId) {
      const group = await requireGroupAccess(store, member.id, body.groupId)
      const conflict = groupConflictResponse(c, group)
      if (conflict) return conflict
    }
    try {
      const result = await store.acceptGroupInvite(c.req.param('token'), member)
      await c.env.SYNC_QUEUE?.send({ type: 'group_invite.accepted', inviteId: result.invite.id, groupId: result.invite.groupId, userId: member.id, createdAt: new Date().toISOString() })
      return c.json(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invite could not be accepted'
      if (message.includes('not found')) return c.json({ error: 'invite_not_found', message }, 404)
      if (message.includes('not pending')) return c.json({ error: 'invite_not_pending', message }, 409)
      if (message.includes('does not match')) return c.json({ error: 'invite_forbidden', message }, 403)
      throw error
    }
  })

  app.put('/api/groups/:id/members/:userId', async (c) => {
    const store = getStore(c.env)
    const group = await requireGroupAccess(store, currentMember(c.get('authMember')).id, c.req.param('id'))
    const conflict = groupConflictResponse(c, group)
    if (conflict) return conflict
    const payload = membershipSchema.parse({ ...(await c.req.json()), groupId: c.req.param('id'), userId: c.req.param('userId') })
    const membership = await store.updateMembership(payload)
    await c.env.SYNC_QUEUE?.send({ type: 'membership.updated', groupId: payload.groupId, userId: payload.userId, createdAt: new Date().toISOString() })
    return c.json({ membership })
  })

  app.delete('/api/groups/:id/members/:userId', async (c) => {
    const store = getStore(c.env)
    const groupId = c.req.param('id')
    const group = await requireGroupAccess(store, currentMember(c.get('authMember')).id, groupId)
    const conflict = groupConflictResponse(c, group)
    if (conflict) return conflict
    const ledger = await store.getLedger()
    const balance = calculateBalances(ledger, groupId, ledger.defaultCurrency).find((item) => item.memberId === c.req.param('userId'))
    if (balance && Math.abs(balance.amount) >= 0.01) {
      return c.json({ error: 'member_has_balance', message: 'Settle this member before removing them from the group.', balance }, 409)
    }
    await store.removeMembership(groupId, c.req.param('userId'))
    await c.env.SYNC_QUEUE?.send({ type: 'membership.removed', groupId: c.req.param('id'), userId: c.req.param('userId'), createdAt: new Date().toISOString() })
    return c.json({ ok: true })
  })

  app.get('/api/expenses', async (c) => {
    const groupId = c.req.query('groupId')
    const filters = groupId === undefined ? {} : { groupId: groupId === 'null' ? null : groupId }
    const store = getStore(c.env)
    const member = currentMember(c.get('authMember'))
    if (filters.groupId) await requireGroupAccess(store, member.id, filters.groupId)
    const scoped = scopeLedger(await store.getLedger(), member.id)
    const expenses = scoped.expenses.filter((expense) => !('groupId' in filters) || expense.groupId === filters.groupId)
    return c.json({ expenses })
  })

  app.post('/api/expenses', async (c) => {
    const store = getStore(c.env)
    const member = currentMember(c.get('authMember'))
    const payload = expenseSchema.parse(await c.req.json())
    if (payload.payments.length && roundMoney(payload.payments.reduce((sum, payment) => sum + payment.value, 0)) !== roundMoney(payload.amount)) {
      return c.json({ error: 'invalid_payers', message: 'Payer shares must match the expense total.' }, 400)
    }
    if (payload.groupId) {
      await requireGroupAccess(store, member.id, payload.groupId)
    } else if (payload.paidBy !== member.id && !payload.participants.includes(member.id) && !payload.payments.some((payment) => payment.memberId === member.id)) {
      throw new AuthError('Non-group expenses must include the authenticated user', 403)
    }
    if (payload.receiptId) {
      const receipt = await store.getReceipt(payload.receiptId, member.id)
      if (!receipt) return c.json({ error: 'receipt_not_found', message: 'Receipt is not visible to this user.' }, 404)
      if (receipt.expenseId) return c.json({ error: 'receipt_already_linked', message: 'Receipt is already attached to another expense.' }, 409)
    }
    let expense = await store.createExpense(payload)
    if (payload.receiptId) {
      await store.linkReceiptToExpense(payload.receiptId, member.id, expense.id, member.id)
      expense = (await store.getExpenseDetails(expense.id)).expense ?? { ...expense, receiptId: payload.receiptId }
    }
    await c.env.SYNC_QUEUE?.send({ type: 'expense.created', expenseId: expense.id, createdAt: new Date().toISOString() })
    return c.json({ expense }, 201)
  })

  app.get('/api/expenses/:id', async (c) => {
    const store = getStore(c.env)
    const member = currentMember(c.get('authMember'))
    await requireExpenseAccess(store, member.id, c.req.param('id'))
    const details = await store.getExpenseDetails(c.req.param('id'))
    return c.json(details)
  })

  app.put('/api/expenses/:id', async (c) => {
    const store = getStore(c.env)
    const member = currentMember(c.get('authMember'))
    const existing = await requireExpenseAccess(store, member.id, c.req.param('id'))
    const conflict = expenseConflictResponse(c, existing)
    if (conflict) return conflict
    const payload = expenseUpdateSchema.parse(await c.req.json())
    if (payload.payments?.length && roundMoney(payload.payments.reduce((sum, payment) => sum + payment.value, 0)) !== roundMoney(payload.amount ?? existing.amount)) {
      return c.json({ error: 'invalid_payers', message: 'Payer shares must match the expense total.' }, 400)
    }
    if (payload.groupId) await requireGroupAccess(store, member.id, payload.groupId)
    const nextGroupId = payload.groupId === undefined ? existing.groupId : payload.groupId
    const nextPaidBy = payload.paidBy ?? existing.paidBy
    const nextParticipants = payload.participants ?? existing.participants
    const nextPayments = payload.payments ?? existing.payments ?? []
    if (!nextGroupId && nextPaidBy !== member.id && !nextParticipants.includes(member.id) && !nextPayments.some((payment) => payment.memberId === member.id)) {
      throw new AuthError('Non-group expenses must include the authenticated user', 403)
    }
    if (payload.receiptId) {
      const receipt = await store.getReceipt(payload.receiptId, member.id)
      if (!receipt) return c.json({ error: 'receipt_not_found', message: 'Receipt is not visible to this user.' }, 404)
      if (receipt.expenseId && receipt.expenseId !== existing.id) {
        return c.json({ error: 'receipt_already_linked', message: 'Receipt is already attached to another expense.' }, 409)
      }
    }
    let expense = await store.updateExpense(c.req.param('id'), payload, member.id)
    if (payload.receiptId) {
      await store.linkReceiptToExpense(payload.receiptId, member.id, expense.id, member.id)
      expense = (await store.getExpenseDetails(expense.id)).expense ?? { ...expense, receiptId: payload.receiptId }
    }
    await c.env.SYNC_QUEUE?.send({ type: 'expense.updated', expenseId: expense.id, createdAt: new Date().toISOString() })
    return c.json({ expense })
  })

  app.post('/api/expenses/:id/comments', async (c) => {
    const store = getStore(c.env)
    const member = currentMember(c.get('authMember'))
    await requireExpenseAccess(store, member.id, c.req.param('id'))
    const comment = await store.addExpenseComment(c.req.param('id'), expenseCommentSchema.parse(await c.req.json()), member.id)
    await c.env.SYNC_QUEUE?.send({ type: 'expense.commented', expenseId: c.req.param('id'), commentId: comment.id, createdAt: new Date().toISOString() })
    return c.json({ comment }, 201)
  })

  app.delete('/api/expenses/:id', async (c) => {
    const store = getStore(c.env)
    const member = currentMember(c.get('authMember'))
    const existing = await requireExpenseAccess(store, member.id, c.req.param('id'))
    const conflict = expenseConflictResponse(c, existing)
    if (conflict) return conflict
    const expense = await store.deleteExpense(c.req.param('id'), member.id)
    await c.env.SYNC_QUEUE?.send({ type: 'expense.deleted', expenseId: expense.id, createdAt: new Date().toISOString() })
    return c.json({ expense })
  })

  app.post('/api/expenses/:id/restore', async (c) => {
    const store = getStore(c.env)
    const member = currentMember(c.get('authMember'))
    const details = await store.getExpenseDetails(c.req.param('id'))
    if (!details.expense) throw new AuthError('Expense is not visible to this user', 403)
    if (details.expense.groupId) {
      await requireGroupAccess(store, member.id, details.expense.groupId)
    } else if (details.expense.paidBy !== member.id && !details.expense.participants.includes(member.id) && !(details.expense.payments ?? []).some((payment) => payment.memberId === member.id)) {
      throw new AuthError('Expense is not visible to this user', 403)
    }
    const conflict = expenseConflictResponse(c, details.expense)
    if (conflict) return conflict
    const expense = await store.restoreExpense(c.req.param('id'), member.id)
    await c.env.SYNC_QUEUE?.send({ type: 'expense.restored', expenseId: expense.id, createdAt: new Date().toISOString() })
    return c.json({ expense })
  })

  app.post('/api/settlements', async (c) => {
    const store = getStore(c.env)
    const member = currentMember(c.get('authMember'))
    const payload = settlementSchema.parse(await c.req.json())
    if (payload.groupId) {
      const group = await requireGroupAccess(store, member.id, payload.groupId)
      const conflict = groupConflictResponse(c, group)
      if (conflict) return conflict
    }
    if (!payload.groupId && payload.from !== member.id && payload.to !== member.id) {
      throw new AuthError('Non-group settlements must include the authenticated user', 403)
    }
    const settlement = await store.recordSettlement(payload)
    await c.env.SYNC_QUEUE?.send({ type: 'settlement.recorded', expenseId: settlement.id, createdAt: new Date().toISOString() })
    return c.json({ settlement }, 201)
  })

  app.get('/api/receipts', async (c) => {
    const store = getStore(c.env)
    const member = currentMember(c.get('authMember'))
    return c.json({ receipts: await store.listReceipts(member.id) })
  })

  app.post('/api/receipts', async (c) => {
    const store = getStore(c.env)
    const member = currentMember(c.get('authMember'))
    const form = await c.req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return c.json({ error: 'validation_error', message: 'Receipt file is required' }, 400)
    }
    const expenseId = textField(form.get('expenseId'))
    if (expenseId) await requireExpenseAccess(store, member.id, expenseId)

    const receiptId = `receipt_${crypto.randomUUID()}`
    const fileName = file.name || 'receipt'
    const contentType = file.type || 'application/octet-stream'
    const bytes = await file.arrayBuffer()
    const objectKey = `receipts/${member.id}/${receiptId}-${safeObjectName(fileName)}`
    await c.env.RECEIPTS.put(objectKey, bytes, {
      httpMetadata: { contentType },
      customMetadata: {
        receiptId,
        ownerId: member.id,
        expenseId: expenseId ?? '',
      },
    })

    const assignedTo = form.getAll('assignedTo').map(textField).filter((value): value is string => Boolean(value))
    const extraction = await extractReceiptItems({
      fileBytes: bytes,
      contentType,
      ocrText: textField(form.get('ocrText')),
      assignedTo: assignedTo.length ? assignedTo : [member.id],
      env: c.env,
    })
    const receipt = await store.createReceipt({
      id: receiptId,
      expenseId,
      ownerId: member.id,
      objectKey,
      fileName,
      contentType,
      sizeBytes: file.size,
      ocrStatus: extraction.status,
      ocrText: extraction.text,
      extractedItems: extraction.items,
    }, member.id)
    await c.env.SYNC_QUEUE?.send({ type: 'receipt.uploaded', receiptId, expenseId, createdAt: new Date().toISOString() })
    return c.json({ receipt, extractedItems: extraction.items }, 201)
  })

  app.get('/api/receipts/:id/file', async (c) => {
    const store = getStore(c.env)
    const member = currentMember(c.get('authMember'))
    const receipt = await store.getReceipt(c.req.param('id'), member.id)
    if (!receipt) return c.json({ error: 'receipt_not_found', message: 'Receipt is not visible to this user.' }, 404)
    const object = await c.env.RECEIPTS.get(receipt.objectKey)
    if (!object) return c.json({ error: 'receipt_file_missing', message: 'Receipt file is missing from storage.' }, 404)
    const fileName = receipt.fileName.replaceAll('"', '')
    return new Response(await object.arrayBuffer(), {
      headers: {
        'content-type': receipt.contentType,
        'content-length': String(receipt.sizeBytes),
        'content-disposition': `inline; filename="${fileName}"`,
        'cache-control': 'private, max-age=60',
      },
    })
  })

  app.post('/api/receipts/:id/retry', async (c) => {
    const store = getStore(c.env)
    const member = currentMember(c.get('authMember'))
    const receipt = await store.getReceipt(c.req.param('id'), member.id)
    if (!receipt) return c.json({ error: 'receipt_not_found', message: 'Receipt is not visible to this user.' }, 404)
    const body = await c.req.json().catch(() => ({})) as { ocrText?: string; assignedTo?: string[] }
    const assignedTo = Array.isArray(body.assignedTo) ? body.assignedTo.filter((id) => typeof id === 'string') : []
    const object = body.ocrText?.trim() ? null : await c.env.RECEIPTS.get(receipt.objectKey)
    const fileBytes = object ? await object.arrayBuffer() : new ArrayBuffer(0)
    const extraction = await extractReceiptItems({
      contentType: receipt.contentType,
      fileBytes,
      ocrText: body.ocrText?.trim() || undefined,
      assignedTo,
      env: c.env,
    })
    const updated = await store.updateReceiptExtraction(
      receipt.id,
      member.id,
      {
        ocrStatus: extraction.status,
        ocrText: extraction.text,
        extractedItems: extraction.items,
        source: body.ocrText?.trim() ? 'review_text' : 'stored_object',
      },
      member.id,
    )
    await c.env.SYNC_QUEUE?.send({ type: 'receipt.ocr_retried', receiptId: receipt.id, itemCount: extraction.items.length, createdAt: new Date().toISOString() })
    return c.json({ receipt: updated, extractedItems: extraction.items })
  })

  app.post('/api/receipts/:id/review', async (c) => {
    const store = getStore(c.env)
    const member = currentMember(c.get('authMember'))
    const visibleReceipt = await store.getReceipt(c.req.param('id'), member.id)
    if (!visibleReceipt) return c.json({ error: 'receipt_not_found', message: 'Receipt is not visible to this user.' }, 404)
    const receipt = await store.recordReceiptReview(c.req.param('id'), member.id, member.id)
    await c.env.SYNC_QUEUE?.send({ type: 'receipt.reviewed', receiptId: receipt.id, itemCount: receipt.extractedItems.length, createdAt: new Date().toISOString() })
    return c.json({ receipt })
  })

  app.get('/api/recurring', async (c) => {
    const store = getStore(c.env)
    const member = currentMember(c.get('authMember'))
    const schedules = await store.listRecurringSchedules(member.id, c.req.query('asOf'))
    return c.json({ schedules })
  })

  app.post('/api/recurring/:id/post', async (c) => {
    const store = getStore(c.env)
    const member = currentMember(c.get('authMember'))
    await requireExpenseAccess(store, member.id, c.req.param('id'))
    const result = await store.postRecurringOccurrence(c.req.param('id'), member.id)
    await c.env.SYNC_QUEUE?.send({ type: 'recurring.posted', sourceExpenseId: c.req.param('id'), occurrenceExpenseId: result.occurrence.id, dueDate: result.event.dueDate, createdAt: new Date().toISOString() })
    return c.json(result, 201)
  })

  app.post('/api/recurring/:id/skip', async (c) => {
    const store = getStore(c.env)
    const member = currentMember(c.get('authMember'))
    await requireExpenseAccess(store, member.id, c.req.param('id'))
    const result = await store.skipRecurringOccurrence(c.req.param('id'), member.id)
    await c.env.SYNC_QUEUE?.send({ type: 'recurring.skipped', sourceExpenseId: c.req.param('id'), dueDate: result.event.dueDate, createdAt: new Date().toISOString() })
    return c.json(result)
  })

  app.get('/api/search', async (c) => {
    const query = searchSchema.parse({
      q: c.req.query('q') ?? '',
      groupId: c.req.query('groupId') === undefined ? undefined : c.req.query('groupId') === 'null' ? null : c.req.query('groupId'),
      currency: c.req.query('currency'),
    })
    const filters = {
      ...(query.groupId !== undefined ? { groupId: query.groupId } : {}),
      ...(query.q ? { q: query.q } : {}),
    }
    const store = getStore(c.env)
    const member = currentMember(c.get('authMember'))
    if (filters.groupId) await requireGroupAccess(store, member.id, filters.groupId)
    const scoped = scopeLedger(await store.getLedger(), member.id)
    const q = filters.q?.toLowerCase()
    const expenses = scoped.expenses.filter((expense) => {
      if ('groupId' in filters && expense.groupId !== filters.groupId) return false
      if (!q) return true
      return [expense.description, expense.category, expense.notes, expense.currency, expense.attachmentName]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(q))
    })
    return c.json({ expenses })
  })

  app.get('/api/groups/:id/balances', async (c) => {
    const store = getStore(c.env)
    const member = currentMember(c.get('authMember'))
    const groupId = c.req.param('id') === 'non-group' ? null : c.req.param('id')
    if (groupId) await requireGroupAccess(store, member.id, groupId)
    const ledger = scopeLedger(await store.getLedger(), member.id)
    const currency = c.req.query('currency') ?? ledger.defaultCurrency
    const balances = calculateBalances(ledger, groupId, currency)
    const group = groupId ? ledger.groups.find((candidate) => candidate.id === groupId) : null
    const settlements = group?.simplifyDebts ?? false
      ? simplifyDebts(balances, currency)
      : calculateDirectSettlements(ledger, groupId, currency)
    return c.json({ balances, settlements })
  })

  app.get('/api/sync', async (c) => {
    const store = getStore(c.env)
    const member = currentMember(c.get('authMember'))
    const cursor = new Date().toISOString()
    return c.json({
      cursor,
      since: c.req.query('since') ?? null,
      ledger: scopeLedger(await store.getLedger(), member.id),
      auditEvents: await store.listAuditEvents(),
    })
  })

  app.get('/api/notifications', async (c) => {
    const store = getStore(c.env)
    const member = currentMember(c.get('authMember'))
    const limit = Math.min(Number(c.req.query('limit') ?? 50) || 50, 100)
    const ledger = await store.getLedger()
    const notifications = scopedAuditEvents(ledger, await store.listAuditEvents(), member.id)
      .map((event) => mapEventToNotification(event))
      .slice(0, limit)
    return c.json({ notifications })
  })

  app.post('/api/notifications/push-subscriptions', async (c) => {
    const store = getStore(c.env)
    const member = currentMember(c.get('authMember'))
    const body = await c.req.json().catch(() => ({})) as { token?: unknown; platform?: unknown; deviceName?: unknown }
    if (typeof body.token !== 'string' || !body.token.startsWith('ExponentPushToken[')) {
      return c.json({ error: 'validation_error', message: 'Expo push token is required.' }, 400)
    }
    const subscription = await store.registerPushSubscription({
      userId: member.id,
      token: body.token,
      platform: typeof body.platform === 'string' ? body.platform : 'unknown',
      deviceName: typeof body.deviceName === 'string' ? body.deviceName : undefined,
    })
    return c.json({ subscription }, 201)
  })

  app.get('/api/export', async (c) => {
    const store = getStore(c.env)
    const member = currentMember(c.get('authMember'))
    const ledger = scopeLedger(await store.getLedger(), member.id)
    const format = c.req.query('format') ?? 'csv'
    if (format === 'json') {
      return new Response(exportJsonBackup(ledger), {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'content-disposition': 'attachment; filename="splitclub-backup.json"',
        },
      })
    }
    if (format !== 'csv') return c.json({ error: 'validation_error', message: 'format must be csv or json' }, 400)
    return new Response(exportCsv(ledger), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="splitclub-export.csv"',
      },
    })
  })

  return app
}

function textField(value: FormDataEntryValue | null) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function safeObjectName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'receipt'
}
