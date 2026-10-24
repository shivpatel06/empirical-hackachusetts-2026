# Empirical coordinator workspace

The user selected waccabacca/empirical as the UI source and confirmed integration into Hackachussets. That repository's visual system supersedes the earlier violet sidebar design. This is an Operate surface for oncology research coordinators inspecting a synthetic trial cohort alongside source evidence.

## System

- Graphite ink and a sea-glass accent on a pale cool canvas. Alternate slate and stone palettes preserve the same status semantics. Exact values live in `src/components/empirical/styles/tokens.css`.
- Floating glass top navigation, numbered modal menu, frosted white surfaces with layered shadows. No persistent sidebar on the primary workspace.
- Manrope headings, DM Sans interface/body and Instrument Serif for the Empirical wordmark only. Fonts are self-hosted; original licenses are in `public/licenses/`.
- Original 20px card / 26px panel radii and pill controls. Status is words plus a small dot. Focus is explicit; the menu traps focus, closes with Escape and restores focus. Respect reduced motion and reduced transparency.
- Overview pairs the candidate list with a workflow rail. The case workspace pairs criteria with evidence; narrower screens stack these surfaces. Source records retain dates, units, citation rejection and pending visit checks.

## Product truth and integration

SQLite and the typed workflow API own clinical/demo state. Only palette preferences use localStorage. All patient records remain synthetic. Live AI and fixture simulation are visibly distinguished. Outdated findings do not count as current matches or exclusions. Match verification, gap requests and outreach must not imply backend support until implemented.

The complete checklist editor remains at `/criteria`, with the Empirical fonts, palette and surface styling while retaining its existing rule-editing controls. Source provenance and integration limits are in `docs/empirical-ui.md`.
