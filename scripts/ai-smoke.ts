import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { loadScriptEnv } from "./load-env";
import { createRunner, OpenAiAdapter } from "../src/server/ai/openai";
import { modelConfigSchema } from "../src/server/ai/model-probe";
import { buildDemoCohort, demoChecklist, demoTrial, DEMO_TIME } from "../src/server/ai/fixtures";
import { safeAiError } from "../src/server/ai/contracts";

async function main() {
  const env = loadScriptEnv();
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");
  const models = modelConfigSchema.parse(JSON.parse(readFileSync("data/model-config.json", "utf8")));
  const adapter = new OpenAiAdapter(models, createRunner(env.OPENAI_API_KEY), () => new Date(DEMO_TIME));
  // Small published-criteria subset exercises real SDK schema conversion, not full-trial accuracy.
  const sourceRules = demoChecklist.rules.filter((rule) => ["hemoglobin", "prior_systemic", "consent"].includes(rule.id));
  const trial = { ...demoTrial, criteriaText: sourceRules.map((rule) => rule.sourceQuote).join("\n\n") };
  const extracted = await adapter.extract(trial);
  const patient = buildDemoCohort()[0]!.patient;
  // Test-harness approval only. No persisted coordinator approval or clinical decision is created.
  const proposals = await adapter.screen(patient, { trialId: trial.id, version: 1, state: "approved", rules: extracted.rules });
  const ids = new Set(extracted.rules.map((rule) => rule.id));
  const complete = proposals.length === ids.size && new Set(proposals.map((proposal) => proposal.ruleId)).size === ids.size
    && proposals.every((proposal) => ids.has(proposal.ruleId));
  const citationsValid = proposals.every((proposal) => proposal.citations.every((citation) =>
    citation.quote.length > 0 && patient.chart.some((line) => line.id === citation.lineId && line.text.includes(citation.quote))));
  const passed = extracted.rules.length > 0 && complete && citationsValid;
  mkdirSync("data", { recursive: true });
  writeFileSync("data/ai-structured-smoke.json", JSON.stringify({
    checkedAt: new Date().toISOString(), model: models.SCREENING_MODEL, mode: "live",
    scope: "Three published criterion paragraphs; synthetic patient; schema/provenance smoke only, not clinical validation.",
    passed, complete, citationsValid, extracted, proposals,
  }, null, 2) + "\n");
  console.log(JSON.stringify({ passed, model: models.SCREENING_MODEL, extractedRules: extracted.rules.length,
    proposedResults: proposals.length, complete, citationsValid }, null, 2));
  if (!passed) process.exitCode = 1;
}
main().catch((error: unknown) => { console.error(safeAiError(error)); process.exitCode = 1; });
