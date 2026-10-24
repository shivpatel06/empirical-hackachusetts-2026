import type { ChecklistDraft, ChartLine, Patient } from "../../lib/schemas/ai";
import type { CheckedRule } from "../../lib/workflow";

type Rule = ChecklistDraft["rules"][number];
type ConditionResult = NonNullable<CheckedRule["conditions"]>[number];
type Truth = ConditionResult["status"];
const normalize = (s: string) => s.replace(/\s+/g, " ").trim();

/** Only dimension-preserving, explicitly enumerated conversions. No guessed
 * analyte aliases, molecular weights, lab ranges, or numbers parsed from prose. */
export function convertUnit(
  value: number,
  from: string,
  to: string,
): number | null {
  if (!Number.isFinite(value)) return null;
  const supported = new Set([
    "g/L",
    "g/dL",
    "/uL",
    "x10^3/uL",
    "10^9/L",
    "x10^9/L",
    "mg/dL",
    "mmol/L",
    "umol/L",
    "U/L",
    "IU/L",
    "mL/min",
    "mL/min/1.73m2",
    "%",
    "1",
  ]);
  if (!supported.has(from) || !supported.has(to)) return null;
  if (from === to) return value;
  const units: Record<string, { dimension: string; scale: number }> = {
    "g/L": { dimension: "mass", scale: 1 },
    "g/dL": { dimension: "mass", scale: 10 },
    "/uL": { dimension: "count", scale: 1 },
    "x10^3/uL": { dimension: "count", scale: 1000 },
    "10^9/L": { dimension: "count", scale: 1000 },
    "x10^9/L": { dimension: "count", scale: 1000 },
  };
  const a = units[from],
    b = units[to];
  return a && b && a.dimension === b.dimension
    ? (value * a.scale) / b.scale
    : null;
}

function compare(value: number, operator: string, threshold: number): boolean {
  if (operator === ">") return value > threshold;
  if (operator === ">=") return value >= threshold;
  if (operator === "<") return value < threshold;
  if (operator === "<=") return value <= threshold;
  return value === threshold;
}

/** Three-valued logic: a missing OR branch is not a failed requirement, and a
 * single false OR branch cannot exclude. All leaves remain in the evidence trail. */
export function combine(operator: "all" | "any", values: Truth[]): Truth {
  if (operator === "all") {
    if (values.includes("not_met")) return "not_met";
    return values.every((v) => v === "met") ? "met" : "unknown";
  }
  if (values.includes("met")) return "met";
  return values.every((v) => v === "not_met") ? "not_met" : "unknown";
}

export function checkAtomicRule(
  patient: Patient,
  rule: Rule,
  cited: ChartLine[],
  base: CheckedRule,
  now: Date,
): CheckedRule {
  const conditions: ConditionResult[] = rule.assessment!.conditions.map(
    (policy) => {
      const result: ConditionResult = {
        nodeId: policy.nodeId,
        condition: rule.expression.nodes.find((n) => n.id === policy.nodeId)!
          .condition!,
        status: "unknown",
        review: false,
        reason: "No cited measurement supports this condition.",
        citations: [],
      };
      const uncertain = (reason: string, review = true): ConditionResult => ({
        ...result,
        reason,
        review,
      });
      const n = policy.numeric;
      if (!n)
        return uncertain(
          "This condition requires interpretation of the source and clinical evidence by the coordinator.",
        );
      // A relative registration/event date cannot be silently replaced by today.
      if (policy.temporal && policy.temporal.anchor !== "assessment")
        return uncertain(
          "The time window uses an unsupported event anchor. Confirm the event date and interpretation.",
        );
      const lines = cited.filter(
        (l) => l.measurement?.analyte.toLowerCase() === n.analyte.toLowerCase(),
      );
      result.citations = base.citations.filter((c) =>
        lines.some((l) => l.id === c.lineId),
      );
      if (!lines.length)
        return { ...result, review: base.proposedStatus === "not_met" };
      if (
        result.citations.some(
          (c) =>
            normalize(c.quote) !==
            normalize(lines.find((l) => l.id === c.lineId)!.text),
        )
      )
        return uncertain("A complete measurement statement is required.");
      const age = (line: ChartLine) => {
        const observed = Date.parse(line.observedAt),
          ingested = Date.parse(line.ingestedAt);
        if (
          !Number.isFinite(observed) ||
          !Number.isFinite(ingested) ||
          observed > now.getTime() ||
          ingested > now.getTime()
        )
          return "invalid";
        return policy.temporal &&
          now.getTime() - observed > policy.temporal.maxAgeDays * 86400000
          ? "stale"
          : "current";
      };
      if (lines.some((l) => age(l) === "invalid"))
        return uncertain("Evidence has an invalid or future timestamp.");
      const measure = (line: ChartLine): boolean | null => {
        const m = line.measurement!;
        const value = convertUnit(m.value, m.unit, n.unit);
        const upper =
          m.referenceUpper === null
            ? null
            : convertUnit(m.referenceUpper, m.unit, n.unit);
        if (
          value === null ||
          (n.usesReferenceUpper && (upper === null || upper <= 0))
        )
          return null;
        const threshold = n.value * (n.usesReferenceUpper ? upper! : 1);
        return Number.isFinite(threshold)
          ? compare(value, n.operator, threshold)
          : null;
      };
      if (lines.some((l) => age(l) === "stale"))
        return uncertain(
          "Cited observation is outside the approved time window. Obtain current evidence.",
          base.proposedStatus === "not_met" ||
            lines.some((l) => measure(l) === false),
        );
      const allCurrent = patient.chart.filter(
        (l) =>
          l.patientId === patient.id &&
          l.revision <= patient.revision &&
          l.measurement?.analyte.toLowerCase() === n.analyte.toLowerCase() &&
          age(l) === "current",
      );
      const values = allCurrent.map(measure);
      if (values.includes(null))
        return uncertain(
          "Units or a required reference range are unsupported or missing.",
        );
      if (values.includes(true) && values.includes(false))
        return uncertain(
          "Current measurements conflict across this threshold.",
        );
      const supported = lines.map(measure);
      if (supported.includes(null))
        return uncertain(
          "Units or a required reference range are unsupported or missing.",
        );
      const met = supported.every((v) => v === true);
      return {
        ...result,
        status: met ? "met" : "not_met",
        reason: `Current cited measurement ${met ? "meets" : "does not meet"} ${n.operator} ${n.value}${n.usesReferenceUpper ? " × upper reference limit" : ""} ${n.unit}.`,
      };
    },
  );
  const nodes = new Map(rule.expression.nodes.map((n) => [n.id, n]));
  const evaluate = (id: string): Truth => {
    const node = nodes.get(id)!;
    return node.operator === "condition"
      ? conditions.find((c) => c.nodeId === id)!.status
      : combine(node.operator, node.childIds.map(evaluate));
  };
  const status = evaluate(rule.expression.rootId);
  return {
    ...base,
    status,
    conditions,
    support: status === "unknown" ? "none" : "compound",
    review:
      (status !== "not_met" && base.proposedStatus === "not_met") ||
      (status === "unknown" && conditions.some((c) => c.review)),
    reason:
      status === "met" && base.proposedStatus === "not_met"
        ? "The model proposed a failure, but current measurements support the expression. Review this disagreement."
        : status === "met"
          ? "The approved AND/OR expression is supported by current cited measurements."
          : status === "not_met"
            ? "Current cited evidence fails the approved qualification expression."
            : "The expression remains unresolved. Inspect the individual conditions.",
  };
}
