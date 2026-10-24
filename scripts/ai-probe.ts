import { mkdirSync, writeFileSync } from "node:fs";
import { loadScriptEnv } from "./load-env";
import { createRunner, OpenAiAdapter } from "../src/server/ai/openai";
import { probeModels, sdkProbe } from "../src/server/ai/model-probe";
import { safeAiError } from "../src/server/ai/contracts";
import type { Patient } from "../src/lib/schemas/ai";

async function main() {
  const env = loadScriptEnv();
  if (!env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is not configured. No live call was attempted.");
    process.exitCode = 1;
    return;
  }
  const runner = createRunner(env.OPENAI_API_KEY);
  const probe = await probeModels(sdkProbe(runner));
  mkdirSync("data", { recursive: true });
  writeFileSync("data/ai-probe.json", JSON.stringify(probe, null, 2) + "\n");
  console.log(JSON.stringify(probe, null, 2));
  if (!probe.config) { process.exitCode = 1; return; }
  const patient: Patient = {
    id: "synthetic-probe", synthetic: true, diagnosis: "Synthetic NSCLC", clinician: "Demo coordinator",
    revision: 1, nextVisit: null, outsideRecords: [], chart: [{
      id: "synthetic-probe-hb", patientId: "synthetic-probe", text: "Hemoglobin 11.5 g/dL.",
      source: "Hand-authored synthetic probe", observedAt: "2026-10-24T12:00:00.000Z",
      ingestedAt: "2026-10-24T12:00:00.000Z", revision: 1,
      measurement: { analyte: "hemoglobin", value: 11.5, unit: "g/dL", referenceUpper: null },
    }],
  };
  const adapter = new OpenAiAdapter(probe.config, runner);
  const trail = await adapter.runGapInvestigation(patient, [{ id: "hemoglobin",
    qualification: "For this synthetic probe only: hemoglobin must be at least 10 g/dL, measured within 28 days of demo assessment.",
    evidenceDescription: "Dated hemoglobin laboratory result with g/dL units." }]);
  writeFileSync("data/ai-gap-smoke.json", JSON.stringify(trail, null, 2) + "\n");
  const read = trail.actions.some((action) => ["search_chart", "get_latest"].includes(action.tool)
    && action.outcome === "ok" && JSON.stringify(action.result).includes("synthetic-probe-hb"));
  const passed = read && trail.completion !== "failed";
  console.log(JSON.stringify({ gapSmokePassed: passed, model: trail.model, completion: trail.completion,
    tools: trail.actions.map(({ tool, outcome }) => ({ tool, outcome })) }, null, 2));
  if (passed) {
    writeFileSync("data/model-config.json", JSON.stringify(probe.config, null, 2) + "\n");
    console.log("Pinned verified models in data/model-config.json (gitignored).");
  } else { process.exitCode = 1; }
}
main().catch((error: unknown) => { console.error(safeAiError(error)); process.exitCode = 1; });
