import type { ChecklistDraft } from "./schemas/ai";
type Rule = ChecklistDraft["rules"][number];

/** A standalone time predicate does not say which measurement it qualifies.
 * Find those predicates in jointly required branches without crossing an OR
 * into an independent alternative. The coordinator must bind applicability. */
export function detachedWindowsFor(rule: Rule, nodeId: string): string[] {
  const nodes = new Map(rule.expression.nodes.map((n) => [n.id, n]));
  const temporalLeaves = new Set(
    rule.assessment?.conditions
      .filter((p) => p.temporal && !p.numeric)
      .map((p) => p.nodeId),
  );
  const descendants = (id: string): string[] => {
    const node = nodes.get(id)!;
    return [id, ...node.childIds.flatMap(descendants)];
  };
  const result = new Set<string>();
  const walk = (id: string) => {
    const node = nodes.get(id)!;
    const branch = node.childIds.find((child) =>
      descendants(child).includes(nodeId),
    );
    if (!branch) return;
    if (node.operator === "all") {
      for (const child of node.childIds.filter((child) => child !== branch)) {
        for (const leaf of descendants(child))
          if (temporalLeaves.has(leaf)) result.add(leaf);
      }
    }
    walk(branch);
  };
  walk(rule.expression.rootId);
  return [...result];
}

export function splitCondition(
  rule: Rule,
  nodeId: string,
  operator: "all" | "any",
  suffix: string,
): Rule {
  const copy = structuredClone(rule),
    node = copy.expression.nodes.find((n) => n.id === nodeId);
  if (!node || node.operator !== "condition" || !copy.assessment)
    throw new Error("Select an atomic condition to split");
  const ids = [`${nodeId}-${suffix}-1`, `${nodeId}-${suffix}-2`];
  if (ids.some((id) => copy.expression.nodes.some((n) => n.id === id)))
    throw new Error("Condition ID already exists");
  const policy = copy.assessment.conditions.find((p) => p.nodeId === nodeId)!;
  copy.expression.nodes.push(...ids.map((id) => ({ ...node, id })));
  node.operator = operator;
  node.condition = null;
  node.childIds = ids;
  copy.assessment.conditions = copy.assessment.conditions
    .filter((p) => p.nodeId !== nodeId)
    .concat(ids.map((id) => ({ ...structuredClone(policy), nodeId: id })));
  return copy;
}

export function removeConditionBranch(
  rule: Rule,
  parentId: string,
  childId: string,
): Rule {
  const copy = structuredClone(rule),
    nodes = new Map(copy.expression.nodes.map((n) => [n.id, n])),
    parent = nodes.get(parentId);
  if (
    !parent ||
    parent.operator === "condition" ||
    !parent.childIds.includes(childId)
  )
    throw new Error("Branch not found");
  const removed = new Set<string>();
  const collect = (id: string) => {
    removed.add(id);
    nodes.get(id)!.childIds.forEach(collect);
  };
  collect(childId);
  parent.childIds = parent.childIds.filter((id) => id !== childId);
  if (parent.childIds.length === 1) {
    const replacement = parent.childIds[0]!;
    if (copy.expression.rootId === parentId)
      copy.expression.rootId = replacement;
    copy.expression.nodes.forEach((n) => {
      n.childIds = n.childIds.map((id) => (id === parentId ? replacement : id));
    });
    removed.add(parentId);
  }
  copy.expression.nodes = copy.expression.nodes.filter(
    (n) => !removed.has(n.id),
  );
  if (copy.assessment)
    copy.assessment.conditions = copy.assessment.conditions.filter(
      (p) => !removed.has(p.nodeId),
    );
  return copy;
}

const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
/** Mechanical coverage, not a semantic/clinical correctness assertion. Every
 * non-heading source character must be retained by at least one quoted rule. */
export function validateCriteriaSource(
  source: string,
  rules: ChecklistDraft["rules"],
): void {
  const text = normalize(source);
  const covered = new Uint8Array(text.length);
  for (const rule of rules) {
    const quote = normalize(rule.sourceQuote);
    if (!quote || !text.includes(quote))
      throw new Error("Rule source quote is absent from the registry criteria");
    let offset = text.indexOf(quote);
    while (offset !== -1) {
      covered.fill(1, offset, offset + quote.length);
      offset = text.indexOf(quote, offset + 1);
    }
  }
  // Only these registry section labels are exempt. Notes, exceptions and
  // subheadings otherwise remain source content and cannot silently disappear.
  for (const match of text.matchAll(/\b(?:Inclusion|Exclusion) Criteria\s*:/gi))
    covered.fill(1, match.index, match.index + match[0].length);
  let index = 0;
  for (const character of text) {
    if (!covered[index] && /[\p{L}\p{N}<>=%]/u.test(character))
      throw new Error(
        "Extraction omitted registry source text. Retain every criterion and exception before approval.",
      );
    index += character.length;
  }
}
