# browser-automation-workflow

Reusable browser automation workflows for AI tools, built around logged-in sessions, prompt orchestration, and reliable UI state handling.

## Purpose

This repository is a shared foundation for browser-based AI workflows that depend on:

- already logged-in browser sessions
- CDP / Playwright automation
- prompt files stored as UTF-8 text
- repeatable UI interaction patterns
- screenshots and JSON logs for verification

It is intended to hold reusable patterns that can be shared across projects such as:

- AI image generation workflows
- NotebookLM research workflows
- Canva / ChatGPT workflow automation
- browser-driven content pipelines

## Scope

This repo focuses on the workflow layer, not product-specific business logic.

Examples of what belongs here:

- browser connection helpers
- session and page targeting
- formal workflow modules
- prompt-file execution patterns
- modal / overlay / iframe handling
- screenshot and metadata logging
- encoding-safe automation guidance

Examples of what should stay in project-specific repos:

- school website business logic
- lesson content
- presentation-specific prompts and assets
- product-specific output content

## Initial Structure

- `docs/`
  workflow docs, SOPs, and conventions
- `lib/`
  reusable formal modules
- `scripts/`
  reusable automation entry points and smoke tests
- `templates/`
  starter prompt files and metadata templates

## Quick Start

Install dependencies:

```powershell
npm install
```

Run the browser smoke test:

```powershell
npm run browser:smoke
```

Prepare a logged-in browser session through the CBS foundation dependency:

```powershell
npm run browser:init
```

Run the first formal Gemini image workflow module:

```powershell
npm run gemini:image-sequence -- -- --session-file .browser-sessions/gemini-chrome-9333.json --prompt-dir templates/gemini-sequence
```

Recommended order:

1. run `npm run browser:init`
2. log in to Gemini in the browser opened by the initializer
3. use the generated `.browser-sessions/...json` file
4. run `npm run gemini:image-sequence -- -- --session-file .browser-sessions\...json --prompt-dir templates/gemini-sequence`

## Design Principles

- Prefer UTF-8 prompt files over inline shell prompt strings.
- Prefer logged-in browser reuse over repeated auth automation.
- Always leave evidence: screenshots, JSON logs, or both.
- Treat UI state detection as a first-class concern.
- Build workflows that degrade gracefully when platform UI changes.

## CBS Foundation

Browser launch, persistent profile setup, remote debugging, manual login readiness, Playwright CDP verification, and reusable session config output live in the separate foundation package:

- `cbs-workflows`
- https://github.com/chianwu-hash/cbs-workflows

This repo consumes the session config produced by `cbs-workflows`.

## Gemini Module

This repo now exposes its first formal reusable module:

- `lib/gemini/session.js`
- `lib/gemini/drive-picker.js`
- `lib/gemini/image-workflow.js`

Together they provide:

- Gemini session control
- Gemini image workflow sequencing
- optional Google Drive reference insertion
- screenshot and JSON run logging
- browser session config reuse through `cbs-workflows`

See:

- [docs/modules.md](docs/modules.md)
- [docs/gemini-session.md](docs/gemini-session.md)
- [docs/gemini-image-workflow.md](docs/gemini-image-workflow.md)
