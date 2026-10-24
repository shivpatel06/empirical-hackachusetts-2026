import { z } from "zod";
import {
  numericPolicySchema,
  temporalPolicySchema,
  validateDraft,
  type ChecklistDraft,
} from "../../lib/schemas/ai";
import { validateCriteriaSource } from "../../lib/criteria";

export interface SourceBlock {
  id: string;
  text: string;
}
/** Transport compression only: exact source remains authoritative and every
 * block must be represented. Nested bullet notes stay with their parent. */
export function sourceBlocks(text: string): SourceBlock[] {
  const bulletBlocks = text.split(/\n(?=(?:[*•-] |\d+[.)] ))/);
  const chunks =
    bulletBlocks.length > 1 ? bulletBlocks : text.split(/\n[ \t]*\n(?=\S)/);
  return chunks
    .map((s) => s.trim())
    .filter((s) => s && !/^(?:Inclusion|Exclusion) Criteria\s*:\s*$/i.test(s))
    .map((text, i) => ({ id: `source-${i + 1}`, text }));
}
// Source references avoid copying the same long registry paragraphs into every
// leaf. They are expanded server-side before shared domain validation/storage.
export const extractionTransportSchema = z
  .object({
    rules: z
      .array(
        z
          .object({
            id: z.string().min(1),
            sourceId: z.string().min(1),
            qualification: z.string(),
            polarity: z.enum(["inclusion", "exclusion"]),
            category: z.string(),
            evidenceDescription: z.string(),
            chartCheckable: z.boolean(),
            expression: z
              .object({
                rootId: z.string(),
                nodes: z
                  .array(
                    z
                      .object({
                        id: z.string(),
                        operator: z.enum(["all", "any", "condition"]),
                        childIds: z.array(z.string()),
                        condition: z.string().nullable(),
                        numeric: numericPolicySchema.nullable(),
                        temporal: temporalPolicySchema.nullable(),
                      })
                      .strict(),
                  )
                  .min(1),
              })
              .strict(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export function expandExtraction(source: string, raw: unknown): ChecklistDraft {
  const transport = extractionTransportSchema.parse(raw),
    blocks = new Map(sourceBlocks(source).map((b) => [b.id, b.text]));
  const used = new Set<string>();
  const rules = transport.rules.map(({ sourceId, expression, ...rule }) => {
    const quote = blocks.get(sourceId);
    if (!quote)
      throw new Error("Extraction references an unknown source block");
    used.add(sourceId);
    if (
      expression.nodes.some(
        (n) => n.operator !== "condition" && (n.numeric || n.temporal),
      )
    )
      throw new Error("Only atomic conditions can have evidence policies");
    return {
      ...rule,
      sourceQuote: quote,
      numeric: null,
      temporal: null,
      expression: {
        rootId: expression.rootId,
        nodes: expression.nodes.map(({ numeric, temporal, ...node }) => node),
      },
      assessment: {
        semantics: "qualification" as const,
        conditions: expression.nodes
          .filter((n) => n.operator === "condition")
          .map((n) => ({
            nodeId: n.id,
            sourceQuote: quote,
            numeric: n.numeric,
            temporal: n.temporal,
          })),
      },
    };
  });
  if (used.size !== blocks.size)
    throw new Error("Extraction omitted a registry source block");
  const draft = validateDraft({ rules });
  validateCriteriaSource(source, draft.rules);
  return draft;
}
