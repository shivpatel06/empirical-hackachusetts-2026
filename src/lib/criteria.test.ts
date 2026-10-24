import { describe, it, expect } from "vitest";
import { splitCondition, removeConditionBranch } from "./criteria";
import { validateDraft, type ChecklistDraft } from "./schemas/ai";
const rule: ChecklistDraft["rules"][number] = {
  id: "example",
  qualification: "A or B",
  polarity: "inclusion",
  sourceQuote: "A or B",
  category: "example",
  evidenceDescription: "Example evidence",
  chartCheckable: true,
  numeric: null,
  temporal: null,
  expression: {
    rootId: "root",
    nodes: [
      { id: "root", operator: "condition", childIds: [], condition: "A or B" },
    ],
  },
  assessment: {
    semantics: "qualification",
    conditions: [
      { nodeId: "root", sourceQuote: "A or B", numeric: null, temporal: null },
    ],
  },
};
describe("coordinator branch editing", () => {
  it("splits a leaf and preserves source policies without mutating the saved draft", () => {
    const split = splitCondition(rule, "root", "any", "test");
    validateDraft({ rules: [split] });
    expect(split.expression.nodes.find((n) => n.id === "root")).toMatchObject({
      operator: "any",
      childIds: ["root-test-1", "root-test-2"],
      condition: null,
    });
    expect(split.assessment!.conditions).toHaveLength(2);
    expect(rule.expression.nodes).toHaveLength(1);
    expect(() => splitCondition(split, "root", "all", "again")).toThrow();
  });
  it("prunes nested branches, collapses one-child groups and keeps every remaining node reachable", () => {
    const split = splitCondition(rule, "root", "any", "test");
    const nested = splitCondition(split, "root-test-1", "all", "nested");
    const removed = removeConditionBranch(nested, "root", "root-test-1");
    validateDraft({ rules: [removed] });
    expect(removed.expression.rootId).toBe("root-test-2");
    expect(removed.expression.nodes).toHaveLength(1);
    expect(removed.assessment!.conditions.map((p) => p.nodeId)).toEqual([
      "root-test-2",
    ]);
    const inner = removeConditionBranch(
      nested,
      "root-test-1",
      "root-test-1-nested-1",
    );
    validateDraft({ rules: [inner] });
    expect(
      inner.expression.nodes.find((n) => n.id === "root")!.childIds,
    ).toEqual(["root-test-1-nested-2", "root-test-2"]);
  });
});
