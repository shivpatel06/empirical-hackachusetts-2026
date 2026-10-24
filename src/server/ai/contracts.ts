import type { ChecklistDraft, ChecklistInput, Patient, RuleOutput, TrialInput } from "../../lib/schemas/ai";
import type { GapTrail } from "./gap-tools";

export interface UnresolvedRule { id: string; qualification: string; evidenceDescription: string }

export interface AiAdapter {
  readonly mode: "live" | "fixture";
  readonly label: string;
  extract(trial: TrialInput): Promise<ChecklistDraft>;
  screen(patient: Patient, checklist: ChecklistInput): Promise<RuleOutput[]>;
  runGapInvestigation(patient: Patient, unresolvedRules: UnresolvedRule[]): Promise<GapTrail>;
}

/** Deliberately avoid provider messages, request bodies and headers in UI/logs. */
export function safeAiError(error: unknown): string {
  const status = typeof error === "object" && error !== null && "status" in error ? error.status : undefined;
  if (status === 401) return "OpenAI authentication failed (401).";
  if (status === 403) return "OpenAI access denied (403).";
  if (status === 404) return "OpenAI model unavailable (404).";
  if (status === 429) return "OpenAI rate or quota limit (429).";
  if (status === 400) return "OpenAI rejected the request or schema (400).";
  if (typeof status === "number" && status >= 500) return "OpenAI service unavailable (5xx).";
  return "AI call failed, timed out, or returned invalid output. Retry or explicitly select fixture mode.";
}
