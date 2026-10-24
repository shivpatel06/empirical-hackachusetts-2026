# Traceability and verified integration facts

Status: Produced by Kiro for task 0.1 on October 24, 2026. The requirements and design were authored by Codex and refined by Kiro; this file maps them to planned modules and tests. Every module and test listed here is **planned, not implemented**. No application code exists yet.

## Requirement-to-module/test map

Module names come from design.md "Components and Interfaces". Test types come from design.md "Testing Strategy". P# refers to the numbered correctness properties in design.md.

| Req | Planned modules | Planned tests | Properties | Build task |
|-----|-----------------|---------------|------------|------------|
| R1 Trial registration and approved criteria | Trials adapter; Checklist extraction (`extract`); Coordinator actions (checklist approve/edit); Audit storage; Trials view | Integration: invalid ID (HTTP 400), unknown ID (HTTP 404), network down, missing criteria text; unit: zero-rule rejection, AND/OR expression-tree preservation, exclusion normalization, immutable approved version; integration: changed-criteria pause → approve → cohort re-screen; unchanged content creates no draft | none | 1.2, 3.3 |
| R2 Synthetic records and cohort selection | Demo fixtures (six-case cohort); data models `patients`, `chart_lines`; cohort pre-filter (in Screening); injectable clock | Unit: pre-filter with histology aliases, unmapped/ambiguous diagnosis routes to review, unknown unit/range not inferred; fixture check: six cases map to the six R2.11 scenarios; UI check: synthetic-data label on every view | none | 0.4, 1.1, 1.3 |
| R3 Screening and deterministic guardrails | Screening (`screen`); Deterministic guardrails; data models `screenings`, `rule_results`; Worklist, Archive, evidence detail views | Pure-function unit tests for every status branch, boundary dates, unsupported units, conflicts, negation, chart prompt injection; property tests P1–P8; integration: stale job cannot overwrite newer result | P1, P2, P3, P4, P5, P6, P7, P8 | 1.3, 1.4, 1.5 |
| R4 Agentic gap investigation | Gap-agent runner (`runGapInvestigation`, six patient-scoped tools); Scheduler / event worker (`NEEDS_INFO`, `REPLY_RECEIVED` → `CHART_UPDATED`); Audit storage; Activity view | Property tests P9 (driven by a fixture adapter that always requests more tools) and P10; unit: argument validation, repeated identical calls bounded, tool/model failure creates recoverable task; provider smoke test: one real model-selected tool run (kept separate) | P9, P10 | 0.3, 2.1, 2.3 |
| R5 Coordinator inbox and approvals | Coordinator actions; data models `inbox_items`, `drafts`; Inbox, Worklist, Archive, Activity views | Property tests P11, P12; integration: stale/unsupported action rejected, repeat approval cannot duplicate dispatch, coordinator answer creates sourced chart line, workflow comment is not chart evidence; browser: keyboard access, next-visit ordering, missing visit date shown | P11, P12 | 2.2, 3.5 |
| R6 Outreach and follow-through | Outreach drafts and tracker; data model `outreach`; Scheduler (`MATCH_VERIFIED`, `DRAFT_APPROVED`, `STEP_STALLED`) | Unit: valid/invalid stage transitions, human-entered outcomes only; simulated-clock tests for two business days, day before visit, five-day window (America/New_York, Mon–Fri, UTC storage); P11/P12 for draft delivery; integration: trial closure stops outreach and keeps history; translations labeled unvalidated | P11, P12 | 3.1, 3.2, 3.4 |
| R7 Events, reliability, and visibility | Scheduler / event worker; data model `events` (dedup key, attempts); Audit storage; Activity view; `.env.example` | Integration: duplicate-event dedup, bounded retries with visible failure state, crash mid-run cannot repeat chart insert or delivery, stale-revision write rejected, atomic approval + transition, scheduled triggers and demo controls share handlers; P12 | P12 | 1.1, 1.5, 3.4, 4.1 |

Every requirement maps to at least one module and one planned test. Every property P1–P12 maps to at least one requirement.

## ClinicalTrials.gov v2 field paths (verified)

Checked on October 24, 2026 against the live API, which reported `apiVersion` 2.0.5 and `dataTimestamp` 2026-10-23T09:00:04.

Sources:
- Official field metadata: [https://clinicaltrials.gov/api/v2/studies/metadata](https://clinicaltrials.gov/api/v2/studies/metadata) (field names, piece names, types)
- Official enum values: [https://clinicaltrials.gov/api/v2/studies/enums](https://clinicaltrials.gov/api/v2/studies/enums)
- OpenAPI spec: [https://clinicaltrials.gov/api/oas/v2](https://clinicaltrials.gov/api/oas/v2) (reachable, HTTP 200; not parsed in detail)
- API version: [https://clinicaltrials.gov/api/v2/version](https://clinicaltrials.gov/api/v2/version)
- Live sample: [https://clinicaltrials.gov/api/v2/studies/NCT04613596](https://clinicaltrials.gov/api/v2/studies/NCT04613596)
- Human docs: [https://clinicaltrials.gov/data-api/api](https://clinicaltrials.gov/data-api/api) (renders client-side; the fetch returned no readable content, so the JSON endpoints above are the verified sources)

Endpoint: `GET https://clinicaltrials.gov/api/v2/studies/{nctId}` returns one study object.

| R1.1 field | JSON path | Type (from metadata) | Observed in NCT04613596 |
|------------|-----------|----------------------|-------------------------|
| NCT ID | `protocolSection.identificationModule.nctId` | nct | `NCT04613596` |
| Brief title | `protocolSection.identificationModule.briefTitle` | text | present |
| Official title | `protocolSection.identificationModule.officialTitle` | text | present |
| Conditions | `protocolSection.conditionsModule.conditions` | text[] | 2 entries |
| Keywords (optional, may help pre-filter aliases) | `protocolSection.conditionsModule.keywords` | text[] | present |
| Phases | `protocolSection.designModule.phases` | Phase[] | `["PHASE2","PHASE3"]` |
| Study type | `protocolSection.designModule.studyType` | StudyType | `INTERVENTIONAL` |
| Recruiting status | `protocolSection.statusModule.overallStatus` | Status enum | `RECRUITING` |
| Eligibility criteria text | `protocolSection.eligibilityModule.eligibilityCriteria` | markup | Markdown-style text |
| Structured age/sex (optional) | `protocolSection.eligibilityModule.minimumAge`, `.maximumAge`, `.sex` | NormalizedTime, Sex | `18 Years`, `ALL` (no maximumAge) |
| Last update posted | `protocolSection.statusModule.lastUpdatePostDateStruct.date` | DateStruct | `2026-10-13` |
| Last update submitted | `protocolSection.statusModule.lastUpdateSubmitDate` | NormalizedDate | `2026-10-12` |
| Status verified | `protocolSection.statusModule.statusVerifiedDate` | PartialDate (`YYYY-MM`) | `2026-10` |
| Data version holder | `derivedSection.miscInfoModule.versionHolder` | NormalizedDate | `2026-10-23` |
| Source URL | not in the response; construct `https://clinicaltrials.gov/study/{nctId}` | — | — |

Enum values observed from `/studies/enums`:
- `overallStatus`: ACTIVE_NOT_RECRUITING, COMPLETED, ENROLLING_BY_INVITATION, NOT_YET_RECRUITING, RECRUITING, SUSPENDED, TERMINATED, WITHDRAWN, AVAILABLE, NO_LONGER_AVAILABLE, TEMPORARILY_NOT_AVAILABLE, APPROVED_FOR_MARKETING, WITHHELD, UNKNOWN.
- `phases`: NA, EARLY_PHASE1, PHASE1, PHASE2, PHASE3, PHASE4.

Observed error responses (relevant to R1.2):
- Well-formed but nonexistent ID (`NCT99999999`): HTTP 404, plain-text body `NCT number NCT99999999 not found`.
- Malformed ID (`NOTANID`): HTTP 400, plain-text body ``Parameter `nctId` has incorrect format``.
- Both bodies are plain text, not JSON. The adapter must check the status code before parsing.

Optional field filter: `?fields=NCTId,BriefTitle,OverallStatus,Phase,Condition,LastUpdatePostDate` (piece names from metadata) returned HTTP 200 with only those paths. The adapter may use it but should keep the full snapshot for R1.1 retention.

### Implementation notes from verification

- **Content hash input (R1.1, R1.11):** hash a canonical serialization of the screening-relevant fields only (`eligibilityCriteria`, `conditions`, `phases`, `overallStatus`, `minimumAge`, `maximumAge`, `sex`). Do not hash the whole response. `derivedSection.miscInfoModule.versionHolder` (`2026-10-23`) matched the date of the API's `dataTimestamp`, which suggests it tracks the registry data refresh rather than a change to this study; this is an inference from one sample and is unverified. Treating it as a change signal would create spurious drafts.
- **Change trigger (R1.11):** use `lastUpdatePostDateStruct.date` as the cheap "maybe changed" signal, then compare the content hash to decide whether to create a new draft.
- **Criteria text format:** `eligibilityCriteria` is Markdown-like with `Inclusion Criteria:` / `Exclusion Criteria:` headings, `*` bullets, and backslash-escaped symbols (for example `\>=50%`). Extraction must keep the original sentence for R1.6 and must not drop comparison signs when unescaping.
- **Recruiting status (R1.5, R6.15):** `overallStatus` is public status only. Local-open confirmation stays a separate coordinator input. A change away from `RECRUITING` should trigger the R6.15 closeout path.
- **Phases may be absent** for some study types (for example observational studies); treat a missing `phases` as an empty list, not an error.

## Kiro changes recorded for task 0.1

| Change | Reason |
|--------|--------|
| Added this traceability.md | Task 0.1 gate requires a recorded requirement-to-module/test map and verified v2 field names. |
| No edits to requirements.md, design.md, or tasks.md in this step | The earlier Kiro refinements (verify-at-visit R3.21, business-day/timezone R6.14, scheduler durability R7.7, fixture tie R2.11, model selection and Agents SDK subsection) already reconcile the identified ambiguities. They are logged in the local activity entries from the earlier refinement passes. |

Trial-first scope and explicit uncertainty are unchanged: the workflow still starts from one coordinator-approved trial, the fixture trial choice, OpenAI model access, and deployment remain unverified, and the sample study NCT04613596 was used only to verify field paths. It is not yet selected as the demo trial (task 0.4).
