export type SplitMode = 'equal' | 'exact' | 'percent' | 'shares' | 'adjustment'
export type ExpenseKind = 'expense' | 'settlement' | 'refund' | 'reimbursement' | 'debt'
export type Recurrence = 'none' | 'weekly' | 'monthly' | 'yearly'
export type PaymentMethod = 'cash' | 'upi' | 'venmo' | 'paypal' | 'bank'
export type PaymentStatus = 'recorded' | 'pending' | 'confirmed'

export type Member = {
  id: string
  name: string
  email?: string
  phone?: string
  avatar: string
  preferredPayment: 'cash' | 'upi' | 'venmo' | 'paypal' | 'bank'
}

export type SplitShare = {
  memberId: string
  value: number
}

export type ReceiptItem = {
  id: string
  label: string
  amount: number
  assignedTo: string[]
}

export type ExpenseComment = {
  id: string
  expenseId: string
  memberId: string
  body: string
  createdAt: string
}

export type ExpenseHistoryEvent = {
  id: string
  expenseId: string
  memberId?: string
  action: 'created' | 'updated' | 'commented' | 'deleted' | 'restored' | 'converted'
  summary: string
  createdAt: string
}

export type Expense = {
  id: string
  groupId: string | null
  description: string
  amount: number
  currency: string
  paidBy: string
  payments?: SplitShare[]
  participants: string[]
  splitMode: SplitMode
  splits: SplitShare[]
  category: string
  kind: ExpenseKind
  date: string
  notes?: string
  attachmentName?: string
  receiptItems?: ReceiptItem[]
  recurrence?: Recurrence
  reminderDays?: number
  paymentMethod?: PaymentMethod
  paymentReference?: string
  paymentStatus?: PaymentStatus
  comments?: ExpenseComment[]
  history?: ExpenseHistoryEvent[]
  deletedAt?: string
}

export type Group = {
  id: string
  name: string
  emoji: string
  category: 'trip' | 'home' | 'couple' | 'friends' | 'project'
  memberIds: string[]
  defaultCurrency: string
  simplifyDebts: boolean
  defaultSplitMode: SplitMode
  defaultSplits: SplitShare[]
  deletedAt?: string
}

export type Ledger = {
  members: Member[]
  groups: Group[]
  expenses: Expense[]
  defaultCurrency: string
  exchangeRates: Record<string, number>
  exchangeRateSource?: string
  exchangeRatesUpdatedAt?: string
}

export type Balance = {
  memberId: string
  amount: number
}

export type Settlement = {
  from: string
  to: string
  amount: number
  currency: string
}

export type FriendBalanceBreakdown = {
  scopeId: string | null
  scopeName: string
  amount: number
  currency: string
}

export type FriendBalanceSummary = {
  friendId: string
  amount: number
  currency: string
  breakdown: FriendBalanceBreakdown[]
}

export type UpcomingRecurringExpense = {
  sourceExpenseId: string
  description: string
  dueDate: string
  reminderDate?: string
  amount: number
  currency: string
  recurrence: Exclude<Recurrence, 'none'>
}

export type CurrencyExposure = {
  currency: string
  expenseCount: number
  originalAmount: number
  convertedAmount: number
}

export type VisibilitySummary = {
  viewerId: string
  groupId?: string | null
  selectedGroupExpenseCount: number
  selectedGroupViewerIds: string[]
  privateExpenseCount: number
  privateViewerIds: string[]
  visibleExpenseCount: number
}

export type SplitValidation = {
  valid: boolean
  message: string
}

export const roundMoney = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100

const distributeRemainder = (shares: Balance[], expected: number) => {
  const rounded = shares.map((share) => ({ ...share, amount: roundMoney(share.amount) }))
  const difference = roundMoney(expected - rounded.reduce((sum, share) => sum + share.amount, 0))
  if (rounded.length > 0 && difference !== 0) {
    rounded[0] = { ...rounded[0], amount: roundMoney(rounded[0].amount + difference) }
  }
  return rounded
}

export function calculateOwedShares(expense: Expense): Balance[] {
  const participants = expense.participants

  if (expense.kind === 'settlement') {
    return [{ memberId: expense.participants[0], amount: expense.amount }]
  }

  if (expense.splitMode === 'equal') {
    return distributeRemainder(
      participants.map((memberId) => ({ memberId, amount: expense.amount / participants.length })),
      expense.amount,
    )
  }

  if (expense.splitMode === 'exact' || expense.splitMode === 'adjustment') {
    return distributeRemainder(
      expense.splits.map((split) => ({ memberId: split.memberId, amount: split.value })),
      expense.amount,
    )
  }

  if (expense.splitMode === 'percent') {
    return distributeRemainder(
      expense.splits.map((split) => ({ memberId: split.memberId, amount: expense.amount * (split.value / 100) })),
      expense.amount,
    )
  }

  const totalShares = expense.splits.reduce((sum, split) => sum + split.value, 0)
  return distributeRemainder(
    expense.splits.map((split) => ({ memberId: split.memberId, amount: expense.amount * (split.value / totalShares) })),
    expense.amount,
  )
}

export function calculateReceiptItemSplits(
  receiptItems: ReceiptItem[],
  participantIds: string[],
  totalAmount?: number,
): SplitShare[] {
  const totals = new Map(participantIds.map((memberId) => [memberId, 0]))
  for (const item of receiptItems) {
    const assignedTo = item.assignedTo.filter((memberId) => totals.has(memberId))
    const members = assignedTo.length > 0 ? assignedTo : participantIds
    if (members.length === 0) continue
    const shares = distributeRemainder(
      members.map((memberId) => ({ memberId, amount: item.amount / members.length })),
      item.amount,
    )
    for (const share of shares) {
      totals.set(share.memberId, roundMoney((totals.get(share.memberId) ?? 0) + share.amount))
    }
  }

  if (totalAmount !== undefined && participantIds.length > 0) {
    const currentTotal = Array.from(totals.values()).reduce((sum, value) => sum + value, 0)
    const remainder = roundMoney(totalAmount - currentTotal)
    if (Math.abs(remainder) >= 0.01) {
      const remainderShares = distributeRemainder(
        participantIds.map((memberId) => ({ memberId, amount: remainder / participantIds.length })),
        remainder,
      )
      for (const share of remainderShares) {
        totals.set(share.memberId, roundMoney((totals.get(share.memberId) ?? 0) + share.amount))
      }
    }
  }

  return participantIds.map((memberId) => ({ memberId, value: roundMoney(totals.get(memberId) ?? 0) }))
}

export function convertAmount(amount: number, from: string, to: string, rates: Record<string, number>) {
  if (from === to) return roundMoney(amount)
  const fromRate = rates[from] ?? 1
  const toRate = rates[to] ?? 1
  return roundMoney((amount / fromRate) * toRate)
}

export function summarizeCurrencyExposure(ledger: Ledger, groupId?: string | null, targetCurrency = ledger.defaultCurrency): CurrencyExposure[] {
  const totals = new Map<string, CurrencyExposure>()
  for (const expense of ledger.expenses) {
    if (expense.deletedAt) continue
    if (groupId !== undefined && expense.groupId !== groupId) continue
    const current = totals.get(expense.currency) ?? {
      currency: expense.currency,
      expenseCount: 0,
      originalAmount: 0,
      convertedAmount: 0,
    }
    current.expenseCount += 1
    current.originalAmount = roundMoney(current.originalAmount + expense.amount)
    current.convertedAmount = roundMoney(
      current.convertedAmount + convertAmount(expense.amount, expense.currency, targetCurrency, ledger.exchangeRates),
    )
    totals.set(expense.currency, current)
  }
  return Array.from(totals.values()).sort((a, b) => b.convertedAmount - a.convertedAmount)
}

const convertSplitValue = (expense: Expense, value: number, targetCurrency: string, rates: Record<string, number>) => {
  if (expense.splitMode !== 'exact' && expense.splitMode !== 'adjustment') return value
  return convertAmount(value, expense.currency, targetCurrency, rates)
}

export function convertExpensesToCurrency(
  ledger: Ledger,
  groupId: string | null | undefined,
  targetCurrency: string,
  actorId = 'system',
  convertedAt = new Date().toISOString(),
): Ledger {
  return {
    ...ledger,
    defaultCurrency: targetCurrency,
    groups: ledger.groups.map((group) => (
      groupId !== undefined && group.id === groupId ? { ...group, defaultCurrency: targetCurrency } : group
    )),
    expenses: ledger.expenses.map((expense) => {
      if (expense.deletedAt) return expense
      if (groupId !== undefined && expense.groupId !== groupId) return expense
      if (expense.currency === targetCurrency) return expense

      const previousCurrency = expense.currency
      const previousAmount = expense.amount
      const convertedAmount = convertAmount(expense.amount, expense.currency, targetCurrency, ledger.exchangeRates)
      return {
        ...expense,
        amount: convertedAmount,
        currency: targetCurrency,
        splits: expense.splits.map((split) => ({
          ...split,
          value: convertSplitValue(expense, split.value, targetCurrency, ledger.exchangeRates),
        })),
        receiptItems: expense.receiptItems?.map((item) => ({
          ...item,
          amount: convertAmount(item.amount, expense.currency, targetCurrency, ledger.exchangeRates),
        })),
        history: [
          {
            id: `history-${expense.id}-converted-${convertedAt}`,
            expenseId: expense.id,
            memberId: actorId,
            action: 'converted',
            summary: `Converted ${previousCurrency} ${previousAmount.toFixed(2)} to ${targetCurrency} ${convertedAmount.toFixed(2)}`,
            createdAt: convertedAt,
          },
          ...(expense.history ?? []),
        ],
      }
    }),
  }
}

export function normalizeDefaultSplits(memberIds: string[], splits: SplitShare[]) {
  const values = new Map(splits.map((split) => [split.memberId, split.value]))
  return memberIds.map((memberId) => ({ memberId, value: roundMoney(values.get(memberId) ?? 0) }))
}

export function validateGroupDefaultSplits(splitMode: SplitMode, memberIds: string[], splits: SplitShare[]): SplitValidation {
  if (!memberIds.length) return { valid: false, message: 'Add members before saving defaults' }
  if (splitMode === 'equal') return { valid: true, message: 'Future expenses split equally' }

  const normalized = normalizeDefaultSplits(memberIds, splits)
  const memberSet = new Set(memberIds)
  if (splits.some((split) => !memberSet.has(split.memberId))) return { valid: false, message: 'Defaults must match current members' }

  if (splitMode === 'percent') {
    const total = roundMoney(normalized.reduce((sum, split) => sum + split.value, 0))
    return total === 100
      ? { valid: true, message: '100% allocated' }
      : { valid: false, message: `${total}% allocated` }
  }

  if (splitMode === 'shares') {
    const total = roundMoney(normalized.reduce((sum, split) => sum + split.value, 0))
    return total > 0
      ? { valid: true, message: `${total} shares saved` }
      : { valid: false, message: 'Share total must be above zero' }
  }

  const total = roundMoney(normalized.reduce((sum, split) => sum + split.value, 0))
  return total > 0
    ? { valid: true, message: `${total.toFixed(2)} default amount saved` }
    : { valid: false, message: 'Default amounts must be above zero' }
}

export function applyGroupDefaultSplits(group: Pick<Group, 'defaultSplitMode' | 'defaultSplits' | 'memberIds'>) {
  return {
    splitMode: group.defaultSplitMode,
    splits: group.defaultSplitMode === 'equal' ? [] : normalizeDefaultSplits(group.memberIds, group.defaultSplits),
  }
}

export function calculateBalances(ledger: Ledger, groupId?: string | null, currency = ledger.defaultCurrency): Balance[] {
  const balances = new Map<string, number>()
  const expenses = ledger.expenses.filter((expense) => !expense.deletedAt && (groupId === undefined || expense.groupId === groupId))

  for (const expense of expenses) {
    const amount = convertAmount(expense.amount, expense.currency, currency, ledger.exchangeRates)
    const normalized = { ...expense, amount, currency }

    if (expense.kind === 'settlement') {
      const from = expense.participants[0]
      balances.set(from, (balances.get(from) ?? 0) + amount)
      balances.set(expense.paidBy, (balances.get(expense.paidBy) ?? 0) - amount)
      continue
    }

    const paymentShares = expense.payments?.length
      ? expense.payments.map((payment) => ({
          memberId: payment.memberId,
          amount: convertAmount(payment.value, expense.currency, currency, ledger.exchangeRates),
        }))
      : [{ memberId: expense.paidBy, amount }]
    for (const payment of paymentShares) {
      balances.set(payment.memberId, (balances.get(payment.memberId) ?? 0) + payment.amount)
    }
    for (const share of calculateOwedShares(normalized)) {
      balances.set(share.memberId, (balances.get(share.memberId) ?? 0) - share.amount)
    }
  }

  return Array.from(balances.entries())
    .map(([memberId, amount]) => ({ memberId, amount: roundMoney(amount) }))
    .filter((balance) => Math.abs(balance.amount) >= 0.01)
    .sort((a, b) => b.amount - a.amount)
}

function addDirectDebt(debts: Map<string, number>, from: string, to: string, amount: number) {
  const rounded = roundMoney(amount)
  if (from === to || Math.abs(rounded) < 0.01) return

  const key = `${from}->${to}`
  const reverseKey = `${to}->${from}`
  const reverse = debts.get(reverseKey) ?? 0
  if (reverse > 0) {
    const offset = Math.min(reverse, rounded)
    const remainingReverse = roundMoney(reverse - offset)
    if (remainingReverse >= 0.01) {
      debts.set(reverseKey, remainingReverse)
    } else {
      debts.delete(reverseKey)
    }

    const remaining = roundMoney(rounded - offset)
    if (remaining >= 0.01) debts.set(key, roundMoney((debts.get(key) ?? 0) + remaining))
    return
  }

  debts.set(key, roundMoney((debts.get(key) ?? 0) + rounded))
}

const paymentMapForExpense = (expense: Expense, currency: string, rates: Record<string, number>) => {
  const payments = new Map<string, number>()
  const paymentShares = expense.payments?.length
    ? expense.payments.map((payment) => ({
        memberId: payment.memberId,
        amount: convertAmount(payment.value, expense.currency, currency, rates),
      }))
    : [{ memberId: expense.paidBy, amount: convertAmount(expense.amount, expense.currency, currency, rates) }]

  for (const payment of paymentShares) {
    payments.set(payment.memberId, roundMoney((payments.get(payment.memberId) ?? 0) + payment.amount))
  }
  return payments
}

const owedMapForExpense = (expense: Expense) => {
  const owed = new Map<string, number>()
  for (const share of calculateOwedShares(expense)) {
    owed.set(share.memberId, roundMoney((owed.get(share.memberId) ?? 0) + share.amount))
  }
  return owed
}

function addFriendBalance(
  summaries: Map<string, FriendBalanceSummary>,
  friendId: string,
  scopeId: string | null,
  scopeName: string,
  amount: number,
  currency: string,
) {
  const rounded = roundMoney(amount)
  if (Math.abs(rounded) < 0.01) return

  const summary = summaries.get(friendId) ?? { friendId, amount: 0, currency, breakdown: [] }
  summary.amount = roundMoney(summary.amount + rounded)
  const breakdown = summary.breakdown.find((item) => item.scopeId === scopeId)
  if (breakdown) {
    breakdown.amount = roundMoney(breakdown.amount + rounded)
  } else {
    summary.breakdown.push({ scopeId, scopeName, amount: rounded, currency })
  }
  summaries.set(friendId, summary)
}

export function calculateFriendBalanceSummaries(
  ledger: Ledger,
  viewerId: string,
  currency = ledger.defaultCurrency,
): FriendBalanceSummary[] {
  const summaries = new Map<string, FriendBalanceSummary>()
  const activeGroups = new Map(
    ledger.groups
      .filter((group) => !group.deletedAt && group.memberIds.includes(viewerId))
      .map((group) => [group.id, group]),
  )

  for (const expense of ledger.expenses) {
    if (expense.deletedAt) continue

    const group = expense.groupId ? activeGroups.get(expense.groupId) : null
    if (expense.groupId && !group) continue
    if (!expense.groupId && !listExpenseViewers(ledger, expense).includes(viewerId)) continue

    const scopeId = group?.id ?? null
    const scopeName = group?.name ?? 'Private expenses'
    const amount = convertAmount(expense.amount, expense.currency, currency, ledger.exchangeRates)

    if (expense.kind === 'settlement') {
      const from = expense.participants[0]
      const to = expense.paidBy
      if (from === viewerId && to !== viewerId) {
        addFriendBalance(summaries, to, scopeId, scopeName, amount, currency)
      } else if (to === viewerId && from !== viewerId) {
        addFriendBalance(summaries, from, scopeId, scopeName, -amount, currency)
      }
      continue
    }

    const normalized = { ...expense, amount, currency }
    const owedByMember = owedMapForExpense(normalized)
    const paidByMember = paymentMapForExpense(expense, currency, ledger.exchangeRates)
    const totalPaid = Array.from(paidByMember.values()).reduce((sum, paid) => sum + paid, 0)
    if (totalPaid <= 0) continue

    const viewerOwed = owedByMember.get(viewerId) ?? 0
    const viewerPaid = paidByMember.get(viewerId) ?? 0
    const involvedMembers = new Set([
      expense.paidBy,
      ...(expense.payments ?? []).map((payment) => payment.memberId),
      ...expense.participants,
    ])

    for (const friendId of involvedMembers) {
      if (friendId === viewerId) continue
      const friendOwed = owedByMember.get(friendId) ?? 0
      const friendPaid = paidByMember.get(friendId) ?? 0
      const viewerCoveredFriend = friendOwed * (viewerPaid / totalPaid)
      const friendCoveredViewer = viewerOwed * (friendPaid / totalPaid)
      addFriendBalance(summaries, friendId, scopeId, scopeName, viewerCoveredFriend - friendCoveredViewer, currency)
    }
  }

  return Array.from(summaries.values())
    .map((summary) => ({
      ...summary,
      amount: roundMoney(summary.amount),
      breakdown: summary.breakdown
        .map((item) => ({ ...item, amount: roundMoney(item.amount) }))
        .filter((item) => Math.abs(item.amount) >= 0.01)
        .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount) || a.scopeName.localeCompare(b.scopeName)),
    }))
    .filter((summary) => Math.abs(summary.amount) >= 0.01)
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount) || a.friendId.localeCompare(b.friendId))
}

export function listExpenseViewers(ledger: Ledger, expense: Expense): string[] {
  if (expense.groupId) {
    const group = ledger.groups.find((candidate) => candidate.id === expense.groupId)
    return group?.memberIds ?? []
  }
  return Array.from(new Set([expense.paidBy, ...(expense.payments ?? []).map((payment) => payment.memberId), ...expense.participants]))
}

export function canMemberSeeExpense(ledger: Ledger, expense: Expense, memberId: string) {
  if (expense.deletedAt) return false
  return listExpenseViewers(ledger, expense).includes(memberId)
}

export function visibleExpensesForMember(ledger: Ledger, memberId: string) {
  return ledger.expenses.filter((expense) => canMemberSeeExpense(ledger, expense, memberId))
}

export function canMemberSeeBalance(ledger: Ledger, groupId: string | null, balanceMemberId: string, viewerId: string) {
  if (groupId) {
    const group = ledger.groups.find((candidate) => candidate.id === groupId)
    return Boolean(group?.memberIds.includes(viewerId))
  }
  return balanceMemberId === viewerId
}

export function summarizeVisibility(ledger: Ledger, viewerId: string, groupId?: string | null): VisibilitySummary {
  const selectedGroupExpenses = ledger.expenses.filter((expense) => !expense.deletedAt && groupId !== undefined && expense.groupId === groupId)
  const privateExpenses = ledger.expenses.filter((expense) => !expense.deletedAt && !expense.groupId && canMemberSeeExpense(ledger, expense, viewerId))
  return {
    viewerId,
    groupId,
    selectedGroupExpenseCount: selectedGroupExpenses.length,
    selectedGroupViewerIds: Array.from(new Set(selectedGroupExpenses.flatMap((expense) => listExpenseViewers(ledger, expense)))),
    privateExpenseCount: privateExpenses.length,
    privateViewerIds: Array.from(new Set(privateExpenses.flatMap((expense) => listExpenseViewers(ledger, expense)))),
    visibleExpenseCount: visibleExpensesForMember(ledger, viewerId).length,
  }
}

export function simplifyDebts(balances: Balance[], currency: string): Settlement[] {
  const creditors = balances
    .filter((balance) => balance.amount > 0)
    .map((balance) => ({ ...balance }))
    .sort((a, b) => b.amount - a.amount)
  const debtors = balances
    .filter((balance) => balance.amount < 0)
    .map((balance) => ({ memberId: balance.memberId, amount: Math.abs(balance.amount) }))
    .sort((a, b) => b.amount - a.amount)
  const settlements: Settlement[] = []

  let creditorIndex = 0
  let debtorIndex = 0
  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex]
    const debtor = debtors[debtorIndex]
    const amount = roundMoney(Math.min(creditor.amount, debtor.amount))

    if (amount > 0) {
      settlements.push({ from: debtor.memberId, to: creditor.memberId, amount, currency })
      creditor.amount = roundMoney(creditor.amount - amount)
      debtor.amount = roundMoney(debtor.amount - amount)
    }

    if (creditor.amount <= 0.01) creditorIndex += 1
    if (debtor.amount <= 0.01) debtorIndex += 1
  }

  return settlements
}

export function calculateDirectSettlements(ledger: Ledger, groupId?: string | null, currency = ledger.defaultCurrency): Settlement[] {
  const debts = new Map<string, number>()
  const expenses = ledger.expenses.filter((expense) => !expense.deletedAt && (groupId === undefined || expense.groupId === groupId))

  for (const expense of expenses) {
    const amount = convertAmount(expense.amount, expense.currency, currency, ledger.exchangeRates)

    if (expense.kind === 'settlement') {
      const from = expense.participants[0]
      addDirectDebt(debts, expense.paidBy, from, amount)
      continue
    }

    const normalized = { ...expense, amount, currency }
    const owedByMember = owedMapForExpense(normalized)
    const paidByMember = paymentMapForExpense(expense, currency, ledger.exchangeRates)
    const totalPaid = Array.from(paidByMember.values()).reduce((sum, paid) => sum + paid, 0)
    if (totalPaid <= 0) continue

    for (const [debtorId, owed] of owedByMember.entries()) {
      for (const [creditorId, paid] of paidByMember.entries()) {
        addDirectDebt(debts, debtorId, creditorId, owed * (paid / totalPaid))
      }
    }
  }

  return Array.from(debts.entries())
    .map(([key, amount]) => {
      const [from, to] = key.split('->')
      return { from, to, amount: roundMoney(amount), currency }
    })
    .filter((settlement) => settlement.amount >= 0.01)
    .sort((a, b) => b.amount - a.amount || a.from.localeCompare(b.from) || a.to.localeCompare(b.to))
}

export function spendingByCategory(ledger: Ledger, groupId?: string | null, currency = ledger.defaultCurrency) {
  const totals = new Map<string, number>()
  for (const expense of ledger.expenses) {
    if (expense.deletedAt) continue
    if (expense.kind === 'settlement') continue
    if (groupId !== undefined && expense.groupId !== groupId) continue
    const amount = convertAmount(expense.amount, expense.currency, currency, ledger.exchangeRates)
    totals.set(expense.category, roundMoney((totals.get(expense.category) ?? 0) + amount))
  }
  return Array.from(totals.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)
}

export function searchExpenses(ledger: Ledger, query: string) {
  const normalized = query.trim().toLowerCase()
  const activeExpenses = ledger.expenses.filter((expense) => !expense.deletedAt)
  if (!normalized) return activeExpenses
  return activeExpenses.filter((expense) => {
    const group = ledger.groups.find((candidate) => candidate.id === expense.groupId)
    const people = [expense.paidBy, ...expense.participants]
      .map((memberId) => ledger.members.find((member) => member.id === memberId)?.name)
      .filter(Boolean)
    return [
      expense.description,
      expense.category,
      expense.notes,
      expense.currency,
      expense.attachmentName,
      expense.date,
      expense.amount.toFixed(2),
      expense.amount.toFixed(0),
      expense.kind,
      expense.splitMode,
      group?.name,
      ...(expense.comments ?? []).map((comment) => comment.body),
      ...people,
    ]
      .filter(Boolean)
      .some((value) => value?.toLowerCase().includes(normalized))
  })
}

export function spendingTrend(ledger: Ledger, groupId?: string | null, currency = ledger.defaultCurrency) {
  const totals = new Map<string, number>()
  for (const expense of ledger.expenses) {
    if (expense.deletedAt) continue
    if (expense.kind === 'settlement') continue
    if (groupId !== undefined && expense.groupId !== groupId) continue
    const month = expense.date.slice(0, 7)
    const amount = convertAmount(expense.amount, expense.currency, currency, ledger.exchangeRates)
    totals.set(month, roundMoney((totals.get(month) ?? 0) + amount))
  }
  return Array.from(totals.entries())
    .map(([month, amount]) => ({ month, amount }))
    .sort((a, b) => a.month.localeCompare(b.month))
}

export function exportCsv(ledger: Ledger) {
  const header = ['date', 'description', 'category', 'amount', 'currency', 'paid_by', 'payer_shares', 'participants', 'group_id', 'kind', 'split_mode', 'payment_method', 'payment_status', 'payment_reference', 'notes']
  const rows = ledger.expenses.filter((expense) => !expense.deletedAt).map((expense) =>
    [
      expense.date,
      expense.description,
      expense.category,
      expense.amount.toFixed(2),
      expense.currency,
      expense.paidBy,
      expense.payments?.length ? expense.payments.map((payment) => `${payment.memberId}:${payment.value.toFixed(2)}`).join('|') : '',
      expense.participants.join('|'),
      expense.groupId ?? 'non-group',
      expense.kind,
      expense.splitMode,
      expense.paymentMethod ?? '',
      expense.paymentStatus ?? '',
      expense.paymentReference ?? '',
      expense.notes ?? '',
    ]
      .map((value) => `"${String(value).replaceAll('"', '""')}"`)
      .join(','),
  )
  return [header.join(','), ...rows].join('\n')
}

export function exportJsonBackup(ledger: Ledger, exportedAt = new Date().toISOString()) {
  return JSON.stringify({
    app: 'SplitClub',
    version: 1,
    exportedAt,
    ledger,
  }, null, 2)
}

export function getNextDueDate(date: string, recurrence: Recurrence): string | undefined {
  if (recurrence === 'none') return undefined
  const due = new Date(`${date}T00:00:00.000Z`)
  if (Number.isNaN(due.getTime())) return undefined
  if (recurrence === 'weekly') due.setUTCDate(due.getUTCDate() + 7)
  if (recurrence === 'monthly') due.setUTCMonth(due.getUTCMonth() + 1)
  if (recurrence === 'yearly') due.setUTCFullYear(due.getUTCFullYear() + 1)
  return due.toISOString().slice(0, 10)
}

export function getReminderDate(dueDate: string, reminderDays = 0): string | undefined {
  const reminder = new Date(`${dueDate}T00:00:00.000Z`)
  if (Number.isNaN(reminder.getTime())) return undefined
  reminder.setUTCDate(reminder.getUTCDate() - reminderDays)
  return reminder.toISOString().slice(0, 10)
}

export function listUpcomingRecurringExpenses(ledger: Ledger, canceledIds: string[] = []): UpcomingRecurringExpense[] {
  const existingGenerated = new Set(
    ledger.expenses
      .map((expense) => expense.notes?.match(/generated-from:([^\s]+)/)?.[1])
      .filter((id): id is string => Boolean(id)),
  )

  return ledger.expenses
    .filter((expense) => !expense.deletedAt)
    .filter((expense) => expense.recurrence && expense.recurrence !== 'none')
    .filter((expense) => !canceledIds.includes(expense.id))
    .flatMap((expense): UpcomingRecurringExpense[] => {
      const dueDate = getNextDueDate(expense.date, expense.recurrence ?? 'none')
      if (!dueDate || existingGenerated.has(expense.id)) return []
      return [{
        sourceExpenseId: expense.id,
        description: expense.description,
        dueDate,
        reminderDate: getReminderDate(dueDate, expense.reminderDays),
        amount: expense.amount,
        currency: expense.currency,
        recurrence: expense.recurrence as Exclude<Recurrence, 'none'>,
      }]
    })
}
