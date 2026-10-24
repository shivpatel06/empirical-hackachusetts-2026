# Empirical UI integration

The coordinator interface is adapted from [waccabacca/empirical](https://github.com/waccabacca/empirical), revision `f679b9b45f819072e804094465f34659d0e3e34a`, at the user's direction on October 24, 2026.

Reused source: `BrandMark.tsx`, `SiteMenu.tsx`, `state/appearance.ts`, `styles/tokens.css`, `styles/app.css`, `styles/lists.css`, `views/case.css`, brand assets and font licenses. The overview, candidate and case compositions are adapted from the original views. Fonts are self-hosted through the original Fontsource families. Source is in `src/components/empirical/`; assets are in `public/brand/` and `public/licenses/`.

The Next.js home page uses the existing `/api/workflow` endpoint and SQLite records. It does not import the prototype's localStorage clinical store, regex screening engine, synthetic arrival catalog, timed investigation, or scripted messaging. Only appearance preferences are stored in the browser. Current results, errors, pending jobs, chart citations and the audit trail come from the backend. Stale findings are excluded from current status counts and the exclusion archive; a prior finding is never shown with a newer checklist's protocol quote.

The complete existing checklist import/edit/re-extract/approve workflow remains at `/criteria`, using the same backend and current concurrent changes. Inbox and Outreach currently disclose that their server workflows are unfinished; they do not perform simulated approvals or sends.

Integration was performed with Codex. This is not evidence of new Kiro implementation or clinical validation. Upstream authorship is retained; this document does not assert a license for the upstream application. Font license files accompany the font assets.
