import { afterEach, describe, it, expect, vi } from "vitest";
import snapshot from "../../../fixtures/trial-prescreening/NCT06116682.json";
import { fetchTrial, registryTrial, validateNctId } from "./registry";
import { importTrial } from "./import";
import { openDatabase, type Db } from "../db/connection";
import { runMigrations } from "../db/migrate";
import { seedDatabase } from "../db/seed";
import { seedWorkflow } from "../workflow/seed";
import { WorkflowStore } from "../workflow/store";
import { FixtureAdapter } from "../ai/fixture-adapter";
import { demoChecklist, demoTrial, DEMO_TIME } from "../ai/fixtures";
import type { AiAdapter } from "../ai/contracts";
const clock = () => new Date(DEMO_TIME),
  dbs: Db[] = [];
afterEach(() => {
  dbs.splice(0).forEach((db) => db.close());
});
function setup() {
  const db = openDatabase(":memory:");
  dbs.push(db);
  runMigrations(db);
  seedDatabase(db);
  seedWorkflow(db, clock);
  return new WorkflowStore(db, "fixture", clock);
}
const response = (value: unknown = snapshot, status = 200) =>
  vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(JSON.stringify(value), { status }));
function newTrial() {
  const raw = structuredClone(snapshot);
  raw.protocolSection.identificationModule.nctId = "NCT00000002";
  raw.protocolSection.identificationModule.briefTitle =
    "Second synthetic test protocol";
  return raw;
}
function changedDraft(clause: string) {
  const draft = structuredClone(demoChecklist);
  draft.rules.push({
    ...structuredClone(draft.rules[0]!),
    id: "new_clause",
    sourceQuote: clause,
    qualification: clause,
    expression: {
      rootId: "new",
      nodes: [
        { id: "new", operator: "condition", childIds: [], condition: clause },
      ],
    },
  });
  return draft;
}
function fakeLive(): AiAdapter {
  const adapter = new FixtureAdapter();
  return {
    ...adapter,
    mode: "live",
    label: "Test mock",
    extract: async (trial) =>
      trial.criteriaText.endsWith("New protocol clause.")
        ? changedDraft("New protocol clause.")
        : structuredClone(demoChecklist),
    screen: adapter.screen.bind(adapter),
    runGapInvestigation: adapter.runGapInvestigation.bind(adapter),
  };
}

describe("ClinicalTrials.gov adapter", () => {
  it("normalizes IDs, rejects malformed IDs before network, and maps verified v2 fields", async () => {
    expect(validateNctId(" nct06116682 ")).toBe(demoTrial.id);
    const fetcher = response();
    await expect(
      fetchTrial("https://evil.test", fetcher, clock),
    ).rejects.toMatchObject({ status: 400 });
    expect(fetcher).not.toHaveBeenCalled();
    const t = await fetchTrial(demoTrial.id, fetcher, clock);
    expect(t.conditions).toEqual(["Lung Non-Small Cell Carcinoma"]);
    expect(t.phases).toEqual(["PHASE2"]);
    expect(t.updatedAt).toBe("2026-10-09");
    expect(t.criteriaText).toBe(demoTrial.criteriaText);
    expect(t.snapshot).toEqual(snapshot);
    expect(fetcher.mock.calls[0]![0]).toBe(
      "https://clinicaltrials.gov/api/v2/studies/NCT06116682",
    );
  });
  it("handles errors, bad JSON, missing criteria, mismatched IDs, and network/timeout failures", async () => {
    for (const status of [404, 429, 500])
      await expect(
        fetchTrial(demoTrial.id, response({}, status), clock),
      ).rejects.toThrow();
    await expect(
      fetchTrial(
        demoTrial.id,
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(new Response("<html>bad</html>")),
        clock,
      ),
    ).rejects.toThrow(/invalid data/);
    const bad = structuredClone(snapshot);
    bad.protocolSection.eligibilityModule.eligibilityCriteria = "";
    await expect(
      fetchTrial(demoTrial.id, response(bad), clock),
    ).rejects.toThrow(/no eligibility/);
    await expect(fetchTrial("NCT00000002", response(), clock)).rejects.toThrow(
      /different trial/,
    );
    await expect(
      fetchTrial(
        demoTrial.id,
        vi
          .fn<typeof fetch>()
          .mockRejectedValue(new DOMException("timeout", "TimeoutError")),
        clock,
      ),
    ).rejects.toThrow(/within 15 seconds/);
  });
  it("hashes screening-relevant fields, not registry refresh dates, metadata order or titles", () => {
    const first = registryTrial(snapshot, demoTrial.id, DEMO_TIME),
      copy = structuredClone(snapshot);
    copy.protocolSection.identificationModule.briefTitle += " updated title";
    copy.protocolSection.statusModule.lastUpdatePostDateStruct.date =
      "2026-10-24";
    expect(
      registryTrial(copy, demoTrial.id, new Date().toISOString()).contentHash,
    ).toBe(first.contentHash);
    copy.protocolSection.eligibilityModule.eligibilityCriteria +=
      "\nAdditional criterion";
    expect(registryTrial(copy, demoTrial.id, DEMO_TIME).contentHash).not.toBe(
      first.contentHash,
    );
  });
  it("tolerates missing optional phases/date and preserves structured eligibility metadata", () => {
    const raw: Record<string, any> = structuredClone(snapshot);
    delete raw.protocolSection.designModule.phases;
    delete raw.protocolSection.statusModule.lastUpdatePostDateStruct;
    const t = registryTrial(raw, demoTrial.id, DEMO_TIME);
    expect(t.phases).toEqual([]);
    expect(t.updatedAt).toBeNull();
    expect(t.minimumAge).toBeTruthy();
  });
});

describe("transactional import and trial switching", () => {
  it("explicit re-extraction creates an unapproved version even when registry content is unchanged", async () => {
    const store = setup();
    store.approve(1, 1, true);
    while (await store.processNext(new FixtureAdapter())) {}
    const adapter = fakeLive();
    const extract = vi.spyOn(adapter, "extract");
    await importTrial(
      store,
      demoTrial.id,
      "live",
      async () => adapter,
      response(),
      { id: 1, revision: 1 },
    );
    expect(extract).toHaveBeenCalledOnce();
    expect(store.checklist()).toMatchObject({
      version: 2,
      state: "draft",
      mode: "live",
    });
    expect(store.checklist(1)?.state).toBe("approved");
    expect(store.view().patients.every((p) => p.screening?.stale)).toBe(true);
    expect(() => store.screen()).toThrow(/Approve/);
    await expect(
      importTrial(
        store,
        demoTrial.id,
        "live",
        async () => adapter,
        response(),
        { id: 1, revision: 1 },
      ),
    ).rejects.toThrow(/Checklist changed/);
  });
  it("re-extraction failure preserves an approved version and a fetch-time edit cannot be overwritten", async () => {
    const store = setup();
    store.approve(1, 1, true);
    const adapter = fakeLive();
    adapter.extract = async () => {
      throw Error("fail");
    };
    await expect(
      importTrial(
        store,
        demoTrial.id,
        "live",
        async () => adapter,
        response(),
        { id: 1, revision: 1 },
      ),
    ).rejects.toThrow(/extraction failed/);
    expect(store.checklist()).toMatchObject({ id: 1, state: "approved" });
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => {
      store.revise(1);
      return new Response(JSON.stringify(snapshot));
    });
    await expect(
      importTrial(
        store,
        demoTrial.id,
        "live",
        async () => fakeLive(),
        fetcher,
        { id: 1, revision: 1 },
      ),
    ).rejects.toThrow(/changed while extraction/);
    expect(store.checklist()).toMatchObject({ version: 2, state: "draft" });
  });

  it("imports an arbitrary NCT snapshot as an unapproved version without replacing the original trial", async () => {
    const store = setup();
    store.approve(1, 1, true);
    await importTrial(
      store,
      "NCT00000002",
      "live",
      async () => fakeLive(),
      response(newTrial()),
    );
    const view = store.view();
    expect(view.trials).toHaveLength(2);
    expect(view.trial?.id).toBe("NCT00000002");
    expect(view.trial?.localOpen).toBe(false);
    expect(view.checklist?.state).toBe("draft");
    expect(view.mode).toBe("live");
    expect(() => store.screen()).toThrow(/Approve/);
    store.selectTrial(demoTrial.id);
    expect(store.checklist()?.state).toBe("approved");
    expect(store.mode).toBe("fixture");
    expect(
      store.db.prepare("SELECT count(*) n FROM trial_snapshots").get(),
    ).toEqual({ n: 2 });
  });
  it("does not call extraction or create a draft for an unchanged registry snapshot", async () => {
    const store = setup();
    store.approve(1, 1, true);
    const adapter = vi.fn(async () => fakeLive());
    expect(
      await importTrial(store, demoTrial.id, "live", adapter, response()),
    ).toBe(false);
    expect(adapter).not.toHaveBeenCalled();
    expect(store.checklist()?.id).toBe(1);
    expect(store.view().pending).toBe(6);
  });
  it("keeps the old source immutable and creates one new version on a relevant change", async () => {
    const store = setup();
    store.approve(1, 1, true);
    while (await store.processNext(new FixtureAdapter())) {}
    const changed = structuredClone(snapshot);
    changed.protocolSection.eligibilityModule.eligibilityCriteria +=
      "\nNew protocol clause.";
    await importTrial(
      store,
      demoTrial.id,
      "live",
      async () => fakeLive(),
      response(changed),
    );
    expect(store.checklist()?.version).toBe(2);
    expect(store.view().patients.every((p) => p.screening?.stale)).toBe(true);
    expect(store.checklist(1)?.state).toBe("approved");
    expect(
      store.db
        .prepare("SELECT snapshot_json FROM trial_snapshots WHERE id=1")
        .get(),
    ).toEqual({ snapshot_json: JSON.stringify(snapshot) });
    await importTrial(
      store,
      demoTrial.id,
      "live",
      async () => fakeLive(),
      response(changed),
    );
    expect(store.checklist()?.version).toBe(2);
    expect(() =>
      store.db
        .prepare("UPDATE checklist_versions SET snapshot_id=2 WHERE id=1")
        .run(),
    ).toThrow(/immutable/);
    expect(() => store.db.prepare("DELETE FROM trial_snapshots").run()).toThrow(
      /immutable/,
    );
  });
  it("leaves trials and checklists unchanged on network, extraction, zero-rule and invalid-source failures", async () => {
    const store = setup();
    const before = store.view();
    await expect(
      importTrial(
        store,
        "NCT00000002",
        "live",
        async () => fakeLive(),
        response({}, 500),
      ),
    ).rejects.toThrow();
    const adapter = fakeLive();
    adapter.extract = async () => {
      throw Error("sensitive provider data");
    };
    await expect(
      importTrial(
        store,
        "NCT00000002",
        "live",
        async () => adapter,
        response(newTrial()),
      ),
    ).rejects.toThrow(/extraction failed/);
    adapter.extract = async () => ({ rules: [] });
    await expect(
      importTrial(
        store,
        "NCT00000002",
        "live",
        async () => adapter,
        response(newTrial()),
      ),
    ).rejects.toThrow();
    adapter.extract = async () => ({
      rules: [{ ...demoChecklist.rules[0]!, sourceQuote: "fabricated" }],
    });
    await expect(
      importTrial(
        store,
        "NCT00000002",
        "live",
        async () => adapter,
        response(newTrial()),
      ),
    ).rejects.toThrow(/exact registry source/);
    expect(store.view()).toEqual(before);
  });
  it("rejects a late extraction if someone edited the existing draft while it was running", async () => {
    const store = setup(),
      changed = structuredClone(snapshot);
    changed.protocolSection.eligibilityModule.eligibilityCriteria +=
      "\nUpdated.";
    const adapter = fakeLive();
    adapter.extract = async () => {
      store.save(1, 1, demoChecklist);
      return changedDraft("Updated.");
    };
    await expect(
      importTrial(
        store,
        demoTrial.id,
        "live",
        async () => adapter,
        response(changed),
      ),
    ).rejects.toThrow(/changed while extraction/);
    expect(store.checklist()?.revision).toBe(2);
    expect(store.checklist()?.version).toBe(1);
  });
  it("switching the visible trial does not discard a valid in-flight screening for another trial", async () => {
    const store = setup();
    store.approve(1, 1, true);
    const adapter = new FixtureAdapter(),
      screen = adapter.screen.bind(adapter);
    adapter.screen = async (p, c) => {
      await importTrial(
        store,
        "NCT00000002",
        "live",
        async () => fakeLive(),
        response(newTrial()),
      );
      return screen(p, c);
    };
    await store.processNext(adapter);
    expect(
      store.db.prepare("SELECT state FROM events WHERE id=1").get(),
    ).toEqual({ state: "completed" });
  });
});
