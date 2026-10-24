import { isDeepStrictEqual } from "node:util";
import type { Db } from "../db/connection";
import {
  patientSchema,
  validateDraft,
  type ChecklistInput,
  type Patient,
  type ChecklistDraft,
} from "../../lib/schemas/ai";
import type {
  StoredChecklist,
  WorkflowView,
  ScreeningResult,
  PatientView,
} from "../../lib/workflow";
import type { AiAdapter } from "../ai/contracts";
import { safeAiError } from "../ai/contracts";
import { demoChecklist, demoTrial, DEMO_TIME } from "../ai/fixtures";
import { lumenTrial, lumenChecklist, lumenStudy } from "../ai/lumen-fixture";
import demoSnapshot from "../../../fixtures/trial-prescreening/NCT06116682.json";
import { registryTrial, type RegistryTrial } from "../trials/registry";
import { checkScreening, prefilter } from "./guardrails";
import { validateCriteriaSource } from "../../lib/criteria";

type Row = Record<string, any>; // SQLite rows are mapped into validated domain contracts at the boundary.
export class WorkflowError extends Error {
  constructor(
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}
interface Payload {
  patientId: string;
  trialId: string;
  checklistId: number;
  chartRevision: number;
  mode: "fixture" | "live";
  assessmentAt: string;
}
export class WorkflowStore {
  constructor(
    readonly db: Db,
    readonly configuredMode: "fixture" | "live",
    readonly clock: () => Date = () => new Date(),
  ) {}
  get mode(): "fixture" | "live" {
    return this.checklist()?.mode ?? this.configuredMode;
  }
  activeTrialId(): string | null {
    const selected = this.db
      .prepare("SELECT value FROM app_meta WHERE key='active_trial'")
      .get() as Row | undefined;
    return (
      selected?.value ??
      (
        this.db
          .prepare(
            "SELECT trial_id FROM checklist_versions ORDER BY id DESC LIMIT 1",
          )
          .get() as Row | undefined
      )?.trial_id ??
      null
    );
  }
  latestChecklist(trialId: string): StoredChecklist | null {
    const row = this.db
      .prepare(
        "SELECT id FROM checklist_versions WHERE trial_id=? ORDER BY version DESC LIMIT 1",
      )
      .get(trialId) as Row | undefined;
    return row ? this.checklist(row.id) : null;
  }
  selectTrial(id: string) {
    if (!this.db.prepare("SELECT id FROM trials WHERE id=?").get(id))
      throw new WorkflowError("Trial not found.", 404);
    this.db
      .prepare(
        "INSERT INTO app_meta (key,value,updated_at) VALUES ('active_trial',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
      )
      .run(id, this.clock().toISOString());
  }
  importRevision(id: string): string {
    const row = this.db
      .prepare("SELECT content_hash FROM trials WHERE id=?")
      .get(id) as Row | undefined;
    const c = this.latestChecklist(id);
    return JSON.stringify([
      row?.content_hash ?? null,
      c?.id ?? null,
      c?.revision ?? null,
      c?.state ?? null,
    ]);
  }
  registryUnchanged(trial: RegistryTrial): boolean {
    const row = this.db
      .prepare("SELECT snapshot_json FROM trials WHERE id=?")
      .get(trial.id) as Row | undefined;
    if (!row) return false;
    if (trial.id === lumenTrial.id) {
      const saved = JSON.parse(row.snapshot_json);
      return JSON.stringify(saved.trial) === JSON.stringify((trial.snapshot as { trial: unknown }).trial);
    }
    return (
      registryTrial(JSON.parse(row.snapshot_json), trial.id, trial.fetchedAt)
        .contentHash === trial.contentHash
    );
  }
  persistImport(
    trial: RegistryTrial,
    draft: ChecklistDraft | null,
    mode: "fixture" | "live",
    expected: string,
    reextract = false,
  ) {
    return this.db.transaction(() => {
      if (this.importRevision(trial.id) !== expected)
        throw new WorkflowError(
          "This trial changed while extraction was running. Refresh and retry.",
        );
      const unchanged = this.registryUnchanged(trial),
        previous = this.latestChecklist(trial.id);
      if ((!unchanged || reextract) && !draft)
        throw new WorkflowError(
          "Extraction is required for changed criteria.",
          422,
        );
      this.db
        .prepare(
          `INSERT INTO trials (id,title,snapshot_json,criteria_text,content_hash,recruiting_status,source_url,fetched_at,conditions_json,phases_json,updated_at,minimum_age,maximum_age,sex)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,snapshot_json=excluded.snapshot_json,criteria_text=excluded.criteria_text,content_hash=excluded.content_hash,recruiting_status=excluded.recruiting_status,source_url=excluded.source_url,fetched_at=excluded.fetched_at,conditions_json=excluded.conditions_json,phases_json=excluded.phases_json,updated_at=excluded.updated_at,minimum_age=excluded.minimum_age,maximum_age=excluded.maximum_age,sex=excluded.sex`,
        )
        .run(
          trial.id,
          trial.title,
          JSON.stringify(trial.snapshot),
          trial.criteriaText,
          trial.contentHash,
          trial.recruitingStatus,
          trial.sourceUrl,
          trial.fetchedAt,
          JSON.stringify(trial.conditions),
          JSON.stringify(trial.phases),
          trial.updatedAt,
          trial.minimumAge,
          trial.maximumAge,
          trial.sex,
        );
      this.db
        .prepare(
          "INSERT OR IGNORE INTO trial_snapshots (trial_id,content_hash,snapshot_json,fetched_at) VALUES (?,?,?,?)",
        )
        .run(
          trial.id,
          trial.contentHash,
          JSON.stringify(trial.snapshot),
          trial.fetchedAt,
        );
      if (!unchanged || reextract) {
        if (previous?.state === "draft")
          this.db
            .prepare(
              "UPDATE checklist_versions SET state='superseded' WHERE id=?",
            )
            .run(previous.id);
        const snapshot = this.db
          .prepare(
            "SELECT id FROM trial_snapshots WHERE trial_id=? AND content_hash=?",
          )
          .get(trial.id, trial.contentHash) as Row;
        this.db
          .prepare(
            "INSERT INTO checklist_versions (trial_id,version,state,rules_json,source_hash,mode,created_at,snapshot_id) VALUES (?,?,'draft',?,?,?,?,?)",
          )
          .run(
            trial.id,
            (previous?.version ?? 0) + 1,
            JSON.stringify(validateDraft(draft).rules),
            trial.contentHash,
            mode,
            this.clock().toISOString(),
            snapshot.id,
          );
        this.audit(
          reextract && unchanged
            ? "Criteria re-extracted"
            : previous
              ? "Registry change imported"
              : "Trial imported",
          `${trial.id}: ${mode} extraction; new draft requires review and local availability confirmation.`,
        );
      } else
        this.audit(
          "Registry checked",
          `${trial.id}: screening-relevant content unchanged; no new checklist or screening jobs.`,
        );
      this.selectTrial(trial.id);
      return !unchanged || reextract;
    })();
  }
  /** An explicit fixture draft, preserving previous versions and all patient history. */
  prepareWalkthrough() {
    if (
      this.db
        .prepare(
          "SELECT id FROM events WHERE state IN ('queued','processing') LIMIT 1",
        )
        .get() ||
      this.db
        .prepare(
          "SELECT id FROM agent_runs WHERE state IN ('queued','running') LIMIT 1",
        )
        .get()
    )
      throw new WorkflowError(
        "Wait for current work to finish before preparing the walkthrough.",
      );
    const isLumen = this.activeTrialId() === lumenTrial.id;
    const trial = isLumen ? lumenStudy(this.clock().toISOString()) : registryTrial(
      demoSnapshot,
      demoTrial.id,
      this.clock().toISOString(),
    );
    this.persistImport(
      trial,
      isLumen ? lumenChecklist : demoChecklist,
      "fixture",
      this.importRevision(trial.id),
      true,
    );
    this.audit(
      "Fixture walkthrough prepared",
      "Authored trial snapshot and checklist loaded as a new draft. Coordinator approval is required; patient and action history retained.",
    );
  }
  private audit(
    action: string,
    detail: string,
    eventId: number | null = null,
    actor = "Coordinator",
  ) {
    this.db
      .prepare(
        "INSERT INTO audit_log (event_id,actor,action,detail,created_at) VALUES (?,?,?,?,?)",
      )
      .run(eventId, actor, action, detail, this.clock().toISOString());
  }
  checklist(id?: number): StoredChecklist | null {
    const row = (
      id
        ? this.db.prepare("SELECT * FROM checklist_versions WHERE id=?").get(id)
        : this.db
            .prepare(
              "SELECT * FROM checklist_versions WHERE trial_id=? ORDER BY version DESC LIMIT 1",
            )
            .get(this.activeTrialId() ?? "")
    ) as Row | undefined;
    return row
      ? {
          id: row.id,
          trialId: row.trial_id,
          version: row.version,
          revision: row.revision,
          state: row.state,
          rules: validateDraft({ rules: JSON.parse(row.rules_json) }).rules,
          mode: row.mode,
          approvedAt: row.approved_at,
          approvedBy: row.approved_by,
        }
      : null;
  }
  patient(id: string): Patient {
    const p = this.db.prepare("SELECT * FROM patients WHERE id=?").get(id) as
      | Row
      | undefined;
    if (!p) throw new WorkflowError("Patient not found.", 404);
    const lines = this.db
      .prepare("SELECT * FROM chart_lines WHERE patient_id=? ORDER BY rowid")
      .all(id) as Row[];
    return patientSchema.parse({
      id: p.id,
      diagnosis: p.diagnosis,
      clinician: p.clinician,
      nextVisit: p.next_visit,
      revision: p.revision,
      synthetic: true,
      chart: lines
        .filter((l) => l.location === "chart")
        .map((l) => JSON.parse(l.payload_json)),
      outsideRecords: lines
        .filter((l) => l.location === "outside")
        .map((l) => JSON.parse(l.payload_json)),
    });
  }
  private cohort(trialId: string) {
    const patients = this.db.prepare("SELECT id,revision FROM patients ORDER BY next_visit,id").all() as Row[];
    if (trialId === lumenTrial.id) return patients.filter((p) => p.id.startsWith("lumen-"));
    if (trialId === demoTrial.id) return patients.filter((p) => !p.id.startsWith("lumen-"));
    return patients;
  }
  private queue(checklist: StoredChecklist, patientId?: string) {
    if (checklist.state !== "approved")
      throw new WorkflowError(
        "Approve the current checklist before screening.",
      );
    const latest = this.latestChecklist(checklist.trialId);
    if (latest?.id !== checklist.id || latest.state !== "approved")
      throw new WorkflowError("Checklist is no longer current.");
    const trial = this.db
      .prepare("SELECT local_open,recruiting_status FROM trials WHERE id=?")
      .get(checklist.trialId) as Row;
    if (!trial.local_open)
      throw new WorkflowError(
        "Confirm local trial availability before screening.",
      );
    if (
      !["RECRUITING", "ENROLLING_BY_INVITATION"].includes(
        trial.recruiting_status,
      )
    )
      throw new WorkflowError(
        "Registry status does not permit new screening. Review trial availability.",
      );
    let count = 0;
    for (const p of this.cohort(checklist.trialId)) {
      if (patientId && p.id !== patientId) continue;
      const payload: Payload = {
        patientId: p.id,
        trialId: checklist.trialId,
        checklistId: checklist.id,
        chartRevision: p.revision,
        mode: checklist.mode,
        assessmentAt:
          checklist.mode === "fixture" ? DEMO_TIME : this.clock().toISOString(),
      };
      count += this.db
        .prepare(
          "INSERT OR IGNORE INTO events (kind,dedup_key,payload_json,state,created_at) VALUES ('screen',?,?,'queued',?)",
        )
        .run(
          `${p.id}:${p.revision}:${checklist.id}:${checklist.mode}`,
          JSON.stringify(payload),
          this.clock().toISOString(),
        ).changes;
    }
    return count;
  }
  approve(id: number, revision: number, localOpen: boolean) {
    return this.db.transaction(() => {
      const checklist = this.checklist();
      if (!localOpen)
        throw new WorkflowError(
          "Confirm that the trial is open at the synthetic demo program.",
          400,
        );
      if (!checklist || checklist.id !== id || checklist.revision !== revision)
        throw new WorkflowError(
          "Checklist changed. Refresh and review the latest version.",
        );
      if (checklist.state === "approved") return 0;
      if (checklist.state !== "draft")
        throw new WorkflowError("Only a draft can be approved.");
      this.db
        .prepare(
          "UPDATE checklist_versions SET state='superseded' WHERE trial_id=? AND state='approved'",
        )
        .run(checklist.trialId);
      this.db
        .prepare(
          "UPDATE checklist_versions SET state='approved',approved_at=?,approved_by='Demo coordinator' WHERE id=? AND state='draft'",
        )
        .run(this.clock().toISOString(), id);
      this.db
        .prepare("UPDATE trials SET local_open=1 WHERE id=?")
        .run(checklist.trialId);
      this.audit(
        "Criteria approved",
        `Version ${checklist.version}; local availability confirmed for the synthetic demo program only.`,
      );
      return this.queue(this.checklist(id)!);
    })();
  }
  save(id: number, revision: number, draft: unknown) {
    const valid = validateDraft(draft);
    return this.db.transaction(() => {
      const current = this.checklist();
      if (
        !current ||
        current.id !== id ||
        current.revision !== revision ||
        current.state !== "draft"
      )
        throw new WorkflowError(
          "Draft changed or was already approved. Refresh before editing.",
        );
      const trial = this.db
        .prepare("SELECT criteria_text FROM trials WHERE id=?")
        .get(current.trialId) as Row;
      try {
        validateCriteriaSource(trial.criteria_text, valid.rules);
      } catch {
        throw new WorkflowError(
          "Every registry criterion and exception must be retained in the draft source quotes.",
          400,
        );
      }
      if (
        valid.rules.some(
          (r) =>
            !trial.criteria_text
              .replace(/\s+/g, " ")
              .includes(r.sourceQuote.replace(/\s+/g, " ")),
        )
      )
        throw new WorkflowError(
          "Every source quote must occur in the imported trial criteria.",
          400,
        );
      this.db
        .prepare(
          "UPDATE checklist_versions SET rules_json=?,revision=revision+1 WHERE id=?",
        )
        .run(JSON.stringify(valid.rules), id);
      this.audit(
        "Draft edited",
        `Version ${current.version}, revision ${revision + 1}. Approval is still required.`,
      );
    })();
  }
  revise(id: number) {
    return this.db.transaction(() => {
      const c = this.checklist();
      if (!c || c.id !== id || c.state !== "approved")
        throw new WorkflowError("A current approved checklist is required.");
      const source = this.db
        .prepare(
          "SELECT source_hash,snapshot_id FROM checklist_versions WHERE id=?",
        )
        .get(id) as Row;
      this.db
        .prepare(
          "INSERT INTO checklist_versions (trial_id,version,state,rules_json,source_hash,mode,created_at,snapshot_id) VALUES (?,?,'draft',?,?,?,?,?)",
        )
        .run(
          c.trialId,
          c.version + 1,
          JSON.stringify(c.rules),
          source.source_hash,
          c.mode,
          this.clock().toISOString(),
          source.snapshot_id,
        );
      this.audit(
        "Revision opened",
        `Version ${c.version + 1} awaits review. Previous results are marked stale until re-screened.`,
      );
    })();
  }
  screen() {
    return this.db.transaction(() =>
      this.queue(
        this.checklist() ??
          (() => {
            throw new WorkflowError("No checklist loaded.");
          })(),
      ),
    )();
  }
  screenPatient(patientId: string, priorScreeningId: number) {
    const prior = this.db
      .prepare(
        "SELECT checklist_id FROM screenings WHERE id=? AND patient_id=?",
      )
      .get(priorScreeningId, patientId) as Row | undefined;
    const checklist = prior ? this.checklist(prior.checklist_id) : null;
    if (!checklist) throw new WorkflowError("Screening checklist not found.");
    return this.queue(checklist, patientId);
  }
  retry() {
    return this.db.transaction(() => {
      const c = this.checklist();
      if (!c || c.state !== "approved")
        throw new WorkflowError("Approve the current checklist first.");
      let count = 0;
      for (const event of this.db
        .prepare("SELECT * FROM events WHERE state='failed' AND attempts<2")
        .all() as Row[]) {
        const p = JSON.parse(event.payload_json) as Payload;
        if (
          p.checklistId === c.id &&
          p.mode === this.mode &&
          this.patient(p.patientId).revision === p.chartRevision
        )
          count += this.db
            .prepare(
              "UPDATE events SET state='queued',error=NULL WHERE id=? AND state='failed'",
            )
            .run(event.id).changes;
      }
      if (count)
        this.audit(
          "Screening retry queued",
          `${count} failed job(s); maximum two attempts per input version.`,
        );
      return count;
    })();
  }
  assessmentAt() {
    return this.mode === "fixture" ? DEMO_TIME : this.clock().toISOString();
  }
  view(): WorkflowView {
    const c = this.checklist();
    const t = this.db
      .prepare("SELECT * FROM trials WHERE id=?")
      .get(this.activeTrialId() ?? "") as Row | undefined;
    const patients = this.cohort(t?.id ?? "").map((p) => {
      const patient = this.patient(p.id);
      const s = this.db
        .prepare(
          "SELECT * FROM screenings WHERE patient_id=? AND trial_id=? ORDER BY id DESC LIMIT 1",
        )
        .get(p.id, t?.id ?? "") as Row | undefined;
      const job = this.db
        .prepare(
          "SELECT id,state,error FROM events WHERE json_extract(payload_json,'$.patientId')=? AND json_extract(payload_json,'$.checklistId')=? AND json_extract(payload_json,'$.mode')=? ORDER BY id DESC LIMIT 1",
        )
        .get(p.id, c?.id ?? 0, this.mode) as PatientView["job"];
      return {
        ...patient,
        job: job ?? null,
        screening: s
          ? {
              id: s.id,
              checklistId: s.checklist_id,
              chartRevision: s.chart_revision,
              mode: s.mode,
              createdAt: s.created_at,
              stale:
                c?.id !== s.checklist_id ||
                c?.state !== "approved" ||
                patient.revision !== s.chart_revision ||
                s.mode !== this.mode,
              result: JSON.parse(s.result_json) as ScreeningResult,
            }
          : null,
      };
    });
    return {
      mode: this.mode,
      demoMode: true,
      assessmentAt: this.assessmentAt(),
      trials: this.db
        .prepare("SELECT id,title FROM trials ORDER BY title")
        .all() as WorkflowView["trials"],
      trial: t
        ? {
            id: t.id,
            title: t.title,
            criteriaText: t.criteria_text,
            sourceUrl: t.source_url,
            localOpen: !!t.local_open,
            recruitingStatus: t.recruiting_status,
            fetchedAt: t.fetched_at,
            conditions: JSON.parse(t.conditions_json),
            phases: JSON.parse(t.phases_json),
            updatedAt: t.updated_at,
            minimumAge: t.minimum_age,
            maximumAge: t.maximum_age,
            sex: t.sex,
          }
        : null,
      checklist: c,
      patients,
      activity: this.db
        .prepare(
          "SELECT id,actor,action,detail,created_at AS createdAt FROM audit_log ORDER BY id DESC LIMIT 60",
        )
        .all() as WorkflowView["activity"],
      pending: (
        this.db
          .prepare(
            "SELECT count(*) AS n FROM events WHERE state IN ('queued','processing')",
          )
          .get() as Row
      ).n,
    };
  }
  nextQueuedMode(): "fixture" | "live" | null {
    const event = this.db
      .prepare(
        "SELECT payload_json FROM events WHERE state='queued' ORDER BY id LIMIT 1",
      )
      .get() as Row | undefined;
    return event ? JSON.parse(event.payload_json).mode : null;
  }
  failQueuedMode(mode: "fixture" | "live") {
    this.db.transaction(() => {
      const result = this.db
        .prepare(
          "UPDATE events SET state='failed',attempts=attempts+1,error='AI initialization failed. Verify server configuration, then retry.' WHERE state='queued' AND json_extract(payload_json,'$.mode')=?",
        )
        .run(mode);
      if (result.changes)
        this.audit(
          "AI initialization failed",
          `${result.changes} ${mode} job(s) failed; no fallback was used.`,
          null,
          "System",
        );
    })();
  }
  async processNext(adapter: AiAdapter): Promise<boolean> {
    const event = this.db.transaction(() => {
      const row = this.db
        .prepare(
          "SELECT * FROM events WHERE state='queued' ORDER BY id LIMIT 1",
        )
        .get() as Row | undefined;
      if (!row) return null;
      this.db
        .prepare(
          "UPDATE events SET state='processing',attempts=attempts+1 WHERE id=? AND state='queued'",
        )
        .run(row.id);
      return row;
    })();
    if (!event) return false;
    const payload = JSON.parse(event.payload_json) as Payload;
    try {
      const c = this.checklist(payload.checklistId),
        patient = this.patient(payload.patientId);
      if (
        !c ||
        c.state !== "approved" ||
        this.latestChecklist(c.trialId)?.id !== c.id ||
        patient.revision !== payload.chartRevision ||
        payload.mode !== adapter.mode
      ) {
        this.markStale(event.id);
        return true;
      }
      const input: ChecklistInput = {
        rules: c.rules,
        trialId: c.trialId,
        version: c.version,
        state: "approved",
      };
      const result =
        prefilter(patient, input, new Date(payload.assessmentAt)) ??
        checkScreening(
          patient,
          input,
          await adapter.screen(patient, input),
          new Date(payload.assessmentAt),
          adapter.mode,
        );
      this.db.transaction(() => {
        const latest = this.latestChecklist(c.trialId);
        if (
          latest?.id !== c.id ||
          latest.state !== "approved" ||
          this.patient(patient.id).revision !== payload.chartRevision
        ) {
          this.markStale(event.id);
          return;
        }
        const row = this.db
          .prepare(
            "INSERT INTO screenings (event_id,patient_id,trial_id,checklist_id,chart_revision,status,mode,result_json,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
          )
          .run(
            event.id,
            patient.id,
            c.trialId,
            c.id,
            patient.revision,
            result.status,
            adapter.mode,
            JSON.stringify(result),
            this.clock().toISOString(),
          );
        for (const rule of result.rules)
          this.db
            .prepare("INSERT INTO rule_results VALUES (?,?,?)")
            .run(row.lastInsertRowid, rule.ruleId, JSON.stringify(rule));
        this.db
          .prepare(
            "UPDATE events SET state='completed',finished_at=? WHERE id=?",
          )
          .run(this.clock().toISOString(), event.id);
        this.audit(
          "Screening completed",
          `${patient.id} · ${result.status} · checklist v${c.version} · ${adapter.mode}${result.prefilter ? " · no AI call (pre-filter)" : ""}`,
          event.id,
          "System",
        );
      })();
    } catch (error) {
      const c = this.checklist(payload.checklistId);
      const message =
        adapter.mode === "fixture" &&
        c &&
        !isDeepStrictEqual(c.rules, demoChecklist.rules)
          ? "Edited criteria have no fixture replay. Restore the demo criteria or configure live AI."
          : safeAiError(error);
      this.db.transaction(() => {
        this.db
          .prepare(
            "UPDATE events SET state='failed',error=?,finished_at=? WHERE id=?",
          )
          .run(message, this.clock().toISOString(), event.id);
        this.audit(
          "Screening failed",
          `${payload.patientId}: ${message}`,
          event.id,
          "System",
        );
      })();
    }
    return true;
  }
  private markStale(id: number) {
    this.db
      .prepare("UPDATE events SET state='stale',finished_at=? WHERE id=?")
      .run(this.clock().toISOString(), id);
    this.audit(
      "Outdated result discarded",
      "Checklist or chart changed while screening. The current version must be screened.",
      id,
      "System",
    );
  }
}
