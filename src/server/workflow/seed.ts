import type { Db } from "../db/connection";
import {
  buildDemoCohort,
  demoChecklist,
  demoTrial,
  DEMO_TIME,
} from "../ai/fixtures";
import snapshot from "../../../fixtures/trial-prescreening/NCT06116682.json";
import { registryTrial } from "../trials/registry";
import provenance from "../../../fixtures/trial-prescreening/provenance.json";

export function seedWorkflow(db: Db, clock: () => Date = () => new Date()) {
  return db.transaction(() => {
    if (db.prepare("SELECT id FROM trials WHERE id=?").get(demoTrial.id))
      return false;
    const timestamp = clock().toISOString();
    db.prepare(
      "INSERT INTO trials (id,title,snapshot_json,criteria_text,content_hash,recruiting_status,source_url,fetched_at) VALUES (?,?,?,?,?,?,?,?)",
    ).run(
      demoTrial.id,
      demoTrial.title,
      JSON.stringify(snapshot),
      demoTrial.criteriaText,
      provenance.criteriaSha256,
      provenance.registryStatus,
      demoTrial.sourceUrl,
      provenance.fetchedAt,
    );
    db.prepare(
      "INSERT INTO checklist_versions (trial_id,version,state,rules_json,source_hash,mode,created_at) VALUES (?,1,'draft',?,?,'fixture',?)",
    ).run(
      demoTrial.id,
      JSON.stringify(demoChecklist.rules),
      provenance.criteriaSha256,
      timestamp,
    );
    const registry = registryTrial(
      snapshot,
      demoTrial.id,
      provenance.fetchedAt,
    );
    db.prepare(
      "UPDATE trials SET conditions_json=?,phases_json=?,updated_at=?,minimum_age=?,maximum_age=?,sex=? WHERE id=?",
    ).run(
      JSON.stringify(registry.conditions),
      JSON.stringify(registry.phases),
      registry.updatedAt,
      registry.minimumAge,
      registry.maximumAge,
      registry.sex,
      demoTrial.id,
    );
    const saved = db
      .prepare(
        "INSERT INTO trial_snapshots (trial_id,content_hash,snapshot_json,fetched_at) VALUES (?,?,?,?)",
      )
      .run(
        demoTrial.id,
        provenance.criteriaSha256,
        JSON.stringify(snapshot),
        provenance.fetchedAt,
      );
    db.prepare(
      "UPDATE checklist_versions SET snapshot_id=? WHERE trial_id=?",
    ).run(saved.lastInsertRowid, demoTrial.id);
    for (const { patient } of buildDemoCohort()) {
      db.prepare("INSERT INTO patients VALUES (?,?,?,?,?,1)").run(
        patient.id,
        patient.diagnosis,
        patient.clinician,
        patient.nextVisit,
        patient.revision,
      );
      for (const location of ["chart", "outside"] as const)
        for (const line of location === "chart"
          ? patient.chart
          : patient.outsideRecords)
          db.prepare("INSERT INTO chart_lines VALUES (?,?,?,?)").run(
            line.id,
            patient.id,
            location,
            JSON.stringify(line),
          );
    }
    db.prepare("INSERT INTO app_meta VALUES ('assessment_at',?,?)").run(
      DEMO_TIME,
      timestamp,
    );
    db.prepare(
      "INSERT INTO audit_log (actor,action,detail,created_at) VALUES ('System','Demo prepared',?,?)",
    ).run(
      "One registry snapshot and six synthetic records loaded. Criteria await coordinator approval.",
      timestamp,
    );
    return true;
  })();
}
