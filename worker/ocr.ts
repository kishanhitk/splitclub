import { parseReceiptText, type ExtractedReceiptItem } from '../src/domain/receipts'

export type OcrBindings = {
  AI?: {
    run(model: string, input: unknown): Promise<unknown>
  }
  OCR_MODEL?: string
}

export async function extractReceiptItems(input: {
  fileBytes?: ArrayBuffer
  contentType?: string
  ocrText?: string
  assignedTo?: string[]
  env: OcrBindings
}): Promise<{ status: 'complete' | 'pending'; text?: string; items: ExtractedReceiptItem[] }> {
  if (input.ocrText?.trim()) {
    return {
      status: 'complete',
      text: input.ocrText,
      items: parseReceiptText(input.ocrText, input.assignedTo),
    }
  }

  if (!input.fileBytes || !input.contentType?.startsWith('image/') || !input.env.AI) {
    return { status: 'pending', items: [] }
  }

  const model = input.env.OCR_MODEL ?? '@cf/google/gemma-3-12b-it'
  const response = await input.env.AI.run(model, {
    image: [...new Uint8Array(input.fileBytes)],
    prompt: 'Extract receipt line items. Return only JSON in this shape: {"items":[{"label":"item name","amount":12.34}]}',
  })
  const text = readAiText(response)
  return {
    status: 'complete',
    text,
    items: parseAiItems(text, input.assignedTo),
  }
}

function readAiText(response: unknown) {
  if (typeof response === 'string') return response
  if (response && typeof response === 'object') {
    const candidate = response as { response?: unknown; text?: unknown; result?: unknown }
    if (typeof candidate.response === 'string') return candidate.response
    if (typeof candidate.text === 'string') return candidate.text
    if (typeof candidate.result === 'string') return candidate.result
  }
  return JSON.stringify(response)
}

function parseAiItems(text: string, assignedTo: string[] = []): ExtractedReceiptItem[] {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return parseReceiptText(text, assignedTo)
  try {
    const parsed = JSON.parse(match[0]) as { items?: Array<{ label?: string; amount?: number }> }
    return (parsed.items ?? [])
      .map((item, index) => ({
        id: `ocr-${index + 1}`,
        label: item.label?.trim() ?? '',
        amount: Number(item.amount),
        assignedTo,
      }))
      .filter((item) => item.label && item.amount > 0)
  } catch {
    return parseReceiptText(text, assignedTo)
  }
}
