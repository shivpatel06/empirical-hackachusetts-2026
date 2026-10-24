# Trial Prescreening Agent design

Status: Implementation design authored by Codex and refined by Kiro for format and clarity. The architecture and product decisions originate from Codex; Kiro reformatted this document to the canonical Kiro design template and folded in review reconciliations. requirements.md defines the authoritative acceptance criteria and glossary. The original source-design.txt is preserved as historical context only; its earlier Bedrock/Claude four-agent architecture is superseded by the OpenAI + Next.js design described here and must not be reintroduced. Source wording such as "Built today" and day-in-the-life counts describes intended behavior, not completed work or measured timings.

## Overview

The Trial Prescreening Agent is a single Next.js/TypeScript application for a synthetic demo. A research coordinator at a community oncology program starts from a trial, approves its extracted screening rules, screens an authorized synthetic cohort, lets a bounded tool loop gather missing evidence, and reviews decisions and drafts in a typed inbox. AI reads evidence and proposes per-rule findings; deterministic code decides aggregate status and enforces every approval boundary. All patient data is synthetic and every outbound action is a clearly labeled simulated send.

The application runs as a persistent `next start` Node server (not serverless) so that SQLite, a background event worker, and server-sent updates all function in one process. React components render the coordinator interface; Next.js route handlers expose the API. A single process with a persisted events table and an in-process worker is sufficient for the demo; separate agent services, MCP, and a distributed queue are not required.

The AI provider is OpenAI, accessed with a single `OPENAI_API_KEY` held server-side. The agentic gap investigation uses the OpenAI Agents SDK (`@openai/agents`), whose `run()` executes the reason → tool → observe loop and emits traces. Criteria extraction and per-rule screening are single structured calls, not agent loops. Zod is the shared validation layer: the Agents SDK consumes Zod schemas for tool arguments and structured output, and the same schemas validate incoming API request bodies.

Three repeatable demo moments anchor the build: a gap investigation that selects real tools, an arriving result that triggers automatic re-screening, and a changed checklist that pauses results and re-screens the cohort after approval.

## Architecture

### Stack and process model

- Single Next.js/TypeScript app: React UI plus Next.js route handlers.
- Persistent `next start` Node server hosting SQLite, the event worker, and server-sent updates.
- SQLite for storage; Zod as the shared validation layer for tool arguments, structured model output, and API request bodies.
- OpenAI via `@openai/agents`: `run()` for gap investigation and bounded outreach drafting; structured single calls for extraction and per-rule screening.
- ClinicalTrials.gov API v2 adapter for trial data.

### Thin internal AI interface

All AI behavior sits behind a thin internal interface so feature code calls domain helpers rather than the SDK directly:

- `extract(trial): ChecklistDraft` — single structured call that produces atomic, uniquely identified rules.
- `screen(patient, checklistVersion): RuleOutput[]` — single structured call that returns proposed per-rule findings with citations.
- `runGapInvestigation(patientId, unresolvedRules): GapRunTrail` — bounded `run()` loop over patient-scoped tools.

Two implementations live behind this interface:

1. The real OpenAI adapter.
2. A clearly labeled deterministic fixture adapter for UI development, repeatable tests, and demo fallback during an outage.

The fixture adapter is NOT evidence of real agent behavior. The final agentic demo must include an actual model-selected tool run; if the model is unavailable, the limitation must be disclosed rather than presented as a real agent run.

### Scheduler durability (reconciled)

The demo uses an in-process scheduler with a persisted events table. Event processing is idempotent and crash-safe through deduplication keys, so a crash mid-run cannot repeat a chart insertion or a simulated delivery. Full cross-restart job resumption is explicitly deferred and is not a demo requirement; the persisted events table plus idempotent processing is sufficient (aligns with requirements R7.7 and the Deferred and future work section).

### Setup verification (reconciled)

Before integration code is written, the following must be verified against current official documentation:

- The `@openai/agents` structured-output mechanism used by the `extract` and `screen` single calls, and the current OpenAI model ID and SDK version.
- ClinicalTrials.gov API v2 response field names.

Do not hard-code assumed field names or structured-output shapes without this check.

### Model selection and Agents SDK implementation

The following implementation constraints are grounded in the current official `@openai/agents` (TypeScript) documentation verified during this review. They refine the existing OpenAI + Next.js design; the historical Bedrock/Claude architecture remains superseded, and the fixture adapter remains explicitly not evidence of real agent behavior.

- **Zod v4 dependency pin**: `@openai/agents` requires Zod v4 (not v3). The shared Zod validation layer described above (tool arguments, structured output, and API request bodies) must therefore be Zod v4. Record this as a hard setup constraint before any integration code is written.

- **Luna default (user decision, October 24; configured by Codex)**: Both `SCREENING_MODEL` (extraction and screening) and `GAP_MODEL` use `gpt-6-luna`. Setup probes only Luna and pins a successful result in the ignored `data/model-config.json`. It does not automatically fall back to Astra or Sol; another model requires a deliberate configuration change. Existing installations must update their pinned config and restart the server to clear its cached adapter.
  - Use fixture/mock tests for routine development. Live probes and smoke tests are billable and separate from the deterministic suite.
  - Prior Astra verification does not establish Luna extraction/screening quality. Full-trial Luna verification remains pending; model choice does not replace coordinator review or deterministic guardrails. Never present a fixture run as a live model run.

- **Structured calls vs agent loop split** (reinforcing the existing thin AI interface):
  - `extract(trial)` and `screen(patient, checklist)` are single structured calls, NOT agent loops. Implement each with a Zod v4 `outputType` schema and `maxTurns: 1` and no tools. The model only proposes per-rule findings; code decides everything after.
  - `runGapInvestigation` uses the Agents SDK `run()` loop, with the six patient-scoped tools defined via `tool({ parameters: zodSchema, execute })`.

- **Six-tool-action cap enforcement**: The SDK's `maxTurns` counts TURNS, and a single turn can execute multiple tool calls, so `maxTurns` is NOT a tool-call counter. The authoritative cap is a per-run counter held in the run context object that every tool increments; when it reaches six, further tool execution is refused and the backend synthesizes the forced `finish` summary of unresolved items. Set `maxTurns` as a generous backstop only (for example ~12) and set `resetToolChoice: true` to avoid tool-choice lock. The run result history provides the Activity trail.

### Boundaries

Model access and credentials stay behind the server. Patient data and model calls use synthetic records only; trial text is fetched publicly. Prefer one shared domain schema and explicit state transitions over multiple agents with overlapping permissions.

## Components and Interfaces

### Backend modules

- **Trials adapter**: fetch a trial by ID from ClinicalTrials.gov v2, retain the response snapshot, compute and compare criteria content hashes, and surface malformed or failed responses as recoverable errors.
- **Checklist extraction**: `extract` single structured call producing atomic rules with source sentence, qualifying polarity, category, evidence description, chart-checkability flag, AND/OR expression tree, and optional numeric and temporal constraints.
- **Screening**: `screen` single structured call that proposes per-rule findings with cited line IDs and quotes; feeds the guardrail.
- **Deterministic guardrails**: pure decision layer that validates output, completes missing rules, verifies citations and relevance, applies date and measurement checks, and computes aggregate status. Returns a decision and explanation; never mutates chart data.
- **Gap-agent runner**: `runGapInvestigation` bounded `run()` loop exposing only patient-scoped read tools and draft tools; validates arguments, enforces the six-tool-action cap in code, and writes the actual call/result trail.
- **Coordinator actions**: typed inbox actions with server-enforced, revision-bound approvals and atomic state transitions.
- **Outreach drafts and tracker**: physician note and patient summary drafts, reminder drafts, and the human-entered outcome tracker.
- **Scheduler / event worker**: in-process scheduler and worker over the persisted events table, routing scheduled and demo-triggered events through shared handlers.
- **Audit storage**: append-only audit log linking events, runs, actors, tools, actions, and artifacts.
- **Demo fixtures**: the six-case synthetic cohort and labeled deterministic adapter outputs.

### React views

Inbox, Worklist, Trials, Ruled-out archive, Activity, and a patient/trial evidence detail panel. Each view shows a discreet Sample workspace disclosure and the current integration mode (live AI vs sample), with accessible status text, keyboard navigation, and visible loading, empty, stale, and error states. Fictional names and readable document titles make the sample records approachable; original source metadata and exact chart text remain inspectable. Repeated synthetic/demo disclaimers in routine cards and drafts are unnecessary under the user's October 24 presentation refinement.

### Thin AI interface signatures

```ts
extract(trial: Trial): Promise<ChecklistDraft>
screen(patient: Patient, checklist: ChecklistVersion): Promise<RuleOutput[]>
runGapInvestigation(patientId: string, unresolvedRules: RuleRef[]): Promise<GapRunTrail>
```

The gap-investigation tools are `search_chart`, `get_latest`, `check_outside_records`, `draft_records_request`, `ask_coordinator`, and `finish`. `search_chart` and `get_latest` return existing dated line IDs; `check_outside_records` returns already stored synthetic outside records; a new reply becomes chart evidence only through a distinct ingestion event. Read and draft only — the agent never edits chart facts, sends messages, or changes status.

### API contracts

- `POST /trials` — add registry ID and local-open confirmation.
- `POST /checklists/:id/approve` — approve the expected version; a conflict returns a stale-state error.
- `POST /screen` — enqueue a selected trial/cohort; requires an approved current checklist.
- `GET /inbox` and `POST /inbox/:id/action` — typed action plus expected revision, validated server-side.
- `GET /worklist` and `GET /screenings/:patient/:trial` — evidence and versioned results.
- `POST /outreach/:id/stage` — a valid human outcome transition with reason.
- `POST /demo/reply` — append an explicitly synthetic result; rejected outside demo mode.
- `GET /activity` and `GET /stream` — audit query and server-sent updates.
- Demo-only controls for registry changes, next-day schedule, and stalled-step clock advance share the production event handlers. All demo mutation routes are guarded by demo mode.

## Data Models

### Stored contracts

- **trials**: registry ID, local-open confirmation, conditions, recruiting state, fetched timestamps, and criteria content hash.
- **checklist_versions**: draft/approved/superseded state, source snapshot, version, approval actor and time.
- **checklist_rules**: stable rule key, source sentence, normalized qualification rule, category, evidence description, AND/OR expression tree, chart-checkable flag, numeric constraint, and temporal constraint.
- **patients**: synthetic identity, diagnosis/histology, clinician, next visit, and chart revision.
- **chart_lines**: stable line ID, patient, original text, source, observed_at, ingested_at, record revision, and optional typed measurements (analyte, value, unit, reference range).
- **screenings**: patient/trial pair, input chart revision, checklist version, model/run ID, status, freshness, and timestamps.
- **rule_results**: raw AI output, validated result, evidence references, provenance check, semantic/temporal/numeric issues, and downgrade reason.
- **inbox_items** and **drafts**: type, subject IDs, content revision, pending/approved/rejected state, approval actor and time, governing chart/checklist versions, and a unique delivery key.
- **outreach**: patient/trial, stage, stage history, and terminal reason.
- **events**: type, schema version, deduplication key, input revisions, status, attempts, next-attempt time, and bounded error summary.
- **audit_log**: event/run, actor/tool, action, time, and linked artifact.

Avoid retaining provider secrets or unnecessary raw request payloads. A simple local demo actor is used; production identity is deferred.

### Database constraints

- Unique rules per checklist version.
- Unique finalized result per screening/rule pair.
- Valid foreign keys across all relations.
- Unique event and delivery keys for idempotent processing and delivery.
- Timestamps stored in UTC and rendered in the clinic's configured timezone (demo default America/New_York).
- An injectable clock drives all eligibility windows and demo scheduling.

### Screening boundary

Capture approved criteria plus the patient chart revision → validate model output → complete missing rules (set to unknown) → validate citations and relevance → apply date and measurement checks → compute aggregate status in code → atomically persist only if the captured chart and checklist revisions remain current.

A quote-match flag is provenance only and is not verification of clinical meaning. Support and conflict reasons are stored separately. A **verify-at-visit** rule is exactly a rule whose chart-checkability flag is false; it never blocks a `likely_match` and remains listed as pending through formal screening. Decision precedence: an independently supported applicable failure → `ruled_out`; an unsupported proposed failure or unresolved conflict → `needs_review`; any unresolved chart-checkable rule → `needs_info`; all chart-checkable rules supported as met → `likely_match` with verify-at-visit items pending. Stale-version results cannot drive new actions. Zero-rule extraction is an error/review condition, never a `likely_match`.

### Events and handlers

`TRIAL_ADDED`/`TRIAL_CHANGED` → draft checklist; `CHECKLIST_APPROVED` → cohort screening; `SCHEDULE_LOADED` → scheduled cohort; `CHART_UPDATED` → re-check affected pairs; `NEEDS_INFO` → bounded gap run; `REQUEST_APPROVED` → simulated dispatch; `REPLY_RECEIVED` → chart ingestion → `CHART_UPDATED`; `MATCH_VERIFIED` → outreach drafts; `DRAFT_APPROVED` → simulated delivery and tracker update; `STEP_STALLED` → reminder draft. A recruiting closure stops action and queues a coordinator closeout notice. Each handler commits its output and processed status together where possible; model-run loops are prevented with patient/trial/chart/checklist and unresolved-rule fingerprints.

### Demonstration fixtures (reconciled)

The demo uses one cached real oncology trial snapshot and a single shared synthetic cohort of six patients. The six fixtures map one-to-one to the six requirement scenarios: supported match, valid exclusion, stale labs/imaging, missing treatment history, conflicting/invalid citation, and unrelated cancer type. Requirements, design, and tasks all refer to this same cohort. Expected outcomes are hand-annotated before any model execution. Explicit measurements and units are used instead of "panel normal" to prove threshold checks. A hand-authored record is never claimed to be Synthea-generated; generation provenance is preserved if Synthea is actually used.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Completeness and unknown-fill

*For any* approved checklist version and any model screening output (including output that omits, duplicates, or malforms rule entries), the finalized result set SHALL contain exactly one result per rule in the version, with every omitted, invalid, or foreign rule entry resolved to `unknown`.

**Validates: Requirements 3.4, 3.5, 3.6**

### Property 2: Provenance verification

*For any* rule result that cites a chart line and quote, if the nonempty quote does not appear in the cited line of this patient's chart under the documented conservative normalization, the result SHALL NOT be treated as verified.

**Validates: Requirements 3.7, 3.8**

### Property 3: Stale or future evidence never qualifies

*For any* evidence whose applicable observation date is stale, future-dated, ambiguous, or conflicting relative to the rule's time window and the injectable clock, the system SHALL NOT silently qualify the patient on that evidence.

**Validates: Requirements 3.13, 3.14**

### Property 4: No evidence, no met

*For any* chart-checkable rule marked `met`, there SHALL exist verified supporting evidence for every required component of that rule.

**Validates: Requirements 3.10, 3.12**

### Property 5: Safe removal

*For any* proposed `not_met` that lacks independent verified support on current applicable evidence, the system SHALL NOT set the aggregate status to `ruled_out` and SHALL NOT silently exclude the patient; it SHALL route the case to `needs_review`.

**Validates: Requirements 3.9, 3.14, 3.17**

### Property 6: Aggregate status precedence

*For any* set of validated per-rule results, the computed aggregate status SHALL follow precedence: an independently supported applicable failure yields `ruled_out`; otherwise an unsupported proposed failure or unresolved conflict yields `needs_review`; otherwise any unresolved chart-checkable rule yields `needs_info`; otherwise all chart-checkable rules supported yields `likely_match`.

**Validates: Requirements 3.16, 3.17, 3.18, 3.19**

### Property 7: AI cannot set aggregate status

*For any* model output (including output carrying an adversarial aggregate-status field), the computed aggregate status SHALL depend only on code-validated per-rule evidence and SHALL ignore any model-proposed aggregate status.

**Validates: Requirements 3.23**

### Property 8: Verify-at-visit never blocks a likely_match

*For any* checklist containing rules whose chart-checkability flag is false, those rules SHALL NOT prevent a `likely_match` when all chart-checkable rules are supported as met, and SHALL remain listed as pending through formal screening.

**Validates: Requirements 3.19, 3.21**

### Property 9: Six-tool-action cap

*For any* gap-investigation run, regardless of how many tools the model attempts to call, the number of executed tool actions SHALL be at most six, and exhausting the budget without `finish` SHALL record a backend-enforced completion summary of unresolved items.

**Validates: Requirements 4.3, 4.4**

### Property 10: No re-screening self-loop

*For any* sequence of gap-investigation discoveries that resolve to the same relevant chart revision and evidence fingerprint, a new screening SHALL be triggered at most once per relevant chart revision, and duplicate discoveries SHALL NOT create a re-screening loop.

**Validates: Requirements 4.9, 4.10**

### Property 11: Approval bound to current revisions

*For any* approval and any subsequent state change, a simulated send SHALL occur only while the approval's bound draft, checklist, and chart revisions match current state; an edited, stale, or rejected draft SHALL NOT send under an old approval.

**Validates: Requirements 5.12, 5.13**

### Property 12: No duplicate simulated send

*For any* set of delivery events or coordinator clicks that share a delivery key (including duplicates produced by a crash or repeated clicking), at most one simulated send SHALL occur.

**Validates: Requirements 5.14, 7.3**

## Error Handling

- **Trial fetch**: an invalid trial ID, an unavailable ClinicalTrials.gov network, or missing criteria text each produces a recoverable error that preserves retry and does not register the trial or produce an approved checklist.
- **Model and tool failures**: a failed model call or tool call produces a recoverable task and never invents evidence; transient provider/network failures are retried with a cap, and exhausted events surface as visible failure states in Activity.
- **Stale-version rejection**: when a screening writes results, captured chart and checklist revisions are compared to current state; a late job is rejected rather than allowed to overwrite newer results.
- **Approval conflict**: approving an unexpected checklist version returns a stale-state error; approvals and their state transitions are atomic.
- **Crash safety**: deduplication keys prevent repeated chart insertion or simulated delivery after a crash mid-run.

## Testing Strategy

### Pure-function guardrail and property tests

The deterministic guardrail is tested with pure-function unit tests for specific examples and edge cases, plus generated property-based tests for the twelve correctness properties above. Use an established property-based testing library for TypeScript (for example fast-check); do not implement property testing from scratch. Each property test runs a minimum of 100 iterations and is tagged with a comment referencing its design property in the format **Feature: trial-prescreening, Property {number}: {property_text}**. Property tests cover completeness and unknown-fill, provenance, staleness, no-evidence-no-met, safe removal, status precedence, AI-cannot-set-status, verify-at-visit, the six-tool-action cap (driven through a mock adapter that always requests more tools), the no-self-loop fingerprint, approval-revision binding, and delivery-key idempotence.

### Integration tests

Cover the changed-checklist flow (pause/stale → approve → cohort re-screen), reply ingestion and automatic re-screen, stale-job rejection, revision-bound approvals, duplicate-event deduplication, and failure recovery. Trial registration error cases (invalid ID, network down, missing criteria) are integration tests with one to three representative responses. Scheduled triggers and demo controls are tested to share the same event handlers.

### Browser tests

Exercise the three demo moments (gap investigation with tool selection, arriving result with automatic re-screen, changed checklist with cohort re-screen), keyboard access across views, and evidence drill-down from a result to its cited chart lines and versions.

### Provider smoke tests

Keep provider smoke tests separate from deterministic tests. They verify real OpenAI access and a real model-selected tool run, record the adapter/model mode and actual outcomes (latency, fixture outcomes, coordinator corrections when measured), and are not mixed into the deterministic property or guardrail suites. The fixture adapter path is explicitly not evidence of real agent behavior.

## Implemented demo journey extension (October 24, Codex)

The persisted journey uses migration 0004 (`agent_runs`, `agent_steps`, `journey_items`, `outreach_cases`) and `/api/journey`. The worker saves tool-execution callbacks immediately; the UI polls server-owned state every two seconds. This replaces the proposed server-sent update transport for the single-process MVP. Successful gap runs retain model/response receipts and successful agent calls retain token usage. Provider failures stop visibly and require explicit retry.

After coordinator verification, a separate bounded Luna SDK agent calls `read_verified_case` and emits structured physician/summary drafts. It can read supported evidence but cannot send or record outcomes. Drafts require separate current-revision approvals; chart/checklist changes invalidate earlier actions. Simulated replies append evidence and queue only the affected patient. Authored fixture replies support Patient 03's two stale records; arbitrary inputs require live evaluation.

Follow-up outcomes require human notes and ordered transitions. Due reminder drafts are evaluated by the active worker and demo clock; autonomous nightly registry/schedule polling remains proposed. All delivery is simulated, all patient summaries are unvalidated care-team drafts, and fixture execution is not evidence of live model reasoning.
