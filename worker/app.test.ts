import { describe, expect, test } from 'bun:test'
import { seedLedger } from '../src/data/seed'
import { createApp, type Bindings } from './app'
import { createMemoryLedgerStore } from './store'

const queueMessages: unknown[] = []

function createEnv(): Bindings {
  return {
    DB: {} as D1Database,
    RECEIPTS: {} as R2Bucket,
    SYNC_QUEUE: {
      send: async (message: unknown) => {
        queueMessages.push(message)
      },
    } as unknown as Queue,
    TEST_STORE: createMemoryLedgerStore(seedLedger),
  }
}

async function request(path: string, init: RequestInit = {}, env = createEnv()) {
  const app = createApp()
  return app.fetch(new Request(`https://splitclub.test${path}`, init), env)
}

describe('SplitClub Worker API', () => {
  test('lists groups and members from the store', async () => {
    const env = createEnv()

    const groupsResponse = await request('/api/groups', {}, env)
    const groupsBody = (await groupsResponse.json()) as { groups: Array<{ id: string }> }
    expect(groupsResponse.status).toBe(200)
    expect(groupsBody.groups.map((group: { id: string }) => group.id)).toContain('goa')

    const membersResponse = await request('/api/members', {}, env)
    const membersBody = (await membersResponse.json()) as { members: unknown[] }
    expect(membersBody.members).toHaveLength(4)
  })

  test('creates an expense and returns updated search results', async () => {
    const env = createEnv()
    const response = await request(
      '/api/expenses',
      {
        method: 'POST',
        body: JSON.stringify({
          groupId: 'goa',
          description: 'Museum tickets',
          amount: 4200,
          currency: 'INR',
          paidBy: 'kishan',
          participants: ['kishan', 'anya', 'dev', 'mia'],
          splitMode: 'equal',
          category: 'Tickets',
          kind: 'expense',
          date: '2026-05-08',
        }),
      },
      env,
    )
    const body = (await response.json()) as { expense: { description: string } }

    expect(response.status).toBe(201)
    expect(body.expense.description).toBe('Museum tickets')

    const searchResponse = await request('/api/search?q=museum&groupId=goa', {}, env)
    const searchBody = (await searchResponse.json()) as { expenses: unknown[] }
    expect(searchBody.expenses).toHaveLength(1)
    expect(queueMessages.some((message) => JSON.stringify(message).includes('expense.created'))).toBe(true)
  })

  test('calculates balances and records settlements', async () => {
    const env = createEnv()

    const balancesResponse = await request('/api/groups/goa/balances?currency=INR', {}, env)
    const balancesBody = (await balancesResponse.json()) as { settlements: Array<{ to: string }> }
    expect(balancesResponse.status).toBe(200)
    expect(balancesBody.settlements[0].to).toBe('kishan')

    const settlementResponse = await request(
      '/api/settlements',
      {
        method: 'POST',
        body: JSON.stringify({
          groupId: 'goa',
          from: 'mia',
          to: 'kishan',
          amount: 500,
          currency: 'INR',
          date: '2026-05-08',
        }),
      },
      env,
    )
    const settlementBody = (await settlementResponse.json()) as { settlement: { kind: string } }
    expect(settlementResponse.status).toBe(201)
    expect(settlementBody.settlement.kind).toBe('settlement')
  })

  test('creates friends, invites members, and updates permissions', async () => {
    const env = createEnv()

    const friendResponse = await request(
      '/api/friends',
      {
        method: 'POST',
        body: JSON.stringify({ name: 'Rhea', email: 'rhea@example.com', preferredPayment: 'upi' }),
      },
      env,
    )
    const friendBody = (await friendResponse.json()) as { friend: { id: string; name: string } }
    expect(friendResponse.status).toBe(201)
    expect(friendBody.friend.name).toBe('Rhea')

    const inviteResponse = await request(
      '/api/groups/goa/invites',
      {
        method: 'POST',
        body: JSON.stringify({ invitedEmail: 'rhea@example.com', role: 'member', createdBy: 'kishan' }),
      },
      env,
    )
    const inviteBody = (await inviteResponse.json()) as { invite: { status: string; token: string } }
    expect(inviteResponse.status).toBe(201)
    expect(inviteBody.invite.status).toBe('pending')
    expect(inviteBody.invite.token).toStartWith('join_')

    const membershipResponse = await request(
      `/api/groups/goa/members/${friendBody.friend.id}`,
      {
        method: 'PUT',
        body: JSON.stringify({ role: 'viewer' }),
      },
      env,
    )
    const membershipBody = (await membershipResponse.json()) as { membership: { role: string } }
    expect(membershipResponse.status).toBe(200)
    expect(membershipBody.membership.role).toBe('viewer')
  })

  test('exposes sync payload and validation errors', async () => {
    const env = createEnv()

    const syncResponse = await request('/api/sync?since=cursor-1', {}, env)
    const syncBody = (await syncResponse.json()) as { since: string; ledger: { expenses: unknown[] } }
    expect(syncResponse.status).toBe(200)
    expect(syncBody.since).toBe('cursor-1')
    expect(syncBody.ledger.expenses.length).toBeGreaterThan(0)

    const invalidResponse = await request(
      '/api/expenses',
      {
        method: 'POST',
        body: JSON.stringify({ description: '', amount: -1 }),
      },
      env,
    )
    const invalidBody = (await invalidResponse.json()) as { error: string }
    expect(invalidResponse.status).toBe(400)
    expect(invalidBody.error).toBe('validation_error')
  })
})
