CREATE TABLE agent_runs (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 patient_id TEXT NOT NULL REFERENCES patients(id),
 trial_id TEXT NOT NULL REFERENCES trials(id),
 screening_id INTEGER NOT NULL REFERENCES screenings(id),
 kind TEXT NOT NULL CHECK(kind IN ('gap','outreach')),
 mode TEXT NOT NULL CHECK(mode IN ('live','fixture')),
 state TEXT NOT NULL CHECK(state IN ('queued','running','completed','failed','stale')),
 attempts INTEGER NOT NULL DEFAULT 0,
 language TEXT NOT NULL DEFAULT 'English',
 summary TEXT NOT NULL DEFAULT '',
 usage_json TEXT,
 created_at TEXT NOT NULL,
 UNIQUE(screening_id,kind)
);
CREATE TABLE agent_steps (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 run_id INTEGER NOT NULL REFERENCES agent_runs(id),
 title TEXT NOT NULL,
 detail TEXT NOT NULL,
 data_json TEXT,
 created_at TEXT NOT NULL
);
CREATE TABLE journey_items (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 run_id INTEGER REFERENCES agent_runs(id),
 patient_id TEXT NOT NULL REFERENCES patients(id),
 trial_id TEXT NOT NULL REFERENCES trials(id),
 screening_id INTEGER NOT NULL REFERENCES screenings(id),
 kind TEXT NOT NULL CHECK(kind IN ('request','question','physician','summary','reminder')),
 rule_id TEXT,
 body TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','approved','declined','answered')),
 revision INTEGER NOT NULL DEFAULT 1,
 approved_at TEXT,
 reply_line_id TEXT,
 dedup_key TEXT NOT NULL UNIQUE,
 created_at TEXT NOT NULL
);
CREATE TABLE outreach_cases (
 screening_id INTEGER PRIMARY KEY REFERENCES screenings(id),
 patient_id TEXT NOT NULL REFERENCES patients(id),
 trial_id TEXT NOT NULL REFERENCES trials(id),
 decision TEXT NOT NULL CHECK(decision IN ('verified','rejected','snoozed')),
 review_note TEXT NOT NULL,
 stage TEXT NOT NULL DEFAULT 'drafts',
 revision INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL,
 stage_at TEXT NOT NULL
);
