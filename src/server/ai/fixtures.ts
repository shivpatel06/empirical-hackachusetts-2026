import snapshot from "../../../fixtures/trial-prescreening/NCT06116682.json";
import draft from "../../../fixtures/trial-prescreening/checklist-draft.json";
import cohort from "../../../fixtures/trial-prescreening/cohort.json";
import {
  patientSchema, screeningOutputSchema, validateDraft, type ChartLine, type Patient, type TrialInput,
} from "../../lib/schemas/ai";

export const DEMO_TIME = "2026-10-24T12:00:00.000Z";
export const demoTrial: TrialInput = {
  id: snapshot.protocolSection.identificationModule.nctId,
  title: snapshot.protocolSection.identificationModule.briefTitle,
  criteriaText: snapshot.protocolSection.eligibilityModule.eligibilityCriteria,
  sourceUrl: "https://clinicaltrials.gov/study/NCT06116682",
};
export const demoChecklist = validateDraft(draft);
export function buildDemoCohort(clock: () => Date = () => new Date(DEMO_TIME)) {
  const now = clock();
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid demo clock");
  const date = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString();
  return cohort.cases.map((fixture) => {
    const materialize = (line: typeof fixture.chart[number]): ChartLine => {
      const { observedDays, ingestedDays, ...rest } = line;
      return { ...rest, observedAt: date(observedDays), ingestedAt: date(ingestedDays) };
    };
    const patient: Patient = patientSchema.parse({
      id: fixture.id, synthetic: true, diagnosis: fixture.diagnosis, clinician: fixture.clinician,
      nextVisit: date(fixture.nextVisitDays), revision: 1,
      chart: fixture.chart.map(materialize), outsideRecords: fixture.outsideRecords.map(materialize),
    });
    return { patient, scenario: fixture.scenario, expectedStatus: fixture.expectedStatus,
      expectedPendingVisitRules: fixture.expectedPendingVisitRules,
      proposals: screeningOutputSchema.parse({ results: fixture.proposedOutputs }).results };
  });
}
