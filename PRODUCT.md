# Product

<!-- impeccable:product-schema 1 -->

## Platform
web

## Users
Community oncology research coordinators reviewing potential trial candidates.

## Product Purpose
Start with a locally open trial, review its criteria, screen synthetic patient charts, and inspect evidence and missing information before taking a coordinator action.

## Operating Context
The user approved a trial-first workflow and requested a usable interface alongside the remaining backend. The initial proof uses one public registry snapshot and six synthetic patients. This is a hackathon demonstration, not a clinical system.

## Capabilities and Constraints
Next.js, SQLite, Zod and OpenAI Agents SDK. Live and fixture modes must remain visibly distinct. AI proposes per-rule findings; code checks evidence and computes status. Local-open confirmation and checklist approval are required. No real patient imports, orders, messages, enrollment or efficacy claims.

## Evidence on Hand
See fixtures/trial-prescreening for the registry snapshot and hand-authored data. Requirements and implementation gates are in .kiro/specs/trial-prescreening. UI work must not imply pending features are complete.

## Product Principles
- Preserve evidence, dates, uncertainty and history.
- Keep approval close to the evidence it governs.
- Prefer one complete demonstration over disconnected features.
- Make the next coordinator action clear.

## Accessibility & Inclusion
Keyboard navigation, text labels for status, visible focus, responsive views, accessible empty and error states.
