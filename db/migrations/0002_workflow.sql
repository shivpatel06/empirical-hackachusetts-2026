CREATE TABLE trials (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  criteria_text TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  recruiting_status TEXT NOT NULL,
  source_url TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  local_open INTEGER NOT NULL DEFAULT 0 CHECK (local_open IN (0,1))
);
CREATE TABLE checklist_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trial_id TEXT NOT NULL REFERENCES trials(id),
  version INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  state TEXT NOT NULL CHECK (state IN ('draft','approved','superseded')),
  rules_json TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('live','fixture')),
  created_at TEXT NOT NULL,
  approved_at TEXT,
  approved_by TEXT,
  UNIQUE(trial_id,version)
);
CREATE UNIQUE INDEX one_draft ON checklist_versions(trial_id) WHERE state='draft';
CREATE UNIQUE INDEX one_approved ON checklist_versions(trial_id) WHERE state='approved';
CREATE TRIGGER immutable_approved_rules BEFORE UPDATE OF rules_json,source_hash,version ON checklist_versions
WHEN OLD.state != 'draft' BEGIN SELECT RAISE(ABORT,'Approved checklist is immutable'); END;
CREATE TABLE patients (
  id TEXT PRIMARY KEY,
  diagnosis TEXT NOT NULL,
  clinician TEXT NOT NULL,
  next_visit TEXT,
  revision INTEGER NOT NULL,
  synthetic INTEGER NOT NULL CHECK (synthetic=1)
);
CREATE TABLE chart_lines (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id),
  location TEXT NOT NULL CHECK (location IN ('chart','outside')),
  payload_json TEXT NOT NULL
);
CREATE TRIGGER chart_append_only_update BEFORE UPDATE ON chart_lines
BEGIN SELECT RAISE(ABORT,'Chart lines are append-only'); END;
CREATE TRIGGER chart_append_only_delete BEFORE DELETE ON chart_lines
BEGIN SELECT RAISE(ABORT,'Chart lines are append-only'); END;
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  dedup_key TEXT NOT NULL UNIQUE,
  payload_json TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('queued','processing','completed','failed','stale')),
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE TABLE screenings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL UNIQUE REFERENCES events(id),
  patient_id TEXT NOT NULL REFERENCES patients(id),
  trial_id TEXT NOT NULL REFERENCES trials(id),
  checklist_id INTEGER NOT NULL REFERENCES checklist_versions(id),
  chart_revision INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('likely_match','needs_info','needs_review','ruled_out')),
  mode TEXT NOT NULL CHECK (mode IN ('live','fixture')),
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE rule_results (
  screening_id INTEGER NOT NULL REFERENCES screenings(id),
  rule_id TEXT NOT NULL,
  result_json TEXT NOT NULL,
  PRIMARY KEY(screening_id,rule_id)
);
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER REFERENCES events(id),
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TRIGGER audit_append_only_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT,'Audit is append-only'); END;
CREATE TRIGGER audit_append_only_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT,'Audit is append-only'); END;
CREATE INDEX patient_screenings ON screenings(patient_id,trial_id,id DESC);
