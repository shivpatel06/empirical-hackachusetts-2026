# Empirical demo walkthrough

Empirical helps an oncology research coordinator move from a trial to an evidence-backed potential match, then prepare care-team outreach. All patients are synthetic. Every delivery in this build is simulated.

The default sample is LUMEN-1, a fictional immunotherapy study for stage IV lung cancer. Walter Hughes is ruled out on a cited pembrolizumab administration record. Historical S1900J records remain available separately.

## Start the app

Follow the repository setup instructions, then run `npm run db:migrate`, `npm run build` and `npm run start -- --hostname 127.0.0.1 --port 3100`. Migration 0004 adds saved investigations, tool steps, approval drafts and outreach cases without resetting previous screenings.

For a fresh, isolated rehearsal, use a **new** database path for every reset:

```sh
DATABASE_PATH=./data/rehearsal-1.db AI_MODE=fixture npm run setup
DATABASE_PATH=./data/rehearsal-1.db AI_MODE=fixture npm run start -- --hostname 127.0.0.1 --port 3103
```

The main workspace's **Workspace → Prepare sample walkthrough** creates an authored checklist draft while keeping patient and action history. It does not reset replied-to charts. Review and approve the draft before screening. Use a new database for a clean replay of the missing-records scenario.

## Show the full journey

1. **Trial and screening.** Approve the demo checklist and confirm synthetic local availability. For LUMEN-1, open Elena Rivera, who has outdated brain imaging and hemoglobin evidence.
2. **Agent investigation.** Choose **Live Luna** for a real Agents SDK run, or explicitly select **Sample run** for a no-cost rehearsal. Click **Investigate gaps**. The activity panel shows completed tool calls and their results as the server saves them; it does not display invented reasoning or animate a fake live run.
3. **Coordinator approval.** Review and separately approve both records-request drafts. Sends are simulated. The agent cannot approve or send its own drafts.
4. **Reply and re-screen.** Click **Receive records**. The two authored replies are appended to the chart, a new chart revision is saved, and that patient is automatically re-screened. Earlier actions become outdated.
5. **Review and outreach.** Expand evidence to inspect the new sources and remaining visit checks. Add a coordinator review note, choose a summary language and verify the potential match. The outreach agent prepares a physician note and patient-summary draft. Patient contact is locked.
6. **Approve and follow through.** Approve the physician note first. Record **Doctor agreed** with a source note; a generic **Doctor responded** is insufficient. Review the patient summary and choose **Approve patient contact** to record simulated delivery. Follow-up stages require human-entered notes through formal screening and enrollment; these outcomes are never inferred. Demo clock controls can generate due reminder drafts, which also need approval.
7. **Changed criteria.** Open the checklist and create a revision. Earlier actions are blocked until the new checklist is approved and new screening results exist. Arbitrary edits require live screening; fixture replay intentionally refuses unauthored clinical inputs. Existing registry import also preserves source snapshots and detects changed criteria.

## Live mode and cost boundaries

The default model for extraction, screening, gap investigation and outreach is `gpt-6-luna`. No automatic escalation to Astra or Sol is configured. A pinned model configuration can be deliberately changed on the server.

Gap investigation uses the OpenAI Agents SDK with up to six tool actions, a turn/time limit, and 2,000 output tokens per turn. Outreach uses an SDK evidence-read tool followed by structured drafting, at most three turns and 3,000 output tokens per turn. Provider retries are disabled. The UI allows at most one explicit retry of a failed run. Successful agent runs display token/request usage; failed-run usage may be unavailable. These are execution bounds, not a dollar spending cap.

Screening mode and agent mode are labeled separately. A fixture-screened synthetic case can be investigated by a real Luna agent. There is no silent fixture fallback on API failure. API quota exhaustion must be resolved before a live demonstration; the deterministic walkthrough remains usable.

## Verification and limitations

Run `npm test` and `npm run build`. The suite exercises the real SDK runner with deterministic model responses and tests the full fixture journey, stale approvals, duplicate clicks, late results, provider failures, citation checks and follow-up transitions. Mock/fixture success does not establish live Luna quality.

English, Spanish, Portuguese and Haitian Creole summaries are unvalidated drafts for care-team review. Clinical validation, real messaging, production authentication, deployment, autonomous nightly registry polling and a fresh full live Luna rehearsal remain outside this verified checkpoint. Reminder evaluation runs with the demo worker while the workspace is active; it is not an unattended scheduler.
