import { healthResponseSchema, type HealthResponse } from "../lib/schemas/health";
import type { ServerEnv } from "../lib/schemas/env";

export interface DbStatusInput {
  ok: boolean;
  migrationVersion: number;
  error?: string;
}

/**
 * Builds the validated health payload. Reports only whether an OpenAI key is
 * configured, never its value.
 */
export function buildHealthResponse(
  env: ServerEnv,
  db: DbStatusInput,
  now: () => Date = () => new Date(),
): HealthResponse {
  return healthResponseSchema.parse({
    status: db.ok && db.migrationVersion > 0 ? "ok" : "degraded",
    time: now().toISOString(),
    syntheticDataOnly: true,
    demoMode: env.DEMO_MODE,
    clinicTimezone: env.CLINIC_TIMEZONE,
    openAiKeyConfigured: typeof env.OPENAI_API_KEY === "string" && env.OPENAI_API_KEY.length > 0,
    db: db.error === undefined
      ? { ok: db.ok, migrationVersion: db.migrationVersion }
      : { ok: db.ok, migrationVersion: db.migrationVersion, error: db.error },
  });
}
