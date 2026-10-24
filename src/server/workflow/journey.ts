import type { WorkflowStore } from "./store";
import { WorkflowError } from "./store";
import type { AiAdapter, AgentObserver } from "../ai/contracts";
import { safeAiError } from "../ai/contracts";
import {
  outreachDraftSchema,
  outreachStages,
  stageLabel,
  type JourneyAction,
  type JourneyView,
  type AgentUsage,
} from "../../lib/journey";
import type { Patient, ChartLine } from "../../lib/schemas/ai";
import type { ScreeningResult } from "../../lib/workflow";
import { demoReply } from "./demo-replies";
import { recordTitle } from "../../lib/sample-profiles";
type Row = Record<string, any>;
const toolTitles: Record<string, string> = {
  search_chart: "Searched patient chart",
  get_latest: "Checked the latest record",
  check_outside_records: "Checked outside records",
  draft_records_request: "Drafted a records request",
  ask_coordinator: "Prepared a coordinator question",
  finish: "Investigation finished",
  read_verified_case: "Read verified evidence for outreach",
};
const terminal = [
  "enrolled",
  "patient_declined",
  "doctor_declined",
  "screen_failed",
  "trial_closed",
];
export class JourneyStore {
  readonly db;
  constructor(readonly workflow: WorkflowStore) {
    this.db = workflow.db;
  }
  now() {
    const r = this.db
      .prepare("SELECT value FROM app_meta WHERE key='journey_clock'")
      .get() as Row | undefined;
    return r?.value ?? this.workflow.clock().toISOString();
  }
  private audit(action: string, detail: string, actor = "Coordinator") {
    this.db
      .prepare(
        "INSERT INTO audit_log (actor,action,detail,created_at) VALUES (?,?,?,?)",
      )
      .run(actor, action, detail, this.now());
  }
  private screening(id: number, patientId?: string) {
    const s = this.db.prepare("SELECT * FROM screenings WHERE id=?").get(id) as
      | Row
      | undefined;
    if (!s || (patientId && s.patient_id !== patientId))
      throw new WorkflowError("Screening not found.", 404);
    const c = this.workflow.latestChecklist(s.trial_id),
      p = this.workflow.patient(s.patient_id);
    const t = this.db
      .prepare("SELECT * FROM trials WHERE id=?")
      .get(s.trial_id) as Row;
    const latest = this.db
      .prepare(
        "SELECT id FROM screenings WHERE patient_id=? AND trial_id=? ORDER BY id DESC LIMIT 1",
      )
      .get(p.id, s.trial_id) as Row;
    if (
      !c ||
      c.id !== s.checklist_id ||
      c.state !== "approved" ||
      p.revision !== s.chart_revision ||
      latest.id !== s.id ||
      !t.local_open ||
      !["RECRUITING", "ENROLLING_BY_INVITATION"].includes(t.recruiting_status)
    )
      throw new WorkflowError(
        "This case changed. Review the current screening before taking action.",
      );
    return { s, c, p, t, result: JSON.parse(s.result_json) as ScreeningResult };
  }
  private stale(id: number) {
    try {
      this.screening(id);
      return false;
    } catch {
      return true;
    }
  }
  private enqueue(
    screeningId: number,
    kind: "gap" | "outreach",
    mode: "live" | "fixture",
    language = "English",
  ) {
    const { s } = this.screening(screeningId);
    this.db
      .prepare(
        "INSERT OR IGNORE INTO agent_runs (patient_id,trial_id,screening_id,kind,mode,state,language,created_at) VALUES (?,?,?,?,?,'queued',?,?)",
      )
      .run(s.patient_id, s.trial_id, s.id, kind, mode, language, this.now());
  }
  private addItem(
    s: Row,
    runId: number | null,
    kind: string,
    body: string,
    key: string,
    ruleId: string | null = null,
  ) {
    this.db
      .prepare(
        "INSERT OR IGNORE INTO journey_items (run_id,patient_id,trial_id,screening_id,kind,rule_id,body,dedup_key,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
      )
      .run(
        runId,
        s.patient_id,
        s.trial_id,
        s.id,
        kind,
        ruleId,
        body,
        key,
        this.now(),
      );
  }
  private item(id: number, revision: number) {
    const item = this.db
      .prepare("SELECT * FROM journey_items WHERE id=?")
      .get(id) as Row | undefined;
    if (!item) throw new WorkflowError("Review item not found.", 404);
    if (item.revision !== revision)
      throw new WorkflowError("This draft changed. Review its latest version.");
    this.screening(item.screening_id);
    return item;
  }
  action(action: JourneyAction) {
    return this.db.transaction(() => {
      if (action.action === "investigate") {
        const { result } = this.screening(action.screeningId, action.patientId);
        if (!["needs_info", "needs_review"].includes(result.status))
          throw new WorkflowError("This patient has no open investigation.");
        this.enqueue(action.screeningId, "gap", action.mode);
      } else if (action.action === "retry_agent") {
        const run = this.db
          .prepare("SELECT * FROM agent_runs WHERE id=?")
          .get(action.runId) as Row | undefined;
        if (!run || run.state !== "failed" || run.attempts >= 2)
          throw new WorkflowError(
            "This run cannot be retried again. Review its error.",
          );
        this.screening(run.screening_id);
        this.db
          .prepare("UPDATE agent_runs SET state='queued',summary='' WHERE id=?")
          .run(run.id);
      } else if (action.action === "review_match") {
        const { s, result } = this.screening(
          action.screeningId,
          action.patientId,
        );
        if (
          action.decision === "verified" &&
          !["likely_match", "needs_review"].includes(result.status)
        )
          throw new WorkflowError(
            "Resolve missing evidence before verifying a potential match.",
          );
        if (
          action.decision === "verified" &&
          !result.rules.some(
            (r) => r.status === "met" && !r.review && r.citations.length,
          )
        )
          throw new WorkflowError(
            "Supported cited findings are required for outreach.",
          );
        const existing = this.db
          .prepare("SELECT * FROM outreach_cases WHERE screening_id=?")
          .get(s.id) as Row | undefined;
        if (existing && existing.decision !== "snoozed")
          throw new WorkflowError("This screening has already been reviewed.");
        this.db
          .prepare(
            "INSERT INTO outreach_cases (screening_id,patient_id,trial_id,decision,review_note,updated_at,stage_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(screening_id) DO UPDATE SET decision=excluded.decision,review_note=excluded.review_note,revision=outreach_cases.revision+1,updated_at=excluded.updated_at",
          )
          .run(
            s.id,
            s.patient_id,
            s.trial_id,
            action.decision,
            action.note,
            this.now(),
            this.now(),
          );
        this.audit(
          "Match review",
          `${s.patient_id}: ${action.decision}. ${action.note}`,
        );
        if (action.decision === "verified")
          this.enqueue(s.id, "outreach", action.mode, action.language);
      } else if (action.action === "item") {
        const item = this.item(action.id, action.revision);
        if (item.state !== "pending")
          throw new WorkflowError("This draft has already been reviewed.");
        if (action.decision === "edit") {
          if (!action.body)
            throw new WorkflowError("Enter the revised draft text.", 400);
          this.db
            .prepare(
              "UPDATE journey_items SET body=?,revision=revision+1 WHERE id=?",
            )
            .run(action.body, item.id);
        } else {
          if (item.kind === "question" && action.decision === "approve")
            throw new WorkflowError(
              "Answer the question with a source instead.",
            );
          this.db
            .prepare(
              "UPDATE journey_items SET state=?,approved_at=?,revision=revision+1 WHERE id=?",
            )
            .run(
              action.decision === "approve" ? "approved" : "declined",
              action.decision === "approve" ? this.now() : null,
              item.id,
            );
          this.audit(
            action.decision === "approve"
              ? "Simulated action approved"
              : "Draft declined",
            `${item.patient_id}: ${item.kind}. ${item.kind === "summary" ? "Care-team handoff only; no direct patient contact." : "No external message sent."}`,
          );
          if (action.decision === "approve" && item.kind === "physician")
            this.db
              .prepare(
                "UPDATE outreach_cases SET stage='doctor_notified',revision=revision+1,stage_at=?,updated_at=? WHERE screening_id=? AND stage='drafts'",
              )
              .run(this.now(), this.now(), item.screening_id);
        }
      } else if (action.action === "demo_reply") {
        const item = this.item(action.id, action.revision);
        if (
          item.kind !== "request" ||
          item.state !== "approved" ||
          item.reply_line_id
        )
          throw new WorkflowError(
            "Approve a records request before receiving its demo reply.",
          );
        const { p } = this.screening(item.screening_id);
        const pending = this.db
          .prepare(
            "SELECT * FROM journey_items WHERE screening_id=? AND kind='request' AND state='approved' AND reply_line_id IS NULL ORDER BY id",
          )
          .all(item.screening_id) as Row[];
        const known = pending.filter((i) =>
          demoReply(p.id, i.rule_id, p.revision + 1),
        );
        if (!known.some((i) => i.id === item.id))
          throw new WorkflowError(
            "No authored reply exists for this request. Use a sourced coordinator answer instead.",
          );
        for (const i of known) {
          const patient = this.workflow.patient(p.id);
          this.ingest(i, demoReply(p.id, i.rule_id, patient.revision + 1)!);
        }
        this.workflow.screenPatient(p.id, item.screening_id);
      } else if (action.action === "reply") {
        const item = this.item(action.id, action.revision);
        if (
          !(
            (item.kind === "question" && item.state === "pending") ||
            (item.kind === "request" && item.state === "approved")
          ) ||
          item.reply_line_id
        )
          throw new WorkflowError("This item is not awaiting evidence.");
        const { p } = this.screening(item.screening_id);
        const assessed = this.workflow.assessmentAt();
        if (Date.parse(action.observedAt) > Date.parse(assessed))
          throw new WorkflowError(
            "Evidence cannot be dated after the screening assessment.",
            400,
          );
        this.ingest(item, {
          id: `${p.id}-coordinator-${item.id}`,
          patientId: p.id,
          text: action.text,
          source: `Coordinator-entered synthetic evidence: ${action.source}`,
          observedAt: action.observedAt,
          ingestedAt: assessed,
          revision: p.revision + 1,
          measurement: null,
        });
        this.workflow.screenPatient(p.id, item.screening_id);
      } else if (action.action === "outcome") {
        this.screening(action.screeningId);
        const c = this.db
          .prepare("SELECT * FROM outreach_cases WHERE screening_id=?")
          .get(action.screeningId) as Row | undefined;
        if (
          !c ||
          c.revision !== action.revision ||
          c.decision !== "verified" ||
          terminal.includes(c.stage)
        )
          throw new WorkflowError(
            "Outreach changed or has closed. Refresh before recording an outcome.",
          );
        const next = outreachStages[outreachStages.indexOf(c.stage) + 1];
        if (
          c.stage === "drafts" ||
          action.stage === "doctor_notified" ||
          (action.stage !== next &&
            ![
              "patient_declined",
              "doctor_declined",
              "screen_failed",
              "trial_closed",
            ].includes(action.stage))
        )
          throw new WorkflowError(
            "Record outcomes in order after approved physician outreach.",
          );
        this.db
          .prepare(
            "UPDATE outreach_cases SET stage=?,revision=revision+1,updated_at=?,stage_at=? WHERE screening_id=?",
          )
          .run(action.stage, this.now(), this.now(), c.screening_id);
        this.db
          .prepare(
            "UPDATE journey_items SET state='declined',revision=revision+1 WHERE screening_id=? AND kind='reminder' AND state='pending'",
          )
          .run(c.screening_id);
        this.audit(
          "Human-entered outreach outcome",
          `${c.patient_id}: ${stageLabel[action.stage]}. ${action.note}`,
        );
      } else if (action.action === "advance_clock") {
        const next = new Date(
          Date.parse(this.now()) + action.days * 86400000,
        ).toISOString();
        this.db
          .prepare(
            "INSERT INTO app_meta (key,value,updated_at) VALUES ('journey_clock',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
          )
          .run(next, next);
        this.audit(
          "Demo follow-up clock advanced",
          `${action.days} day(s); screening assessment dates are unchanged.`,
        );
      }
      this.reminders();
    })();
  }
  private ingest(item: Row, line: ChartLine) {
    this.db
      .prepare(
        "INSERT INTO chart_lines (id,patient_id,location,payload_json) VALUES (?,?,'chart',?)",
      )
      .run(line.id, line.patientId, JSON.stringify(line));
    this.db
      .prepare("UPDATE patients SET revision=? WHERE id=?")
      .run(line.revision, line.patientId);
    this.db
      .prepare(
        "UPDATE journey_items SET state='answered',reply_line_id=?,revision=revision+1 WHERE id=?",
      )
      .run(line.id, item.id);
    this.audit(
      "Synthetic reply received",
      `${line.patientId}: ${line.source}; appended ${line.id}. Re-screening required.`,
      "System",
    );
  }
  reminders() {
    for (const c of this.db
      .prepare("SELECT * FROM outreach_cases WHERE decision='verified'")
      .all() as Row[]) {
      if (this.stale(c.screening_id) || terminal.includes(c.stage)) continue;
      const { s, p } = this.screening(c.screening_id);
      const age = (Date.parse(this.now()) - Date.parse(c.stage_at)) / 86400000;
      const businessDays = elapsedBusinessDays(c.stage_at, this.now());
      const reasons = [];
      if (c.stage === "doctor_notified" && businessDays >= 2)
        reasons.push([
          "doctor",
          "Please follow up with the doctor; two business days have passed without a recorded response.",
        ]);
      if (c.stage === "patient_interested" && age >= 5)
        reasons.push([
          "consent",
          "Please arrange the consent visit; five days have passed since interest was recorded.",
        ]);
      const visit = p.nextVisit
        ? Date.parse(p.nextVisit) - Date.parse(this.now())
        : Infinity;
      if (visit >= 0 && visit <= 86400000 && c.stage !== "drafts")
        reasons.push([
          "visit",
          "The patient visit is within one day. Please review the trial discussion and outstanding checks.",
        ]);
      for (const [key, body] of reasons)
        this.addItem(
          s,
          null,
          "reminder",
          body!,
          `reminder:${s.id}:${c.stage}:${key}`,
        );
    }
  }
  /** Continue only a patient who already started an investigation; never fan out new paid runs from polling. */
  continueAfterReplies() {
    const prior = this.db
      .prepare("SELECT * FROM agent_runs WHERE kind='gap' ORDER BY id DESC")
      .all() as Row[];
    const seen = new Set<string>();
    for (const run of prior) {
      const key = `${run.patient_id}:${run.trial_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const latest = this.db
        .prepare(
          "SELECT * FROM screenings WHERE patient_id=? AND trial_id=? ORDER BY id DESC LIMIT 1",
        )
        .get(run.patient_id, run.trial_id) as Row | undefined;
      if (
        latest &&
        latest.id !== run.screening_id &&
        latest.status === "needs_info" &&
        !this.stale(latest.id)
      )
        this.enqueue(latest.id, "gap", run.mode);
    }
  }
  recover() {
    this.db
      .prepare(
        "UPDATE agent_runs SET state='failed',summary='Server restarted during this run. Review and retry explicitly.' WHERE state='running'",
      )
      .run();
  }
  nextMode(): "live" | "fixture" | null {
    return (
      (
        this.db
          .prepare(
            "SELECT mode FROM agent_runs WHERE state='queued' ORDER BY id LIMIT 1",
          )
          .get() as Row | undefined
      )?.mode ?? null
    );
  }
  async processNext(adapter: AiAdapter) {
    const run = this.db.transaction(() => {
      const r = this.db
        .prepare(
          "SELECT * FROM agent_runs WHERE state='queued' ORDER BY id LIMIT 1",
        )
        .get() as Row | undefined;
      if (r)
        this.db
          .prepare(
            "UPDATE agent_runs SET state='running',attempts=attempts+1 WHERE id=?",
          )
          .run(r.id);
      return r;
    })();
    if (!run) return false;
    const step = (title: string, detail: string, data: unknown = null) =>
      this.db
        .prepare(
          "INSERT INTO agent_steps (run_id,title,detail,data_json,created_at) VALUES (?,?,?,?,?)",
        )
        .run(run.id, title, detail, JSON.stringify(data), this.now());
    const observer: AgentObserver = {
      step: (action) => {
        const r = action.result as {
          records?: unknown[];
          draft?: { request?: string; question?: string };
          summary?: string;
          error?: string;
        };
        const detail =
          r?.draft?.request ??
          r?.draft?.question ??
          r?.summary ??
          r?.error ??
          (r?.records
            ? `${r.records.length} record(s) returned.`
            : "Tool completed.");
        step(toolTitles[action.tool] ?? action.tool, detail, action);
      },
      usage: (usage: AgentUsage) =>
        this.db
          .prepare("UPDATE agent_runs SET usage_json=? WHERE id=?")
          .run(JSON.stringify(usage), run.id),
    };
    try {
      const { s, p, c, t, result } = this.screening(
        run.screening_id,
        run.patient_id,
      );
      if (adapter.mode !== run.mode)
        throw new WorkflowError("Agent mode changed.");
      step(
        run.kind === "gap"
          ? "Investigation started"
          : "Outreach drafting started",
        run.mode === "live"
          ? "Luna is working. Actual tool results appear below."
          : "Reading the chart and current criteria.",
      );
      if (run.kind === "gap") {
        const unresolved = result.rules
          .filter((r) => r.status === "unknown" || r.review)
          .map((r) => c.rules.find((def) => def.id === r.ruleId))
          .filter((r) => !!r)
          .map((r) => ({
            id: r!.id,
            qualification: r!.qualification,
            evidenceDescription: r!.evidenceDescription,
          }));
        const trail = await adapter.runGapInvestigation(
          p,
          unresolved,
          observer,
        );
        if (trail.completion === "failed")
          throw new WorkflowError(trail.summary, 502);
        this.db.transaction(() => {
          this.screening(s.id);
          for (const a of trail.actions) {
            if (a.outcome !== "ok") continue;
            const args = a.arguments as {
              ruleId?: string;
              request?: string;
              question?: string;
            };
            if (a.tool === "draft_records_request" && args.request)
              this.addItem(
                s,
                run.id,
                "request",
                args.request,
                `gap:${s.id}:${a.sequence}`,
                args.ruleId,
              );
            if (a.tool === "ask_coordinator" && args.question)
              this.addItem(
                s,
                run.id,
                "question",
                args.question,
                `gap:${s.id}:${a.sequence}`,
                args.ruleId,
              );
          }
          if (
            unresolved.length &&
            !trail.actions.some(
              (a) =>
                a.outcome === "ok" &&
                ["draft_records_request", "ask_coordinator"].includes(a.tool),
            )
          ) {
            this.addItem(
              s,
              null,
              "question",
              "The investigation stopped with unresolved criteria. Review the tool results and add any missing evidence with its source and observation date. Do not infer an absent result.",
              `gap:${s.id}:human-handoff`,
            );
          }
          step(
            "Run receipt saved",
            `${trail.actions.length} tool actions recorded.`,
            {
              mode: trail.mode,
              model: trail.model,
              responseIds: trail.responseIds,
              completion: trail.completion,
            },
          );
          this.db
            .prepare(
              "UPDATE agent_runs SET state='completed',summary=? WHERE id=?",
            )
            .run(trail.summary, run.id);
          this.audit(
            "Agent investigation completed",
            `${p.id}: ${trail.actions.length} actual ${run.mode} tool actions.`,
            "Agent",
          );
        })();
      } else {
        const review = this.db
          .prepare(
            "SELECT * FROM outreach_cases WHERE screening_id=? AND decision='verified'",
          )
          .get(s.id) as Row | undefined;
        if (!review || !adapter.draftOutreach)
          throw new WorkflowError(
            "Current coordinator verification is required.",
          );
        const draft = outreachDraftSchema.parse(
          await adapter.draftOutreach(
            {
              patient: p,
              trialTitle: t.title,
              trialId: t.id,
              result,
              reviewNote: review.review_note,
              language: run.language,
            },
            observer,
          ),
        );
        const allowed = new Set(
          result.rules
            .filter(
              (r) => r.status === "met" && !r.review && r.provenanceVerified,
            )
            .flatMap((r) => r.citations.map((c) => c.lineId)),
        );
        if (draft.citedLineIds.some((id) => !allowed.has(id)))
          throw new WorkflowError("Outreach cited an unsupported record.");
        this.db.transaction(() => {
          this.screening(s.id);
          this.addItem(
            s,
            run.id,
            "physician",
            draft.physician +
              `\n\nSources: ${draft.citedLineIds.map((id) => {
                const line = p.chart.find((record) => record.id === id)!;
                return `${recordTitle(line.source, line.id)} (${line.observedAt.slice(0, 10)})`;
              }).join("; ")}.`,
            `outreach:${s.id}:physician`,
          );
          this.addItem(
            s,
            run.id,
            "summary",
            `${run.language} · Unvalidated draft for care-team review.\n\n${draft.summary}`,
            `outreach:${s.id}:summary`,
          );
          this.db
            .prepare(
              "UPDATE agent_runs SET state='completed',summary='Outreach drafts are ready for coordinator review.' WHERE id=?",
            )
            .run(run.id);
          step(
            "Drafts ready",
            "Physician note and patient summary await separate approval.",
          );
          this.audit(
            "Outreach drafts prepared",
            `${p.id}: ${run.language}; ${run.mode}. No messages sent.`,
            "Agent",
          );
        })();
      }
    } catch (error) {
      const stale = this.stale(run.screening_id);
      const message =
        error instanceof WorkflowError ? error.message : safeAiError(error);
      this.db
        .prepare("UPDATE agent_runs SET state=?,summary=? WHERE id=?")
        .run(stale ? "stale" : "failed", message, run.id);
      step(stale ? "Inputs changed" : "Agent stopped", message);
    }
    return true;
  }
  failNext(message: string) {
    const r = this.db
      .prepare(
        "SELECT id FROM agent_runs WHERE state='queued' ORDER BY id LIMIT 1",
      )
      .get() as Row | undefined;
    if (r)
      this.db
        .prepare(
          "UPDATE agent_runs SET state='failed',attempts=attempts+1,summary=? WHERE id=?",
        )
        .run(message, r.id);
  }
  view(): JourneyView {
    const trial = this.workflow.activeTrialId() ?? "";
    const runs = (
      this.db
        .prepare("SELECT * FROM agent_runs WHERE trial_id=? ORDER BY id")
        .all(trial) as Row[]
    ).map((r) => ({
      id: r.id,
      patientId: r.patient_id,
      screeningId: r.screening_id,
      kind: r.kind,
      mode: r.mode,
      state: r.state,
      summary: r.summary,
      language: r.language,
      attempts: r.attempts,
      stale: this.stale(r.screening_id),
      usage: r.usage_json ? JSON.parse(r.usage_json) : null,
      steps: (
        this.db
          .prepare("SELECT * FROM agent_steps WHERE run_id=? ORDER BY id")
          .all(r.id) as Row[]
      ).map((s) => ({
        id: s.id,
        title: s.title,
        detail: s.detail,
        data: JSON.parse(s.data_json),
        createdAt: s.created_at,
      })),
    }));
    const items = (
      this.db
        .prepare(
          "SELECT i.*,r.mode FROM journey_items i LEFT JOIN agent_runs r ON r.id=i.run_id WHERE i.trial_id=? ORDER BY i.id",
        )
        .all(trial) as Row[]
    ).map((i) => ({
      id: i.id,
      patientId: i.patient_id,
      screeningId: i.screening_id,
      kind: i.kind,
      body: i.body,
      ruleId: i.rule_id,
      revision: i.revision,
      state: i.state,
      stale: this.stale(i.screening_id),
      replyLineId: i.reply_line_id,
      mode: i.mode,
    }));
    const cases = (
      this.db
        .prepare("SELECT * FROM outreach_cases WHERE trial_id=?")
        .all(trial) as Row[]
    ).map((c) => ({
      screeningId: c.screening_id,
      patientId: c.patient_id,
      decision: c.decision,
      reviewNote: c.review_note,
      stage: c.stage,
      revision: c.revision,
      stale: this.stale(c.screening_id),
    }));
    return { runs, items, cases, now: this.now() };
  }
}
export function elapsedBusinessDays(start: string, end: string) {
  const local = (s: string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(s));
  let d = new Date(local(start) + "T12:00:00Z"),
    days = 0;
  const last = local(end);
  for (let i = 0; i < 370 && d.toISOString().slice(0, 10) < last; i++) {
    d = new Date(d.getTime() + 86400000);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) days++;
  }
  return days;
}
