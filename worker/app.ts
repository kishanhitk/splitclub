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
import { calculateBalances, simplifyDebts } from '../src/domain/split'
import { createD1LedgerStore, type LedgerStore } from './store'

export type Bindings = {
  DB: D1Database
  RECEIPTS: R2Bucket
  SYNC_QUEUE: Queue
  TEST_STORE?: LedgerStore
}

const getStore = (env: Bindings) => env.TEST_STORE ?? createD1LedgerStore(env.DB)

export function createApp() {
  const app = new Hono<{ Bindings: Bindings }>()

  app.onError((error, c) => {
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

  app.get('/api/members', async (c) => c.json({ members: await getStore(c.env).listMembers() }))

  app.post('/api/members', async (c) => {
    const member = await getStore(c.env).createMember(memberSchema.parse(await c.req.json()))
    return c.json({ member }, 201)
  })

  app.get('/api/friends', async (c) => c.json({ friends: await getStore(c.env).listFriends() }))

  app.post('/api/friends', async (c) => {
    const friend = await getStore(c.env).createFriend(friendSchema.parse(await c.req.json()))
    await c.env.SYNC_QUEUE?.send({ type: 'friend.created', friendId: friend.id, createdAt: new Date().toISOString() })
    return c.json({ friend }, 201)
  })

  app.get('/api/groups', async (c) => c.json({ groups: await getStore(c.env).listGroups() }))

  app.post('/api/groups', async (c) => {
    const group = await getStore(c.env).createGroup(groupSchema.parse(await c.req.json()))
    await c.env.SYNC_QUEUE?.send({ type: 'group.created', groupId: group.id, createdAt: new Date().toISOString() })
    return c.json({ group }, 201)
  })

  app.get('/api/groups/:id/invites', async (c) => c.json({ invites: await getStore(c.env).listGroupInvites(c.req.param('id')) }))

  app.post('/api/groups/:id/invites', async (c) => {
    const payload = groupInviteSchema.parse({ ...(await c.req.json()), groupId: c.req.param('id') })
    const invite = await getStore(c.env).createGroupInvite(payload)
    await c.env.SYNC_QUEUE?.send({ type: 'group_invite.created', inviteId: invite.id, groupId: invite.groupId, createdAt: new Date().toISOString() })
    return c.json({ invite }, 201)
  })

  app.put('/api/groups/:id/members/:userId', async (c) => {
    const payload = membershipSchema.parse({ ...(await c.req.json()), groupId: c.req.param('id'), userId: c.req.param('userId') })
    const membership = await getStore(c.env).updateMembership(payload)
    await c.env.SYNC_QUEUE?.send({ type: 'membership.updated', groupId: payload.groupId, userId: payload.userId, createdAt: new Date().toISOString() })
    return c.json({ membership })
  })

  app.delete('/api/groups/:id/members/:userId', async (c) => {
    await getStore(c.env).removeMembership(c.req.param('id'), c.req.param('userId'))
    await c.env.SYNC_QUEUE?.send({ type: 'membership.removed', groupId: c.req.param('id'), userId: c.req.param('userId'), createdAt: new Date().toISOString() })
    return c.json({ ok: true })
  })

  app.get('/api/expenses', async (c) => {
    const groupId = c.req.query('groupId')
    const filters = groupId === undefined ? {} : { groupId: groupId === 'null' ? null : groupId }
    const expenses = await getStore(c.env).listExpenses(filters)
    return c.json({ expenses })
  })

  app.post('/api/expenses', async (c) => {
    const payload = expenseSchema.parse(await c.req.json())
    const expense = await getStore(c.env).createExpense(payload)
    await c.env.SYNC_QUEUE?.send({ type: 'expense.created', expenseId: expense.id, createdAt: new Date().toISOString() })
    return c.json({ expense }, 201)
  })

  app.post('/api/settlements', async (c) => {
    const payload = settlementSchema.parse(await c.req.json())
    const settlement = await getStore(c.env).recordSettlement(payload)
    await c.env.SYNC_QUEUE?.send({ type: 'settlement.recorded', expenseId: settlement.id, createdAt: new Date().toISOString() })
    return c.json({ settlement }, 201)
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
    const expenses = await getStore(c.env).listExpenses(filters)
    return c.json({ expenses })
  })

  app.get('/api/groups/:id/balances', async (c) => {
    const store = getStore(c.env)
    const ledger = await store.getLedger()
    const groupId = c.req.param('id') === 'non-group' ? null : c.req.param('id')
    const currency = c.req.query('currency') ?? ledger.defaultCurrency
    const balances = calculateBalances(ledger, groupId, currency)
    return c.json({ balances, settlements: simplifyDebts(balances, currency) })
  })

  app.get('/api/sync', async (c) => {
    const store = getStore(c.env)
    const cursor = new Date().toISOString()
    return c.json({
      cursor,
      since: c.req.query('since') ?? null,
      ledger: await store.getLedger(),
      auditEvents: await store.listAuditEvents(),
    })
  })

  return app
}
