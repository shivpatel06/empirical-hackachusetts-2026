import { isDeepStrictEqual } from "node:util";
import { buildDemoCohort, DEMO_TIME } from "../ai/fixtures";
import type { ChartLine, Patient } from "../../lib/schemas/ai";
/** Two explicit authored reply scenarios. Never manufacture a result from an arbitrary model request. */
export function demoReply(
  patientId: string,
  ruleId: string,
  revision: number,
): ChartLine | null {
  if (
    patientId !== "synthetic-03" ||
    !["hemoglobin", "brain_imaging"].includes(ruleId)
  )
    return null;
  const original = buildDemoCohort()[2]!.patient.chart.find(
    (l) => l.id === `${patientId}-${ruleId}`,
  )!;
  return {
    ...original,
    id: `${patientId}-reply-${ruleId}`,
    source: "Simulated outside-record reply · authored demo fixture",
    observedAt: DEMO_TIME,
    ingestedAt: DEMO_TIME,
    revision,
  };
}
export function fixtureWithReplies(patient: Patient) {
  const base = buildDemoCohort().find((c) => c.patient.id === patient.id);
  if (!base || patient.id !== "synthetic-03") return null;
  const extra = patient.chart.filter(
    (l) => !base.patient.chart.some((b) => b.id === l.id),
  );
  if (
    !extra.length ||
    extra.length > 2 ||
    patient.revision !== extra.length + 1
  )
    return null;
  const expected = structuredClone(base.patient);
  expected.revision = patient.revision;
  for (let i = 0; i < extra.length; i++) {
    const line = extra[i]!;
    const rule = line.id.replace(`${patient.id}-reply-`, "");
    const canonical = demoReply(patient.id, rule, i + 2);
    if (!canonical || !isDeepStrictEqual(canonical, line)) return null;
    expected.chart.push(canonical);
  }
  if (!isDeepStrictEqual(expected, patient)) return null;
  const proposals = structuredClone(base.proposals);
  for (const line of extra) {
    const output = proposals.find(
      (r) => line.id === `${patient.id}-reply-${r.ruleId}`,
    );
    if (output) {
      output.status = "met";
      output.citations = [{ lineId: line.id, quote: line.text }];
      output.explanation =
        "Authored synthetic reply supplies the current record.";
    }
  }
  return proposals;
}
