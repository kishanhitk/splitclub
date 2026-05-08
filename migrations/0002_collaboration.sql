PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS group_invites (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id),
  invited_email TEXT,
  invited_phone TEXT,
  role TEXT NOT NULL DEFAULT 'member',
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  created_by TEXT REFERENCES users(id),
  accepted_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT,
  accepted_at TEXT,
  canceled_at TEXT
);

CREATE TABLE IF NOT EXISTS visibility_settings (
  user_id TEXT NOT NULL REFERENCES users(id),
  group_id TEXT REFERENCES groups(id),
  show_expenses INTEGER NOT NULL DEFAULT 1,
  show_balances INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_group_invites_group ON group_invites(group_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_group_invites_token ON group_invites(token);
