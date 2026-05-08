PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS receipts (
  id TEXT PRIMARY KEY,
  expense_id TEXT REFERENCES expenses(id),
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  object_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  ocr_status TEXT NOT NULL DEFAULT 'pending',
  ocr_text TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS receipt_extracted_items (
  id TEXT PRIMARY KEY,
  receipt_id TEXT NOT NULL REFERENCES receipts(id),
  label TEXT NOT NULL,
  amount REAL NOT NULL,
  assigned_to_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_receipts_owner ON receipts(owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_receipts_expense ON receipts(expense_id);
