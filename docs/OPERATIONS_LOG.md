# Operations Log

This file records dated changes that future AI assistants and maintainers may need to understand before modifying browser automation workflows.

Do not record secrets, cookies, tokens, full session configs, private browser profile data, sensitive screenshot contents, or account credentials.

## 2026-08-08 — Add repo-local AI memory layer

Changed:

- Added `AGENTS.md` and `CLAUDE.md`.
- Added `docs/PROJECT_MEMORY.md`.
- Added `docs/RUNBOOK.md`.
- Added this operations log.

Reason:

- `browser-automation-workflow` is reusable browser/CDP automation infrastructure used across ChatGPT, Gemini, and future AI browser workflows.
- Future AI sessions need clear boundaries around logged-in browser state, prompt encoding, CDP setup, UI drift, evidence artifacts, and smoke-test validation.

Validation:

- Docs-only change.
- No browser automation was run.
- No browser profile, cookie, session config, screenshot, or generated artifact was read or copied into memory docs.

Next-time warnings:

- Read the workflow skill and reference files before changing ChatGPT or Gemini behavior.
- Do not claim success from console text alone; validate artifacts and metadata.
- Do not store logged-in browser state or sensitive screenshots in memory.
