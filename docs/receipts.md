# Receipts And OCR

SplitClub receipt handling uses Expo DocumentPicker on Android/web and Cloudflare R2 for durable file storage.

## Worker Routes

- `GET /api/receipts` lists receipts owned by the authenticated member, including extracted items, linked expense id, and review history.
- `POST /api/receipts` accepts multipart form data with:
  - `file`: receipt image or PDF.
  - `expenseId`: optional linked expense id.
  - `ocrText`: optional OCR text override for deterministic extraction and tests.
  - `assignedTo`: repeated member ids for extracted line item assignment.
- `POST /api/receipts/:id/retry` reruns extraction for an owned receipt with an optional JSON `ocrText` override and `assignedTo` member list.
- `POST /api/expenses` and `PUT /api/expenses/:id` accept `receiptId` to attach an owned cloud receipt to the saved expense.

Uploaded files are stored under `receipts/{ownerId}/{receiptId}-{fileName}` in R2. Metadata and extracted items are stored by `migrations/0004_receipts.sql`. OCR review events and attachment lifecycle events are stored by `migrations/0008_receipt_lifecycle.sql`.

## OCR Path

When `ocrText` is present, the Worker parses line items directly. Without `ocrText`, image files use the configured Cloudflare Workers AI binding:

```toml
[ai]
binding = "AI"

[vars]
OCR_MODEL = "@cf/google/gemma-3-12b-it"
```

The model prompt asks for JSON line items. If AI is not configured or the file is not an image, the receipt is stored with `ocrStatus: "pending"` so extraction can be retried later.

Retrying OCR replaces the stored extracted item list for that receipt and records a receipt retry audit event plus a receipt review history row. If `ocrText` is supplied, retry uses that reviewed text directly; otherwise the Worker reads the original object from R2 and attempts extraction again.

Each receipt review history row records the action, source, OCR status, item count, actor, and creation time. Attaching a receipt to an expense adds a `linked` history event and refuses reuse when the receipt is already attached to a different expense.

## App Review Flow

The Add screen lets users choose a receipt, run extraction, review the extracted line items, adjust assignments/amounts through the existing itemization controls, and then save the expense.

When cloud sync is configured, the receipt step can also load `GET /api/receipts`, show the latest uploaded receipts with compact review history, retry OCR from the reviewed OCR text, select a cloud receipt for the current expense, and save that receipt link with the expense. If cloud sync is unavailable, local OCR text extraction remains available.
