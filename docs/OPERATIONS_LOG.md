# Operations Log

This file records dated changes that future AI assistants and maintainers may need to understand before modifying browser automation workflows.

Do not record secrets, cookies, tokens, full session configs, private browser profile data, sensitive screenshot contents, or account credentials.

## 2026-08-12 — Add step-level verification to image workflows

Changed:

- Added prompt-fill and verified-send checks to ChatGPT and Gemini workflows.
- Send acceptance now requires composer clearance plus a matching new user message.
- Added early browser-health and unsent-prompt checks during generation waits.
- Added a separate 30-second generation-start deadline and rejection detection before long completion waits.
- Added output image signature and byte-count validation.
- Added failed-run metadata and a local success/failure regression smoke test.
- Updated both installed-skill contracts and failure policies.
- Added at-most-two recovery retries followed by one structured Codex CLI escalation; unresolved escalation fails closed.
- Added `@openai/codex` as a repo development dependency because the Microsoft Store app binary is not directly executable from PowerShell on this machine.
- Windows CLI escalation uses `danger-full-access` after a verified `workspace-write` sandbox-helper initialization failure; it remains a single attempt and must return structured artifact verification.
- Added ChatGPT's observed `正在產生更細緻的圖片` progress wording to generation-start detection after a live false negative at 76% progress.
- Strengthened Codex CLI escalation after reviewing a timed-out live event log: the CLI found useful `data-turn` selector drift and began a rerun, but spent too much time on broad document reads and unrelated MCP startup warnings.
- Escalation now receives an attached browser screenshot plus structured DOM snapshot, ignores user MCP configuration, classifies the failure within 60 seconds, and prioritizes one clean fresh-chat image-mode rerun for healthy transient model failures.

Reason:

- A live ChatGPT run left the prompt in the composer while the runner waited nearly seven minutes for an image.
- Each inexpensive step check should fail close to the real cause instead of consuming the full downstream timeout.

Validation:

- `npm run check`
- `npm run smoke:step-verification`

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
