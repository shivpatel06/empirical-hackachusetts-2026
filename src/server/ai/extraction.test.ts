import { describe, it, expect } from "vitest";
import { expandExtraction, sourceBlocks } from "./extraction";
import { demoChecklist, demoTrial } from "./fixtures";
const transport = () => ({
  rules: demoChecklist.rules.map(
    ({ sourceQuote, numeric, temporal, assessment, ...rule }, index) => ({
      ...rule,
      sourceId: `source-${index + 1}`,
      expression: {
        ...rule.expression,
        nodes: rule.expression.nodes.map((node) => ({
          ...node,
          numeric: node.operator === "condition" ? numeric : null,
          temporal: node.operator === "condition" ? temporal : null,
        })),
      },
    }),
  ),
});
describe("lossless registry-source references", () => {
  it("retains all 42 source blocks and nested notes with exact server-owned text", () => {
    const blocks = sourceBlocks(demoTrial.criteriaText);
    expect(blocks).toHaveLength(42);
    const draft = expandExtraction(demoTrial.criteriaText, transport());
    draft.rules.forEach((rule, index) => {
      expect(rule.sourceQuote).toBe(blocks[index]!.text);
      expect(rule.sourceQuote).toContain(
        demoChecklist.rules[index]!.sourceQuote,
      );
      expect(
        rule.assessment!.conditions.every(
          (p) => p.sourceQuote === rule.sourceQuote,
        ),
      ).toBe(true);
    });
    expect(draft.rules.at(-1)!.sourceQuote).toContain("NOTE:");
  });
  it("rejects omitted and fabricated source IDs despite otherwise valid rules", () => {
    const raw = transport();
    raw.rules.pop();
    expect(() => expandExtraction(demoTrial.criteriaText, raw)).toThrow(
      /omitted/,
    );
    const fake = transport();
    fake.rules[0]!.sourceId = "source-secret";
    expect(() => expandExtraction(demoTrial.criteriaText, fake)).toThrow(
      /unknown source/,
    );
  });
  it("preserves nested alternatives and rejects numeric policies on logic nodes", () => {
    const raw = transport();
    const rule = raw.rules[0]!;
    const node = structuredClone(rule.expression.nodes[0]!);
    rule.expression = {
      rootId: "or",
      nodes: [
        {
          id: "or",
          operator: "any",
          childIds: ["a", "b"],
          condition: null,
          numeric: null,
          temporal: null,
        },
        { ...node, id: "a" },
        { ...node, id: "b" },
      ],
    };
    expect(
      expandExtraction(demoTrial.criteriaText, raw).rules[0]!.expression
        .nodes[0]!.operator,
    ).toBe("any");
    rule.expression.nodes[0]!.numeric = {
      analyte: "x",
      value: 1,
      operator: ">=",
      unit: "g/dL",
      usesReferenceUpper: false,
    };
    expect(() => expandExtraction(demoTrial.criteriaText, raw)).toThrow(
      /Only atomic/,
    );
  });
  it("handles unbulleted protocol text and refuses an empty source extraction", () => {
    expect(sourceBlocks("Inclusion Criteria:\n\nA\n\nB")).toEqual([
      { id: "source-1", text: "A" },
      { id: "source-2", text: "B" },
    ]);
    expect(() => expandExtraction("", { rules: [] })).toThrow();
  });
});
