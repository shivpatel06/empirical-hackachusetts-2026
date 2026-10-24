# Start the Trial Prescreening Agent build in Kiro

The user selected the supplied system design as the project spec. This package was prepared by Codex; no application implementation or Kiro spec review is claimed yet.

Read requirements.md for acceptance, design.md for architecture, tasks.md for ordered implementation and source-design.txt for the verbatim original. The original contains target behavior and unverified impact figures; requirements.md resolves implementation ambiguities without treating those claims as delivered results.

Paste this into Kiro with the project folder open:

```text
Read AGENTS.md, .kiro/steering/, and .kiro/specs/trial-prescreening/
requirements.md, design.md and tasks.md, plus the three local context docs.
Use the updated architecture: Next.js + TypeScript, SQLite, Zod and OpenAI
Agents SDK (@openai/agents). The original source-design.txt is historical.
Keep OpenAI calls server-side. Use structured single calls for extraction
and screening; use the Agents SDK loop only for gap investigation.
Begin with tasks 0.1–0.4 only. Review the spec, scaffold the runnable app,
add migrations/seed data, shared schemas, fixture/live provider modes,
and verify one structured OpenAI response and one scoped read-tool call.
Check current official SDK/API docs before coding integration details.
Use OPENAI_API_KEY from ignored server environment configuration; never
print it. If access is unavailable, finish the fixture path and report the
precise blocker. Do not describe fixture output as a live model run.
Completion gate: app starts, database migrates/seeds, health check works,
typecheck/tests pass, and actual live smoke-test results or blocker recorded.
Stop at that milestone and report commands, changed files and next task.
Keep trial-first scope, synthetic data, evidence, human approvals and the
six-tool-action application cap. Preserve others' changes. Log actual Kiro
contributions in .project-context/activity/ and update task checkboxes only
when verified. Keep private context/local loaders uncommitted. Do not
commit, push, deploy or send real messages during this first milestone.
```

Blocking runtime dependency: an accessible OpenAI model/API account for a real agent demo. Engineering can begin on schemas, fixtures, guardrails and UI using the explicitly labeled fixture adapter while provider access is resolved. Trial choice and deployment host can be resolved during their corresponding tasks.
