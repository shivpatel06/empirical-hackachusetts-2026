import type { AiAdapter } from "../ai/contracts";
import type { WorkflowStore } from "../workflow/store";
import { WorkflowError } from "../workflow/store";
import { fetchTrial, validateNctId, type RegistryTrial } from "./registry";
import { validateDraft } from "../../lib/schemas/ai";
import { validateCriteriaSource } from "../../lib/criteria";

export async function importTrial(
  store: WorkflowStore,
  id: string,
  mode: "fixture" | "live",
  adapter: () => Promise<AiAdapter>,
  fetcher: typeof fetch = fetch,
  reextract?: { id: number; revision: number },
) {
  id = validateNctId(id);
  if (reextract) {
    const current = store.latestChecklist(id);
    if (
      !current ||
      current.id !== reextract.id ||
      current.revision !== reextract.revision
    )
      throw new WorkflowError(
        "Checklist changed. Refresh before re-extracting criteria.",
      );
  }
  const captured = store.importRevision(id);
  const trial = await fetchTrial(id, fetcher, store.clock);
  if (!reextract && store.registryUnchanged(trial))
    return store.persistImport(trial, null, mode, captured);
  let draft;
  try {
    const ai = await adapter();
    if (ai.mode !== mode) throw new Error("Mode mismatch");
    draft = validateDraft(
      await ai.extract({
        id: trial.id,
        title: trial.title,
        sourceUrl: trial.sourceUrl,
        criteriaText: trial.criteriaText,
      }),
    );
  } catch {
    throw new WorkflowError(
      mode === "fixture"
        ? "This registry snapshot has no fixture extraction. Choose Live AI to import and extract this trial."
        : "Criteria extraction failed. No trial or draft was replaced. Check AI configuration and retry.",
      502,
    );
  }
  validateSourceQuotes(trial, draft.rules);
  try {
    validateCriteriaSource(trial.criteriaText, draft.rules);
  } catch {
    throw new WorkflowError(
      "Extraction omitted registry source text. Nothing was imported; review or retry extraction.",
      422,
    );
  }
  return store.persistImport(trial, draft, mode, captured, Boolean(reextract));
}
export function validateSourceQuotes(
  trial: Pick<RegistryTrial, "criteriaText">,
  rules: { sourceQuote: string }[],
) {
  const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
  if (
    !rules.length ||
    rules.some(
      (rule) =>
        !normalize(rule.sourceQuote) ||
        !normalize(trial.criteriaText).includes(normalize(rule.sourceQuote)),
    )
  )
    throw new WorkflowError(
      "An extracted rule is missing its exact registry source. Nothing was imported.",
      422,
    );
}
