import { z } from "zod";

// Empty strings in .env files (e.g. `OPENAI_API_KEY=`) mean "not set".
const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Server environment schema. Parse with `parseServerEnv`; read it only through
 * `src/server/env.ts`, which is guarded by `server-only`.
 */
export const serverEnvSchema = z.object({
  AI_MODE: z.preprocess(emptyToUndefined, z.enum(["fixture", "live"]).default("fixture")),
  OPENAI_API_KEY: z.preprocess(emptyToUndefined, z.string().trim().min(1).optional()),
  DATABASE_PATH: z.preprocess(emptyToUndefined, z.string().min(1).default("./data/app.db")),
  DEMO_MODE: z.preprocess(
    emptyToUndefined,
    z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
  ),
  CLINIC_TIMEZONE: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .default("America/New_York")
      .refine(isValidTimeZone, { message: "must be a valid IANA timezone" }),
  ),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/**
 * Validates environment variables. Error messages name the variable and the
 * problem only; they never include the supplied value, so a secret cannot leak
 * through a startup error.
 */
export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid server environment: ${problems}`);
  }
  return result.data;
}
