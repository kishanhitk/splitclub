export type ImportedTransaction = {
  id: string
  date: string
  description: string
  amount: number
  currency: string
  category: string
  sourceRow: string
}

const headerAliases = {
  date: ['date', 'transaction date', 'posted date', 'posting date'],
  description: ['description', 'merchant', 'memo', 'details', 'payee', 'narration'],
  amount: ['amount', 'value', 'transaction amount'],
  debit: ['debit', 'withdrawal', 'spent', 'charge'],
  credit: ['credit', 'deposit', 'received'],
  currency: ['currency', 'ccy', 'currency code'],
  category: ['category', 'type'],
} as const

const categoryRules: Array<[string, RegExp]> = [
  ['Transport', /\b(cab|taxi|uber|ola|lyft|metro|train|bus|fuel|parking|toll|flight|airline)\b/i],
  ['Food', /\b(cafe|coffee|restaurant|dinner|lunch|breakfast|bar|martins|zomato|swiggy|doordash|ubereats)\b/i],
  ['Lodging', /\b(hotel|villa|airbnb|booking|stay|lodging)\b/i],
  ['Rent', /\b(rent|lease|landlord)\b/i],
  ['Groceries', /\b(grocery|groceries|market|supermarket|trader|whole foods|dmart)\b/i],
  ['Utilities', /\b(electric|water|wifi|internet|gas|utility|phone|mobile|broadband)\b/i],
  ['Tickets', /\b(ticket|cinema|movie|concert|event|museum|show)\b/i],
]

function parseCsvLine(line: string) {
  const cells: string[] = []
  let current = ''
  let quoted = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]

    if (char === '"' && quoted && next === '"') {
      current += '"'
      index += 1
      continue
    }
    if (char === '"') {
      quoted = !quoted
      continue
    }
    if (char === ',' && !quoted) {
      cells.push(current.trim())
      current = ''
      continue
    }
    current += char
  }

  cells.push(current.trim())
  return cells
}

function normalizeHeader(header: string) {
  return header.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
}

function headerIndex(headers: string[], aliases: readonly string[]) {
  return headers.findIndex((header) => aliases.includes(normalizeHeader(header)))
}

function parseMoney(value?: string) {
  if (!value) return undefined
  const normalized = value
    .replace(/\(([^)]+)\)/, '-$1')
    .replace(/[^0-9.-]/g, '')
  const amount = Number(normalized)
  return Number.isFinite(amount) ? amount : undefined
}

function toIsoDate(value?: string) {
  if (!value) return undefined
  const trimmed = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed

  const slashMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (slashMatch) {
    const [, first, second, year] = slashMatch
    const fullYear = year.length === 2 ? `20${year}` : year
    const month = Number(first) > 12 ? second : first
    const day = Number(first) > 12 ? first : second
    return `${fullYear.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  const date = new Date(trimmed)
  if (Number.isNaN(date.getTime())) return undefined
  return date.toISOString().slice(0, 10)
}

export function inferTransactionCategory(description: string) {
  return categoryRules.find(([, pattern]) => pattern.test(description))?.[0] ?? 'General'
}

export function parseImportedTransactions(input: string, defaultCurrency = 'INR'): ImportedTransaction[] {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length === 0) return []

  const firstRow = parseCsvLine(lines[0])
  const normalizedHeaders = firstRow.map(normalizeHeader)
  const hasHeader = normalizedHeaders.some((header) =>
    Object.values(headerAliases).some((aliases) => (aliases as readonly string[]).includes(header)),
  )
  const headers = hasHeader ? firstRow : ['date', 'description', 'amount', 'currency']
  const rows = hasHeader ? lines.slice(1) : lines

  const dateIndex = headerIndex(headers, headerAliases.date)
  const descriptionIndex = headerIndex(headers, headerAliases.description)
  const amountIndex = headerIndex(headers, headerAliases.amount)
  const debitIndex = headerIndex(headers, headerAliases.debit)
  const creditIndex = headerIndex(headers, headerAliases.credit)
  const currencyIndex = headerIndex(headers, headerAliases.currency)
  const categoryIndex = headerIndex(headers, headerAliases.category)

  return rows.flatMap((line, index) => {
    const cells = parseCsvLine(line)
    const debit = parseMoney(cells[debitIndex])
    const credit = parseMoney(cells[creditIndex])
    const signedAmount = parseMoney(cells[amountIndex]) ?? debit ?? (credit !== undefined ? -credit : undefined)
    const amount = signedAmount === undefined ? undefined : Math.abs(signedAmount)
    const date = toIsoDate(cells[dateIndex])
    const description = cells[descriptionIndex]?.trim()

    if (!date || !description || !amount || amount <= 0) return []

    const currency = (cells[currencyIndex]?.trim() || defaultCurrency).toUpperCase()
    const category = cells[categoryIndex]?.trim() || inferTransactionCategory(description)
    return [{
      id: `txn_${date}_${index}_${description.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`,
      date,
      description,
      amount,
      currency,
      category,
      sourceRow: line,
    }]
  })
}
