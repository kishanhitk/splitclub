import { describe, expect, test } from 'bun:test'
import { seedLedger } from '../src/data/seed'
import { createApp, type Bindings } from './app'
import { createMemoryLedgerStore } from './store'

const queueMessages: unknown[] = []
const receiptObjects: Array<{ key: string; size: number; contentType?: string }> = []

function createEnv(): Bindings {
  return {
    DB: {} as D1Database,
    RECEIPTS: {
      put: async (key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }) => {
        receiptObjects.push({ key, size: value.byteLength, contentType: options?.httpMetadata?.contentType })
        return null
      },
    } as unknown as R2Bucket,
    SYNC_QUEUE: {
      send: async (message: unknown) => {
        queueMessages.push(message)
      },
    } as unknown as Queue,
    TEST_STORE: createMemoryLedgerStore(seedLedger),
    TEST_AUTH_TOKENS: {
      'test-kishan': { id: 'kishan', email: 'kishan@example.com', name: 'Kishan Kumar', provider: 'test' },
      'test-outsider': { id: 'outsider', email: 'outsider@example.com', name: 'Outside User', provider: 'test' },
    },
  }
}

async function request(path: string, init: RequestInit = {}, env = createEnv(), auth = true) {
  const app = createApp()
  const headers = new Headers(init.headers)
  if (auth) headers.set('Authorization', 'Bearer test-kishan')
  return app.fetch(new Request(`https://splitclub.test${path}`, { ...init, headers }), env)
}

describe('SplitClub Worker API', () => {
  test('keeps public metadata open and protects ledger routes', async () => {
    const env = createEnv()

    const healthResponse = await request('/api/health', {}, env, false)
    expect(healthResponse.status).toBe(200)

    const inviteLandingResponse = await request('/invite/join_public', {}, env, false)
    const inviteLandingHtml = await inviteLandingResponse.text()
    expect(inviteLandingResponse.status).toBe(200)
    expect(inviteLandingHtml).toContain('SplitClub invite')
    expect(inviteLandingHtml).toContain('join_public')

    const groupsResponse = await request('/api/groups', {}, env, false)
    const groupsBody = (await groupsResponse.json()) as { error: string }
    expect(groupsResponse.status).toBe(401)
    expect(groupsBody.error).toBe('unauthorized')
  })

  test('scopes session and group access to the authenticated member', async () => {
    const env = createEnv()

    const sessionResponse = await request('/api/auth/session', {}, env)
    const sessionBody = (await sessionResponse.json()) as { user: { id: string } }
    expect(sessionBody.user.id).toBe('kishan')

    const outsiderResponse = await request(
      '/api/groups/goa/balances',
      { headers: { Authorization: 'Bearer test-outsider' } },
      env,
      false,
    )
    const outsiderBody = (await outsiderResponse.json()) as { error: string }
    expect(outsiderResponse.status).toBe(403)
    expect(outsiderBody.error).toBe('forbidden')
  })

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
          payments: [
            { memberId: 'kishan', value: 3000 },
            { memberId: 'anya', value: 1200 },
          ],
          participants: ['kishan', 'anya', 'dev', 'mia'],
          splitMode: 'equal',
          category: 'Tickets',
          kind: 'expense',
          date: '2026-05-08',
        }),
      },
      env,
    )
    const body = (await response.json()) as { expense: { description: string; payments?: Array<{ memberId: string; value: number }> } }

    expect(response.status).toBe(201)
    expect(body.expense.description).toBe('Museum tickets')
    expect(body.expense.payments).toContainEqual({ memberId: 'anya', value: 1200 })

    const searchResponse = await request('/api/search?q=museum&groupId=goa', {}, env)
    const searchBody = (await searchResponse.json()) as { expenses: unknown[] }
    expect(searchBody.expenses).toHaveLength(1)
    expect(queueMessages.some((message) => JSON.stringify(message).includes('expense.created'))).toBe(true)

    const invalidPayersResponse = await request(
      '/api/expenses',
      {
        method: 'POST',
        body: JSON.stringify({
          groupId: 'goa',
          description: 'Bad payer total',
          amount: 100,
          currency: 'INR',
          paidBy: 'kishan',
          payments: [{ memberId: 'kishan', value: 90 }],
          participants: ['kishan', 'anya'],
          splitMode: 'equal',
          category: 'Food',
          kind: 'expense',
          date: '2026-05-08',
        }),
      },
      env,
    )
    expect(invalidPayersResponse.status).toBe(400)
  })

  test('calculates balances and records settlements', async () => {
    const env = createEnv()

    const friendBalancesResponse = await request('/api/friends/balances?currency=INR', {}, env)
    const friendBalancesBody = (await friendBalancesResponse.json()) as {
      balances: Array<{ friendId: string; amount: number; breakdown: Array<{ scopeName: string }> }>
    }
    expect(friendBalancesResponse.status).toBe(200)
    expect(friendBalancesBody.balances.find((balance) => balance.friendId === 'dev')).toMatchObject({
      amount: -9000,
      breakdown: [{ scopeName: 'Apartment' }, { scopeName: 'Goa long weekend' }],
    })

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
          paymentMethod: 'upi',
          paymentReference: 'UPI-500',
          paymentStatus: 'confirmed',
        }),
      },
      env,
    )
    const settlementBody = (await settlementResponse.json()) as {
      settlement: { kind: string; paymentMethod?: string; paymentReference?: string; paymentStatus?: string }
    }
    expect(settlementResponse.status).toBe(201)
    expect(settlementBody.settlement.kind).toBe('settlement')
    expect(settlementBody.settlement).toMatchObject({
      paymentMethod: 'upi',
      paymentReference: 'UPI-500',
      paymentStatus: 'confirmed',
    })
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
        body: JSON.stringify({ invitedEmail: 'outsider@example.com', role: 'member', createdBy: 'kishan' }),
      },
      env,
    )
    const inviteBody = (await inviteResponse.json()) as { invite: { status: string; token: string } }
    expect(inviteResponse.status).toBe(201)
    expect(inviteBody.invite.status).toBe('pending')
    expect(inviteBody.invite.token).toStartWith('join_')

    const acceptInviteResponse = await request(
      `/api/invites/${inviteBody.invite.token}/accept`,
      { method: 'POST', headers: { Authorization: 'Bearer test-outsider' } },
      env,
      false,
    )
    const acceptInviteBody = (await acceptInviteResponse.json()) as { invite: { status: string; acceptedBy: string }; membership: { userId: string; role: string } }
    expect(acceptInviteResponse.status).toBe(200)
    expect(acceptInviteBody.invite).toMatchObject({ status: 'accepted', acceptedBy: 'outsider' })
    expect(acceptInviteBody.membership).toMatchObject({ userId: 'outsider', role: 'member' })

    const repeatAcceptResponse = await request(
      `/api/invites/${inviteBody.invite.token}/accept`,
      { method: 'POST', headers: { Authorization: 'Bearer test-outsider' } },
      env,
      false,
    )
    expect(repeatAcceptResponse.status).toBe(409)

    const missingAcceptResponse = await request('/api/invites/join_missing/accept', { method: 'POST' }, env)
    expect(missingAcceptResponse.status).toBe(404)

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

    const blockedRemoveResponse = await request(`/api/groups/goa/members/dev`, { method: 'DELETE' }, env)
    const blockedRemoveBody = (await blockedRemoveResponse.json()) as { error: string; balance: { memberId: string } }
    expect(blockedRemoveResponse.status).toBe(409)
    expect(blockedRemoveBody).toMatchObject({ error: 'member_has_balance', balance: { memberId: 'dev' } })

    const zeroBalanceRemoveResponse = await request(`/api/groups/goa/members/${friendBody.friend.id}`, { method: 'DELETE' }, env)
    expect(zeroBalanceRemoveResponse.status).toBe(200)
  })

  test('deletes restores and hides groups from active lists', async () => {
    const env = createEnv()

    const deleteResponse = await request('/api/groups/goa', { method: 'DELETE' }, env)
    const deleteBody = (await deleteResponse.json()) as { group: { id: string; deletedAt?: string } }
    expect(deleteResponse.status).toBe(200)
    expect(deleteBody.group).toMatchObject({ id: 'goa' })
    expect(deleteBody.group.deletedAt).toBeTruthy()

    const groupsResponse = await request('/api/groups', {}, env)
    const groupsBody = (await groupsResponse.json()) as { groups: Array<{ id: string }> }
    expect(groupsBody.groups.some((group) => group.id === 'goa')).toBe(false)

    const deletedResponse = await request('/api/groups/deleted', {}, env)
    const deletedBody = (await deletedResponse.json()) as { groups: Array<{ id: string; deletedAt?: string }> }
    expect(deletedBody.groups).toContainEqual(expect.objectContaining({ id: 'goa' }))

    const restoreResponse = await request('/api/groups/goa/restore', { method: 'POST' }, env)
    const restoreBody = (await restoreResponse.json()) as { group: { id: string; deletedAt?: string } }
    expect(restoreResponse.status).toBe(200)
    expect(restoreBody.group.deletedAt).toBeUndefined()

    const restoredGroupsResponse = await request('/api/groups', {}, env)
    const restoredGroupsBody = (await restoredGroupsResponse.json()) as { groups: Array<{ id: string }> }
    expect(restoredGroupsBody.groups.some((group) => group.id === 'goa')).toBe(true)
  })

  test('updates group default split settings with validation', async () => {
    const env = createEnv()

    const invalidResponse = await request(
      '/api/groups/goa/defaults',
      {
        method: 'PUT',
        body: JSON.stringify({
          defaultSplitMode: 'percent',
          defaultSplits: [
            { memberId: 'kishan', value: 50 },
            { memberId: 'anya', value: 20 },
            { memberId: 'dev', value: 20 },
            { memberId: 'mia', value: 0 },
          ],
        }),
      },
      env,
    )
    const invalidBody = (await invalidResponse.json()) as { error: string; message: string }
    expect(invalidResponse.status).toBe(400)
    expect(invalidBody).toMatchObject({ error: 'invalid_group_defaults', message: '90% allocated' })

    const response = await request(
      '/api/groups/goa/defaults',
      {
        method: 'PUT',
        body: JSON.stringify({
          simplifyDebts: false,
          defaultSplitMode: 'percent',
          defaultSplits: [
            { memberId: 'kishan', value: 40 },
            { memberId: 'anya', value: 20 },
            { memberId: 'dev', value: 20 },
            { memberId: 'mia', value: 20 },
          ],
        }),
      },
      env,
    )
    const body = (await response.json()) as { group: { simplifyDebts: boolean; defaultSplitMode: string; defaultSplits: Array<{ memberId: string; value: number }> } }
    expect(response.status).toBe(200)
    expect(body.group.simplifyDebts).toBe(false)
    expect(body.group.defaultSplitMode).toBe('percent')
    expect(body.group.defaultSplits).toContainEqual({ memberId: 'kishan', value: 40 })

    const balancesResponse = await request('/api/groups/goa/balances?currency=INR', {}, env)
    const balancesBody = (await balancesResponse.json()) as { settlements: Array<{ from: string; to: string; amount: number; currency: string }> }
    expect(balancesBody.settlements).toHaveLength(5)
    expect(balancesBody.settlements).toContainEqual({ from: 'dev', to: 'anya', amount: 840, currency: 'INR' })
    expect(queueMessages.some((message) => JSON.stringify(message).includes('group.defaults.updated'))).toBe(true)
  })

  test('exports scoped CSV and JSON backup files', async () => {
    const env = createEnv()

    const csvResponse = await request('/api/export?format=csv', {}, env)
    const csv = await csvResponse.text()
    expect(csvResponse.status).toBe(200)
    expect(csvResponse.headers.get('content-type')).toContain('text/csv')
    expect(csvResponse.headers.get('content-disposition')).toContain('splitclub-export.csv')
    expect(csv).toContain('date,description,category')
    expect(csv).toContain('"Beach villa"')

    const jsonResponse = await request('/api/export?format=json', {}, env)
    const backup = (await jsonResponse.json()) as { app: string; ledger: { groups: Array<{ id: string }> } }
    expect(jsonResponse.status).toBe(200)
    expect(jsonResponse.headers.get('content-disposition')).toContain('splitclub-backup.json')
    expect(backup.app).toBe('SplitClub')
    expect(backup.ledger.groups.map((group) => group.id)).toContain('goa')

    const invalidResponse = await request('/api/export?format=xlsx', {}, env)
    expect(invalidResponse.status).toBe(400)
  })

  test('uploads a receipt to R2 and returns OCR line items for review', async () => {
    const env = createEnv()
    const form = new FormData()
    form.set('file', new File(['receipt image bytes'], 'dinner.jpg', { type: 'image/jpeg' }))
    form.set('expenseId', 'e2')
    form.set('ocrText', 'Fish thali 520\nLime soda 160')
    form.append('assignedTo', 'kishan')
    form.append('assignedTo', 'anya')

    const response = await request('/api/receipts', { method: 'POST', body: form }, env)
    const body = (await response.json()) as {
      receipt: { objectKey: string; ocrStatus: string }
      extractedItems: Array<{ id?: string; label: string; amount: number; assignedTo: string[] }>
    }

    expect(response.status).toBe(201)
    expect(body.receipt.objectKey).toContain('receipts/kishan/receipt_')
    expect(body.receipt.ocrStatus).toBe('complete')
    expect(body.extractedItems).toEqual([
      { id: 'ocr-1', label: 'Fish thali', amount: 520, assignedTo: ['kishan', 'anya'] },
      { id: 'ocr-2', label: 'Lime soda', amount: 160, assignedTo: ['kishan', 'anya'] },
    ])
    expect(receiptObjects.at(-1)?.contentType).toBe('image/jpeg')
  })

  test('updates comments deletes restores and returns expense history', async () => {
    const env = createEnv()

    const commentResponse = await request(
      '/api/expenses/e2/comments',
      {
        method: 'POST',
        body: JSON.stringify({ body: 'Please attach the final bill.' }),
      },
      env,
    )
    const commentBody = (await commentResponse.json()) as { comment: { body: string; memberId: string } }
    expect(commentResponse.status).toBe(201)
    expect(commentBody.comment).toMatchObject({ body: 'Please attach the final bill.', memberId: 'kishan' })

    const updateResponse = await request(
      '/api/expenses/e2',
      {
        method: 'PUT',
        body: JSON.stringify({ description: 'Dinner at Martins, final bill', amount: 7000 }),
      },
      env,
    )
    const updateBody = (await updateResponse.json()) as {
      expense: { description: string; amount: number; splitMode: string; category: string; receiptItems: unknown[] }
    }
    expect(updateResponse.status).toBe(200)
    expect(updateBody.expense.description).toBe('Dinner at Martins, final bill')
    expect(updateBody.expense.amount).toBe(7000)
    expect(updateBody.expense.splitMode).toBe('percent')
    expect(updateBody.expense.category).toBe('Food')
    expect(updateBody.expense.receiptItems).toHaveLength(3)

    const detailResponse = await request('/api/expenses/e2', {}, env)
    const detailBody = (await detailResponse.json()) as { comments: unknown[]; history: Array<{ action: string }> }
    expect(detailBody.comments).toHaveLength(1)
    expect(detailBody.history.map((event) => event.action)).toContain('commented')
    expect(detailBody.history.map((event) => event.action)).toContain('updated')

    const deleteResponse = await request('/api/expenses/e2', { method: 'DELETE' }, env)
    const deleteBody = (await deleteResponse.json()) as { expense: { deletedAt?: string } }
    expect(deleteResponse.status).toBe(200)
    expect(deleteBody.expense.deletedAt).toBeTruthy()

    const searchResponse = await request('/api/search?q=martins&groupId=goa', {}, env)
    const searchBody = (await searchResponse.json()) as { expenses: unknown[] }
    expect(searchBody.expenses).toHaveLength(0)

    const restoreResponse = await request('/api/expenses/e2/restore', { method: 'POST' }, env)
    const restoreBody = (await restoreResponse.json()) as { expense: { deletedAt?: string; history: Array<{ action: string }> } }
    expect(restoreResponse.status).toBe(200)
    expect(restoreBody.expense.deletedAt).toBeUndefined()
    expect(restoreBody.expense.history.map((event) => event.action)).toContain('restored')

    const notificationsResponse = await request('/api/notifications?limit=10', {}, env)
    const notificationsBody = (await notificationsResponse.json()) as {
      notifications: Array<{ type: string; title: string; splitwiseType: number; entityId: string; read: boolean }>
    }
    expect(notificationsResponse.status).toBe(200)
    expect(notificationsBody.notifications.map((notification) => notification.type)).toContain('comment_added')
    expect(notificationsBody.notifications.map((notification) => notification.type)).toContain('expense_deleted')
    expect(notificationsBody.notifications.map((notification) => notification.type)).toContain('expense_restored')
    expect(notificationsBody.notifications.find((notification) => notification.type === 'comment_added')).toMatchObject({
      splitwiseType: 3,
      entityId: 'e2',
      read: false,
    })
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
