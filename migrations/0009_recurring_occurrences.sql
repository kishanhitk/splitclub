PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS recurring_occurrences (
  id TEXT PRIMARY KEY,
  source_expense_id TEXT NOT NULL REFERENCES expenses(id),
  occurrence_expense_id TEXT REFERENCES expenses(id),
  actor_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  due_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_recurring_occurrences_source ON recurring_occurrences(source_expense_id, due_date DESC);
