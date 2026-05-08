import { describe, expect, test } from 'bun:test'
import { seedLedger } from '../src/data/seed'
import { createApp, runRecurringScheduler, type Bindings } from './app'
import { createMemoryLedgerStore } from './store'

const queueMessages: unknown[] = []
const receiptObjects: Array<{ key: string; size: number; contentType?: string }> = []
const jwksUrl = 'https://issuer.splitclub.test/.well-known/jwks.json'
const oidcIssuer = 'https://issuer.splitclub.test'
const oidcAudience = 'splitclub-api'

function createEnv(): Bindings {
  return {
    DB: {} as D1Database,
    RECEIPTS: {
      put: async (key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }) => {
        receiptObjects.push({ key, size: value.byteLength, contentType: options?.httpMetadata?.contentType })
        return null
      },
      get: async () => ({
        arrayBuffer: async () => new TextEncoder().encode('retry bytes').buffer,
      }),
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

async function createSignedBearer(payload: Record<string, unknown>) {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )
  const publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey) as JsonWebKey & { kid?: string; alg?: string; use?: string }
  publicJwk.kid = 'splitclub-test-key'
  publicJwk.alg = 'RS256'
  publicJwk.use = 'sig'
  const header = encodeBase64UrlJson({ alg: 'RS256', typ: 'JWT', kid: publicJwk.kid })
  const body = encodeBase64UrlJson({
    iss: oidcIssuer,
    aud: oidcAudience,
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...payload,
  })
  const signature = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    keyPair.privateKey,
    new TextEncoder().encode(`${header}.${body}`),
  )
  return {
    token: `${header}.${body}.${encodeBase64UrlBytes(signature)}`,
    jwks: { keys: [publicJwk] },
  }
}

function encodeBase64UrlJson(value: unknown) {
  return encodeBase64UrlBytes(new TextEncoder().encode(JSON.stringify(value)))
}

function encodeBase64UrlBytes(value: ArrayBuffer | Uint8Array) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value)
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
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
    expect(inviteLandingHtml).toContain('splitclub://invite/join_public')

    const groupsResponse = await request('/api/groups', {}, env, false)
    const groupsBody = (await groupsResponse.json()) as { error: string }
    expect(groupsResponse.status).toBe(401)
    expect(groupsBody.error).toBe('unauthorized')
  })

  test('reports public auth provider readiness without leaking signing key URLs', async () => {
    const env = {
      ...createEnv(),
      AUTH_PROVIDER_NAME: 'clerk',
      AUTH_JWKS_URL: jwksUrl,
      AUTH_JWT_ISSUER: oidcIssuer,
      AUTH_JWT_AUDIENCE: oidcAudience,
    }

    const response = await request('/api/auth/config', {}, env, false)
    const body = (await response.json()) as {
      provider: string
      configured: boolean
      issuer: string
      issuerHost: string
      jwksConfigured: boolean
      audienceConfigured: boolean
      supportedAlgorithms: string[]
    }

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      provider: 'clerk',
      configured: true,
      issuer: oidcIssuer,
      issuerHost: 'issuer.splitclub.test',
      jwksConfigured: true,
      audienceConfigured: true,
    })
    expect(body.supportedAlgorithms).toContain('RS256')
    expect(JSON.stringify(body)).not.toContain(jwksUrl)
  })

  test('links phone claims from production OIDC tokens into the authenticated member', async () => {
    const env = {
      ...createEnv(),
      AUTH_PROVIDER_NAME: 'clerk',
      AUTH_JWKS_URL: jwksUrl,
      AUTH_JWT_ISSUER: oidcIssuer,
      AUTH_JWT_AUDIENCE: oidcAudience,
    }
    const { token, jwks } = await createSignedBearer({
      sub: 'oidc-kishan',
      email: 'oidc@example.com',
      phone_number: '+91 95555 55555',
      name: 'OIDC Kishan',
      picture: 'OK',
    })
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url === jwksUrl) {
        return new Response(JSON.stringify(jwks), {
          headers: { 'content-type': 'application/json' },
        })
      }
      return originalFetch(input, init)
    }) as typeof fetch

    try {
      const response = await request('/api/auth/session', { headers: { Authorization: `Bearer ${token}` } }, env, false)
      const body = (await response.json()) as { user: { id: string; email?: string; phone?: string; provider?: string } }

      expect(response.status).toBe(200)
      expect(body.user).toMatchObject({
        id: 'oidc-kishan',
        email: 'oidc@example.com',
        phone: '+91 95555 55555',
      })
    } finally {
      globalThis.fetch = originalFetch
    }
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

  test('updates the authenticated account identity used by invite matching', async () => {
    const env = createEnv()

    const updateResponse = await request(
      '/api/account',
      {
        method: 'PUT',
        body: JSON.stringify({
          name: 'Kishan Linked',
          email: 'linked@example.com',
          phone: '+91 99999 99999',
          preferredPayment: 'upi',
        }),
      },
      env,
    )
    const updateBody = (await updateResponse.json()) as { user: { id: string; name: string; email: string; phone: string; preferredPayment: string } }
    expect(updateResponse.status).toBe(200)
    expect(updateBody.user).toMatchObject({
      id: 'kishan',
      name: 'Kishan Linked',
      email: 'linked@example.com',
      phone: '+91 99999 99999',
      preferredPayment: 'upi',
    })

    const sessionResponse = await request('/api/auth/session', {}, env)
    const sessionBody = (await sessionResponse.json()) as { user: { email?: string; phone?: string } }
    expect(sessionBody.user).toMatchObject({ email: 'linked@example.com', phone: '+91 99999 99999' })
    expect(queueMessages.some((message) => JSON.stringify(message).includes('account.updated'))).toBe(true)
  })

  test('rejects stale account updates with member conflict details', async () => {
    const env = createEnv()
    const baseRevision = 'Kishan|kishan@example.com||upi'

    const firstUpdate = await request(
      '/api/account',
      {
        method: 'PUT',
        headers: { 'x-splitclub-base-revision': baseRevision },
        body: JSON.stringify({
          name: 'Kishan Fresh',
          email: 'fresh@example.com',
          phone: '+91 98888 88888',
          preferredPayment: 'upi',
        }),
      },
      env,
    )
    expect(firstUpdate.status).toBe(200)

    const staleUpdate = await request(
      '/api/account',
      {
        method: 'PUT',
        headers: { 'x-splitclub-base-revision': baseRevision },
        body: JSON.stringify({
          name: 'Kishan Stale',
          email: 'stale@example.com',
          preferredPayment: 'bank',
        }),
      },
      env,
    )
    const body = (await staleUpdate.json()) as { error: string; conflict: { entity: string; recordId: string; baseRevision: string } }
    expect(staleUpdate.status).toBe(409)
    expect(body.error).toBe('member_conflict')
    expect(body.conflict).toMatchObject({ entity: 'member', recordId: 'kishan', baseRevision })
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

  test('lists posts and skips recurring schedules with history', async () => {
    const env = createEnv()

    const schedulesResponse = await request('/api/recurring', {}, env)
    const schedulesBody = (await schedulesResponse.json()) as {
      schedules: Array<{ sourceExpenseId: string; dueDate: string; history: unknown[] }>
    }
    expect(schedulesResponse.status).toBe(200)
    expect(schedulesBody.schedules.find((schedule) => schedule.sourceExpenseId === 'e3')).toMatchObject({
      dueDate: '2026-06-03',
      history: [],
    })

    const postResponse = await request('/api/recurring/e3/post', { method: 'POST' }, env)
    const postBody = (await postResponse.json()) as {
      occurrence: { id: string; recurrence: string; notes: string }
      source: { date: string }
      event: { action: string; dueDate: string; occurrenceExpenseId: string }
    }
    expect(postResponse.status).toBe(201)
    expect(postBody.occurrence.recurrence).toBe('none')
    expect(postBody.occurrence.notes).toContain('generated-from:e3')
    expect(postBody.source.date).toBe('2026-06-03')
    expect(postBody.event).toMatchObject({ action: 'posted', dueDate: '2026-06-03', occurrenceExpenseId: postBody.occurrence.id })

    const skipResponse = await request('/api/recurring/e3/skip', { method: 'POST' }, env)
    const skipBody = (await skipResponse.json()) as { source: { date: string }; event: { action: string; dueDate: string } }
    expect(skipResponse.status).toBe(200)
    expect(skipBody.source.date).toBe('2026-07-03')
    expect(skipBody.event).toMatchObject({ action: 'skipped', dueDate: '2026-07-03' })

    const updatedResponse = await request('/api/recurring', {}, env)
    const updatedBody = (await updatedResponse.json()) as {
      schedules: Array<{ sourceExpenseId: string; dueDate: string; history: Array<{ action: string }> }>
    }
    const rent = updatedBody.schedules.find((schedule) => schedule.sourceExpenseId === 'e3')
    expect(rent?.dueDate).toBe('2026-08-03')
    expect(rent?.history.map((event) => event.action)).toEqual(['skipped', 'posted'])
  })

  test('scheduled recurring scan enqueues due bill notifications', async () => {
    const env = createEnv()
    const before = queueMessages.length

    const result = await runRecurringScheduler(env, '2026-05-31')
    const messages = queueMessages.slice(before) as Array<{ type?: string; notificationId?: string; sourceExpenseId?: string; dueDate?: string; reminderDate?: string }>

    expect(result).toMatchObject({ asOf: '2026-05-31', scanned: 1, queued: 1 })
    expect(messages).toContainEqual(expect.objectContaining({
      type: 'recurring.due',
      notificationId: 'recurring:e3:2026-06-03',
      sourceExpenseId: 'e3',
      dueDate: '2026-06-03',
      reminderDate: '2026-05-31',
    }))
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

    const mismatchedAcceptResponse = await request(
      `/api/invites/${inviteBody.invite.token}/accept`,
      { method: 'POST' },
      env,
    )
    const mismatchedAcceptBody = (await mismatchedAcceptResponse.json()) as { error: string }
    expect(mismatchedAcceptResponse.status).toBe(403)
    expect(mismatchedAcceptBody.error).toBe('invite_forbidden')

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

  test('rejects stale group pushes with conflict details', async () => {
    const env = createEnv()

    const groupsResponse = await request('/api/groups', {}, env)
    const groupsBody = (await groupsResponse.json()) as { groups: Array<{ id: string; updatedAt?: string; name: string }> }
    const goa = groupsBody.groups.find((group) => group.id === 'goa')
    expect(goa).toBeTruthy()
    const baseRevision = goa?.updatedAt ?? goa?.name ?? 'goa'

    const firstDefaultsResponse = await request(
      '/api/groups/goa/defaults',
      {
        method: 'PUT',
        headers: { 'x-splitclub-base-revision': baseRevision },
        body: JSON.stringify({
          simplifyDebts: false,
          defaultSplitMode: 'shares',
          defaultSplits: [
            { memberId: 'kishan', value: 1 },
            { memberId: 'anya', value: 1 },
            { memberId: 'dev', value: 2 },
            { memberId: 'mia', value: 1 },
          ],
        }),
      },
      env,
    )
    expect(firstDefaultsResponse.status).toBe(200)

    const staleDefaultsResponse = await request(
      '/api/groups/goa/defaults',
      {
        method: 'PUT',
        headers: { 'x-splitclub-base-revision': baseRevision },
        body: JSON.stringify({
          simplifyDebts: true,
          defaultSplitMode: 'equal',
          defaultSplits: [],
        }),
      },
      env,
    )
    const staleDefaultsBody = (await staleDefaultsResponse.json()) as { error: string; conflict: { recordId: string; baseRevision: string; currentRevision?: string } }
    expect(staleDefaultsResponse.status).toBe(409)
    expect(staleDefaultsBody.error).toBe('group_conflict')
    expect(staleDefaultsBody.conflict).toMatchObject({ recordId: 'goa', baseRevision })
    expect(staleDefaultsBody.conflict.currentRevision).not.toBe(baseRevision)

    const staleDeleteResponse = await request(
      '/api/groups/goa',
      { method: 'DELETE', headers: { 'if-unmodified-since': baseRevision } },
      env,
    )
    expect(staleDeleteResponse.status).toBe(409)
  })

  test('rejects stale collaboration pushes with group conflict details', async () => {
    const env = createEnv()

    const inviteResponse = await request(
      '/api/groups/goa/invites',
      {
        method: 'POST',
        headers: { 'x-splitclub-base-revision': 'stale-group-copy' },
        body: JSON.stringify({ invitedEmail: 'new@example.com', role: 'member' }),
      },
      env,
    )
    const inviteBody = (await inviteResponse.json()) as { error: string; conflict: { entity: string; recordId: string } }
    expect(inviteResponse.status).toBe(409)
    expect(inviteBody.error).toBe('group_conflict')
    expect(inviteBody.conflict).toMatchObject({ entity: 'group', recordId: 'goa' })

    const roleResponse = await request(
      '/api/groups/goa/members/anya',
      {
        method: 'PUT',
        headers: { 'x-splitclub-base-revision': 'stale-group-copy' },
        body: JSON.stringify({ role: 'admin' }),
      },
      env,
    )
    const roleBody = (await roleResponse.json()) as { error: string; conflict: { entity: string; recordId: string } }
    expect(roleResponse.status).toBe(409)
    expect(roleBody.error).toBe('group_conflict')
    expect(roleBody.conflict).toMatchObject({ entity: 'group', recordId: 'goa' })

    const removalResponse = await request(
      '/api/groups/goa/members/anya',
      {
        method: 'DELETE',
        headers: { 'x-splitclub-base-revision': 'stale-group-copy' },
      },
      env,
    )
    const removalBody = (await removalResponse.json()) as { error: string; conflict: { entity: string; recordId: string } }
    expect(removalResponse.status).toBe(409)
    expect(removalBody.error).toBe('group_conflict')
    expect(removalBody.conflict).toMatchObject({ entity: 'group', recordId: 'goa' })
  })

  test('rejects stale grouped settlement pushes with group conflict details', async () => {
    const env = createEnv()
    const groupsResponse = await request('/api/groups', {}, env)
    const groupsBody = (await groupsResponse.json()) as { groups: Array<{ id: string; updatedAt?: string; name: string }> }
    const goa = groupsBody.groups.find((group) => group.id === 'goa')
    const baseRevision = goa?.updatedAt ?? goa?.name ?? 'goa'

    const firstDefaultsResponse = await request(
      '/api/groups/goa/defaults',
      {
        method: 'PUT',
        headers: { 'x-splitclub-base-revision': baseRevision },
        body: JSON.stringify({
          simplifyDebts: false,
          defaultSplitMode: 'equal',
          defaultSplits: [],
        }),
      },
      env,
    )
    expect(firstDefaultsResponse.status).toBe(200)

    const settlementResponse = await request(
      '/api/settlements',
      {
        method: 'POST',
        headers: { 'x-splitclub-base-revision': baseRevision },
        body: JSON.stringify({
          groupId: 'goa',
          from: 'anya',
          to: 'kishan',
          amount: 100,
          currency: 'INR',
          date: '2026-05-08',
        }),
      },
      env,
    )
    const body = (await settlementResponse.json()) as { error: string; conflict: { entity: string; recordId: string; baseRevision: string } }
    expect(settlementResponse.status).toBe(409)
    expect(body.error).toBe('group_conflict')
    expect(body.conflict).toMatchObject({ entity: 'group', recordId: 'goa', baseRevision })
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
      receipt: { id: string; objectKey: string; ocrStatus: string; reviewHistory: Array<{ action: string; source: string; itemCount: number }> }
      extractedItems: Array<{ id?: string; label: string; amount: number; assignedTo: string[] }>
    }

    expect(response.status).toBe(201)
    expect(body.receipt.objectKey).toContain('receipts/kishan/receipt_')
    expect(body.receipt.ocrStatus).toBe('complete')
    expect(body.receipt.reviewHistory[0]).toMatchObject({ action: 'uploaded', source: 'review_text', itemCount: 2 })
    expect(body.extractedItems).toEqual([
      { id: 'ocr-1', label: 'Fish thali', amount: 520, assignedTo: ['kishan', 'anya'] },
      { id: 'ocr-2', label: 'Lime soda', amount: 160, assignedTo: ['kishan', 'anya'] },
    ])
    expect(receiptObjects.at(-1)?.contentType).toBe('image/jpeg')

    const fileResponse = await request(`/api/receipts/${body.receipt.id}/file`, {}, env)
    expect(fileResponse.status).toBe(200)
    expect(fileResponse.headers.get('content-type')).toBe('image/jpeg')
    expect(fileResponse.headers.get('content-disposition')).toContain('filename="dinner.jpg"')
    expect(await fileResponse.text()).toBe('retry bytes')

    const outsiderFileResponse = await request(
      `/api/receipts/${body.receipt.id}/file`,
      { headers: { Authorization: 'Bearer test-outsider' } },
      env,
      false,
    )
    expect(outsiderFileResponse.status).toBe(404)
  })

  test('retries receipt OCR and replaces extracted line items', async () => {
    const env = createEnv()
    const form = new FormData()
    form.set('file', new File(['receipt image bytes'], 'pending.pdf', { type: 'application/pdf' }))

    const uploadResponse = await request('/api/receipts', { method: 'POST', body: form }, env)
    const uploadBody = (await uploadResponse.json()) as { receipt: { id: string; ocrStatus: string; extractedItems: unknown[]; reviewHistory: unknown[] } }
    expect(uploadResponse.status).toBe(201)
    expect(uploadBody.receipt.ocrStatus).toBe('pending')

    const retryResponse = await request(
      `/api/receipts/${uploadBody.receipt.id}/retry`,
      {
        method: 'POST',
        body: JSON.stringify({
          ocrText: 'Paneer tikka 420\nNaan basket 180',
          assignedTo: ['kishan', 'anya'],
        }),
      },
      env,
    )
    const retryBody = (await retryResponse.json()) as {
      receipt: { ocrStatus: string; extractedItems: Array<{ id?: string; label: string; amount: number; assignedTo: string[] }>; reviewHistory: Array<{ action: string; source: string; itemCount: number }> }
      extractedItems: Array<{ id?: string; label: string; amount: number; assignedTo: string[] }>
    }
    expect(retryResponse.status).toBe(200)
    expect(retryBody.receipt.ocrStatus).toBe('complete')
    expect(retryBody.extractedItems).toEqual([
      { id: 'ocr-1', label: 'Paneer tikka', amount: 420, assignedTo: ['kishan', 'anya'] },
      { id: 'ocr-2', label: 'Naan basket', amount: 180, assignedTo: ['kishan', 'anya'] },
    ])
    expect(retryBody.receipt.extractedItems).toHaveLength(2)
    expect(retryBody.receipt.reviewHistory.map((event) => event.action)).toEqual(['retried', 'uploaded'])
    expect(retryBody.receipt.reviewHistory[0]).toMatchObject({ source: 'review_text', itemCount: 2 })
    expect(queueMessages.some((message) => JSON.stringify(message).includes('receipt.ocr_retried'))).toBe(true)
  })

  test('links a cloud receipt to a saved expense and exposes lifecycle history', async () => {
    const env = createEnv()
    const form = new FormData()
    form.set('file', new File(['receipt image bytes'], 'linked.jpg', { type: 'image/jpeg' }))
    form.set('ocrText', 'Room snacks 300')
    form.append('assignedTo', 'kishan')
    form.append('assignedTo', 'anya')

    const uploadResponse = await request('/api/receipts', { method: 'POST', body: form }, env)
    const uploadBody = (await uploadResponse.json()) as { receipt: { id: string } }

    const createResponse = await request(
      '/api/expenses',
      {
        method: 'POST',
        body: JSON.stringify({
          groupId: 'goa',
          description: 'Room snacks',
          amount: 300,
          currency: 'INR',
          paidBy: 'kishan',
          participants: ['kishan', 'anya'],
          splitMode: 'equal',
          category: 'Food',
          kind: 'expense',
          date: '2026-05-08',
          attachmentName: 'linked.jpg',
          receiptId: uploadBody.receipt.id,
          receiptItems: [{ label: 'Room snacks', amount: 300, assignedTo: ['kishan', 'anya'] }],
        }),
      },
      env,
    )
    const createBody = (await createResponse.json()) as { expense: { id: string; receiptId?: string } }
    expect(createResponse.status).toBe(201)
    expect(createBody.expense.receiptId).toBe(uploadBody.receipt.id)

    const receiptsResponse = await request('/api/receipts', {}, env)
    const receiptsBody = (await receiptsResponse.json()) as {
      receipts: Array<{ id: string; expenseId?: string; reviewHistory: Array<{ action: string; source: string }> }>
    }
    const linkedReceipt = receiptsBody.receipts.find((receipt) => receipt.id === uploadBody.receipt.id)
    expect(linkedReceipt?.expenseId).toBe(createBody.expense.id)
    expect(linkedReceipt?.reviewHistory.map((event) => event.action)).toContain('linked')
    expect(linkedReceipt?.reviewHistory[0]).toMatchObject({ action: 'linked', source: 'expense_link' })

    const reuseResponse = await request(
      '/api/expenses',
      {
        method: 'POST',
        body: JSON.stringify({
          groupId: 'goa',
          description: 'Duplicate snacks',
          amount: 300,
          currency: 'INR',
          paidBy: 'kishan',
          participants: ['kishan', 'anya'],
          splitMode: 'equal',
          category: 'Food',
          kind: 'expense',
          date: '2026-05-08',
          receiptId: uploadBody.receipt.id,
        }),
      },
      env,
    )
    expect(reuseResponse.status).toBe(409)
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

  test('rejects stale expense pushes with conflict details', async () => {
    const env = createEnv()

    const initialResponse = await request('/api/expenses/e1', {}, env)
    const initialBody = (await initialResponse.json()) as { expense: { updatedAt?: string; date: string } }
    const baseRevision = initialBody.expense.updatedAt ?? initialBody.expense.date

    const firstUpdateResponse = await request(
      '/api/expenses/e1',
      {
        method: 'PUT',
        headers: { 'x-splitclub-base-revision': baseRevision },
        body: JSON.stringify({ description: 'Beach villa final' }),
      },
      env,
    )
    const firstUpdateBody = (await firstUpdateResponse.json()) as { expense: { updatedAt?: string } }
    expect(firstUpdateResponse.status).toBe(200)
    expect(firstUpdateBody.expense.updatedAt).toBeTruthy()

    const staleUpdateResponse = await request(
      '/api/expenses/e1',
      {
        method: 'PUT',
        headers: { 'x-splitclub-base-revision': baseRevision },
        body: JSON.stringify({ amount: 25000 }),
      },
      env,
    )
    const staleUpdateBody = (await staleUpdateResponse.json()) as { error: string; conflict: { baseRevision: string; currentRevision?: string; recordId: string } }
    expect(staleUpdateResponse.status).toBe(409)
    expect(staleUpdateBody.error).toBe('expense_conflict')
    expect(staleUpdateBody.conflict).toMatchObject({ recordId: 'e1', baseRevision })
    expect(staleUpdateBody.conflict.currentRevision).not.toBe(baseRevision)

    const staleDeleteResponse = await request(
      '/api/expenses/e1',
      { method: 'DELETE', headers: { 'if-unmodified-since': baseRevision } },
      env,
    )
    expect(staleDeleteResponse.status).toBe(409)
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
