import type { ChecklistDraft } from "./schemas/ai";

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
