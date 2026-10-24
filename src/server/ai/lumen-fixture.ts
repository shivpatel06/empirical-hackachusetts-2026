import { createHash } from "node:crypto";
import fixture from "../../../fixtures/trial-prescreening/lumen-1.json";
import { patientSchema, screeningOutputSchema, validateDraft, type ChartLine } from "../../lib/schemas/ai";
import type { RegistryTrial } from "../trials/registry";
import { DEMO_TIME } from "./fixtures";

export const lumenTrial = fixture.trial;
export const lumenChecklist = validateDraft(fixture.checklist);
export const priorImmunotherapyEvidence = fixture.priorImmunotherapyEvidence;
export function lumenStudy(fetchedAt = DEMO_TIME): RegistryTrial {
  return { ...lumenTrial, snapshot: fixture, conditions: ["Stage IV non-small cell lung cancer"],
    phases: ["Sample immunotherapy study"], recruitingStatus: "RECRUITING",
    updatedAt: "2026-10-24", fetchedAt, minimumAge: null, maximumAge: null, sex: "ALL",
    contentHash: createHash("sha256").update(JSON.stringify(fixture.trial)).digest("hex") };
}
export function buildLumenCohort(clock: () => Date = () => new Date(DEMO_TIME)) {
  const now = clock().getTime();
  if (!Number.isFinite(now)) throw new Error("Invalid sample clock");
  const date = (days: number) => new Date(now + days * 86400000).toISOString();
  return fixture.cases.map((item) => {
    const materialize = (line: typeof item.chart[number]): ChartLine => {
      const { observedDays, ingestedDays, ...rest } = line;
      return { ...rest, observedAt: date(observedDays), ingestedAt: date(ingestedDays) };
    };
    return { patient: patientSchema.parse({ id: item.id, synthetic: true, diagnosis: item.diagnosis,
      clinician: item.clinician, nextVisit: date(item.nextVisitDays), revision: 1,
      chart: item.chart.map(materialize), outsideRecords: [] }),
      proposals: screeningOutputSchema.parse({ results: item.proposedOutputs }).results,
      expectedStatus: item.expectedStatus };
  });
}
