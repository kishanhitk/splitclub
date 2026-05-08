export type SplitMode = 'equal' | 'exact' | 'percent' | 'shares' | 'adjustment'
export type ExpenseKind = 'expense' | 'settlement' | 'refund' | 'reimbursement' | 'debt'
export type Recurrence = 'none' | 'weekly' | 'monthly' | 'yearly'

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

export type Expense = {
  id: string
  groupId: string | null
  description: string
  amount: number
  currency: string
  paidBy: string
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
}

export type Ledger = {
  members: Member[]
  groups: Group[]
  expenses: Expense[]
  defaultCurrency: string
  exchangeRates: Record<string, number>
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

export type UpcomingRecurringExpense = {
  sourceExpenseId: string
  description: string
  dueDate: string
  reminderDate?: string
  amount: number
  currency: string
  recurrence: Exclude<Recurrence, 'none'>
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

export function convertAmount(amount: number, from: string, to: string, rates: Record<string, number>) {
  if (from === to) return roundMoney(amount)
  const fromRate = rates[from] ?? 1
  const toRate = rates[to] ?? 1
  return roundMoney((amount / fromRate) * toRate)
}

export function calculateBalances(ledger: Ledger, groupId?: string | null, currency = ledger.defaultCurrency): Balance[] {
  const balances = new Map<string, number>()
  const expenses = ledger.expenses.filter((expense) => groupId === undefined || expense.groupId === groupId)

  for (const expense of expenses) {
    const amount = convertAmount(expense.amount, expense.currency, currency, ledger.exchangeRates)
    const normalized = { ...expense, amount, currency }

    if (expense.kind === 'settlement') {
      const from = expense.participants[0]
      balances.set(from, (balances.get(from) ?? 0) + amount)
      balances.set(expense.paidBy, (balances.get(expense.paidBy) ?? 0) - amount)
      continue
    }

    balances.set(expense.paidBy, (balances.get(expense.paidBy) ?? 0) + amount)
    for (const share of calculateOwedShares(normalized)) {
      balances.set(share.memberId, (balances.get(share.memberId) ?? 0) - share.amount)
    }
  }

  return Array.from(balances.entries())
    .map(([memberId, amount]) => ({ memberId, amount: roundMoney(amount) }))
    .filter((balance) => Math.abs(balance.amount) >= 0.01)
    .sort((a, b) => b.amount - a.amount)
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

export function spendingByCategory(ledger: Ledger, groupId?: string | null, currency = ledger.defaultCurrency) {
  const totals = new Map<string, number>()
  for (const expense of ledger.expenses) {
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
  if (!normalized) return ledger.expenses
  return ledger.expenses.filter((expense) => {
    return [expense.description, expense.category, expense.notes, expense.currency, expense.attachmentName]
      .filter(Boolean)
      .some((value) => value?.toLowerCase().includes(normalized))
  })
}

export function exportCsv(ledger: Ledger) {
  const header = ['date', 'description', 'category', 'amount', 'currency', 'paid_by', 'group_id', 'kind']
  const rows = ledger.expenses.map((expense) =>
    [
      expense.date,
      expense.description,
      expense.category,
      expense.amount.toFixed(2),
      expense.currency,
      expense.paidBy,
      expense.groupId ?? 'non-group',
      expense.kind,
    ]
      .map((value) => `"${String(value).replaceAll('"', '""')}"`)
      .join(','),
  )
  return [header.join(','), ...rows].join('\n')
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
