# KJP — CHANGELOG

Every entry is a shipped, verified change. The top entry MUST match `VERSION` in
`js/core.js` — QA100 fails if it does not, so nothing ships unnumbered.

## 2.0.0 — the versioning system
- `VERSION` constant, shown on the title (top-right) and stamped on the score card, so every bug report arrives with the build it happened on
- CHANGELOG.md is the ledger; a QA100 check enforces that the top entry matches VERSION
