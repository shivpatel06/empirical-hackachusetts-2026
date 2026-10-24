import { z } from "zod";
import { patientSchema, type Patient } from "../../lib/schemas/ai";

export const gapParameters = {
  search_chart: z.object({ query: z.string().trim().min(1).max(200) }).strict(),
  get_latest: z.object({ query: z.string().trim().min(1).max(200) }).strict(),
  check_outside_records: z.object({ query: z.string().trim().min(1).max(200) }).strict(),
  draft_records_request: z.object({ ruleId: z.string(), request: z.string().min(1).max(1000) }).strict(),
  ask_coordinator: z.object({ ruleId: z.string(), question: z.string().min(1).max(1000) }).strict(),
  finish: z.object({ summary: z.string().min(1).max(1000) }).strict(),
};
export type GapToolName = keyof typeof gapParameters;
export interface GapAction {
  sequence: number; tool: GapToolName; arguments: unknown;
  outcome: "ok" | "duplicate" | "invalid" | "failed"; result: unknown;
}
export interface GapTrail {
  mode: "live" | "fixture"; label: string; patientId: string;
  actions: GapAction[]; unresolvedRuleIds: string[];
  completion: "finished" | "budget_exhausted" | "model_stopped" | "failed";
  summary: string; model: string | null; responseIds: string[]; historyItemTypes: string[];
}

/** Scope is captured by the server, never supplied by model arguments. No write/send tools. */
export class GapSession {
  readonly patient: Patient;
  readonly unresolvedRuleIds: string[];
  readonly actions: GapAction[] = [];
  private readonly seen = new Set<string>();
  finished = false;
  summary = "";
  constructor(patient: Patient, unresolvedRuleIds: string[]) {
    this.patient = structuredClone(patientSchema.parse(patient));
    this.unresolvedRuleIds = [...new Set(unresolvedRuleIds)];
  }
  get exhausted() { return this.actions.length >= 6; }

  execute(name: GapToolName, input: unknown): unknown {
    if (this.finished || this.exhausted) return { error: "Run closed; no further tool execution allowed." };
    // Reserve budget synchronously, before parsing or effects; parallel calls cannot overspend.
    const action: GapAction = {
      sequence: this.actions.length + 1, tool: name, arguments: null, outcome: "invalid", result: null,
    };
    this.actions.push(action);
    const parsed = gapParameters[name].safeParse(input);
    if (!parsed.success) return (action.result = { error: "Invalid tool arguments." });
    action.arguments = parsed.data;
    const fingerprint = JSON.stringify([name, parsed.data]);
    if (this.seen.has(fingerprint)) {
      action.outcome = "duplicate";
      return (action.result = { error: "Duplicate tool call; choose another step or finish." });
    }
    this.seen.add(fingerprint);
    try {
      const args = parsed.data;
      if ("ruleId" in args && !this.unresolvedRuleIds.includes(args.ruleId)) {
        return (action.result = { error: "Rule is outside this investigation." });
      }
      if ("query" in args) {
        const lines = name === "check_outside_records" ? this.patient.outsideRecords : this.patient.chart;
        const query = args.query.toLocaleLowerCase();
        const matched = lines.filter((line) => line.text.toLocaleLowerCase().includes(query)
          || line.measurement?.analyte.toLocaleLowerCase().includes(query));
        const ordered = [...matched].sort((a, b) => b.observedAt.localeCompare(a.observedAt));
        action.result = { records: ordered.slice(0, name === "get_latest" ? 1 : 10),
          note: "Existing synthetic evidence only; findings require re-screening and guardrails." };
      } else if (name === "finish" && "summary" in args) {
        this.finished = true;
        this.summary = args.summary;
        action.result = { summary: args.summary, unresolvedRuleIds: this.unresolvedRuleIds };
      } else {
        action.result = { draft: args, patientId: this.patient.id, state: "pending_review", simulated: true,
          sent: false, note: "Draft proposal only. No chart edit, order, or dispatch occurred." };
      }
      action.outcome = "ok";
    } catch {
      action.outcome = "failed";
      action.result = { error: "Tool failed; evidence remains unresolved." };
    }
    return structuredClone(action.result);
  }

  trail(mode: "live" | "fixture", model: string | null, error?: string): GapTrail {
    const completion = error ? "failed" : this.finished ? "finished" : this.exhausted ? "budget_exhausted" : "model_stopped";
    return {
      mode, label: mode === "live" ? "Live OpenAI · synthetic records" : "Fixture simulation · no AI call",
      patientId: this.patient.id, actions: structuredClone(this.actions),
      unresolvedRuleIds: [...this.unresolvedRuleIds], completion,
      summary: error ?? (this.finished ? this.summary : `Backend stopped the run (${completion}). Rules still need validated re-screening: ${this.unresolvedRuleIds.join(", ")}.`),
      model, responseIds: [], historyItemTypes: [],
    };
  }
}
