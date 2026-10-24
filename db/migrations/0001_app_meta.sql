-- Foundation table for application metadata (seed markers, demo flags).
-- The domain schema (trials, checklists, patients, events, audit) is added in later migrations.
CREATE TABLE app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
