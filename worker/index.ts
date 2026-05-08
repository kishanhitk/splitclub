/// <reference types="@cloudflare/workers-types" />

import { Hono } from 'hono'
import { z } from 'zod'
import { seedLedger } from '../src/data/seed'
import { calculateBalances, searchExpenses, simplifyDebts } from '../src/domain/split'

type Bindings = {
  DB: D1Database
  RECEIPTS: R2Bucket
  SYNC_QUEUE: Queue
}

const expenseSchema = z.object({
  description: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().length(3),
  groupId: z.string().nullable(),
  paidBy: z.string(),
  participants: z.array(z.string()).min(1),
  splitMode: z.enum(['equal', 'exact', 'percent', 'shares', 'adjustment']),
})

const app = new Hono<{ Bindings: Bindings }>()

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

app.get('/api/demo/groups/:id/balances', (c) => {
  const groupId = c.req.param('id')
  const currency = c.req.query('currency') ?? seedLedger.defaultCurrency
  const balances = calculateBalances(seedLedger, groupId, currency)
  return c.json({ balances, settlements: simplifyDebts(balances, currency) })
})

app.get('/api/demo/search', (c) => {
  const query = c.req.query('q') ?? ''
  return c.json({ expenses: searchExpenses(seedLedger, query) })
})

app.post('/api/expenses', async (c) => {
  const payload = expenseSchema.parse(await c.req.json())
  await c.env.SYNC_QUEUE.send({ type: 'expense.created', payload, createdAt: new Date().toISOString() })
  return c.json({ queued: true, expense: payload }, 202)
})

export default app
