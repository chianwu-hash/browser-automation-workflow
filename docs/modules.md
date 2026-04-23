# Formal Modules

## Foundation Dependency: cbs-workflows

Browser session initialization now lives in the separate `cbs-workflows` repo:

- local sibling repo: `..\cbs-workflows`
- remote repo: `https://github.com/chianwu-hash/cbs-workflows`

Purpose:

- choose or receive a remote debugging port
- find a free port when needed
- create or reuse a persistent browser profile / user data dir
- launch Chrome, Edge, or Chromium with remote debugging enabled
- prompt the operator to log in manually
- verify Playwright can connect through CDP
- write a reusable local session config

This repository consumes the generated session config file and uses its `cdpUrl`.

## Gemini Module

This repository now exposes its first formal reusable module around Gemini browser automation.

### Layer 1: Gemini Session

Path:

- `lib/gemini/session.js`

Purpose:

- connect to Gemini through a logged-in browser session
- normalize page targeting
- navigate to a fresh chat
- enter image mode
- consume a `cdpUrl` produced by `cbs-workflows`

### Layer 2: Gemini Image Workflow

Paths:

- `lib/gemini/image-workflow.js`
- `lib/gemini/drive-picker.js`
- `lib/gemini/index.js`

Purpose:

- collect prompt files
- attach optional Drive references
- run same-chat prompt sequences
- detect generation completion
- save screenshots and run metadata

### Layer 3: Gemini Result Export

Paths:

- `lib/gemini/result-targeting.js`
- `lib/gemini/export-routes.js`
- `lib/gemini/result-export.js`
- `docs/gemini-result-export.md`

Purpose:

- define the export layer separately from generation
- target the newest generated result
- detect available export routes
- normalize export outcomes and failure states
- support manual handoff when Gemini export is unstable

## CLI Entry Point

- `scripts/gemini-image-sequence.js`

Use this when you want a repo-level executable that demonstrates the Gemini module in action.
