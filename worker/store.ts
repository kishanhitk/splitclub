import type { Expense, Group, Ledger, Member } from '../src/domain/split'
import type {
  ExpenseInput,
  FriendInput,
  GroupInput,
  GroupInviteInput,
  MemberInput,
  MembershipInput,
  SettlementInput,
} from '../src/contracts/api'

export type GroupRole = 'owner' | 'admin' | 'member' | 'viewer'

export type GroupInvite = {
  id: string
  groupId: string
  invitedEmail?: string
  invitedPhone?: string
  role: GroupRole
  token: string
  status: 'pending' | 'accepted' | 'canceled'
  createdBy: string
  acceptedBy?: string
  createdAt: string
}

export type Membership = {
  groupId: string
  userId: string
  role: GroupRole
}

export type AuditEvent = {
  id: string
  actorId?: string
  entityType: string
  entityId: string
  action: string
  payload: unknown
  createdAt: string
}

export type LedgerStore = {
  getLedger(): Promise<Ledger>
  listMembers(): Promise<Member[]>
  createMember(input: MemberInput): Promise<Member>
  listFriends(): Promise<Member[]>
  createFriend(input: FriendInput): Promise<Member>
  listGroups(): Promise<Group[]>
  createGroup(input: GroupInput): Promise<Group>
  listGroupInvites(groupId: string): Promise<GroupInvite[]>
  createGroupInvite(input: GroupInviteInput): Promise<GroupInvite>
  updateMembership(input: MembershipInput): Promise<Membership>
  removeMembership(groupId: string, userId: string): Promise<void>
  listExpenses(filters?: { groupId?: string | null; q?: string }): Promise<Expense[]>
  createExpense(input: ExpenseInput): Promise<Expense>
  recordSettlement(input: SettlementInput): Promise<Expense>
  listAuditEvents(): Promise<AuditEvent[]>
}

const now = () => new Date().toISOString()
const makeId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`

export function createMemoryLedgerStore(initialLedger: Ledger): LedgerStore {
  let ledger: Ledger = structuredClone(initialLedger)
  const auditEvents: AuditEvent[] = []
  const roles = new Map<string, GroupRole>()
  const invites: GroupInvite[] = []

  for (const group of ledger.groups) {
    group.memberIds.forEach((memberId, index) => roles.set(`${group.id}:${memberId}`, index === 0 ? 'owner' : 'member'))
  }

  const audit = (entityType: string, entityId: string, action: string, payload: unknown) => {
    auditEvents.unshift({ id: makeId('audit'), entityType, entityId, action, payload, createdAt: now() })
  }

  return {
    async getLedger() {
      return structuredClone(ledger)
    },
    async listMembers() {
      return structuredClone(ledger.members)
    },
    async createMember(input) {
      const member: Member = {
        id: input.id ?? makeId('user'),
        name: input.name,
        email: input.email,
        phone: input.phone,
        avatar: input.avatar ?? input.name.slice(0, 2).toUpperCase(),
        preferredPayment: input.preferredPayment,
      }
      ledger = { ...ledger, members: [member, ...ledger.members] }
      audit('user', member.id, 'created', member)
      return structuredClone(member)
    },
    async listFriends() {
      return structuredClone(ledger.members)
    },
    async createFriend(input) {
      return this.createMember(input)
    },
    async listGroups() {
      return structuredClone(ledger.groups)
    },
    async createGroup(input) {
      const group: Group = {
        id: input.id ?? makeId('group'),
        name: input.name,
        emoji: input.emoji,
        category: input.category,
        memberIds: input.memberIds,
        defaultCurrency: input.defaultCurrency,
        simplifyDebts: input.simplifyDebts,
        defaultSplitMode: input.defaultSplitMode,
        defaultSplits: input.defaultSplits,
      }
      ledger = { ...ledger, groups: [group, ...ledger.groups] }
      audit('group', group.id, 'created', group)
      return structuredClone(group)
    },
    async listGroupInvites(groupId) {
      return structuredClone(invites.filter((invite) => invite.groupId === groupId))
    },
    async createGroupInvite(input) {
      const invite: GroupInvite = {
        id: makeId('invite'),
        groupId: input.groupId,
        invitedEmail: input.invitedEmail,
        invitedPhone: input.invitedPhone,
        role: input.role,
        token: makeId('join'),
        status: 'pending',
        createdBy: input.createdBy,
        createdAt: now(),
      }
      invites.unshift(invite)
      audit('group_invite', invite.id, 'created', invite)
      return structuredClone(invite)
    },
    async updateMembership(input) {
      const group = ledger.groups.find((candidate) => candidate.id === input.groupId)
      if (!group) throw new Error('Group not found')
      if (!group.memberIds.includes(input.userId)) {
        group.memberIds.push(input.userId)
      }
      roles.set(`${input.groupId}:${input.userId}`, input.role)
      audit('membership', `${input.groupId}:${input.userId}`, 'updated', input)
      return { groupId: input.groupId, userId: input.userId, role: input.role }
    },
    async removeMembership(groupId, userId) {
      ledger = {
        ...ledger,
        groups: ledger.groups.map((group) =>
          group.id === groupId ? { ...group, memberIds: group.memberIds.filter((memberId) => memberId !== userId) } : group,
        ),
      }
      roles.delete(`${groupId}:${userId}`)
      audit('membership', `${groupId}:${userId}`, 'removed', { groupId, userId })
    },
    async listExpenses(filters = {}) {
      const q = filters.q?.trim().toLowerCase()
      const expenses = ledger.expenses.filter((expense) => {
        if ('groupId' in filters && expense.groupId !== filters.groupId) return false
        if (!q) return true
        return [expense.description, expense.category, expense.notes, expense.currency, expense.attachmentName]
          .filter(Boolean)
          .some((value) => value?.toLowerCase().includes(q))
      })
      return structuredClone(expenses)
    },
    async createExpense(input) {
      const expense: Expense = {
        id: input.id ?? makeId('expense'),
        groupId: input.groupId,
        description: input.description,
        amount: input.amount,
        currency: input.currency,
        paidBy: input.paidBy,
        participants: input.participants,
        splitMode: input.splitMode,
        splits: input.splits,
        category: input.category,
        kind: input.kind,
        date: input.date,
        notes: input.notes,
        attachmentName: input.attachmentName,
        receiptItems: input.receiptItems.map((item) => ({
          id: item.id ?? makeId('receipt_item'),
          label: item.label,
          amount: item.amount,
          assignedTo: item.assignedTo,
        })),
        recurrence: input.recurrence,
        reminderDays: input.reminderDays,
      }
      ledger = { ...ledger, expenses: [expense, ...ledger.expenses] }
      audit('expense', expense.id, 'created', expense)
      return structuredClone(expense)
    },
    async recordSettlement(input) {
      const expense = await this.createExpense({
        id: input.id ?? makeId('settlement'),
        groupId: input.groupId,
        description: `${input.from} paid back ${input.to}`,
        amount: input.amount,
        currency: input.currency,
        paidBy: input.to,
        participants: [input.from],
        splitMode: 'exact',
        splits: [{ memberId: input.from, value: input.amount }],
        category: 'Settlement',
        kind: 'settlement',
        date: input.date,
        notes: input.notes,
        receiptItems: [],
        recurrence: 'none',
      })
      audit('settlement', expense.id, 'recorded', input)
      return expense
    },
    async listAuditEvents() {
      return structuredClone(auditEvents)
    },
  }
}

type UserRow = {
  id: string
  name: string
  email?: string
  phone?: string
  avatar: string
  preferred_payment: Member['preferredPayment']
}

type GroupRow = {
  id: string
  name: string
  emoji: string
  category: Group['category']
  default_currency: string
  simplify_debts: number
  default_split_mode: Group['defaultSplitMode']
}

type ExpenseRow = {
  id: string
  group_id: string | null
  description: string
  amount: number
  currency: string
  paid_by: string
  split_mode: Expense['splitMode']
  category: string
  kind: Expense['kind']
  date: string
  notes?: string
  attachment_name?: string
  recurrence?: Expense['recurrence']
  reminder_days?: number
}

export function createD1LedgerStore(db: D1Database): LedgerStore {
  const listParticipants = async (expenseId: string) => {
    const result = await db.prepare('SELECT user_id FROM expense_participants WHERE expense_id = ?').bind(expenseId).all<{ user_id: string }>()
    return result.results.map((row) => row.user_id)
  }

  const listSplits = async (expenseId: string) => {
    const result = await db.prepare('SELECT user_id, value FROM expense_splits WHERE expense_id = ?').bind(expenseId).all<{ user_id: string; value: number }>()
    return result.results.map((row) => ({ memberId: row.user_id, value: row.value }))
  }

  const listReceiptItems = async (expenseId: string) => {
    const result = await db.prepare('SELECT id, label, amount FROM receipt_items WHERE expense_id = ?').bind(expenseId).all<{ id: string; label: string; amount: number }>()
    return Promise.all(
      result.results.map(async (item) => {
        const assignments = await db
          .prepare('SELECT user_id FROM receipt_item_assignments WHERE receipt_item_id = ?')
          .bind(item.id)
          .all<{ user_id: string }>()
        return { id: item.id, label: item.label, amount: item.amount, assignedTo: assignments.results.map((row) => row.user_id) }
      }),
    )
  }

  const toExpense = async (row: ExpenseRow): Promise<Expense> => ({
    id: row.id,
    groupId: row.group_id,
    description: row.description,
    amount: row.amount,
    currency: row.currency,
    paidBy: row.paid_by,
    participants: await listParticipants(row.id),
    splitMode: row.split_mode,
    splits: await listSplits(row.id),
    category: row.category,
    kind: row.kind,
    date: row.date,
    notes: row.notes,
    attachmentName: row.attachment_name,
    receiptItems: await listReceiptItems(row.id),
    recurrence: row.recurrence,
    reminderDays: row.reminder_days,
  })

  const audit = async (entityType: string, entityId: string, action: string, payload: unknown) => {
    await db
      .prepare('INSERT INTO audit_events (id, entity_type, entity_id, action, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(makeId('audit'), entityType, entityId, action, JSON.stringify(payload), now())
      .run()
  }

  return {
    async getLedger() {
      return {
        members: await this.listMembers(),
        groups: await this.listGroups(),
        expenses: await this.listExpenses(),
        defaultCurrency: 'INR',
        exchangeRates: { INR: 1 },
      }
    },
    async listMembers() {
      const result = await db.prepare('SELECT id, name, email, phone, avatar, preferred_payment FROM users WHERE deleted_at IS NULL ORDER BY name').all<UserRow>()
      return result.results.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        avatar: row.avatar,
        preferredPayment: row.preferred_payment,
      }))
    },
    async createMember(input) {
      const member: Member = {
        id: input.id ?? makeId('user'),
        name: input.name,
        email: input.email,
        phone: input.phone,
        avatar: input.avatar ?? input.name.slice(0, 2).toUpperCase(),
        preferredPayment: input.preferredPayment,
      }
      await db
        .prepare('INSERT INTO users (id, name, email, phone, avatar, preferred_payment) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(member.id, member.name, member.email, member.phone, member.avatar, member.preferredPayment)
        .run()
      await audit('user', member.id, 'created', member)
      return member
    },
    async listFriends() {
      return this.listMembers()
    },
    async createFriend(input) {
      const friend = await this.createMember(input)
      await db
        .prepare('INSERT OR IGNORE INTO friendships (id, user_id, friend_id, status) VALUES (?, ?, ?, ?)')
        .bind(makeId('friendship'), 'kishan', friend.id, 'accepted')
        .run()
      await audit('friendship', friend.id, 'created', friend)
      return friend
    },
    async listGroups() {
      const groups = await db
        .prepare('SELECT id, name, emoji, category, default_currency, simplify_debts, default_split_mode FROM groups WHERE deleted_at IS NULL ORDER BY updated_at DESC')
        .all<GroupRow>()
      return Promise.all(
        groups.results.map(async (row) => {
          const members = await db.prepare('SELECT user_id FROM group_memberships WHERE group_id = ? AND deleted_at IS NULL').bind(row.id).all<{ user_id: string }>()
          const splits = await db.prepare('SELECT user_id, value FROM group_default_splits WHERE group_id = ?').bind(row.id).all<{ user_id: string; value: number }>()
          return {
            id: row.id,
            name: row.name,
            emoji: row.emoji,
            category: row.category,
            memberIds: members.results.map((member) => member.user_id),
            defaultCurrency: row.default_currency,
            simplifyDebts: row.simplify_debts === 1,
            defaultSplitMode: row.default_split_mode,
            defaultSplits: splits.results.map((split) => ({ memberId: split.user_id, value: split.value })),
          }
        }),
      )
    },
    async createGroup(input) {
      const group: Group = {
        id: input.id ?? makeId('group'),
        name: input.name,
        emoji: input.emoji,
        category: input.category,
        memberIds: input.memberIds,
        defaultCurrency: input.defaultCurrency,
        simplifyDebts: input.simplifyDebts,
        defaultSplitMode: input.defaultSplitMode,
        defaultSplits: input.defaultSplits,
      }
      await db
        .prepare('INSERT INTO groups (id, name, emoji, category, default_currency, simplify_debts, default_split_mode) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(group.id, group.name, group.emoji, group.category, group.defaultCurrency, group.simplifyDebts ? 1 : 0, group.defaultSplitMode)
        .run()
      await Promise.all(group.memberIds.map((memberId) => db.prepare('INSERT INTO group_memberships (group_id, user_id) VALUES (?, ?)').bind(group.id, memberId).run()))
      await Promise.all(group.defaultSplits.map((split) => db.prepare('INSERT INTO group_default_splits (group_id, user_id, value) VALUES (?, ?, ?)').bind(group.id, split.memberId, split.value).run()))
      await audit('group', group.id, 'created', group)
      return group
    },
    async listGroupInvites(groupId) {
      const result = await db
        .prepare('SELECT id, group_id, invited_email, invited_phone, role, token, status, created_by, accepted_by, created_at FROM group_invites WHERE group_id = ? ORDER BY created_at DESC')
        .bind(groupId)
        .all<{
          id: string
          group_id: string
          invited_email?: string
          invited_phone?: string
          role: GroupRole
          token: string
          status: GroupInvite['status']
          created_by: string
          accepted_by?: string
          created_at: string
        }>()
      return result.results.map((row) => ({
        id: row.id,
        groupId: row.group_id,
        invitedEmail: row.invited_email,
        invitedPhone: row.invited_phone,
        role: row.role,
        token: row.token,
        status: row.status,
        createdBy: row.created_by,
        acceptedBy: row.accepted_by,
        createdAt: row.created_at,
      }))
    },
    async createGroupInvite(input) {
      const invite: GroupInvite = {
        id: makeId('invite'),
        groupId: input.groupId,
        invitedEmail: input.invitedEmail,
        invitedPhone: input.invitedPhone,
        role: input.role,
        token: makeId('join'),
        status: 'pending',
        createdBy: input.createdBy,
        createdAt: now(),
      }
      await db
        .prepare('INSERT INTO group_invites (id, group_id, invited_email, invited_phone, role, token, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(invite.id, invite.groupId, invite.invitedEmail, invite.invitedPhone, invite.role, invite.token, invite.status, invite.createdBy, invite.createdAt)
        .run()
      await audit('group_invite', invite.id, 'created', invite)
      return invite
    },
    async updateMembership(input) {
      await db
        .prepare('INSERT OR REPLACE INTO group_memberships (group_id, user_id, role, deleted_at) VALUES (?, ?, ?, NULL)')
        .bind(input.groupId, input.userId, input.role)
        .run()
      await audit('membership', `${input.groupId}:${input.userId}`, 'updated', input)
      return { groupId: input.groupId, userId: input.userId, role: input.role }
    },
    async removeMembership(groupId, userId) {
      await db
        .prepare('UPDATE group_memberships SET deleted_at = CURRENT_TIMESTAMP WHERE group_id = ? AND user_id = ?')
        .bind(groupId, userId)
        .run()
      await audit('membership', `${groupId}:${userId}`, 'removed', { groupId, userId })
    },
    async listExpenses(filters = {}) {
      const clauses = ['deleted_at IS NULL']
      const bindings: unknown[] = []
      if ('groupId' in filters) {
        if (filters.groupId === null) {
          clauses.push('group_id IS NULL')
        } else {
          clauses.push('group_id = ?')
          bindings.push(filters.groupId)
        }
      }
      if (filters.q) {
        clauses.push('(LOWER(description) LIKE ? OR LOWER(category) LIKE ? OR LOWER(COALESCE(notes, "")) LIKE ? OR LOWER(currency) LIKE ?)')
        const q = `%${filters.q.toLowerCase()}%`
        bindings.push(q, q, q, q)
      }
      const result = await db.prepare(`SELECT * FROM expenses WHERE ${clauses.join(' AND ')} ORDER BY date DESC, created_at DESC`).bind(...bindings).all<ExpenseRow>()
      return Promise.all(result.results.map(toExpense))
    },
    async createExpense(input) {
      const expenseId = input.id ?? makeId('expense')
      await db
        .prepare(
          'INSERT INTO expenses (id, group_id, description, amount, currency, paid_by, split_mode, category, kind, date, notes, attachment_name, recurrence, reminder_days) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .bind(
          expenseId,
          input.groupId,
          input.description,
          input.amount,
          input.currency,
          input.paidBy,
          input.splitMode,
          input.category,
          input.kind,
          input.date,
          input.notes,
          input.attachmentName,
          input.recurrence,
          input.reminderDays,
        )
        .run()
      await Promise.all(input.participants.map((memberId) => db.prepare('INSERT INTO expense_participants (expense_id, user_id) VALUES (?, ?)').bind(expenseId, memberId).run()))
      await Promise.all(input.splits.map((split) => db.prepare('INSERT INTO expense_splits (expense_id, user_id, value) VALUES (?, ?, ?)').bind(expenseId, split.memberId, split.value).run()))
      for (const item of input.receiptItems) {
        const itemId = item.id ?? makeId('receipt_item')
        await db.prepare('INSERT INTO receipt_items (id, expense_id, label, amount) VALUES (?, ?, ?, ?)').bind(itemId, expenseId, item.label, item.amount).run()
        await Promise.all(item.assignedTo.map((memberId) => db.prepare('INSERT INTO receipt_item_assignments (receipt_item_id, user_id) VALUES (?, ?)').bind(itemId, memberId).run()))
      }
      if (input.recurrence !== 'none') {
        await db
          .prepare('INSERT INTO recurring_rules (id, expense_id, interval, reminder_days, next_due_date) VALUES (?, ?, ?, ?, ?)')
          .bind(makeId('recurring'), expenseId, input.recurrence, input.reminderDays, input.date)
          .run()
      }
      await audit('expense', expenseId, 'created', input)
      return toExpense({ id: expenseId, group_id: input.groupId, description: input.description, amount: input.amount, currency: input.currency, paid_by: input.paidBy, split_mode: input.splitMode, category: input.category, kind: input.kind, date: input.date, notes: input.notes, attachment_name: input.attachmentName, recurrence: input.recurrence, reminder_days: input.reminderDays })
    },
    async recordSettlement(input) {
      const expense = await this.createExpense({
        id: input.id ?? makeId('settlement'),
        groupId: input.groupId,
        description: `${input.from} paid back ${input.to}`,
        amount: input.amount,
        currency: input.currency,
        paidBy: input.to,
        participants: [input.from],
        splitMode: 'exact',
        splits: [{ memberId: input.from, value: input.amount }],
        category: 'Settlement',
        kind: 'settlement',
        date: input.date,
        notes: input.notes,
        receiptItems: [],
        recurrence: 'none',
      })
      await db
        .prepare('INSERT INTO settlements (id, group_id, from_user_id, to_user_id, amount, currency, date, expense_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(makeId('settlement_record'), input.groupId, input.from, input.to, input.amount, input.currency, input.date, expense.id, input.notes)
        .run()
      await audit('settlement', expense.id, 'recorded', input)
      return expense
    },
    async listAuditEvents() {
      const result = await db.prepare('SELECT id, actor_id, entity_type, entity_id, action, payload_json, created_at FROM audit_events ORDER BY created_at DESC').all<{
        id: string
        actor_id?: string
        entity_type: string
        entity_id: string
        action: string
        payload_json: string
        created_at: string
      }>()
      return result.results.map((row) => ({
        id: row.id,
        actorId: row.actor_id,
        entityType: row.entity_type,
        entityId: row.entity_id,
        action: row.action,
        payload: JSON.parse(row.payload_json),
        createdAt: row.created_at,
      }))
    },
  }
}
