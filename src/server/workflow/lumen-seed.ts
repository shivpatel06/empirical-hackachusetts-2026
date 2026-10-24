import type { Db } from "../db/connection";
import { buildLumenCohort, lumenChecklist, lumenStudy, lumenTrial } from "../ai/lumen-fixture";
import { DEMO_TIME } from "../ai/fixtures";
import { WorkflowStore } from "./store";

/** Adds a separate study/cohort; historical trials, approvals and charts are never overwritten. */
export function seedLumenWorkflow(db: Db, clock: () => Date = () => new Date()) {
  return db.transaction(() => {
    if (db.prepare("SELECT id FROM trials WHERE id=?").get(lumenTrial.id)) return false;
    const store = new WorkflowStore(db, "fixture", clock);
    const study = lumenStudy(clock().toISOString());
    store.persistImport(study, lumenChecklist, "fixture", store.importRevision(study.id));
    for (const { patient } of buildLumenCohort()) {
      db.prepare("INSERT INTO patients VALUES (?,?,?,?,?,1)").run(
        patient.id, patient.diagnosis, patient.clinician, patient.nextVisit, patient.revision);
      for (const line of patient.chart)
        db.prepare("INSERT INTO chart_lines VALUES (?,?,?,?)").run(line.id, patient.id, "chart", JSON.stringify(line));
    }
    db.prepare("INSERT OR IGNORE INTO app_meta VALUES ('assessment_at',?,?)").run(DEMO_TIME, clock().toISOString());
    return true;
  })();
}
