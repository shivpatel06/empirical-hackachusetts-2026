# Synthetic trial-prescreening fixtures

Public trial: [NCT06116682 / S1900J](https://clinicaltrials.gov/study/NCT06116682), an expanded Lung-MAP treatment trial for advanced NSCLC with MET amplification. The saved registry response lists Massachusetts sites. This does **not** establish that a coordinator's hospital has opened the trial; local-open confirmation is still required and is false in the provenance record.

- `NCT06116682.json`: unchanged public API snapshot, serialized as JSON.
- `provenance.json`: retrieval time, source URLs, registry update date and SHA-256 hashes.
- `checklist-draft.json`: hand-authored fixture draft retaining all 42 top-level eligibility paragraphs and their nested notes. Each complete paragraph remains an opaque condition; this is not a clinically reviewed, atomic extraction. The live extractor supports explicit AND/OR nodes; decomposition and coordinator approval belong to task 1.2. No paragraph may be silently dropped when that work is done.
- `cohort.json`: six hand-authored synthetic cases, expected statuses, and deterministic model proposals. Authored by Codex before any model execution on this cohort. Not Synthea output, real patient records, or measured clinical accuracy.

| Case | Expected result after future guardrails | Deliberate condition |
| --- | --- | --- |
| synthetic-01 | likely_match, with visit checks pending | Supported chart evidence |
| synthetic-02 | ruled_out | Current hemoglobin 8.0 g/dL, below the published 10.0 threshold |
| synthetic-03 | needs_info | Hemoglobin and brain imaging are 60 days old; model proposals deliberately overlook staleness |
| synthetic-04 | needs_info | Complete treatment history missing from chart; existing synthetic outside records are discoverable |
| synthetic-05 | needs_review | Proposed failure cites another synthetic patient's hemoglobin |
| synthetic-06 | ruled_out by conservative pre-filter | Explicit unrelated colorectal primary |

These are expected outcomes for future screening-engine tests, not computed results. Consent, ctDNA agreement and the specimen-banking offer remain pending visit checks. Public eligibility text is not the full protocol; eligibility is not confirmed by these fixtures.

`buildDemoCohort(clock)` materializes all observation, ingestion and visit dates from one injectable date. Its default demo registration/assessment time is `2026-10-24T12:00:00Z`. The trial's 28-day lab and 42-day brain-imaging windows are preserved. Changing the clock shifts every relative fixture date. The demo assessment date substitutes for a hypothetical registration date only in tests; future real screening would need an actual registration anchor.

The fixture adapter only replays the exact known snapshot, checklist and chart. Edits fail explicitly instead of returning stale canned results. It never claims to have selected tools with AI, sent anything, or validated evidence.
