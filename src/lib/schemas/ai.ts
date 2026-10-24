import { z } from "zod";

export const measurementSchema = z.object({
  analyte: z.string(), value: z.number(), unit: z.string(),
  referenceUpper: z.number().nullable(),
}).strict();
export const chartLineSchema = z.object({
  id: z.string().min(1), patientId: z.string().min(1), text: z.string().min(1),
  source: z.string().min(1), observedAt: z.iso.datetime(), ingestedAt: z.iso.datetime(),
  revision: z.number().int().positive(), measurement: measurementSchema.nullable(),
}).strict();
export const patientSchema = z.object({
  id: z.string().min(1), synthetic: z.literal(true), diagnosis: z.string(),
  clinician: z.string(), nextVisit: z.iso.datetime().nullable(), revision: z.number().int().positive(),
  chart: z.array(chartLineSchema), outsideRecords: z.array(chartLineSchema),
}).strict().superRefine((patient, ctx) => {
  const ids = new Set<string>();
  for (const line of [...patient.chart, ...patient.outsideRecords]) {
    if (line.patientId !== patient.id || ids.has(line.id)) {
      ctx.addIssue({ code: "custom", message: "Foreign patient or duplicate chart line" });
    }
    ids.add(line.id);
  }
});
export const trialInputSchema = z.object({
  id: z.string().regex(/^NCT\d{8}$/), title: z.string(), criteriaText: z.string().min(1),
  sourceUrl: z.url(),
}).strict();

// Flat nodes encode an arbitrary AND/OR tree without recursive provider schemas.
// Nullable fields are required: OpenAI strict structured outputs disallow optional keys.
export const expressionNodeSchema = z.object({
  id: z.string(), operator: z.enum(["all", "any", "condition"]),
  childIds: z.array(z.string()), condition: z.string().nullable(),
}).strict();
export const checklistRuleSchema = z.object({
  id: z.string().min(1), sourceQuote: z.string().min(1), qualification: z.string(),
  polarity: z.enum(["inclusion", "exclusion"]), category: z.string(),
  evidenceDescription: z.string(), chartCheckable: z.boolean(),
  expression: z.object({ rootId: z.string(), nodes: z.array(expressionNodeSchema).min(1) }).strict(),
  numeric: z.object({
    analyte: z.string(), operator: z.enum([">", ">=", "<", "<=", "="]),
    value: z.number(), unit: z.string(), usesReferenceUpper: z.boolean(),
  }).strict().nullable(),
  temporal: z.object({ maxAgeDays: z.number().int().nonnegative(), anchor: z.string() }).strict().nullable(),
}).strict();
export const checklistDraftSchema = z.object({ rules: z.array(checklistRuleSchema).min(1) }).strict();
export const checklistInputSchema = checklistDraftSchema.extend({
  trialId: z.string(), version: z.number().int().positive(), state: z.literal("approved"),
}).strict();
export const ruleOutputSchema = z.object({
  ruleId: z.string(), status: z.enum(["met", "not_met", "unknown"]),
  citations: z.array(z.object({ lineId: z.string(), quote: z.string() }).strict()),
  explanation: z.string(),
}).strict();
// No aggregate status field. These are proposals, never validated eligibility decisions.
export const screeningOutputSchema = z.object({ results: z.array(ruleOutputSchema) }).strict();

export type Patient = z.infer<typeof patientSchema>;
export type ChartLine = z.infer<typeof chartLineSchema>;
export type TrialInput = z.infer<typeof trialInputSchema>;
export type ChecklistDraft = z.infer<typeof checklistDraftSchema>;
export type ChecklistInput = z.infer<typeof checklistInputSchema>;
export type RuleOutput = z.infer<typeof ruleOutputSchema>;

export function validateDraft(draft: unknown): ChecklistDraft {
  const result = checklistDraftSchema.parse(draft);
  const ids = new Set<string>();
  for (const rule of result.rules) {
    if (ids.has(rule.id)) throw new Error("Duplicate checklist rule ID");
    ids.add(rule.id);
    const nodes = new Map(rule.expression.nodes.map((node) => [node.id, node]));
    if (nodes.size !== rule.expression.nodes.length) throw new Error("Duplicate expression node");
    const seen = new Set<string>();
    const visit = (id: string) => {
      const node = nodes.get(id);
      if (!node || seen.has(id)) throw new Error("Invalid expression tree");
      seen.add(id);
      if (node.operator === "condition") {
        if (!node.condition?.trim() || node.childIds.length) throw new Error("Invalid condition node");
      } else {
        if (node.childIds.length < 2 || node.condition !== null) throw new Error("Invalid logic node");
        node.childIds.forEach(visit);
      }
    };
    visit(rule.expression.rootId);
    if (seen.size !== nodes.size) throw new Error("Unreachable expression node");
  }
  return result;
}
