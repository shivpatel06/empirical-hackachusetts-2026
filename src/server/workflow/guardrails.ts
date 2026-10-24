import { isDeepStrictEqual } from "node:util";
import {
  ruleOutputSchema,
  type ChecklistInput,
  type Patient,
  type ChartLine,
  validateDraft,
} from "../../lib/schemas/ai";
import type { CheckedRule, ScreeningResult } from "../../lib/workflow";
import { demoChecklist, demoTrial } from "../ai/fixtures";
import { checkAtomicRule } from "./atomic";

const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
export function compare(
  value: number,
  operator: string,
  threshold: number,
): boolean {
  switch (operator) {
    case ">":
      return value > threshold;
    case ">=":
      return value >= threshold;
    case "<":
      return value < threshold;
    case "<=":
      return value <= threshold;
    case "=":
      return value === threshold;
    default:
      throw new Error("Unsupported comparison");
  }
}

/** Proposals never determine aggregate status. This demo has an explicit, narrow
 * synthetic assertion catalog; arbitrary prose does not become clinical truth. */
export function checkScreening(
  patient: Patient,
  checklist: ChecklistInput,
  raw: unknown[],
  now: Date,
  mode: "fixture" | "live",
): ScreeningResult {
  if (
    checklist.state !== "approved" ||
    !checklist.rules.length ||
    !Number.isFinite(now.getTime())
  )
    throw new Error("Approved nonempty checklist and valid clock required");
  validateDraft({ rules: checklist.rules });
  const parsed = raw.map((value) => ruleOutputSchema.safeParse(value));
  const unknownOutput = parsed.some(
    (p) => !p.success || !checklist.rules.some((r) => r.id === p.data.ruleId),
  );
  const rules: CheckedRule[] = checklist.rules.map((rule) => {
    const matches = parsed
      .filter((p) => p.success && p.data.ruleId === rule.id)
      .map((p) => p.data!);
    const proposal = matches[0];
    const base: CheckedRule = {
      ruleId: rule.id,
      status: "unknown",
      reason: "No supporting evidence supplied.",
      review: false,
      citations: proposal?.citations ?? [],
      proposedStatus: proposal?.status ?? null,
      provenanceVerified: false,
      support: "none",
    };
    if (!rule.chartCheckable)
      return {
        ...base,
        status: "pending",
        reason: "Coordinator must verify at the study visit.",
      };
    const uncertain = (reason: string, review = false): CheckedRule => ({
      ...base,
      reason,
      review,
    });
    if (matches.length !== 1)
      return uncertain(
        matches.length
          ? "Duplicate rule proposals require review."
          : "Rule was omitted from the response.",
        true,
      );
    if (!proposal!.citations.length)
      return uncertain(
        "No chart citation supports this finding.",
        proposal!.status !== "unknown",
      );
    const cited: ChartLine[] = [];
    for (const citation of proposal!.citations) {
      const line = patient.chart.find(
        (l) =>
          l.id === citation.lineId &&
          l.patientId === patient.id &&
          l.revision <= patient.revision,
      );
      if (
        !line ||
        !normalize(citation.quote) ||
        !normalize(line.text).includes(normalize(citation.quote))
      )
        return uncertain(
          "Citation rejected: missing, foreign, empty, or altered chart evidence.",
          true,
        );
      cited.push(line);
    }
    base.provenanceVerified = true;
    if (rule.assessment)
      return checkAtomicRule(patient, rule, cited, base, now);
    const current = (line: ChartLine) => {
      const observed = Date.parse(line.observedAt),
        ingested = Date.parse(line.ingestedAt);
      return (
        Number.isFinite(observed) &&
        Number.isFinite(ingested) &&
        observed <= now.getTime() &&
        ingested <= now.getTime() &&
        (!rule.temporal ||
          now.getTime() - observed <= rule.temporal.maxAgeDays * 86400000)
      );
    };
    if (
      cited.some(
        (line) =>
          Date.parse(line.observedAt) > now.getTime() ||
          Date.parse(line.ingestedAt) > now.getTime(),
      )
    )
      return uncertain(
        "Evidence has a future timestamp; verify the record.",
        true,
      );
    if (cited.some((line) => !current(line)))
      return uncertain(
        `Evidence is outside the ${rule.temporal?.maxAgeDays ?? "allowed"}-day window. A current record is needed.`,
        proposal!.status === "not_met",
      );
    // Scope the demo policy to an unchanged, hand-authored rule, not a model-created predicate.
    const canonical = demoChecklist.rules.find((r) => r.id === rule.id);
    const knownRule =
      checklist.trialId === demoTrial.id && isDeepStrictEqual(rule, canonical);
    if (!knownRule)
      return uncertain(
        "This rule needs a reviewed evidence policy before automated classification.",
        true,
      );
    if (rule.numeric) {
      const numeric = rule.numeric;
      const measure = (line: ChartLine): boolean | null => {
        const m = line.measurement;
        if (
          !m ||
          m.analyte !== numeric.analyte ||
          m.unit !== numeric.unit ||
          !Number.isFinite(m.value)
        )
          return null;
        if (
          numeric.usesReferenceUpper &&
          (!m.referenceUpper || m.referenceUpper <= 0)
        )
          return null;
        return compare(
          m.value,
          numeric.operator,
          numeric.value * (numeric.usesReferenceUpper ? m.referenceUpper! : 1),
        );
      };
      // Require the full measurement statement; a substring could omit a negation or unit.
      if (
        proposal!.citations.some(
          (c, i) => normalize(c.quote) !== normalize(cited[i]!.text),
        )
      )
        return uncertain("A complete measurement statement is required.", true);
      const values = cited.map(measure);
      if (values.some((v) => v === null))
        return uncertain(
          "Measurement, analyte, units, or reference range is unsupported.",
          true,
        );
      const chartValues = patient.chart
        .filter(
          (l) =>
            l.patientId === patient.id &&
            l.revision <= patient.revision &&
            current(l),
        )
        .map(measure)
        .filter((v) => v !== null);
      if (chartValues.includes(true) && chartValues.includes(false))
        return uncertain(
          "Current measurements conflict across the threshold; coordinator review is required.",
          true,
        );
      const met = values.every(Boolean);
      return {
        ...base,
        status: met ? "met" : "not_met",
        review: met && proposal!.status === "not_met",
        support: "numeric",
        reason:
          met && proposal!.status === "not_met"
            ? "The model proposed a failure, but current measurements meet the threshold. Review this disagreement."
            : `Verified measurement ${met ? "meets" : "does not meet"} ${numeric.operator} ${numeric.value} ${numeric.unit}.`,
      };
    }
    if (
      mode === "fixture" &&
      cited.every(
        (line) =>
          normalize(line.text) === normalize(canonical!.evidenceDescription),
      ) &&
      proposal!.citations.every(
        (c) => normalize(c.quote) === normalize(canonical!.evidenceDescription),
      ) &&
      proposal!.status === "met"
    ) {
      return {
        ...base,
        status: "met",
        support: "synthetic_assertion",
        reason:
          "Exact hand-authored demo assertion verified. Not a general clinical interpretation.",
      };
    }
    return uncertain(
      "Quoted text exists, but clinical support is not independently established.",
      true,
    );
  });
  const pendingVisit = rules
    .filter((r) => r.status === "pending")
    .map((r) => r.ruleId);
  const active = rules.filter((r) => r.status !== "pending");
  const failed = active.find((r) => r.status === "not_met");
  const unknownChartAssertion =
    mode === "fixture" &&
    patient.chart.some(
      (line) =>
        !line.measurement &&
        !demoChecklist.rules.some(
          (rule) =>
            normalize(rule.evidenceDescription) === normalize(line.text),
        ),
    );
  const review =
    unknownOutput ||
    unknownChartAssertion ||
    active.some((r) => r.review) ||
    !active.length;
  const missing = active.some((r) => r.status === "unknown");
  return {
    status: failed
      ? "ruled_out"
      : review
        ? "needs_review"
        : missing
          ? "needs_info"
          : "likely_match",
    reason: failed
      ? failed.reason
      : review
        ? "Evidence or response needs coordinator review."
        : missing
          ? "Current chart evidence is missing for one or more criteria."
          : "All chart-checkable demo criteria are supported. Visit checks remain pending.",
    rules,
    pendingVisit,
    evaluatedAt: now.toISOString(),
    prefilter: null,
  };
}

/** Deliberately narrow fixture pre-filter. Unknown diagnoses go to screening. */
export function prefilter(
  patient: Patient,
  checklist: ChecklistInput,
  now: Date,
): ScreeningResult | null {
  if (
    checklist.state !== "approved" ||
    !isDeepStrictEqual(
      checklist.rules.find((r) => r.id === "nsclc_met"),
      demoChecklist.rules.find((r) => r.id === "nsclc_met"),
    ) ||
    checklist.trialId !== demoTrial.id ||
    patient.diagnosis !== "metastatic colorectal adenocarcinoma"
  )
    return null;
  const line = patient.chart.find(
    (l) =>
      l.patientId === patient.id &&
      l.text ===
        "Pathology confirms metastatic colorectal adenocarcinoma. No lung primary; no NSCLC." &&
      l.revision <= patient.revision &&
      Date.parse(l.observedAt) <= now.getTime() &&
      Date.parse(l.ingestedAt) <= now.getTime(),
  );
  if (!line) return null;
  return {
    status: "ruled_out",
    reason:
      "Documented colorectal cancer is outside this NSCLC trial's disease scope.",
    rules: [
      {
        ruleId: "nsclc_met",
        status: "not_met",
        reason: "Explicit pathology documents colorectal cancer and no NSCLC.",
        review: false,
        citations: [{ lineId: line.id, quote: line.text }],
        proposedStatus: null,
        provenanceVerified: true,
        support: "synthetic_assertion",
      },
    ],
    pendingVisit: [],
    evaluatedAt: now.toISOString(),
    prefilter: "Disease-scope pre-filter; no AI call made.",
  };
}
