import { createHash } from "node:crypto";
import { z } from "zod";
import type { TrialInput } from "../../lib/schemas/ai";

export class RegistryError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}
const moduleSchema = z.object({
  protocolSection: z.object({
    identificationModule: z.object({
      nctId: z.string().regex(/^NCT\d{8}$/),
      briefTitle: z.string().trim().min(1),
    }),
    conditionsModule: z
      .object({ conditions: z.array(z.string()).default([]) })
      .default({ conditions: [] }),
    designModule: z
      .object({ phases: z.array(z.string()).default([]) })
      .default({ phases: [] }),
    statusModule: z.object({
      overallStatus: z.string().min(1),
      lastUpdatePostDateStruct: z
        .object({ date: z.string().min(1) })
        .optional(),
    }),
    eligibilityModule: z.object({
      eligibilityCriteria: z.string().trim().min(1),
      minimumAge: z.string().optional(),
      maximumAge: z.string().optional(),
      sex: z.string().optional(),
    }),
  }),
});
export interface RegistryTrial extends TrialInput {
  snapshot: unknown;
  conditions: string[];
  phases: string[];
  recruitingStatus: string;
  updatedAt: string | null;
  fetchedAt: string;
  minimumAge: string | null;
  maximumAge: string | null;
  sex: string | null;
  contentHash: string;
}
export function validateNctId(value: string): string {
  const id = value.trim().toUpperCase();
  if (!/^NCT\d{8}$/.test(id))
    throw new RegistryError(
      "Enter an NCT ID followed by eight digits, for example NCT06116682.",
      400,
    );
  return id;
}
export function registryTrial(
  raw: unknown,
  expectedId: string,
  fetchedAt: string,
): RegistryTrial {
  const parsed = moduleSchema.safeParse(raw);
  if (!parsed.success)
    throw new RegistryError(
      "The registry response is incomplete or has no eligibility criteria. Nothing was imported.",
    );
  const p = parsed.data.protocolSection;
  if (p.identificationModule.nctId !== expectedId)
    throw new RegistryError(
      "The registry returned a different trial ID. Nothing was imported.",
    );
  const fields = {
    criteriaText: p.eligibilityModule.eligibilityCriteria.replace(
      /\r\n/g,
      "\n",
    ),
    conditions: p.conditionsModule.conditions,
    phases: p.designModule.phases,
    recruitingStatus: p.statusModule.overallStatus,
    minimumAge: p.eligibilityModule.minimumAge ?? null,
    maximumAge: p.eligibilityModule.maximumAge ?? null,
    sex: p.eligibilityModule.sex ?? null,
  };
  const canonical = {
    ...fields,
    conditions: [...fields.conditions].sort(),
    phases: [...fields.phases].sort(),
  };
  return {
    ...fields,
    id: expectedId,
    title: p.identificationModule.briefTitle,
    sourceUrl: `https://clinicaltrials.gov/study/${expectedId}`,
    updatedAt: p.statusModule.lastUpdatePostDateStruct?.date ?? null,
    fetchedAt,
    snapshot: raw,
    contentHash: createHash("sha256")
      .update(JSON.stringify(canonical))
      .digest("hex"),
  };
}
export async function fetchTrial(
  id: string,
  fetcher: typeof fetch = fetch,
  now: () => Date = () => new Date(),
): Promise<RegistryTrial> {
  id = validateNctId(id);
  try {
    const response = await fetcher(
      `https://clinicaltrials.gov/api/v2/studies/${id}`,
      {
        headers: { Accept: "application/json" },
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      },
    );
    if (response.status === 404)
      throw new RegistryError(
        "No trial was found with that NCT ID. Check the ID and try again.",
        404,
      );
    if (response.status === 429)
      throw new RegistryError(
        "The registry is rate limiting requests. Please try again shortly.",
        429,
      );
    if (!response.ok)
      throw new RegistryError(
        `The registry is temporarily unavailable (${response.status}). Please retry.`,
      );
    const text = await response.text();
    if (text.length > 4_000_000)
      throw new RegistryError(
        "Registry response exceeded the supported size. Nothing was imported.",
      );
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new RegistryError(
        "The registry returned invalid data. Please retry.",
      );
    }
    return registryTrial(raw, id, now().toISOString());
  } catch (error) {
    if (error instanceof RegistryError) throw error;
    throw new RegistryError(
      "Could not reach ClinicalTrials.gov within 15 seconds. Your workspace is unchanged; please retry.",
    );
  }
}
