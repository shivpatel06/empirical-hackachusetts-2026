import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { loadScriptEnv } from "./load-env";
import { createRunner, OpenAiAdapter } from "../src/server/ai/openai";
import { modelConfigSchema } from "../src/server/ai/model-probe";
import { demoTrial, DEMO_TIME } from "../src/server/ai/fixtures";
import { openDatabase } from "../src/server/db/connection";
import { runMigrations } from "../src/server/db/migrate";
import { seedDatabase } from "../src/server/db/seed";
import { seedWorkflow } from "../src/server/workflow/seed";
import { WorkflowStore, WorkflowError } from "../src/server/workflow/store";
import { importTrial } from "../src/server/trials/import";
import { RegistryError } from "../src/server/trials/registry";
import { safeAiError } from "../src/server/ai/contracts";

// Billable integration check. Never opens the user's application database.
// Harness approval demonstrates transitions, not human or clinical approval.
async function main() {
  const env = loadScriptEnv();
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required");
  const models = modelConfigSchema.parse(
    JSON.parse(readFileSync("data/model-config.json", "utf8")),
  );
  const clock = () => new Date(DEMO_TIME);
  const db = openDatabase(":memory:");
  const started = Date.now();
  let phase = "setup";
  let passed = false;
  let screenCalls = 0;
  let failure: string | null = null;
  const store = new WorkflowStore(db, "live", clock);
  try {
    runMigrations(db);
    seedDatabase(db);
    seedWorkflow(db, clock);
    const adapter = new OpenAiAdapter(
      models,
      createRunner(env.OPENAI_API_KEY),
      clock,
    );
    const originalScreen = adapter.screen.bind(adapter);
    const originalExtract = adapter.extract.bind(adapter);
    adapter.extract = async (trial) => {
      phase = "complete live extraction";
      console.log(JSON.stringify({ phase }));
      try {
        return await originalExtract(trial);
      } catch (error) {
        failure = safeAiError(error);
        throw error;
      }
    };
    adapter.screen = async (...args) => {
      screenCalls++;
      return originalScreen(...args);
    };
    phase = "live registry import and complete extraction";
    console.log(JSON.stringify({ phase }));
    const original = store.checklist()!;
    await importTrial(store, demoTrial.id, "live", async () => adapter, fetch, {
      id: original.id,
      revision: original.revision,
    });
    const draft = store.checklist()!;
    assert.equal(draft.state, "draft");
    assert.equal(draft.mode, "live");
    assert.throws(() => store.screen(), /Approve/);
    phase = "isolated harness approval";
    assert.equal(store.approve(draft.id, draft.revision, true), 6);
    assert.equal(store.approve(draft.id, draft.revision, true), 0);
    phase = "persisted cohort screening";
    let jobs = 0;
    while (await store.processNext(adapter)) {
      jobs++;
      console.log(JSON.stringify({ phase, jobs, screenCalls }));
      assert.ok(jobs <= 6, "Unexpected duplicate job");
    }
    const view = store.view();
    assert.equal(jobs, 6);
    assert.equal(view.pending, 0);
    assert.equal(view.patients.length, 6);
    // The conservative pre-filter only applies to its exact approved disease
    // rule. Freshly extracted rules may require all six patients to reach AI.
    assert.equal(
      screenCalls,
      view.patients.filter((p) => !p.screening?.result.prefilter).length,
    );
    assert.ok(screenCalls > 0, "The live smoke must actually call the model");
    for (const patient of view.patients) {
      assert.equal(patient.job?.state, "completed");
      assert.ok(patient.screening && !patient.screening.stale);
      assert.equal(patient.screening.mode, "live");
      assert.equal(patient.screening.chartRevision, patient.revision);
      assert.equal(patient.screening.checklistId, draft.id);
      if (!patient.screening.result.prefilter) {
        assert.equal(patient.screening.result.rules.length, draft.rules.length);
        assert.equal(
          new Set(patient.screening.result.rules.map((r) => r.ruleId)).size,
          draft.rules.length,
        );
      }
    }
    assert.equal(store.screen(), 0);
    passed = true;
    phase = "complete";
  } catch (error) {
    failure ??=
      error instanceof RegistryError || error instanceof WorkflowError
        ? error.message
        : "A workflow smoke invariant did not pass.";
    throw error;
  } finally {
    mkdirSync("data", { recursive: true });
    const view = store.view();
    const receipt = {
      checkedAt: new Date().toISOString(),
      passed,
      phase,
      failure,
      elapsedMs: Date.now() - started,
      model: models.SCREENING_MODEL,
      screenCalls,
      scope:
        "Real registry fetch and complete extraction, isolated test-harness approval, six synthetic persisted jobs. Not clinical validation, coordinator approval, or a gap-agent demo.",
      checklist: view.checklist,
      patients: view.patients,
      activity: view.activity,
    };
    writeFileSync(
      "data/ai-workflow-smoke.json",
      JSON.stringify(receipt, null, 2) + "\n",
    );
    console.log(
      JSON.stringify({
        passed,
        phase,
        elapsedMs: receipt.elapsedMs,
        screenCalls,
        cases: view.patients.map((p) => ({
          id: p.id,
          job: p.job?.state,
          status: p.screening?.result.status,
        })),
      }),
    );
    db.close();
  }
}
main().catch(() => {
  console.error(
    "Workflow smoke failed. Inspect the phase and safe job errors in data/ai-workflow-smoke.json; no live database was changed.",
  );
  process.exitCode = 1;
});
