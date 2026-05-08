PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS expense_comments (
  id TEXT PRIMARY KEY,
  expense_id TEXT NOT NULL REFERENCES expenses(id),
  member_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_expense_comments_expense ON expense_comments(expense_id, created_at ASC);
