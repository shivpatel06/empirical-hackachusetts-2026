# Requirements Document

Status: Prepared by Codex from the user-supplied system design on October 24, 2026, and refined by Kiro for format and clarity. The design direction and product decisions originate from Codex; Kiro reformatted the document to the canonical spec template and folded in review clarifications. Implementation has not started; all checkboxes in tasks.md begin unchecked. The original source-design.txt is preserved as historical context and retains the earlier Bedrock architecture.

## Introduction

Research coordinators at community oncology programs need to find potential candidates for trials their hospital has opened. This feature delivers a Trial Prescreening Agent that starts from a trial, screens an authorized synthetic cohort, gathers missing evidence through tools, and brings decisions and drafts to a coordinator for review. Patients benefit through potential access to research; enrollment gains and staff-time savings are hypotheses to evaluate, not claimed outcomes.

The intended track is Healthcare & Biotech. The selected build targets are a single Next.js/TypeScript application (React components with Next.js route handlers), SQLite for storage, Zod for shared validation, OpenAI accessed through the OpenAI Agents SDK (`@openai/agents`), and ClinicalTrials.gov API v2 for trial data. Criteria extraction and per-rule screening use structured single calls; gap investigation uses a bounded agent loop. The demo runs as a persistent `next start` Node server. Actual model access, the chosen trial fixture, and deployment remain to be verified. These are build targets, not working integrations.

The hackathon goals are to complete the trial-first workflow from an approved checklist to a coordinator-reviewed potential match; to show each chart-checkable result with evidence, dates, and explicit uncertainty; to show a real bounded tool-selection loop resolving or escalating missing information; to demonstrate automatic re-screening on new chart evidence and approved checklist changes; and to preserve approval boundaries, version history, and an inspectable audit trail.

Build priorities: P0 is the complete first slice (add and approve one trial, screen a seeded cohort, apply guardrails, run a genuine gap-tool loop, ingest a missing result, re-screen, review in the inbox, and enforce audit and approval). The remaining supplied capabilities (outreach drafts and languages, tracker, trial-change demo, and scheduled triggers) are implemented next and remain in scope; they are not claimed as delivered until their tasks pass. Future deployment work (real EHR/FHIR ingestion, real hospital messaging, authentication and multiple coordinators, accuracy and drop-off reporting, production data governance, and clinical validation) is out of scope for this demo. No real clinical use or autonomous enrollment is part of this demo.

The supplied impact figures from source-design.txt (approximately 7.5 hours per enrollment, two-thirds dead ends, 50-75% review-time reduction, and national staff-hour estimates) are unverified source claims. They are not presented as this project's results or as general benchmarks.

## Glossary

- **Coordinator**: A research coordinator at a community oncology program who reviews extracted criteria, approvals, candidates, and drafts. The coordinator is the only actor authorized to approve actions in this system.
- **Trial**: A clinical trial fetched from ClinicalTrials.gov and registered for local screening.
- **Checklist version**: An immutable, versioned set of extracted and coordinator-approved screening rules for one trial. Only an approved checklist version may drive actionable screening results.
- **Checklist rule**: An atomic, uniquely identified eligibility criterion with source sentence, qualifying polarity, category, evidence description, chart-checkability flag, and optional structured thresholds and time windows.
- **Chart line**: A single append-only entry in a synthetic patient chart, carrying a stable line ID, source, clinical observation date, ingestion date, record revision, and original text.
- **Chart revision**: A monotonic marker of a patient chart's state at the time a screening reads it, used to detect staleness and bind results to the evidence they were computed from.
- **Chart-checkable**: A property of a checklist rule indicating the rule can be determined from chart evidence. A rule whose chart-checkability flag is true is chart-checkable; a rule whose flag is false is not.
- **Verify-at-visit**: A checklist rule whose chart-checkability flag is false. Such a rule is deferred to formal screening at the patient visit. A verify-at-visit rule never blocks a likely_match and remains listed through formal screening.
- **likely_match**: An aggregate screening status meaning the patient is a potential prescreening candidate, not a confirmation of eligibility. All chart-checkable rules are supported; verify-at-visit items remain separately pending.
- **ruled_out**: An aggregate screening status set when at least one chart-checkable rule has an independently supported, relevant failure on current applicable evidence.
- **needs_review**: An aggregate screening status set when a proposed failure is unsupported or a conflict is unresolved, and no independently valid failure exists.
- **needs_info**: An aggregate screening status set when one or more chart-checkable rules remain unknown and no supported failure exists.
- **Gap investigation**: A bounded, AI-driven tool loop that attempts to resolve unknown chart-checkable rules by reading records and drafting requests or questions, without editing chart facts, sending messages, or changing status.
- **Tool action**: One invocation of a gap-investigation tool (search_chart, get_latest, check_outside_records, draft_records_request, ask_coordinator, or finish). Tool actions are counted and capped at six per gap-investigation run.
- **Simulated send**: A clearly labeled, non-real delivery of a request, question, note, summary, or reminder within the demo. No real email, SMS, test order, or hospital API call occurs. Every simulated send requires explicit coordinator approval.

## Requirements

### Requirement 1: Trial registration and approved criteria

**User Story:** As a coordinator, I want to add one locally open trial and approve its extracted rules, so that only reviewed criteria affect a cohort.

#### Acceptance Criteria

1. WHEN a coordinator submits a valid trial ID, THE System SHALL fetch and store the trial title, conditions, phase, recruiting status, criteria text, source URL, update date, fetched time, and content hash.
2. IF a submitted trial ID is invalid, THEN THE System SHALL display a recoverable error and SHALL NOT register the trial.
3. IF the ClinicalTrials.gov network is unavailable, THEN THE System SHALL display a recoverable error and SHALL preserve the ability to retry.
4. IF a fetched trial has missing criteria text, THEN THE System SHALL display a recoverable error and SHALL NOT produce an approved checklist.
5. THE System SHALL require the coordinator to separately confirm that the trial is open at the coordinator's program, independent of public recruiting status.
6. WHEN extracting criteria, THE System SHALL produce atomic, uniquely identified rules with original source sentence, qualifying polarity, category, evidence description, chart-checkability flag, and structured thresholds and time windows where supported.
7. WHEN a criterion expresses compound AND/OR logic, THE System SHALL retain that logic in the rule's expression tree.
8. WHEN extracting an exclusion criterion, THE System SHALL normalize the rule without reversing its meaning.
9. WHILE a checklist version is in draft state, THE System SHALL require coordinator review, edit, and approval before that version can drive screening.
10. WHEN a coordinator approves a checklist version, THE System SHALL store that version as immutable.
11. WHEN a trial publishes a new update date, THE System SHALL compare content and SHALL create a new draft only when a relevant change is detected.
12. WHILE a pending changed draft exists for a trial, THE System SHALL pause actionable results for that trial and SHALL display affected prior results as stale.
13. WHEN a coordinator approves a new checklist version, THE System SHALL invalidate earlier results and SHALL queue the relevant cohort for re-screening.
14. WHEN a coordinator approves a new checklist version, THE System SHALL NOT silently overwrite a previously approved version.

### Requirement 2: Synthetic records and cohort selection

**User Story:** As a coordinator, I want a clearly synthetic cohort with structured chart data, so that screening is demonstrable without real patient data.

#### Acceptance Criteria

1. THE System SHALL label every screen as using synthetic demo data.
2. THE System SHALL NOT import real patient data or connect to a hospital system in this version.
3. THE System SHALL store each patient with a stable ID, cancer type, clinician, next visit, and append-only chart lines.
4. THE System SHALL store each chart line with a stable line ID, record revision, source, clinical observation date, ingestion date, and original text.
5. THE System SHALL derive all demo dates from an injectable demo clock.
6. WHERE a chart line is a numeric measurement, THE System SHALL preserve analyte, value, unit, and reference range where available.
7. IF a measurement's unit is unknown or its reference range is missing, THEN THE System SHALL NOT infer the missing unit or reference range.
8. WHEN selecting a cohort for a trial, THE System SHALL apply a conservative code pre-filter for the trial's supported cancer types, including supported histology aliases.
9. IF a patient's diagnosis is unmapped or ambiguous, THEN THE System SHALL route the patient to review rather than silently excluding the patient.
10. THE System SHALL include demo fixtures containing both matching and clearly unrelated diagnoses.
11. THE System SHALL provide one synthetic fixture cohort of six cases comprising supported match, valid exclusion, stale labs/imaging, missing treatment history, conflicting or invalid citation, and unrelated cancer type, and requirements, design, and tasks SHALL refer to this same cohort.

### Requirement 3: Screening and deterministic guardrails

**User Story:** As a coordinator, I want screening decisions made by deterministic code over cited evidence, so that AI reads and proposes but code decides.

#### Acceptance Criteria

1. WHEN screening a patient, THE System SHALL reference the patient chart revision and the approved checklist version.
2. THE System SHALL treat patient chart text as data and SHALL NOT interpret chart text as tool instructions.
3. WHEN the model returns per-rule output, THE System SHALL require per-rule rule ID, a status of met, not_met, or unknown, cited line IDs, quotes, and an explanation.
4. THE System SHALL fill any missing rule with unknown.
5. IF model output contains an invalid, duplicate, or foreign rule ID, malformed structure, a foreign patient citation, an empty quote, or an unsupported status, THEN THE System SHALL reject that output element.
6. THE System SHALL produce exactly one final result per rule.
7. WHEN validating a citation, THE System SHALL verify the cited line exists in this patient's chart and that the nonempty quote matches under a documented conservative normalization that preserves numbers, comparison signs, negation, and units.
8. THE System SHALL treat quote matching as provenance verification only and SHALL NOT treat it as verification of clinical meaning.
9. IF a rule-to-evidence relationship is contradictory or unsupported, THEN THE System SHALL set the rule to unknown or route it to needs_review.
10. WHEN a chart-checkable rule is marked met, THE System SHALL require supporting evidence for that determination.
11. THE System SHALL NOT treat the absence of a medication from an incomplete list as evidence of no prior treatment, and SHALL require explicit sufficient history for such a determination.
12. WHEN a rule has multiple required components, THE System SHALL require evidence for every required component before marking the rule met.
13. WHEN making favorable or unfavorable determinations, THE System SHALL validate applicable observation dates, time windows, numeric units and operators, and reference ranges.
14. IF evidence is stale, future-dated, ambiguous, or conflicting, THEN THE System SHALL NOT silently qualify or exclude the patient on that evidence.
15. IF a numeric expression is unsupported, THEN THE System SHALL escalate the rule rather than inferring a value from an arbitrary number in a sentence.
16. WHEN at least one chart-checkable rule has a verified, relevant not_met on current applicable evidence, THE System SHALL set the aggregate status to ruled_out.
17. WHEN a proposed not_met is unsupported and no independently valid failure exists, THE System SHALL set the aggregate status to needs_review.
18. WHEN one or more chart-checkable rules remain unknown and no supported failure exists, THE System SHALL set the aggregate status to needs_info.
19. WHEN all chart-checkable rules are supported as met, THE System SHALL set the aggregate status to likely_match with verify-at-visit items separately pending.
20. IF a trial has zero chart-checkable rules or invalid criteria, THEN THE System SHALL NOT produce a likely_match.
21. THE System SHALL treat a rule as verify-at-visit exactly when its chart-checkability flag is false, SHALL NOT allow a verify-at-visit rule to block a likely_match, and SHALL keep verify-at-visit items listed through formal screening.
22. THE System SHALL treat likely_match as a potential prescreening candidate and SHALL NOT present it as eligibility confirmation.
23. THE System SHALL NOT allow the model to set or override the aggregate status.
24. WHEN a patient and trial pair is ruled out, THE System SHALL retain the pair in an auditable archive with evidence and SHALL make it re-screenable when the checklist or relevant chart information changes.
25. WHEN a chart update affects previously decided pairs, THE System SHALL re-check all affected pairs before any category routing optimization is applied.

### Requirement 4: Agentic gap investigation

**User Story:** As a coordinator, I want a bounded tool loop to resolve or escalate missing information, so that unknown results are investigated without inventing evidence.

#### Acceptance Criteria

1. WHEN a case is needs_info, THE System SHALL invoke an AI-selected sequence of the tools search_chart, get_latest, check_outside_records, draft_records_request, ask_coordinator, and finish.
2. THE System SHALL scope every tool to a single patient and SHALL validate every tool's arguments by code.
3. THE System SHALL allow at most six tool actions per gap-investigation run.
4. IF the agent exhausts the six-action budget without calling finish, THEN THE System SHALL record a backend-enforced completion summary listing unresolved items.
5. THE System SHALL bound repeated identical tool calls.
6. IF a tool call or model call fails, THEN THE System SHALL produce a recoverable task and SHALL NOT invent evidence.
7. WHEN the gap investigation runs, THE System SHALL record every actual tool choice, bounded arguments, result summary, and outcome in Activity.
8. THE System SHALL allow the agent to read records and draft requests or questions, and SHALL NOT allow the agent to edit chart facts, send messages, or change status.
9. WHEN newly discovered existing evidence is found, THE System SHALL trigger a new screening at most once per relevant chart revision.
10. THE System SHALL NOT allow duplicate discoveries to create a re-screening loop.
11. WHEN an external reply arrives, THE System SHALL require a distinct append-only chart ingestion event before re-screening.
12. THE System SHALL distinguish requesting existing outside records from proposing a new test.
13. WHERE the agent proposes a new test, THE System SHALL keep it as a draft for an authorized care-team decision, and demo approval SHALL only simulate the action.

### Requirement 5: Coordinator inbox and approvals

**User Story:** As a coordinator, I want a typed inbox with server-enforced approvals, so that I control every decision and no action bypasses review.

#### Acceptance Criteria

1. THE System SHALL support inbox items for likely match with verify, reject-with-reason, and snooze actions.
2. THE System SHALL support inbox items for needs review with confirm-ruled-out and keep-screening-with-reason actions.
3. THE System SHALL support inbox items for a request with approve, edit, and decline actions.
4. THE System SHALL support inbox items for a question with an answer-with-provenance action.
5. THE System SHALL support inbox items for a checklist with approve and edit actions.
6. THE System SHALL support inbox items for an outreach draft with approve and edit actions.
7. THE System SHALL display on each card the next visit, trial, version freshness, evidence, and pending visit checks.
8. THE System SHALL base urgency on upcoming visits and SHALL display missing visit dates explicitly.
9. THE System SHALL provide worklist, archive, and activity views.
10. WHEN a coordinator answer supplies chart evidence, THE System SHALL create a sourced chart line and event.
11. THE System SHALL treat general workflow comments as non-chart facts and SHALL NOT store them as chart evidence.
12. THE System SHALL enforce approval server-side, bound to the current draft revision, checklist, and chart revision where applicable.
13. IF a draft is edited, stale, or rejected, THEN THE System SHALL NOT allow a send using an old approval.
14. THE System SHALL NOT duplicate a send when a coordinator clicks repeatedly or a duplicate event occurs.

### Requirement 6: Outreach and follow-through

**User Story:** As a coordinator, I want reviewable outreach drafts and outcome tracking, so that I control all simulated sends and record real human outcomes.

#### Acceptance Criteria

1. WHEN a coordinator verifies a current match, THE System SHALL create a physician note and a patient summary as drafts.
2. THE System SHALL include in the physician note the cited findings, pending checks, next visit, and an ask to discuss the trial.
3. THE System SHALL write the patient summary in plain language targeting approximately a grade-six reading level, describing study participation, voluntary choice, and care-team questions.
4. WHERE translations are provided, THE System SHALL offer English, Spanish, Portuguese, and Haitian Creole as planned options and SHALL mark generated translations as unvalidated drafts for care-team review.
5. THE System SHALL simulate and visibly label all delivery.
6. THE System SHALL hand patient summaries to the care team and SHALL NOT automatically send a patient summary to a patient.
7. THE System SHALL require explicit coordinator approval for each external-facing simulated request or draft.
8. THE System SHALL track the stages doctor notified, doctor responded, discussed at visit, patient interested or declined, consent visit scheduled, consented, formal screening, and enrolled or screen failed, with terminal reasons including doctor decline and trial closure.
9. THE System SHALL require human-entered outcomes and SHALL NOT infer outcomes from AI text.
10. WHEN a physician has not replied after two business days, THE System SHALL create a reminder draft.
11. WHEN the day before a patient visit is reached, THE System SHALL create a reminder draft.
12. WHEN five days of patient interest pass without a scheduled consent visit, THE System SHALL create a reminder draft.
13. THE System SHALL require coordinator approval for any reminder that leaves the system.
14. THE System SHALL compute business-day and reminder timing using the clinic's configured timezone with a demo default of America/New_York, a Monday-through-Friday business-day calendar that excludes no holidays in the demo, timestamps stored in UTC, and the injectable demo clock, so the two-business-day and five-day windows are deterministic.
15. WHEN a trial closes or its recruiting status changes to not recruiting, THE System SHALL stop outreach and SHALL create a reviewable closeout reason without deleting history.

### Requirement 7: Events, reliability, and visibility

**User Story:** As a coordinator, I want an idempotent, auditable event pipeline, so that late or crashed jobs cannot corrupt results and every action is inspectable.

#### Acceptance Criteria

1. THE System SHALL persist events and audit entries for chart changes, checklist changes, model runs, tool actions, approvals, failures, and simulated delivery.
2. THE System SHALL process events idempotently with bounded retries and visible failure states.
3. IF a crash occurs mid-run, THEN THE System SHALL prevent repeated chart insertion or delivery through deduplication keys.
4. WHEN a screening writes results, THE System SHALL compare captured chart and checklist revisions to current state and SHALL NOT allow a late job to overwrite newer results.
5. THE System SHALL perform an approval and its state transition atomically.
6. THE System SHALL route scheduled trial checks, next-day clinic screening, new-chart and reply rechecks, and stalled-step checks through the same event handlers as the demo controls.
7. THE System SHALL run an in-process scheduler with a persisted events table as sufficient for the demo.
8. THE System SHALL keep patient and model calls on synthetic records only and SHALL fetch trial text publicly.
9. THE System SHALL keep credentials server-side and SHALL document environment variable names in .env.example.

## Open implementation decisions

- Engineering: choose and smoke-test an accessible OpenAI model using server-only configuration before expanding the UI.
- Engineering: verify the structured-output mechanism of `@openai/agents` (used by the extraction and screening single calls) and the ClinicalTrials.gov API v2 field names against current official documentation during setup, before integration code is written.
- Engineering: choose a deployment compatible with a persistent Node process and SQLite, or document a later database change.
- Product and engineering: select one authentic trial snapshot and the small synthetic fixture cohort described in Requirement 2.
- Care-team validation and translation quality are outside the hackathon proof. No real hospital access is assumed.

## Deferred and future work

- Full cross-restart job resumption is out of scope for the demo. The in-process scheduler with a persisted events table and idempotent processing is sufficient; durable job resumption after a process restart is deferred.
- Real EHR/FHIR ingestion, real hospital messaging, authentication and multiple coordinators, accuracy and drop-off reporting, production data governance, and clinical validation are future deployment work.

## Success and evidence

Required demo outcomes: three repeatable transitions (gap investigation, an arriving result, and a changed checklist); every displayed result linked to its stored versions; zero unapproved simulated sends; and all guardrail invariant tests passing. Record actual model latency, fixture outcomes, and coordinator corrections when measured. Deployment-level screening time savings, enrollment improvement, and clinical accuracy require separate evaluation and are not claimed by this demo.
