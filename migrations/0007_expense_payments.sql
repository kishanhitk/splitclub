CREATE TABLE IF NOT EXISTS expense_payments (
  expense_id TEXT NOT NULL REFERENCES expenses(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  value REAL NOT NULL,
  PRIMARY KEY (expense_id, user_id)
);
