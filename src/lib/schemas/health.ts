import { z } from "zod";

/**
 * Response contract for GET /api/health. Strict so that no extra field (for
 * example a credential value) can be added to the response by accident.
 */
export const healthResponseSchema = z.strictObject({
  status: z.enum(["ok", "degraded"]),
  time: z.iso.datetime(),
  syntheticDataOnly: z.literal(true),
  demoMode: z.boolean(),
  clinicTimezone: z.string().min(1),
  openAiKeyConfigured: z.boolean(),
  db: z.strictObject({
    ok: z.boolean(),
    migrationVersion: z.number().int().nonnegative(),
    error: z.string().max(200).optional(),
  }),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
