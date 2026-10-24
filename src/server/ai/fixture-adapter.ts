import { isDeepStrictEqual } from "node:util";
import { checklistInputSchema, patientSchema, type ChecklistInput, type Patient, type TrialInput } from "../../lib/schemas/ai";
import type { AiAdapter, UnresolvedRule } from "./contracts";
import { buildDemoCohort, demoChecklist, demoTrial, DEMO_TIME } from "./fixtures";
import { GapSession } from "./gap-tools";

/** Exact fixture replay, not an alternative screening engine. Unknown/edited inputs fail closed. */
export class FixtureAdapter implements AiAdapter {
  readonly mode = "fixture" as const;
  readonly label = "Fixture simulation · no AI call";
  constructor(private readonly clock: () => Date = () => new Date(DEMO_TIME)) {}
  async extract(trial: TrialInput) {
    if (trial.id !== demoTrial.id || trial.criteriaText !== demoTrial.criteriaText) {
      throw new Error("No extraction fixture for this trial snapshot. Select live mode or restore the demo snapshot.");
    }
    return structuredClone(demoChecklist);
  }
  async screen(input: Patient, approved: ChecklistInput) {
    const patient = patientSchema.parse(input);
    const checklist = checklistInputSchema.parse(approved);
    const fixture = buildDemoCohort(this.clock).find((item) => item.patient.id === patient.id);
    if (!fixture || !isDeepStrictEqual(patient, fixture.patient)
      || checklist.trialId !== demoTrial.id || !isDeepStrictEqual(checklist.rules, demoChecklist.rules)) {
      throw new Error("No exact screening fixture for these inputs. Edited charts/checklists require live screening.");
    }
    return structuredClone(fixture.proposals);
  }
  async runGapInvestigation(patient: Patient, unresolvedRules: UnresolvedRule[]) {
    const unresolvedRuleIds = unresolvedRules.map((rule) => rule.id);
    const session = new GapSession(patient, unresolvedRuleIds);
    const ruleId = unresolvedRuleIds[0];
    if (ruleId) {
      session.execute("search_chart", { query: ruleId.replaceAll("_", " ") });
      session.execute("check_outside_records", { query: ruleId.includes("treatment") || ruleId === "prior_systemic" ? "treatment" : ruleId });
      session.execute("ask_coordinator", { ruleId, question: "Fixture simulation: review missing evidence; no action was sent." });
    }
    session.execute("finish", { summary: "Deterministic fixture sequence only. No model selected these tools; re-screening is still required." });
    return session.trail("fixture", null);
  }
}
