import type { Expense, ExpenseComment, ExpenseHistoryEvent, Group, Ledger, Member } from '../src/domain/split'
import type { ExtractedReceiptItem } from '../src/domain/receipts'
import type {
  AuthUser,
  ExpenseInput,
  ExpenseCommentInput,
  ExpenseUpdateInput,
  FriendInput,
  GroupDefaultsInput,
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

export type ReceiptRecord = {
  id: string
  expenseId?: string
  ownerId: string
  objectKey: string
  fileName: string
  contentType: string
  sizeBytes: number
  ocrStatus: 'pending' | 'complete'
  ocrText?: string
  extractedItems: ExtractedReceiptItem[]
  createdAt: string
}

export type LedgerStore = {
  ensureAuthenticatedMember(input: AuthUser): Promise<Member>
  getLedger(): Promise<Ledger>
  listMembers(): Promise<Member[]>
  createMember(input: MemberInput): Promise<Member>
  listFriends(): Promise<Member[]>
  createFriend(input: FriendInput, ownerId?: string): Promise<Member>
  listGroups(): Promise<Group[]>
  createGroup(input: GroupInput): Promise<Group>
  updateGroupDefaults(groupId: string, input: GroupDefaultsInput, actorId?: string): Promise<Group>
  listDeletedGroups(memberId: string): Promise<Group[]>
  deleteGroup(groupId: string, actorId?: string): Promise<Group>
  restoreGroup(groupId: string, actorId?: string): Promise<Group>
  listGroupInvites(groupId: string): Promise<GroupInvite[]>
  createGroupInvite(input: GroupInviteInput): Promise<GroupInvite>
  acceptGroupInvite(token: string, userId: string): Promise<{ invite: GroupInvite; membership: Membership }>
  updateMembership(input: MembershipInput): Promise<Membership>
  removeMembership(groupId: string, userId: string): Promise<void>
  listExpenses(filters?: { groupId?: string | null; q?: string }): Promise<Expense[]>
  createExpense(input: ExpenseInput): Promise<Expense>
  updateExpense(expenseId: string, input: ExpenseUpdateInput, actorId?: string): Promise<Expense>
  deleteExpense(expenseId: string, actorId?: string): Promise<Expense>
  restoreExpense(expenseId: string, actorId?: string): Promise<Expense>
  addExpenseComment(expenseId: string, input: ExpenseCommentInput, memberId: string): Promise<ExpenseComment>
  getExpenseDetails(expenseId: string): Promise<{ expense?: Expense; comments: ExpenseComment[]; history: ExpenseHistoryEvent[] }>
  recordSettlement(input: SettlementInput): Promise<Expense>
  createReceipt(input: Omit<ReceiptRecord, 'createdAt'>): Promise<ReceiptRecord>
  listReceipts(ownerId: string): Promise<ReceiptRecord[]>
  listAuditEvents(): Promise<AuditEvent[]>
}

const now = () => new Date().toISOString()
const makeId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`
const historySummary = (action: string, payload: unknown) => {
  if (action === 'created') return 'Expense created'
  if (action === 'updated') return 'Expense updated'
  if (action === 'commented') {
    const body = typeof payload === 'object' && payload && 'body' in payload ? String((payload as { body?: unknown }).body ?? '') : ''
    return body ? `Comment added: ${body}` : 'Comment added'
  }
  if (action === 'deleted') return 'Expense deleted'
  if (action === 'restored') return 'Expense restored'
  return action
}

export function createMemoryLedgerStore(initialLedger: Ledger): LedgerStore {
  let ledger: Ledger = structuredClone(initialLedger)
  const auditEvents: AuditEvent[] = []
  const roles = new Map<string, GroupRole>()
  const invites: GroupInvite[] = []
  const receipts: ReceiptRecord[] = []

  for (const group of ledger.groups) {
    group.memberIds.forEach((memberId, index) => roles.set(`${group.id}:${memberId}`, index === 0 ? 'owner' : 'member'))
  }

  const audit = (entityType: string, entityId: string, action: string, payload: unknown, actorId?: string) => {
    auditEvents.unshift({ id: makeId('audit'), actorId, entityType, entityId, action, payload, createdAt: now() })
  }

  const expenseHistory = (expenseId: string): ExpenseHistoryEvent[] =>
    auditEvents
      .filter((event) => event.entityType === 'expense' && event.entityId === expenseId)
      .map((event) => ({
        id: event.id,
        expenseId,
        memberId: event.actorId,
        action: event.action as ExpenseHistoryEvent['action'],
        summary: historySummary(event.action, event.payload),
        createdAt: event.createdAt,
      }))

  const expenseComments = (expenseId: string): ExpenseComment[] =>
    ledger.expenses.find((expense) => expense.id === expenseId)?.comments ?? []

  const decorateExpense = (expense: Expense): Expense => ({
    ...expense,
    comments: expenseComments(expense.id),
    history: expenseHistory(expense.id),
  })

  const findExpense = (expenseId: string) => ledger.expenses.find((expense) => expense.id === expenseId)

  const applyExpensePatch = (expense: Expense, input: ExpenseUpdateInput): Expense => {
    const receiptItems = input.receiptItems?.map((item) => ({
      id: item.id ?? makeId('receipt_item'),
      label: item.label,
      amount: item.amount,
      assignedTo: item.assignedTo,
    }))
    return {
      ...expense,
      ...input,
      groupId: input.groupId === undefined ? expense.groupId : input.groupId,
      payments: input.payments ?? expense.payments,
      participants: input.participants ?? expense.participants,
      splits: input.splits ?? expense.splits,
      receiptItems: receiptItems ?? expense.receiptItems,
    }
  }

  return {
    async ensureAuthenticatedMember(input) {
      const existing = ledger.members.find((member) => member.id === input.id || (input.email && member.email === input.email))
      if (existing) return structuredClone(existing)
      return this.createMember({
        id: input.id,
        name: input.name ?? input.email ?? 'SplitClub member',
        email: input.email,
        avatar: input.avatar ?? input.name?.slice(0, 2).toUpperCase(),
        preferredPayment: 'cash',
      })
    },
    async getLedger() {
      return structuredClone({ ...ledger, expenses: ledger.expenses.map(decorateExpense) })
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
    async createFriend(input, _ownerId) {
      return this.createMember(input)
    },
    async listGroups() {
      return structuredClone(ledger.groups.filter((group) => !group.deletedAt))
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
    async updateGroupDefaults(groupId, input, actorId) {
      const group = ledger.groups.find((candidate) => candidate.id === groupId && !candidate.deletedAt)
      if (!group) throw new Error('Group not found')
      const updated = {
        ...group,
        simplifyDebts: input.simplifyDebts ?? group.simplifyDebts,
        defaultSplitMode: input.defaultSplitMode,
        defaultSplits: input.defaultSplitMode === 'equal' ? [] : input.defaultSplits,
      }
      ledger = { ...ledger, groups: ledger.groups.map((candidate) => candidate.id === groupId ? updated : candidate) }
      audit('group', groupId, 'defaults.updated', {
        simplifyDebts: updated.simplifyDebts,
        defaultSplitMode: updated.defaultSplitMode,
        defaultSplits: updated.defaultSplits,
      }, actorId)
      return structuredClone(updated)
    },
    async listDeletedGroups(memberId) {
      return structuredClone(ledger.groups.filter((group) => group.deletedAt && group.memberIds.includes(memberId)))
    },
    async deleteGroup(groupId, actorId) {
      const group = ledger.groups.find((candidate) => candidate.id === groupId && !candidate.deletedAt)
      if (!group) throw new Error('Group not found')
      const deleted = { ...group, deletedAt: now() }
      ledger = { ...ledger, groups: ledger.groups.map((candidate) => candidate.id === groupId ? deleted : candidate) }
      audit('group', groupId, 'deleted', { deletedAt: deleted.deletedAt }, actorId)
      return structuredClone(deleted)
    },
    async restoreGroup(groupId, actorId) {
      const group = ledger.groups.find((candidate) => candidate.id === groupId)
      if (!group) throw new Error('Group not found')
      const restored = { ...group, deletedAt: undefined }
      ledger = { ...ledger, groups: ledger.groups.map((candidate) => candidate.id === groupId ? restored : candidate) }
      audit('group', groupId, 'restored', { restoredAt: now() }, actorId)
      return structuredClone(restored)
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
    async acceptGroupInvite(token, userId) {
      const invite = invites.find((candidate) => candidate.token === token)
      if (!invite) throw new Error('Invite not found')
      if (invite.status !== 'pending') throw new Error('Invite is not pending')
      invite.status = 'accepted'
      invite.acceptedBy = userId
      const membership = await this.updateMembership({ groupId: invite.groupId, userId, role: invite.role })
      audit('group_invite', invite.id, 'accepted', invite, userId)
      return { invite: structuredClone(invite), membership }
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
        if (expense.deletedAt) return false
        if ('groupId' in filters && expense.groupId !== filters.groupId) return false
        if (!q) return true
        return [expense.description, expense.category, expense.notes, expense.currency, expense.attachmentName]
          .filter(Boolean)
          .some((value) => value?.toLowerCase().includes(q))
      })
      return structuredClone(expenses.map(decorateExpense))
    },
    async createExpense(input) {
      const expense: Expense = {
        id: input.id ?? makeId('expense'),
        groupId: input.groupId,
        description: input.description,
        amount: input.amount,
        currency: input.currency,
        paidBy: input.paidBy,
        payments: input.payments,
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
        paymentMethod: input.paymentMethod,
        paymentReference: input.paymentReference,
        paymentStatus: input.paymentStatus,
        comments: [],
        history: [],
      }
      ledger = { ...ledger, expenses: [expense, ...ledger.expenses] }
      audit('expense', expense.id, 'created', expense)
      return structuredClone(decorateExpense(expense))
    },
    async updateExpense(expenseId, input, actorId) {
      const existing = findExpense(expenseId)
      if (!existing) throw new Error('Expense not found')
      const updated = applyExpensePatch(existing, input)
      ledger = {
        ...ledger,
        expenses: ledger.expenses.map((expense) => (expense.id === expenseId ? updated : expense)),
      }
      audit('expense', expenseId, 'updated', { before: existing, after: updated }, actorId)
      return structuredClone(decorateExpense(updated))
    },
    async deleteExpense(expenseId, actorId) {
      const existing = findExpense(expenseId)
      if (!existing) throw new Error('Expense not found')
      const deletedAt = now()
      const deleted = { ...existing, deletedAt }
      ledger = {
        ...ledger,
        expenses: ledger.expenses.map((expense) => (expense.id === expenseId ? deleted : expense)),
      }
      audit('expense', expenseId, 'deleted', { deletedAt }, actorId)
      return structuredClone(decorateExpense(deleted))
    },
    async restoreExpense(expenseId, actorId) {
      const existing = findExpense(expenseId)
      if (!existing) throw new Error('Expense not found')
      const restored = { ...existing, deletedAt: undefined }
      ledger = {
        ...ledger,
        expenses: ledger.expenses.map((expense) => (expense.id === expenseId ? restored : expense)),
      }
      audit('expense', expenseId, 'restored', restored, actorId)
      return structuredClone(decorateExpense(restored))
    },
    async addExpenseComment(expenseId, input, memberId) {
      const existing = findExpense(expenseId)
      if (!existing) throw new Error('Expense not found')
      const comment: ExpenseComment = {
        id: makeId('comment'),
        expenseId,
        memberId,
        body: input.body,
        createdAt: now(),
      }
      const updated = { ...existing, comments: [...(existing.comments ?? []), comment] }
      ledger = {
        ...ledger,
        expenses: ledger.expenses.map((expense) => (expense.id === expenseId ? updated : expense)),
      }
      audit('expense', expenseId, 'commented', comment, memberId)
      return structuredClone(comment)
    },
    async getExpenseDetails(expenseId) {
      const expense = findExpense(expenseId)
      return {
        expense: expense ? structuredClone(decorateExpense(expense)) : undefined,
        comments: structuredClone(expenseComments(expenseId)),
        history: structuredClone(expenseHistory(expenseId)),
      }
    },
    async recordSettlement(input) {
      const expense = await this.createExpense({
        id: input.id ?? makeId('settlement'),
        groupId: input.groupId,
        description: `${input.from} paid back ${input.to}`,
        amount: input.amount,
        currency: input.currency,
        paidBy: input.to,
        payments: [],
        participants: [input.from],
        splitMode: 'exact',
        splits: [{ memberId: input.from, value: input.amount }],
        category: 'Settlement',
        kind: 'settlement',
        date: input.date,
        notes: input.notes,
        receiptItems: [],
        recurrence: 'none',
        paymentMethod: input.paymentMethod,
        paymentReference: input.paymentReference,
        paymentStatus: input.paymentStatus,
      })
      audit('settlement', expense.id, 'recorded', input)
      return expense
    },
    async createReceipt(input) {
      const receipt = { ...input, createdAt: now() }
      receipts.unshift(receipt)
      audit('receipt', receipt.id, 'created', receipt)
      return structuredClone(receipt)
    },
    async listReceipts(ownerId) {
      return structuredClone(receipts.filter((receipt) => receipt.ownerId === ownerId))
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
  deleted_at?: string
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
  payment_method?: Expense['paymentMethod']
  payment_reference?: string
  payment_status?: Expense['paymentStatus']
  deleted_at?: string
}

type ReceiptRow = {
  id: string
  expense_id?: string
  owner_user_id: string
  object_key: string
  file_name: string
  content_type: string
  size_bytes: number
  ocr_status: ReceiptRecord['ocrStatus']
  ocr_text?: string
  created_at: string
}

type ExpenseCommentRow = {
  id: string
  expense_id: string
  member_id: string
  body: string
  created_at: string
}

const rowToMember = (row: UserRow): Member => ({
  id: row.id,
  name: row.name,
  email: row.email,
  phone: row.phone,
  avatar: row.avatar,
  preferredPayment: row.preferred_payment,
})

export function createD1LedgerStore(db: D1Database): LedgerStore {
  const toGroup = async (row: GroupRow): Promise<Group> => {
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
      deletedAt: row.deleted_at,
    }
  }

  const listParticipants = async (expenseId: string) => {
    const result = await db.prepare('SELECT user_id FROM expense_participants WHERE expense_id = ?').bind(expenseId).all<{ user_id: string }>()
    return result.results.map((row) => row.user_id)
  }

  const listSplits = async (expenseId: string) => {
    const result = await db.prepare('SELECT user_id, value FROM expense_splits WHERE expense_id = ?').bind(expenseId).all<{ user_id: string; value: number }>()
    return result.results.map((row) => ({ memberId: row.user_id, value: row.value }))
  }

  const listPayments = async (expenseId: string) => {
    const result = await db.prepare('SELECT user_id, value FROM expense_payments WHERE expense_id = ?').bind(expenseId).all<{ user_id: string; value: number }>()
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

  const listComments = async (expenseId: string): Promise<ExpenseComment[]> => {
    const result = await db
      .prepare('SELECT id, expense_id, member_id, body, created_at FROM expense_comments WHERE expense_id = ? AND deleted_at IS NULL ORDER BY created_at ASC')
      .bind(expenseId)
      .all<ExpenseCommentRow>()
    return result.results.map((row) => ({
      id: row.id,
      expenseId: row.expense_id,
      memberId: row.member_id,
      body: row.body,
      createdAt: row.created_at,
    }))
  }

  const listExpenseHistory = async (expenseId: string): Promise<ExpenseHistoryEvent[]> => {
    const result = await db
      .prepare('SELECT id, actor_id, action, payload_json, created_at FROM audit_events WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC')
      .bind('expense', expenseId)
      .all<{ id: string; actor_id?: string; action: string; payload_json: string; created_at: string }>()
    return result.results.map((row) => ({
      id: row.id,
      expenseId,
      memberId: row.actor_id,
      action: row.action as ExpenseHistoryEvent['action'],
      summary: historySummary(row.action, JSON.parse(row.payload_json)),
      createdAt: row.created_at,
    }))
  }

  const toExpense = async (row: ExpenseRow): Promise<Expense> => ({
    id: row.id,
    groupId: row.group_id,
    description: row.description,
    amount: row.amount,
    currency: row.currency,
    paidBy: row.paid_by,
    payments: await listPayments(row.id),
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
    paymentMethod: row.payment_method,
    paymentReference: row.payment_reference,
    paymentStatus: row.payment_status,
    comments: await listComments(row.id),
    history: await listExpenseHistory(row.id),
    deletedAt: row.deleted_at,
  })

  const audit = async (entityType: string, entityId: string, action: string, payload: unknown, actorId?: string) => {
    await db
      .prepare('INSERT INTO audit_events (id, actor_id, entity_type, entity_id, action, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(makeId('audit'), actorId, entityType, entityId, action, JSON.stringify(payload), now())
      .run()
  }

  const toReceipt = async (row: ReceiptRow): Promise<ReceiptRecord> => {
    const items = await db
      .prepare('SELECT id, label, amount, assigned_to_json FROM receipt_extracted_items WHERE receipt_id = ? ORDER BY created_at ASC')
      .bind(row.id)
      .all<{ id: string; label: string; amount: number; assigned_to_json: string }>()
    return {
      id: row.id,
      expenseId: row.expense_id,
      ownerId: row.owner_user_id,
      objectKey: row.object_key,
      fileName: row.file_name,
      contentType: row.content_type,
      sizeBytes: row.size_bytes,
      ocrStatus: row.ocr_status,
      ocrText: row.ocr_text,
      extractedItems: items.results.map((item) => ({
        id: item.id,
        label: item.label,
        amount: item.amount,
        assignedTo: JSON.parse(item.assigned_to_json) as string[],
      })),
      createdAt: row.created_at,
    }
  }

  const findExpenseRow = async (expenseId: string, includeDeleted = false) => {
    const clause = includeDeleted ? 'id = ?' : 'id = ? AND deleted_at IS NULL'
    return db.prepare(`SELECT * FROM expenses WHERE ${clause}`).bind(expenseId).first<ExpenseRow>()
  }

  const replaceExpenseChildren = async (expenseId: string, input: Pick<ExpenseInput, 'payments' | 'participants' | 'splits' | 'receiptItems'>) => {
    await db.prepare('DELETE FROM expense_payments WHERE expense_id = ?').bind(expenseId).run()
    await db.prepare('DELETE FROM expense_participants WHERE expense_id = ?').bind(expenseId).run()
    await db.prepare('DELETE FROM expense_splits WHERE expense_id = ?').bind(expenseId).run()
    const existingItems = await db.prepare('SELECT id FROM receipt_items WHERE expense_id = ?').bind(expenseId).all<{ id: string }>()
    await Promise.all(
      existingItems.results.map((item) => db.prepare('DELETE FROM receipt_item_assignments WHERE receipt_item_id = ?').bind(item.id).run()),
    )
    await db.prepare('DELETE FROM receipt_items WHERE expense_id = ?').bind(expenseId).run()
    await Promise.all(input.payments.map((payment) => db.prepare('INSERT INTO expense_payments (expense_id, user_id, value) VALUES (?, ?, ?)').bind(expenseId, payment.memberId, payment.value).run()))
    await Promise.all(input.participants.map((memberId) => db.prepare('INSERT INTO expense_participants (expense_id, user_id) VALUES (?, ?)').bind(expenseId, memberId).run()))
    await Promise.all(input.splits.map((split) => db.prepare('INSERT INTO expense_splits (expense_id, user_id, value) VALUES (?, ?, ?)').bind(expenseId, split.memberId, split.value).run()))
    for (const item of input.receiptItems) {
      const itemId = item.id ?? makeId('receipt_item')
      await db.prepare('INSERT INTO receipt_items (id, expense_id, label, amount) VALUES (?, ?, ?, ?)').bind(itemId, expenseId, item.label, item.amount).run()
      await Promise.all(item.assignedTo.map((memberId) => db.prepare('INSERT INTO receipt_item_assignments (receipt_item_id, user_id) VALUES (?, ?)').bind(itemId, memberId).run()))
    }
  }

  return {
    async ensureAuthenticatedMember(input) {
      const provider = input.provider ?? 'oidc'
      const existingIdentity = await db
        .prepare('SELECT user_id FROM auth_identities WHERE provider = ? AND subject = ?')
        .bind(provider, input.id)
        .first<{ user_id: string }>()

      if (existingIdentity) {
        await db
          .prepare('UPDATE auth_identities SET last_seen_at = CURRENT_TIMESTAMP WHERE provider = ? AND subject = ?')
          .bind(provider, input.id)
          .run()
        const existingUser = await db
          .prepare('SELECT id, name, email, phone, avatar, preferred_payment FROM users WHERE id = ? AND deleted_at IS NULL')
          .bind(existingIdentity.user_id)
          .first<UserRow>()
        if (existingUser) {
          return rowToMember(existingUser)
        }
      }

      const emailUser = input.email
        ? await db
            .prepare('SELECT id, name, email, phone, avatar, preferred_payment FROM users WHERE email = ? AND deleted_at IS NULL')
            .bind(input.email)
            .first<UserRow>()
        : null
      const member: Member =
        (emailUser ? rowToMember(emailUser) : null) ??
        (await this.createMember({
          id: input.id,
          name: input.name ?? input.email ?? 'SplitClub member',
          email: input.email,
          avatar: input.avatar ?? input.name?.slice(0, 2).toUpperCase(),
          preferredPayment: 'cash',
        }))

      await db
        .prepare('INSERT OR REPLACE INTO auth_identities (provider, subject, user_id, email, last_seen_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)')
        .bind(provider, input.id, member.id, input.email)
        .run()
      return member
    },
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
    async createFriend(input, ownerId = 'kishan') {
      const friend = await this.createMember(input)
      await db
        .prepare('INSERT OR IGNORE INTO friendships (id, user_id, friend_id, status) VALUES (?, ?, ?, ?)')
        .bind(makeId('friendship'), ownerId, friend.id, 'accepted')
        .run()
      await audit('friendship', friend.id, 'created', friend)
      return friend
    },
    async listGroups() {
      const groups = await db
        .prepare('SELECT id, name, emoji, category, default_currency, simplify_debts, default_split_mode, deleted_at FROM groups WHERE deleted_at IS NULL ORDER BY updated_at DESC')
        .all<GroupRow>()
      return Promise.all(groups.results.map(toGroup))
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
    async updateGroupDefaults(groupId, input, actorId) {
      const row = await db
        .prepare('SELECT id, name, emoji, category, default_currency, simplify_debts, default_split_mode, deleted_at FROM groups WHERE id = ? AND deleted_at IS NULL')
        .bind(groupId)
        .first<GroupRow>()
      if (!row) throw new Error('Group not found')
      const simplifyDebts = input.simplifyDebts ?? (row.simplify_debts === 1)
      await db.prepare('UPDATE groups SET simplify_debts = ?, default_split_mode = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(simplifyDebts ? 1 : 0, input.defaultSplitMode, groupId).run()
      await db.prepare('DELETE FROM group_default_splits WHERE group_id = ?').bind(groupId).run()
      if (input.defaultSplitMode !== 'equal') {
        await Promise.all(input.defaultSplits.map((split) => (
          db.prepare('INSERT INTO group_default_splits (group_id, user_id, value) VALUES (?, ?, ?)').bind(groupId, split.memberId, split.value).run()
        )))
      }
      await audit('group', groupId, 'defaults.updated', input, actorId)
      return toGroup({ ...row, simplify_debts: simplifyDebts ? 1 : 0, default_split_mode: input.defaultSplitMode })
    },
    async listDeletedGroups(memberId) {
      const groups = await db
        .prepare(
          'SELECT g.id, g.name, g.emoji, g.category, g.default_currency, g.simplify_debts, g.default_split_mode, g.deleted_at FROM groups g INNER JOIN group_memberships gm ON gm.group_id = g.id WHERE g.deleted_at IS NOT NULL AND gm.user_id = ? ORDER BY g.updated_at DESC',
        )
        .bind(memberId)
        .all<GroupRow>()
      return Promise.all(groups.results.map(toGroup))
    },
    async deleteGroup(groupId, actorId) {
      const row = await db
        .prepare('SELECT id, name, emoji, category, default_currency, simplify_debts, default_split_mode, deleted_at FROM groups WHERE id = ? AND deleted_at IS NULL')
        .bind(groupId)
        .first<GroupRow>()
      if (!row) throw new Error('Group not found')
      const deletedAt = now()
      await db.prepare('UPDATE groups SET deleted_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(deletedAt, groupId).run()
      await audit('group', groupId, 'deleted', { deletedAt }, actorId)
      return { ...(await toGroup(row)), deletedAt }
    },
    async restoreGroup(groupId, actorId) {
      const row = await db
        .prepare('SELECT id, name, emoji, category, default_currency, simplify_debts, default_split_mode, deleted_at FROM groups WHERE id = ?')
        .bind(groupId)
        .first<GroupRow>()
      if (!row) throw new Error('Group not found')
      await db.prepare('UPDATE groups SET deleted_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(groupId).run()
      await audit('group', groupId, 'restored', { restoredAt: now() }, actorId)
      return { ...(await toGroup(row)), deletedAt: undefined }
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
    async acceptGroupInvite(token, userId) {
      const row = await db
        .prepare('SELECT id, group_id, invited_email, invited_phone, role, token, status, created_by, accepted_by, created_at FROM group_invites WHERE token = ?')
        .bind(token)
        .first<{
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
      if (!row) throw new Error('Invite not found')
      if (row.status !== 'pending') throw new Error('Invite is not pending')
      await db
        .prepare('UPDATE group_invites SET status = ?, accepted_by = ?, accepted_at = CURRENT_TIMESTAMP WHERE token = ?')
        .bind('accepted', userId, token)
        .run()
      const membership = await this.updateMembership({ groupId: row.group_id, userId, role: row.role })
      const invite: GroupInvite = {
        id: row.id,
        groupId: row.group_id,
        invitedEmail: row.invited_email,
        invitedPhone: row.invited_phone,
        role: row.role,
        token: row.token,
        status: 'accepted',
        createdBy: row.created_by,
        acceptedBy: userId,
        createdAt: row.created_at,
      }
      await audit('group_invite', invite.id, 'accepted', invite, userId)
      return { invite, membership }
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
          'INSERT INTO expenses (id, group_id, description, amount, currency, paid_by, split_mode, category, kind, date, notes, attachment_name, recurrence, reminder_days, payment_method, payment_reference, payment_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
          input.paymentMethod,
          input.paymentReference,
          input.paymentStatus,
        )
        .run()
      await Promise.all(input.payments.map((payment) => db.prepare('INSERT INTO expense_payments (expense_id, user_id, value) VALUES (?, ?, ?)').bind(expenseId, payment.memberId, payment.value).run()))
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
      return toExpense({ id: expenseId, group_id: input.groupId, description: input.description, amount: input.amount, currency: input.currency, paid_by: input.paidBy, split_mode: input.splitMode, category: input.category, kind: input.kind, date: input.date, notes: input.notes, attachment_name: input.attachmentName, recurrence: input.recurrence, reminder_days: input.reminderDays, payment_method: input.paymentMethod, payment_reference: input.paymentReference, payment_status: input.paymentStatus })
    },
    async updateExpense(expenseId, input, actorId) {
      const row = await findExpenseRow(expenseId)
      if (!row) throw new Error('Expense not found')
      const existing = await toExpense(row)
      const updated: ExpenseInput = {
        groupId: input.groupId === undefined ? existing.groupId : input.groupId,
        description: input.description ?? existing.description,
        amount: input.amount ?? existing.amount,
        currency: input.currency ?? existing.currency,
        paidBy: input.paidBy ?? existing.paidBy,
        payments: input.payments ?? existing.payments ?? [],
        participants: input.participants ?? existing.participants,
        splitMode: input.splitMode ?? existing.splitMode,
        splits: input.splits ?? existing.splits,
        category: input.category ?? existing.category,
        kind: input.kind ?? existing.kind,
        date: input.date ?? existing.date,
        notes: input.notes ?? existing.notes,
        attachmentName: input.attachmentName ?? existing.attachmentName,
        receiptItems: input.receiptItems ?? existing.receiptItems ?? [],
        recurrence: input.recurrence ?? existing.recurrence ?? 'none',
        reminderDays: input.reminderDays ?? existing.reminderDays,
        paymentMethod: input.paymentMethod ?? existing.paymentMethod,
        paymentReference: input.paymentReference ?? existing.paymentReference,
        paymentStatus: input.paymentStatus ?? existing.paymentStatus,
      }
      await db
        .prepare(
          'UPDATE expenses SET group_id = ?, description = ?, amount = ?, currency = ?, paid_by = ?, split_mode = ?, category = ?, kind = ?, date = ?, notes = ?, attachment_name = ?, recurrence = ?, reminder_days = ?, payment_method = ?, payment_reference = ?, payment_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        )
        .bind(
          updated.groupId,
          updated.description,
          updated.amount,
          updated.currency,
          updated.paidBy,
          updated.splitMode,
          updated.category,
          updated.kind,
          updated.date,
          updated.notes,
          updated.attachmentName,
          updated.recurrence,
          updated.reminderDays,
          updated.paymentMethod,
          updated.paymentReference,
          updated.paymentStatus,
          expenseId,
        )
        .run()
      await replaceExpenseChildren(expenseId, updated)
      await audit('expense', expenseId, 'updated', { before: existing, after: updated }, actorId)
      const updatedRow = await findExpenseRow(expenseId)
      if (!updatedRow) throw new Error('Expense was not updated')
      return toExpense(updatedRow)
    },
    async deleteExpense(expenseId, actorId) {
      const row = await findExpenseRow(expenseId)
      if (!row) throw new Error('Expense not found')
      const deletedAt = now()
      await db.prepare('UPDATE expenses SET deleted_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(deletedAt, expenseId).run()
      await audit('expense', expenseId, 'deleted', { deletedAt }, actorId)
      const deletedRow = await findExpenseRow(expenseId, true)
      if (!deletedRow) throw new Error('Expense was not deleted')
      return toExpense(deletedRow)
    },
    async restoreExpense(expenseId, actorId) {
      const row = await findExpenseRow(expenseId, true)
      if (!row) throw new Error('Expense not found')
      await db.prepare('UPDATE expenses SET deleted_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(expenseId).run()
      await audit('expense', expenseId, 'restored', { restoredAt: now() }, actorId)
      const restoredRow = await findExpenseRow(expenseId)
      if (!restoredRow) throw new Error('Expense was not restored')
      return toExpense(restoredRow)
    },
    async addExpenseComment(expenseId, input, memberId) {
      const row = await findExpenseRow(expenseId)
      if (!row) throw new Error('Expense not found')
      const comment: ExpenseComment = {
        id: makeId('comment'),
        expenseId,
        memberId,
        body: input.body,
        createdAt: now(),
      }
      await db
        .prepare('INSERT INTO expense_comments (id, expense_id, member_id, body, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(comment.id, expenseId, memberId, comment.body, comment.createdAt)
        .run()
      await audit('expense', expenseId, 'commented', comment, memberId)
      return comment
    },
    async getExpenseDetails(expenseId) {
      const row = await findExpenseRow(expenseId, true)
      return {
        expense: row ? await toExpense(row) : undefined,
        comments: await listComments(expenseId),
        history: await listExpenseHistory(expenseId),
      }
    },
    async recordSettlement(input) {
      const expense = await this.createExpense({
        id: input.id ?? makeId('settlement'),
        groupId: input.groupId,
        description: `${input.from} paid back ${input.to}`,
        amount: input.amount,
        currency: input.currency,
        paidBy: input.to,
        payments: [],
        participants: [input.from],
        splitMode: 'exact',
        splits: [{ memberId: input.from, value: input.amount }],
        category: 'Settlement',
        kind: 'settlement',
        date: input.date,
        notes: input.notes,
        receiptItems: [],
        recurrence: 'none',
        paymentMethod: input.paymentMethod,
        paymentReference: input.paymentReference,
        paymentStatus: input.paymentStatus,
      })
      await db
        .prepare('INSERT INTO settlements (id, group_id, from_user_id, to_user_id, amount, currency, date, expense_id, notes, payment_method, payment_reference, payment_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(makeId('settlement_record'), input.groupId, input.from, input.to, input.amount, input.currency, input.date, expense.id, input.notes, input.paymentMethod, input.paymentReference, input.paymentStatus)
        .run()
      await audit('settlement', expense.id, 'recorded', input)
      return expense
    },
    async createReceipt(input) {
      await db
        .prepare(
          'INSERT INTO receipts (id, expense_id, owner_user_id, object_key, file_name, content_type, size_bytes, ocr_status, ocr_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .bind(input.id, input.expenseId, input.ownerId, input.objectKey, input.fileName, input.contentType, input.sizeBytes, input.ocrStatus, input.ocrText)
        .run()
      await Promise.all(
        input.extractedItems.map((item, index) =>
          db
            .prepare('INSERT INTO receipt_extracted_items (id, receipt_id, label, amount, assigned_to_json) VALUES (?, ?, ?, ?, ?)')
            .bind(item.id ?? makeId(`receipt_item_${index}`), input.id, item.label, item.amount, JSON.stringify(item.assignedTo))
            .run(),
        ),
      )
      await audit('receipt', input.id, 'created', input)
      const row = await db
        .prepare('SELECT id, expense_id, owner_user_id, object_key, file_name, content_type, size_bytes, ocr_status, ocr_text, created_at FROM receipts WHERE id = ?')
        .bind(input.id)
        .first<ReceiptRow>()
      if (!row) throw new Error('Receipt was not stored')
      return toReceipt(row)
    },
    async listReceipts(ownerId) {
      const result = await db
        .prepare('SELECT id, expense_id, owner_user_id, object_key, file_name, content_type, size_bytes, ocr_status, ocr_text, created_at FROM receipts WHERE owner_user_id = ? ORDER BY created_at DESC')
        .bind(ownerId)
        .all<ReceiptRow>()
      return Promise.all(result.results.map(toReceipt))
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
