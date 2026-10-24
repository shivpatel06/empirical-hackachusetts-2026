# Hackachusetts 2026

Built for Hackachusetts powered by Kiro, October 24, 2026.

## Overview

Trial Prescreening Agent helps oncology research coordinators start with a trial, review screening criteria, and investigate missing evidence in a synthetic patient cohort. The local demo now supports checklist approval, persisted cohort screening, a patient worklist, evidence inspection, an exclusion archive, and an activity history.

## Features

- Next.js app with SQLite setup, environment validation and health endpoint.
- Server-side OpenAI structured extraction/screening adapters and a patient-scoped gap runner with a code-enforced six-tool budget.
- Explicit deterministic fixture mode, one public trial snapshot and six synthetic cases.
- ClinicalTrials.gov import by NCT ID, explicit extraction mode, immutable registry snapshots and trial selection.
- Versioned checklist editing and approval, deduplicated screening jobs, immutable chart lines and an append-only audit log.
- Citation, observation-date, numeric-unit, conflict and stale-version checks with inspectable patient findings.
- Empirical coordinator UI with Overview, Worklist, Archive, Activity, searchable candidates and a source-evidence workspace.
- Complete trial import, checklist editing and approval at `/criteria`. Inbox and Outreach disclose their unfinished backend integration.

The repeatable demo uses the seeded NCT06116682 snapshot. Registry import creates an unapproved draft using live structured extraction; unchanged imports preserve the existing checklist. New live extraction supplies atomic condition policies and reviewable AND/OR trees. Full-trial decomposition review, generalized clinical evidence interpretation, and the gap/inbox/reply workflow remain unfinished. Model outputs are proposals, not final eligibility decisions.

## Demo

Public deployment and demo video are pending. Run locally, then:

1. From **Overview**, choose **Review checklist** (or **Inspect trial criteria**) to open `/criteria` and inspect the 42 source-preserving demo criteria.
2. Confirm availability at the **synthetic demo program**, then choose **Approve & screen cohort**.
3. Return to **Empirical overview** and open **Worklist** from the top navigation or menu: Patient 01 is a potential match; 03 has stale evidence; 04 lacks treatment history; 05 has a rejected foreign citation.
4. Choose **View exclusion archive** (also available in the menu) for Patient 02 (hemoglobin below threshold) and 06 (unrelated cancer type).
5. Inspect **Activity**. Rechecking the same cohort does not duplicate jobs.

A fresh database starts with an unapproved checklist. Setup is idempotent and does not reset approvals. To rehearse from a fresh state without deleting your history, set `DATABASE_PATH` to a new local file, run setup, and restart the server.

## UI source

The interface is adapted from [waccabacca/empirical](https://github.com/waccabacca/empirical), preserving its floating navigation, palettes, fonts and evidence layout. This integration uses the existing server workflow and SQLite data. The original prototype's browser-only screening, timed agent simulations and messaging transitions are not used. See [integration provenance and boundaries](docs/empirical-ui.md). Integration work was performed with Codex; it adds no new Kiro implementation claim.

## Tech stack

Next.js, React, TypeScript, SQLite (`better-sqlite3`), Zod v4, OpenAI Agents SDK 0.21.0 Vitest and fast-check. The intended demo uses a persistent Node server.

## Getting started

### Setup (development)

Requires Node.js 22 or later (verified on Node 23.4.0). All data is synthetic.

```sh
npm ci                  # install from package-lock.json
cp .env.example .env    # then set OPENAI_API_KEY; the key is read server-side only
npm run setup           # apply SQLite migrations and seed (both safe to re-run)
npm run dev             # development server at http://localhost:3000
```

Production-style run (persistent Node server):

```sh
npm run build
npm run start           # PORT=3100 npm run start to choose a port
curl http://localhost:3000/api/health
```

`/api/health` reports database connectivity, the applied migration version, demo mode, and whether an OpenAI key is configured (as true/false, never the value).

Environment variables are documented in [`.env.example`](.env.example): `OPENAI_API_KEY`, `DATABASE_PATH` (default `./data/app.db`), `DEMO_MODE` (default `true`), `CLINIC_TIMEZONE` (default `America/New_York`).

### AI setup and explicit demo mode

`AI_MODE=fixture` is the default and is visibly labeled as a simulation. `AI_MODE=live` selects OpenAI; provider failures never silently switch modes. Choose extraction mode on the import form; each checklist retains its mode, which is shown throughout the workspace. Live screening is connected, but the verified browser screening walkthrough used fixture mode; it is not evidence of full-trial live AI accuracy.

```sh
npm run ai:probe   # real, billable structured-output probes + synthetic scoped-tool smoke
npm run ai:smoke   # real extraction/screening of three public criterion paragraphs + a synthetic chart
npm run ai:workflow-smoke # billable full registry import/extraction + six persisted synthetic screening jobs
```

The probe tries an ordered, documented model list, verifies access and pins the selected `SCREENING_MODEL` and `GAP_MODEL` in gitignored `data/model-config.json`. Delete that file or rerun the probe to select again after changing accounts. The server's `getAiAdapter()` probes lazily on first live use if no pin exists. Probe receipts stay in `data/`; only model IDs and safe diagnostics are printed. Neither command prints the API key. These commands use a POSIX shell; on other platforms, set Node's `--conditions=react-server` option when running the equivalent `tsx` script.

The successful initial probe selected `gpt-6-astra` for extraction/screening and `gpt-6-luna` for gap investigation. Availability can differ by account. [OpenAI's agent configuration docs](https://developers.openai.com/api/docs/guides/agents/define-agents) describe the structured-output/tool mechanism; installed SDK types are also checked by TypeScript.

The workflow smoke uses a separate in-memory database and explicit test-harness approval. It checks import, unapproved-screen rejection, approval deduplication, persisted live screening, result/version coverage and repeat-screen deduplication. It makes billable API calls and writes its outcome to ignored `data/ai-workflow-smoke.json`; it does not change the application database or establish clinical accuracy or human approval.

See [fixture provenance and expected cases](fixtures/trial-prescreening/README.md). `npm run setup` seeds the trial snapshot, unapproved checklist and six synthetic patients. Fixture assessment time is fixed at October 24, 2026 so the six scenarios remain repeatable. Audit entries use actual execution time.

Note: with npm 10.9.2, `npm install` without the lockfile crashes in npm's dependency resolver (`Cannot read properties of null (reading 'edgesOut')`). `npm ci` works. To re-resolve dependencies, use npm 11 (`npx npm@11 install`).

### Evidence policy and runtime limits

Historical demo rules retain their three reviewed numeric thresholds (ANC, hemoglobin, platelets). New atomic rules support deterministic AND/OR composition, numeric operators, explicit unit conversions, laboratory upper-reference-limit multiples and assessment-relative observation windows. Unsupported units, missing ranges, event-relative windows without an event date and conflicting measurements require review. Coordinators can inspect/edit the expression and per-condition policies before approval. Extraction and draft saves reject missing registry source text; source coverage does not establish semantic correctness. Other positive fixture findings require exact matches to a closed, hand-authored synthetic assertion catalog and unchanged rule definitions. Unrecognized assertions and rules require review. This is not a generalized clinical reasoning engine; live prose citations alone do not establish eligibility. Stale proposed failures require review, while stale proposed matches become missing information. Visit checks remain separately pending.

Editing a checklist changes its revision; approving locks it and queues the cohort. Creating a new draft makes previous results stale. Fixture replay intentionally rejects changed rules; use live mode for edited inputs, which may still require manual interpretation. Reimporting an NCT ID detects screening-relevant changes and creates an unapproved version while retaining old snapshots and results. Background registry-change detection is not implemented. Registry import failure, unchanged/changed content, source-quote validation and version races are covered by tests; arbitrary full-trial live extraction accuracy remains unverified.

Run one persistent Node process against the SQLite file. Jobs survive in the database; interrupted jobs are marked failed on restart and can be retried up to two attempts per input version. The UI polls the shared worker every two seconds; there is no distributed scheduler or SSE stream. Mutations require `DEMO_MODE=true` and a matching HTTP Origin/Host. Authentication, real patient ingestion and real communications are not implemented.

## Testing

```sh
npm run typecheck   # next typegen && tsc --noEmit
npm test            # vitest run
```

## Built with Kiro

Codex prepared the original spec from the selected design. Kiro refined the spec, verified registry field paths, added traceability and implemented the Next.js/SQLite/Zod scaffold (tasks 0.1–0.2). Codex then implemented the OpenAI/fixture adapters and synthetic fixture package (tasks 0.3–0.4), followed by the persisted screening slice, coordinator UI, registry import and guardrail/property tests. These later changes are Codex work, not Kiro implementation. Project artifacts live in [`.kiro/`](.kiro/). No clinical benefit or development-speed measurement is claimed.
