import { afterEach, describe, expect, it } from "vitest";
import { openDatabase, type Db } from "../db/connection";
import { runMigrations } from "../db/migrate";
import { seedDatabase } from "../db/seed";
import { seedWorkflow } from "./seed";
import { seedLumenWorkflow } from "./lumen-seed";
import { WorkflowStore } from "./store";
import { JourneyStore } from "./journey";
import { FixtureAdapter } from "../ai/fixture-adapter";
import { buildLumenCohort, lumenChecklist, lumenTrial, priorImmunotherapyEvidence } from "../ai/lumen-fixture";
import { DEMO_TIME } from "../ai/fixtures";
import { checkScreening } from "./guardrails";
import { validateNctId } from "../trials/registry";
import type { ChecklistInput } from "../../lib/schemas/ai";
const dbs: Db[] = [];
const clock = () => new Date(DEMO_TIME);
const adapter = new FixtureAdapter();
const checklist: ChecklistInput = { ...lumenChecklist, trialId: lumenTrial.id, version: 1, state: "approved" };
afterEach(() => dbs.splice(0).forEach((db) => db.close()));
function database() {
  const db = openDatabase(":memory:"); dbs.push(db); runMigrations(db); seedDatabase(db); return db;
}
async function setup() {
  const db = database(); seedLumenWorkflow(db, clock);
  const store = new WorkflowStore(db, "fixture", clock);
  store.approve(store.checklist()!.id, 1, true);
  while (await store.processNext(adapter)) {}
  return { db, store, journey: new JourneyStore(store) };
}
async function outreach() {
  const ctx = await setup();
  const p = ctx.store.view().patients[0]!;
  ctx.journey.action({ action: "review_match", patientId: p.id, screeningId: p.screening!.id,
    decision: "verified", note: "Reviewed the current source evidence and visit checks.", language: "Spanish", mode: "fixture" });
  await ctx.journey.processNext(adapter);
  return ctx;
}
function outcome(journey: JourneyStore, stage: "doctor_responded" | "doctor_agreed" | "doctor_declined" | "patient_contacted") {
  const c = journey.view().cases[0]!;
  journey.action({ action: "outcome", screeningId: c.screeningId, revision: c.revision, stage,
    note: "Dr. Maya Shah confirmed this decision; recorded by the coordinator." });
}
function approve(journey: JourneyStore, kind: "physician" | "summary") {
  const item = journey.view().items.find((i) => i.kind === kind)!;
  journey.action({ action: "item", id: item.id, revision: item.revision, decision: "approve" });
}
describe("recorded LUMEN-1 workflow", () => {
  it("adds a separate fictional study without rewriting historical trial records or approvals", () => {
    const db = database(); seedWorkflow(db, clock);
    const store = new WorkflowStore(db, "fixture", clock);
    const legacy = store.checklist()!; store.approve(legacy.id, 1, true);
    const before = db.prepare("SELECT * FROM patients WHERE id='synthetic-02'").get();
    expect(seedLumenWorkflow(db, clock)).toBe(true);
    expect(store.view().trial!.id).toBe("LUMEN-1");
    expect(store.view().trial!.sourceUrl).not.toContain("clinicaltrials.gov");
    expect(store.view().patients).toHaveLength(6);
    expect(store.checklist()!.state).toBe("draft");
    expect(store.checklist(legacy.id)!.state).toBe("approved");
    expect(db.prepare("SELECT * FROM patients WHERE id='synthetic-02'").get()).toEqual(before);
    expect(seedLumenWorkflow(db, clock)).toBe(false);
    store.selectTrial(legacy.trialId);
    expect(store.view().patients.every((p) => p.id.startsWith("synthetic-"))).toBe(true);
    expect(() => validateNctId("LUMEN-1")).toThrow();
  });
  it("matches the six expected cases and cites Walter's prior pembrolizumab instead of a lab exclusion", async () => {
    const { store } = await setup();
    const patients = store.view().patients;
    expect(patients.map((p) => p.screening!.result.status)).toEqual(buildLumenCohort().map((p) => p.expectedStatus));
    const walter = patients.find((p) => p.id === "lumen-02")!;
    const failures = walter.screening!.result.rules.filter((r) => r.status === "not_met");
    expect(failures.map((r) => r.ruleId)).toEqual(["no_prior_immunotherapy"]);
    expect(failures[0]!.citations[0]!.quote).toBe(priorImmunotherapyEvidence);
    expect(walter.screening!.result.rules.find((r) => r.ruleId === "hemoglobin")!.status).toBe("met");
  });
  it("does not infer prior treatment from incomplete, altered, conflicting or future evidence", () => {
    for (const variant of ["partial", "conflict", "future", "missing"] as const) {
      const f = structuredClone(buildLumenCohort()[1]!);
      const line = f.patient.chart.find((l) => l.id.endsWith("no_prior_immunotherapy"))!;
      const output = f.proposals.find((r) => r.ruleId === "no_prior_immunotherapy")!;
      if (variant === "partial") output.citations[0]!.quote = "pembrolizumab";
      if (variant === "conflict") f.patient.chart.push({ ...line, id: "conflict", text: lumenChecklist.rules[1]!.evidenceDescription });
      if (variant === "future") line.observedAt = "2027-01-01T00:00:00Z";
      if (variant === "missing") f.patient.chart = f.patient.chart.filter((l) => l.id !== line.id);
      expect(checkScreening(f.patient, checklist, f.proposals, clock(), "fixture").status).toBe("needs_review");
    }
  });
  it("resolves Elena's stale results with approved requests and automatically queued re-screening", async () => {
    const { store, journey } = await setup();
    let p = store.view().patients.find((p) => p.id === "lumen-03")!;
    expect(p.screening!.result.status).toBe("needs_info");
    expect(p.screening!.result.rules.filter((r) => r.status === "unknown").map((r) => r.ruleId)).toEqual(["brain_imaging", "hemoglobin"]);
    journey.action({ action: "investigate", patientId: p.id, screeningId: p.screening!.id, mode: "fixture" });
    await journey.processNext(adapter);
    expect(store.patient(p.id).revision).toBe(1);
    const items = journey.view().items;
    expect(items).toHaveLength(2);
    for (const item of items) journey.action({ action: "item", id: item.id, revision: 1, decision: "approve" });
    journey.action({ action: "demo_reply", id: items[0]!.id, revision: 2 });
    while (await store.processNext(adapter)) {}
    p = store.view().patients.find((p) => p.id === "lumen-03")!;
    expect(p.screening!.result.status).toBe("likely_match");
    expect(p.revision).toBe(3);
    expect(p.screening!.result.rules.filter((r) => ["hemoglobin", "brain_imaging"].includes(r.ruleId)).every((r) => r.citations[0]!.lineId.includes("-reply-"))).toBe(true);
    store.prepareWalkthrough();
    expect(store.checklist()!.trialId).toBe("LUMEN-1");
    expect(store.checklist()!.state).toBe("draft");
    expect(store.patient(p.id).revision).toBe(3);
  });
  it("requires doctor agreement AND separate current coordinator approval, with an audit trail", async () => {
    const { db, journey } = await outreach();
    expect(() => approve(journey, "summary")).toThrow(/agreement/);
    expect(() => outcome(journey, "doctor_agreed")).toThrow(/in order/);
    approve(journey, "physician");
    outcome(journey, "doctor_responded");
    expect(() => approve(journey, "summary")).toThrow(/agreement/);
    outcome(journey, "doctor_agreed");
    expect(journey.view().items.find((i) => i.kind === "summary")!.state).toBe("pending");
    expect(() => outcome(journey, "patient_contacted")).toThrow(/in order/);
    const draft = journey.view().items.find((i) => i.kind === "summary")!;
    journey.action({ action: "item", id: draft.id, revision: draft.revision, decision: "edit", body: "Reviewed patient invitation with the care team." });
    expect(() => journey.action({ action: "item", id: draft.id, revision: draft.revision, decision: "approve" })).toThrow(/draft changed/);
    approve(journey, "summary");
    expect(journey.view().cases[0]!.stage).toBe("patient_contacted");
    expect(() => approve(journey, "summary")).toThrow(/already/);
    const events = db.prepare("SELECT * FROM audit_log WHERE action='Patient contact approved'").all() as {actor: string; detail: string}[];
    expect(events).toHaveLength(1);
    expect(events[0]!.actor).toBe("Coordinator");
    expect(events[0]!.detail).toContain("Delivery simulated");
  });
  it("supports an explicit doctor agreement without treating a generic response as consent", async () => {
    const { journey } = await outreach(); approve(journey, "physician");
    outcome(journey, "doctor_agreed"); approve(journey, "summary");
    expect(journey.view().cases[0]!.stage).toBe("patient_contacted");
  });
  it("blocks contact after doctor decline or changed criteria", async () => {
    for (const close of [true, false]) {
      const { store, journey } = await outreach(); approve(journey, "physician");
      outcome(journey, "doctor_agreed");
      if (close) outcome(journey, "doctor_declined"); else store.revise(store.checklist()!.id);
      expect(() => approve(journey, "summary")).toThrow();
      expect(journey.view().items.find((i) => i.kind === "summary")!.state).toBe("pending");
    }
  });
});
