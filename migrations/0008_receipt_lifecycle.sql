PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS receipt_review_events (
  id TEXT PRIMARY KEY,
  receipt_id TEXT NOT NULL REFERENCES receipts(id),
  actor_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  source TEXT NOT NULL,
  ocr_status TEXT NOT NULL,
  item_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_receipt_review_events_receipt ON receipt_review_events(receipt_id, created_at DESC);
