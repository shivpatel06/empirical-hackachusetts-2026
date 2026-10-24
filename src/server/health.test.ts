import { describe, expect, it } from "vitest";
import { healthResponseSchema } from "../lib/schemas/health";
import { parseServerEnv } from "../lib/schemas/env";
import { buildHealthResponse } from "./health";

const fixedNow = () => new Date("2026-10-24T12:00:00.000Z");

describe("buildHealthResponse", () => {
  it("reports ok with a migrated database and a boolean key flag only", () => {
    const key = "sk-test-not-a-real-key";
    const body = buildHealthResponse(
      parseServerEnv({ OPENAI_API_KEY: key }),
      { ok: true, migrationVersion: 1 },
      fixedNow,
    );
    expect(body).toEqual({
      status: "ok",
      time: "2026-10-24T12:00:00.000Z",
      syntheticDataOnly: true,
      demoMode: true,
      clinicTimezone: "America/New_York",
      openAiKeyConfigured: true,
      db: { ok: true, migrationVersion: 1 },
    });
    expect(JSON.stringify(body)).not.toContain(key);
  });

  it("reports degraded when the database is unavailable or unmigrated", () => {
    const env = parseServerEnv({});
    expect(buildHealthResponse(env, { ok: false, migrationVersion: 0, error: "missing" }).status).toBe("degraded");
    expect(buildHealthResponse(env, { ok: true, migrationVersion: 0 }).status).toBe("degraded");
    expect(buildHealthResponse(env, { ok: true, migrationVersion: 0 }).openAiKeyConfigured).toBe(false);
  });
});

describe("healthResponseSchema", () => {
  it("rejects extra fields such as a leaked credential", () => {
    const valid = buildHealthResponse(parseServerEnv({}), { ok: true, migrationVersion: 1 }, fixedNow);
    expect(healthResponseSchema.safeParse(valid).success).toBe(true);
    expect(healthResponseSchema.safeParse({ ...valid, openAiKey: "sk-x" }).success).toBe(false);
    expect(healthResponseSchema.safeParse({ ...valid, openAiKeyConfigured: "yes" }).success).toBe(false);
  });
});
