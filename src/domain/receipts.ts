export type ExtractedReceiptItem = {
  id?: string
  label: string
  amount: number
  assignedTo: string[]
}

export function parseReceiptText(text: string, assignedTo: string[] = []): ExtractedReceiptItem[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => line.match(/^(.+?)\s+(?:[A-Z]{3}\s*)?([0-9]+(?:\.[0-9]{1,2})?)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match, index) => ({
      id: `ocr-${index + 1}`,
      label: cleanupLabel(match[1]),
      amount: Number(match[2]),
      assignedTo,
    }))
    .filter((item) => item.label.length > 0 && item.amount > 0)
}

function cleanupLabel(label: string) {
  return label.replace(/[·•*-]+$/g, '').trim()
}
