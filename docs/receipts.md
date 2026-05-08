# Receipts And OCR

SplitClub receipt handling uses Expo DocumentPicker on Android/web and Cloudflare R2 for durable file storage.

## Worker Routes

- `GET /api/receipts` lists receipts owned by the authenticated member.
- `POST /api/receipts` accepts multipart form data with:
  - `file`: receipt image or PDF.
  - `expenseId`: optional linked expense id.
  - `ocrText`: optional OCR text override for deterministic extraction and tests.
  - `assignedTo`: repeated member ids for extracted line item assignment.

Uploaded files are stored under `receipts/{ownerId}/{receiptId}-{fileName}` in R2. Metadata and extracted items are stored by `migrations/0004_receipts.sql`.

## OCR Path

When `ocrText` is present, the Worker parses line items directly. Without `ocrText`, image files use the configured Cloudflare Workers AI binding:

```toml
[ai]
binding = "AI"

[vars]
OCR_MODEL = "@cf/google/gemma-3-12b-it"
```

The model prompt asks for JSON line items. If AI is not configured or the file is not an image, the receipt is stored with `ocrStatus: "pending"` so extraction can be retried later.

## App Review Flow

The Add screen lets users choose a receipt, run extraction, review the extracted line items, adjust assignments/amounts through the existing itemization controls, and then save the expense.
