import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { checkScreening } from "./guardrails";
import { combine, convertUnit } from "./atomic";
import {
  validateDraft,
  type ChecklistInput,
  type Patient,
  type ChartLine,
  type RuleOutput,
} from "../../lib/schemas/ai";
import { validateCriteriaSource } from "../../lib/criteria";
import { demoChecklist, demoTrial } from "../ai/fixtures";
const now = new Date("2026-10-24T12:00:00Z");
function input(operator: "all" | "any" = "all") {
  const checklist: ChecklistInput = {
    trialId: "NCT00000099",
    version: 1,
    state: "approved",
    rules: [
      {
        id: "organ_function",
        sourceQuote: "Hemoglobin >= 10 g/dL AND bilirubin <= 1.5 times ULN.",
        qualification: "Adequate organ function",
        polarity: "inclusion",
        category: "lab",
        evidenceDescription: "Dated laboratory measurements",
        chartCheckable: true,
        numeric: null,
        temporal: null,
        expression: {
          rootId: "root",
          nodes: [
            { id: "root", operator, childIds: ["hb", "bili"], condition: null },
            {
              id: "hb",
              operator: "condition",
              childIds: [],
              condition: "Hemoglobin >= 10 g/dL",
            },
            {
              id: "bili",
              operator: "condition",
              childIds: [],
              condition: "Bilirubin <= 1.5 times ULN",
            },
          ],
        },
        assessment: {
          semantics: "qualification",
          conditions: [
            {
              nodeId: "hb",
              sourceQuote: "Hemoglobin >= 10 g/dL",
              numeric: {
                analyte: "hemoglobin",
                operator: ">=",
                value: 10,
                unit: "g/dL",
                usesReferenceUpper: false,
              },
              temporal: { maxAgeDays: 28, anchor: "assessment" },
            },
            {
              nodeId: "bili",
              sourceQuote: "bilirubin <= 1.5 times ULN",
              numeric: {
                analyte: "bilirubin",
                operator: "<=",
                value: 1.5,
                unit: "mg/dL",
                usesReferenceUpper: true,
              },
              temporal: { maxAgeDays: 28, anchor: "assessment" },
            },
          ],
        },
      },
    ],
  };
  const make = (
    id: string,
    analyte: string,
    value: number,
    unit: string,
    upper: number | null,
  ): ChartLine => ({
    id,
    patientId: "p",
    text: `${analyte} ${value} ${unit}.`,
    source: "Synthetic lab",
    observedAt: "2026-10-23T12:00:00Z",
    ingestedAt: "2026-10-23T12:00:00Z",
    revision: 1,
    measurement: { analyte, value, unit, referenceUpper: upper },
  });
  const patient: Patient = {
    id: "p",
    synthetic: true,
    diagnosis: "Synthetic oncology case",
    clinician: "Demo",
    nextVisit: null,
    revision: 1,
    outsideRecords: [],
    chart: [
      make("h", "hemoglobin", 12, "g/dL", null),
      make("b", "bilirubin", 1.5, "mg/dL", 1),
    ],
  };
  const proposal = (): RuleOutput => ({
    ruleId: "organ_function",
    status: "met",
    explanation: "Model proposal",
    citations: patient.chart.map((l) => ({ lineId: l.id, quote: l.text })),
  });
  const run = (raw: RuleOutput[] = [proposal()]) =>
    checkScreening(patient, checklist, raw, now, "live");
  return { patient, checklist, proposal, run };
}
describe("atomic expression guardrails", () => {
  it("evaluates new-trial AND thresholds and ULN independently of model status", () => {
    const x = input();
    x.checklist.rules[0]!.assessment!.conditions[0]!.numeric!.analyte =
      "Hemoglobin";
    expect(x.run().status).toBe("likely_match");
    const p = x.proposal();
    p.status = "not_met";
    expect(x.run([p]).status).toBe("needs_review");
    x.patient.chart[1]!.measurement!.value = 1.51;
    expect(x.run().status).toBe("ruled_out");
    expect(x.run().rules[0]!.conditions?.map((c) => c.status)).toEqual([
      "met",
      "not_met",
    ]);
  });
  it("requires every AND component and does not flatten OR into mandatory rules", () => {
    const and = input();
    and.patient.chart.pop();
    expect(and.run().status).toBe("needs_info");
    const or = input("any");
    or.patient.chart.pop();
    expect(or.run().status).toBe("likely_match");
    or.patient.chart[0]!.measurement!.value = 8;
    expect(or.run().status).toBe("needs_info");
    const both = input("any");
    both.patient.chart[0]!.measurement!.value = 8;
    both.patient.chart[1]!.measurement!.value = 2;
    expect(both.run().status).toBe("ruled_out");
  });
  it("retains nested AND/OR and qualification polarity without double inversion", () => {
    const x = input();
    const rule = x.checklist.rules[0]!;
    rule.polarity = "exclusion"; // qualification already means absence of the exclusion
    expect(x.run().status).toBe("likely_match");
    rule.expression.nodes.push(
      {
        id: "outer",
        operator: "any",
        condition: null,
        childIds: ["root", "alternative"],
      },
      {
        id: "alternative",
        operator: "condition",
        childIds: [],
        condition: "Alternative clinical pathway",
      },
    );
    rule.expression.rootId = "outer";
    rule.assessment!.conditions.push({
      nodeId: "alternative",
      sourceQuote: rule.sourceQuote,
      numeric: null,
      temporal: null,
    });
    expect(x.run().status).toBe("likely_match");
    x.patient.chart[0]!.measurement!.value = 8;
    expect(x.run().status).toBe("needs_review");
  });
  it("requires reference ranges and supported units and detects uncited conflicts", () => {
    const x = input();
    x.patient.chart[1]!.measurement!.referenceUpper = null;
    expect(x.run().status).toBe("needs_review");
    x.patient.chart[1]!.measurement!.referenceUpper = 1;
    x.patient.chart[0]!.measurement!.unit = "unknown";
    expect(x.run().status).toBe("needs_review");
    x.patient.chart[0]!.measurement!.unit = "g/dL";
    const raw = x.proposal();
    const conflict = structuredClone(x.patient.chart[0]!);
    conflict.id = "conflict";
    conflict.measurement!.value = 8;
    x.patient.chart.push(conflict);
    expect(x.run([raw]).status).toBe("needs_review");
  });
  it("converts explicitly equivalent units without converting unrelated dimensions", () => {
    const x = input();
    x.patient.chart[0]!.measurement!.value = 120;
    x.patient.chart[0]!.measurement!.unit = "g/L";
    expect(x.run().status).toBe("likely_match");
    expect(convertUnit(1.5, "10^9/L", "/uL")).toBe(1500);
    expect(convertUnit(1, "g/dL", "mg/dL")).toBeNull();
    expect(convertUnit(1, "g/L", "10^9/L")).toBeNull();
    expect(convertUnit(1, "unknown", "unknown")).toBeNull();
  });
  it("uses observation date, includes boundary, and escalates stale adverse and future evidence", () => {
    const x = input();
    const line = x.patient.chart[0]!;
    line.observedAt = new Date(now.getTime() - 28 * 86400000).toISOString();
    expect(x.run().status).toBe("likely_match");
    line.observedAt = new Date(Date.parse(line.observedAt) - 1).toISOString();
    expect(x.run().status).toBe("needs_info");
    line.measurement!.value = 8;
    expect(x.run().status).toBe("needs_review");
    line.observedAt = new Date(now.getTime() + 1).toISOString();
    expect(x.run().status).toBe("needs_review");
    line.observedAt = now.toISOString();
    x.checklist.rules[0]!.assessment!.conditions[0]!.temporal!.anchor =
      "registration";
    expect(x.run().status).toBe("needs_review");
  });
  it("rejects fabricated, foreign, partial, missing and duplicate proposals", () => {
    const x = input();
    for (const change of [
      (p: RuleOutput) => (p.citations[0]!.quote = "fabricated"),
      (p: RuleOutput) => (p.citations[0]!.lineId = "other-patient"),
      (p: RuleOutput) => (p.citations[0]!.quote = "12"),
    ]) {
      const p = x.proposal();
      change(p);
      expect(x.run([p]).status).toBe("needs_review");
    }
    expect(x.run([]).status).toBe("needs_review");
    expect(x.run([x.proposal(), x.proposal()]).status).toBe("needs_review");
    const p = x.proposal();
    p.status = "not_met";
    p.citations = [];
    expect(x.run([p]).status).toBe("needs_review");
  });
  it("requires exactly one source-bound policy per condition and preserves historical schemas", () => {
    expect(validateDraft(demoChecklist)).toEqual(demoChecklist);
    const x = input();
    validateDraft(x.checklist.rules.length ? { rules: x.checklist.rules } : {});
    x.checklist.rules[0]!.assessment!.conditions.pop();
    expect(() => validateDraft({ rules: x.checklist.rules })).toThrow(
      /exactly one/,
    );
    const y = input();
    y.checklist.rules[0]!.assessment!.conditions[0]!.sourceQuote =
      "Invented threshold";
    expect(() => validateDraft({ rules: y.checklist.rules })).toThrow(
      /source quote/,
    );
  });
  it("preserves all source content, including exceptions, beyond quote presence alone", () => {
    expect(() =>
      validateCriteriaSource(demoTrial.criteriaText, demoChecklist.rules),
    ).not.toThrow();
    expect(() =>
      validateCriteriaSource(
        demoTrial.criteriaText + "\nException: additional consent required.",
        demoChecklist.rules,
      ),
    ).toThrow(/omitted/);
    expect(() =>
      validateCriteriaSource(
        demoTrial.criteriaText,
        demoChecklist.rules.slice(1),
      ),
    ).toThrow(/omitted/);
  });
});
describe("atomic properties (100 cases each)", () => {
  it("AND and OR obey three-valued truth tables", () =>
    fc.assert(
      fc.property(
        fc.array(
          fc.constantFrom("met", "not_met", "unknown") as fc.Arbitrary<
            "met" | "not_met" | "unknown"
          >,
          { minLength: 2, maxLength: 20 },
        ),
        (values) => {
          expect(combine("all", values) === "met").toBe(
            values.every((v) => v === "met"),
          );
          expect(combine("any", values) === "not_met").toBe(
            values.every((v) => v === "not_met"),
          );
          if (values.includes("met"))
            expect(combine("any", values)).toBe("met");
        },
      ),
      { numRuns: 100 },
    ));
  it("numeric boundaries use evidence, never the proposed status", () =>
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 200 }),
        fc.boolean(),
        (tenths, proposed) => {
          const x = input();
          x.patient.chart[0]!.measurement!.value = tenths / 10;
          const p = x.proposal();
          p.status = proposed ? "met" : "not_met";
          expect(x.run([p]).status).toBe(
            tenths >= 100
              ? proposed
                ? "likely_match"
                : "needs_review"
              : "ruled_out",
          );
        },
      ),
      { numRuns: 100 },
    ));
  it("fabricated citations cannot exclude even when the numeric data would fail", () =>
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (foreign) => {
        const x = input();
        x.patient.chart[0]!.measurement!.value = 8;
        const p = x.proposal();
        p.status = "not_met";
        p.citations[0]!.lineId = "foreign:" + foreign;
        expect(x.run([p]).status).toBe("needs_review");
      }),
      { numRuns: 100 },
    ));
});
