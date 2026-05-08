PRAGMA foreign_keys = ON;

ALTER TABLE expenses ADD COLUMN payment_method TEXT;
ALTER TABLE expenses ADD COLUMN payment_reference TEXT;
ALTER TABLE expenses ADD COLUMN payment_status TEXT;

ALTER TABLE settlements ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'cash';
ALTER TABLE settlements ADD COLUMN payment_reference TEXT;
ALTER TABLE settlements ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'recorded';
