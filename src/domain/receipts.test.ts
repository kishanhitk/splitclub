import { describe, expect, test } from 'bun:test'
import { parseReceiptText } from './receipts'

describe('receipt OCR parsing', () => {
  test('extracts line items from receipt text', () => {
    const items = parseReceiptText(
      `Paneer tikka 420.50
Naan basket INR 180
Service charge 60.25`,
      ['kishan', 'anya'],
    )

    expect(items).toEqual([
      { id: 'ocr-1', label: 'Paneer tikka', amount: 420.5, assignedTo: ['kishan', 'anya'] },
      { id: 'ocr-2', label: 'Naan basket', amount: 180, assignedTo: ['kishan', 'anya'] },
      { id: 'ocr-3', label: 'Service charge', amount: 60.25, assignedTo: ['kishan', 'anya'] },
    ])
  })
})
