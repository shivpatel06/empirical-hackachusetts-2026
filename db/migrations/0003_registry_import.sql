ALTER TABLE trials ADD COLUMN conditions_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE trials ADD COLUMN phases_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE trials ADD COLUMN updated_at TEXT;
ALTER TABLE trials ADD COLUMN minimum_age TEXT;
ALTER TABLE trials ADD COLUMN maximum_age TEXT;
ALTER TABLE trials ADD COLUMN sex TEXT;
CREATE TABLE trial_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trial_id TEXT NOT NULL REFERENCES trials(id),
  content_hash TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  UNIQUE(trial_id,content_hash)
);
INSERT INTO trial_snapshots (trial_id,content_hash,snapshot_json,fetched_at)
SELECT id,content_hash,snapshot_json,fetched_at FROM trials;
ALTER TABLE checklist_versions ADD COLUMN snapshot_id INTEGER REFERENCES trial_snapshots(id);
UPDATE checklist_versions SET snapshot_id=(SELECT id FROM trial_snapshots WHERE trial_id=checklist_versions.trial_id ORDER BY id DESC LIMIT 1);
CREATE TRIGGER immutable_snapshot_update BEFORE UPDATE ON trial_snapshots
BEGIN SELECT RAISE(ABORT,'Registry snapshots are immutable'); END;
CREATE TRIGGER immutable_snapshot_delete BEFORE DELETE ON trial_snapshots
BEGIN SELECT RAISE(ABORT,'Registry snapshots are immutable'); END;
CREATE TRIGGER immutable_checklist_source BEFORE UPDATE OF snapshot_id,trial_id,revision,mode,created_at,approved_at,approved_by ON checklist_versions
WHEN OLD.state != 'draft' BEGIN SELECT RAISE(ABORT,'Approved checklist is immutable'); END;

UPDATE trials SET
 conditions_json=COALESCE(json_extract(snapshot_json,'$.protocolSection.conditionsModule.conditions'),'[]'),
 phases_json=COALESCE(json_extract(snapshot_json,'$.protocolSection.designModule.phases'),'[]'),
 updated_at=json_extract(snapshot_json,'$.protocolSection.statusModule.lastUpdatePostDateStruct.date'),
 minimum_age=json_extract(snapshot_json,'$.protocolSection.eligibilityModule.minimumAge'),
 maximum_age=json_extract(snapshot_json,'$.protocolSection.eligibilityModule.maximumAge'),
 sex=json_extract(snapshot_json,'$.protocolSection.eligibilityModule.sex');
