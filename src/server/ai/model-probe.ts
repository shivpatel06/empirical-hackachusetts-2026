import "server-only";
import { Agent, type Runner } from "@openai/agents";
import { z } from "zod";
import { safeAiError } from "./contracts";
import type { ModelConfig } from "./openai";

// Cost policy: use Luna for extraction/screening and gap investigation.
// Never automatically escalate to another model; an override must be deliberate.
// Candidates are not claims of account access. Selection still requires a live probe.
export const MODEL_CANDIDATES = {
  screening: ["gpt-6-luna"],
  gap: ["gpt-6-luna"],
} as const;
export const modelConfigSchema = z.object({
  SCREENING_MODEL: z.string().min(1).max(100), GAP_MODEL: z.string().min(1).max(100),
}).strict();
export interface ProbeAttempt { model: string; ok: boolean; detail: string }
export interface ProbeResult { config: ModelConfig | null; attempts: ProbeAttempt[]; checkedAt: string }

export async function probeModels(
  check: (model: string) => Promise<void>,
  candidates: { screening: readonly string[]; gap: readonly string[] } = MODEL_CANDIDATES,
): Promise<ProbeResult> {
  const attempts: ProbeAttempt[] = [];
  const cache = new Map<string, boolean>();
  const select = async (list: readonly string[]) => {
    for (const model of list) {
      if (!cache.has(model)) {
        try {
          await check(model);
          cache.set(model, true);
          attempts.push({ model, ok: true, detail: "Structured output probe passed." });
        } catch (error) {
          cache.set(model, false);
          attempts.push({ model, ok: false, detail: safeAiError(error) });
          // Authentication/quota failures affect the account; do not fan out more requests.
          const status = (error as { status?: number } | null)?.status;
          if (status === 401 || status === 403 || status === 429) throw error;
        }
      }
      if (cache.get(model)) return model;
    }
    return undefined;
  };
  let config: ModelConfig | null = null;
  try {
    const screening = await select(candidates.screening);
    const gap = await select(candidates.gap);
    const available = screening ?? gap;
    if (available) config = { SCREENING_MODEL: screening ?? available, GAP_MODEL: gap ?? available };
  } catch { /* Attempts contain safe, bounded diagnostics. No credentials or raw errors. */ }
  return { config, attempts, checkedAt: new Date().toISOString() };
}

export function sdkProbe(runner: Runner) {
  return async (model: string) => {
    const schema = z.object({ ready: z.boolean() }).strict();
    const agent = new Agent({ name: "Model capability probe", model, outputType: schema,
      instructions: "Return ready=true. This is a synthetic connectivity test." });
    const result = await runner.run(agent, "Confirm structured output works.", {
      maxTurns: 1, signal: AbortSignal.timeout(45_000),
    });
    if (!schema.parse(result.finalOutput).ready) throw new Error("Probe did not confirm readiness.");
  };
}
