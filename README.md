# Empirical

**Matching patients to clinical research.**

Built for Hackachusetts 2026, powered by Kiro.

Empirical helps research teams identify patients who may qualify for clinical trials, resolve missing information, and coordinate the next steps toward participation. It compares patient records with study eligibility criteria and shows the evidence behind each potential match.

## What it does

- Imports trial criteria from ClinicalTrials.gov for coordinator review and approval.
- Screens a patient cohort and separates potential matches, exclusions, missing information, and cases needing review.
- Shows the chart excerpts and dates behind each finding.
- Investigates gaps, drafts records requests, and re-screens when new records arrive.
- Prepares physician notes and multilingual patient summaries. Patient contact requires recorded doctor agreement and separate coordinator approval.

The hackathon prototype uses fictional patient records and simulated communications. Prescreening supports clinical review; it does not determine final eligibility.

## Stack

Next.js · React · TypeScript · SQLite · OpenAI Agents SDK · Zod · ClinicalTrials.gov

## Run locally

Requires Node.js 22 or later.

```sh
npm ci
cp .env.example .env
npm run setup
npm run dev
```

Open [localhost:3000](http://localhost:3000). The included sample workflow runs without an API key. For live AI, set `OPENAI_API_KEY` in `.env`, run `npm run ai:probe`, and select live mode in the app. See [`.env.example`](.env.example) for configuration.

## Checks

```sh
npm run typecheck
npm test
npm run build
```

Tests use Vitest and fast-check to cover the workflow and evidence, versioning, and approval safeguards.
