/// <reference types="@cloudflare/workers-types" />

import { Hono } from 'hono'
import { ZodError } from 'zod'
import {
  expenseSchema,
  friendSchema,
  groupSchema,
  groupInviteSchema,
  membershipSchema,
  memberSchema,
  searchSchema,
  settlementSchema,
} from '../src/contracts/api'
import type { Ledger, Member } from '../src/domain/split'
import { calculateBalances, simplifyDebts } from '../src/domain/split'
import { AuthError, authenticateRequest, type AuthBindings } from './auth'
import { extractReceiptItems, type OcrBindings } from './ocr'
import { createD1LedgerStore, type LedgerStore } from './store'

export type Bindings = AuthBindings & OcrBindings & {
  DB: D1Database
  RECEIPTS: R2Bucket
  SYNC_QUEUE: Queue
  TEST_STORE?: LedgerStore
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
  const visibleGroups = ledger.groups.filter((group) => group.memberIds.includes(userId))
  const visibleGroupIds = new Set(visibleGroups.map((group) => group.id))
  const visibleExpenses = ledger.expenses.filter((expense) => {
    if (expense.groupId) return visibleGroupIds.has(expense.groupId)
    return expense.paidBy === userId || expense.participants.includes(userId)
  })
  const visibleMemberIds = new Set<string>([userId])
  visibleGroups.forEach((group) => group.memberIds.forEach((memberId) => visibleMemberIds.add(memberId)))
  visibleExpenses.forEach((expense) => {
    visibleMemberIds.add(expense.paidBy)
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

  app.use('/api/*', async (c, next) => {
    const store = getStore(c.env)
    const authUser = await authenticateRequest(c.req.raw, c.env)
    const member = await store.ensureAuthenticatedMember(authUser)
    c.set('authMember', member)
    await next()
  })

  app.get('/api/auth/session', (c) => c.json({ user: currentMember(c.get('authMember')) }))

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

  app.post('/api/friends', async (c) => {
    const member = currentMember(c.get('authMember'))
    const friend = await getStore(c.env).createFriend(friendSchema.parse(await c.req.json()), member.id)
    await c.env.SYNC_QUEUE?.send({ type: 'friend.created', friendId: friend.id, createdAt: new Date().toISOString() })
    return c.json({ friend }, 201)
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

  app.get('/api/groups/:id/invites', async (c) => {
    const store = getStore(c.env)
    await requireGroupAccess(store, currentMember(c.get('authMember')).id, c.req.param('id'))
    return c.json({ invites: await store.listGroupInvites(c.req.param('id')) })
  })

  app.post('/api/groups/:id/invites', async (c) => {
    const store = getStore(c.env)
    const member = currentMember(c.get('authMember'))
    await requireGroupAccess(store, member.id, c.req.param('id'))
    const payload = groupInviteSchema.parse({ ...(await c.req.json()), groupId: c.req.param('id'), createdBy: member.id })
    const invite = await store.createGroupInvite(payload)
    await c.env.SYNC_QUEUE?.send({ type: 'group_invite.created', inviteId: invite.id, groupId: invite.groupId, createdAt: new Date().toISOString() })
    return c.json({ invite }, 201)
  })

  app.put('/api/groups/:id/members/:userId', async (c) => {
    const store = getStore(c.env)
    await requireGroupAccess(store, currentMember(c.get('authMember')).id, c.req.param('id'))
    const payload = membershipSchema.parse({ ...(await c.req.json()), groupId: c.req.param('id'), userId: c.req.param('userId') })
    const membership = await store.updateMembership(payload)
    await c.env.SYNC_QUEUE?.send({ type: 'membership.updated', groupId: payload.groupId, userId: payload.userId, createdAt: new Date().toISOString() })
    return c.json({ membership })
  })

  app.delete('/api/groups/:id/members/:userId', async (c) => {
    const store = getStore(c.env)
    await requireGroupAccess(store, currentMember(c.get('authMember')).id, c.req.param('id'))
    await store.removeMembership(c.req.param('id'), c.req.param('userId'))
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
    if (payload.groupId) {
      await requireGroupAccess(store, member.id, payload.groupId)
    } else if (payload.paidBy !== member.id && !payload.participants.includes(member.id)) {
      throw new AuthError('Non-group expenses must include the authenticated user', 403)
    }
    const expense = await store.createExpense(payload)
    await c.env.SYNC_QUEUE?.send({ type: 'expense.created', expenseId: expense.id, createdAt: new Date().toISOString() })
    return c.json({ expense }, 201)
  })

  app.post('/api/settlements', async (c) => {
    const store = getStore(c.env)
    const member = currentMember(c.get('authMember'))
    const payload = settlementSchema.parse(await c.req.json())
    if (payload.groupId) await requireGroupAccess(store, member.id, payload.groupId)
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
    })
    await c.env.SYNC_QUEUE?.send({ type: 'receipt.uploaded', receiptId, expenseId, createdAt: new Date().toISOString() })
    return c.json({ receipt, extractedItems: extraction.items }, 201)
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
    return c.json({ balances, settlements: simplifyDebts(balances, currency) })
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

  return app
}

function textField(value: FormDataEntryValue | null) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function safeObjectName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'receipt'
}
