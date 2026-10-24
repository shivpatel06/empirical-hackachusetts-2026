import { afterEach, describe, expect, it } from "vitest";
import { openDatabase, type Db } from "../db/connection";
import { runMigrations } from "../db/migrate";
import { seedDatabase } from "../db/seed";
import { seedWorkflow } from "./seed";
import { WorkflowStore } from "./store";
import { JourneyStore, elapsedBusinessDays } from "./journey";
import { FixtureAdapter } from "../ai/fixture-adapter";
import { DEMO_TIME } from "../ai/fixtures";
const dbs: Db[] = [];
const adapter = new FixtureAdapter();
async function setup() {
  const db = openDatabase(":memory:");
  dbs.push(db);
  runMigrations(db);
  seedDatabase(db);
  seedWorkflow(db);
  const store = new WorkflowStore(db, "fixture", () => new Date(DEMO_TIME));
  store.approve(store.checklist()!.id, 1, true);
  while (await store.processNext(adapter)) {}
  return { store, journey: new JourneyStore(store) };
}
afterEach(() => {
  dbs.splice(0).forEach((d) => d.close());
});
async function outreach() {
  const { store, journey } = await setup();
  const p = store.view().patients.find((p) => p.id === "synthetic-01")!;
  journey.action({
    action: "review_match",
    patientId: p.id,
    screeningId: p.screening!.id,
    decision: "verified",
    note: "Reviewed cited synthetic evidence and pending visit checks.",
    language: "Spanish",
    mode: "fixture",
  });
  await journey.processNext(adapter);
  return { store, journey, p };
}
describe("agent journey", () => {
  it("persists real adapter steps before the run completes and deduplicates investigations", async () => {
    const { store, journey } = await setup();
    const p = store.view().patients.find((p) => p.id === "synthetic-03")!;
    const command = {
      action: "investigate" as const,
      patientId: p.id,
      screeningId: p.screening!.id,
      mode: "fixture" as const,
    };
    journey.action(command);
    journey.action(command);
    expect(journey.view().runs).toHaveLength(1);
    let resolve!: () => void;
    const gate = new Promise<void>((r) => (resolve = r));
    const delayed = new FixtureAdapter();
    const original = delayed.runGapInvestigation.bind(delayed);
    delayed.runGapInvestigation = async (p, r, o) => {
      const result = await original(p, r, o);
      await gate;
      return result;
    };
    const running = journey.processNext(delayed);
    await Promise.resolve();
    await Promise.resolve();
    expect(journey.view().runs[0]!.state).toBe("running");
    expect(journey.view().runs[0]!.steps.length).toBeGreaterThan(1);
    expect(journey.view().items).toHaveLength(0);
    resolve();
    await running;
    expect(
      journey.view().items.filter((i) => i.kind === "request"),
    ).toHaveLength(2);
  });
  it("completes request → approved synthetic replies → guarded match → outreach → recorded follow-up", async () => {
    const { store, journey } = await setup();
    let p = store.view().patients.find((p) => p.id === "synthetic-03")!;
    expect(p.screening!.result.status).toBe("needs_info");
    journey.action({
      action: "investigate",
      patientId: p.id,
      screeningId: p.screening!.id,
      mode: "fixture",
    });
    await journey.processNext(adapter);
    const items = journey.view().items;
    expect(() =>
      journey.action({ action: "demo_reply", id: items[0]!.id, revision: 1 }),
    ).toThrow(/Approve/);
    for (const item of items)
      journey.action({
        action: "item",
        id: item.id,
        revision: 1,
        decision: "approve",
      });
    journey.action({ action: "demo_reply", id: items[0]!.id, revision: 2 });
    expect(store.patient(p.id).revision).toBe(3);
    expect(() =>
      journey.action({ action: "demo_reply", id: items[0]!.id, revision: 2 }),
    ).toThrow();
    while (await store.processNext(adapter)) {}
    p = store.view().patients.find((p) => p.id === "synthetic-03")!;
    expect(p.screening!.result.status).toBe("likely_match");
    journey.action({
      action: "review_match",
      patientId: p.id,
      screeningId: p.screening!.id,
      decision: "verified",
      note: "Reviewed all current evidence and pending visit requirements.",
      language: "English",
      mode: "fixture",
    });
    await journey.processNext(adapter);
    const drafts = journey.view().items.filter((i) => !i.stale);
    expect(drafts.map((d) => d.kind)).toEqual(["physician", "summary"]);
    const caseView = journey.view().cases[0]!;
    expect(() =>
      journey.action({
        action: "outcome",
        screeningId: caseView.screeningId,
        revision: caseView.revision,
        stage: "enrolled",
        note: "Skip steps",
      }),
    ).toThrow();
    for (const item of drafts)
      journey.action({
        action: "item",
        id: item.id,
        revision: item.revision,
        decision: "approve",
      });
    journey.action({ action: "advance_clock", days: 3 });
    expect(
      journey
        .view()
        .items.some((i) => i.kind === "reminder" && i.state === "pending"),
    ).toBe(true);
    const reminderCount = journey
      .view()
      .items.filter((i) => i.kind === "reminder").length;
    journey.reminders();
    expect(
      journey.view().items.filter((i) => i.kind === "reminder"),
    ).toHaveLength(reminderCount);
    const c = journey.view().cases[0]!;
    journey.action({
      action: "outcome",
      screeningId: c.screeningId,
      revision: c.revision,
      stage: "doctor_responded",
      note: "Doctor agreed to discuss the trial.",
    });
    expect(journey.view().cases[0]!.stage).toBe("doctor_responded");
  });
  it("rejects stale approvals and late outputs after checklist revision", async () => {
    const { store, journey } = await outreach();
    const item = journey.view().items[0]!;
    store.revise(store.checklist()!.id);
    expect(journey.view().items.every((i) => i.stale)).toBe(true);
    expect(() =>
      journey.action({
        action: "item",
        id: item.id,
        revision: 1,
        decision: "approve",
      }),
    ).toThrow(/case changed/);
  });
  it("editing requires a fresh revision and approval cannot be reused", async () => {
    const { journey } = await outreach();
    const item = journey.view().items[0]!;
    journey.action({
      action: "item",
      id: item.id,
      revision: 1,
      decision: "edit",
      body: "Revised draft for the care team.",
    });
    expect(() =>
      journey.action({
        action: "item",
        id: item.id,
        revision: 1,
        decision: "approve",
      }),
    ).toThrow(/draft changed/);
    journey.action({
      action: "item",
      id: item.id,
      revision: 2,
      decision: "approve",
    });
    expect(() =>
      journey.action({
        action: "item",
        id: item.id,
        revision: 3,
        decision: "approve",
      }),
    ).toThrow(/already/);
  });
  it("records provider failure without fabricated tool success or silent fixture fallback", async () => {
    const { store, journey } = await setup();
    const p = store.view().patients[2]!;
    journey.action({
      action: "investigate",
      patientId: p.id,
      screeningId: p.screening!.id,
      mode: "live",
    });
    await journey.processNext({
      mode: "live",
      label: "test",
      extract: adapter.extract.bind(adapter),
      screen: adapter.screen.bind(adapter),
      runGapInvestigation: async () => {
        throw { status: 429 };
      },
    });
    const r = journey.view().runs[0]!;
    expect(r.state).toBe("failed");
    expect(r.summary).toContain("429");
    expect(journey.view().items).toHaveLength(0);
  });
  it("does not auto-start paid investigations for an untouched cohort", async () => {
    const { journey } = await setup();
    journey.continueAfterReplies();
    expect(journey.nextMode()).toBeNull();
  });
  it("blocks outreach after trial closure", async () => {
    const { store, journey } = await outreach();
    const item = journey.view().items[0]!;
    store.db.prepare("UPDATE trials SET recruiting_status='TERMINATED'").run();
    expect(() =>
      journey.action({
        action: "item",
        id: item.id,
        revision: 1,
        decision: "approve",
      }),
    ).toThrow(/case changed/);
  });
  it("discards late agent drafts after the checklist changes", async () => {
    const { store, journey } = await setup();
    const p = store.view().patients.find((p) => p.id === "synthetic-03")!;
    journey.action({
      action: "investigate",
      patientId: p.id,
      screeningId: p.screening!.id,
      mode: "fixture",
    });
    const delayed = new FixtureAdapter();
    const original = delayed.runGapInvestigation.bind(delayed);
    delayed.runGapInvestigation = async (p, r, o) => {
      const output = await original(p, r, o);
      store.revise(store.checklist()!.id);
      return output;
    };
    await journey.processNext(delayed);
    expect(journey.view().runs[0]!.state).toBe("stale");
    expect(journey.view().items).toHaveLength(0);
  });
  it("records each human outcome, creates scheduling reminders and closes terminal cases", async () => {
    const { journey } = await outreach();
    const physician = journey.view().items.find((i) => i.kind === "physician")!;
    journey.action({
      action: "item",
      id: physician.id,
      revision: 1,
      decision: "approve",
    });
    for (const stage of [
      "doctor_responded",
      "discussed_at_visit",
      "patient_interested",
      "consent_visit_scheduled",
      "consented",
      "formal_screening",
      "enrolled",
    ] as const) {
      const c = journey.view().cases[0]!;
      journey.action({
        action: "outcome",
        screeningId: c.screeningId,
        revision: c.revision,
        stage,
        note: "Synthetic outcome entered by coordinator.",
      });
      if (stage === "patient_interested") {
        journey.action({ action: "advance_clock", days: 5 });
        expect(
          journey
            .view()
            .items.some(
              (i) =>
                i.kind === "reminder" &&
                i.body.includes("five days") &&
                i.state === "pending",
            ),
        ).toBe(true);
      }
    }
    expect(journey.view().cases[0]!.stage).toBe("enrolled");
    expect(
      journey
        .view()
        .items.filter((i) => i.kind === "reminder" && i.state === "pending"),
    ).toHaveLength(0);
    const c = journey.view().cases[0]!;
    expect(() =>
      journey.action({
        action: "outcome",
        screeningId: c.screeningId,
        revision: c.revision,
        stage: "doctor_responded",
        note: "Cannot reopen",
      }),
    ).toThrow();
  });
  it("prepares a fixture draft without deleting existing runs or bypassing approval", async () => {
    const { store, journey } = await outreach();
    const previous = store.checklist()!;
    store.prepareWalkthrough();
    expect(store.checklist()!.state).toBe("draft");
    expect(store.checklist()!.version).toBe(previous.version + 1);
    expect(store.checklist()!.mode).toBe("fixture");
    expect(journey.view().runs).toHaveLength(1);
    expect(journey.view().items.every((i) => i.stale)).toBe(true);
  });
  it("counts clinic business days across a weekend", () => {
    expect(
      elapsedBusinessDays("2026-10-23T12:00:00Z", "2026-10-26T12:00:00Z"),
    ).toBe(1);
    expect(
      elapsedBusinessDays("2026-10-23T12:00:00Z", "2026-10-27T12:00:00Z"),
    ).toBe(2);
  });
});
