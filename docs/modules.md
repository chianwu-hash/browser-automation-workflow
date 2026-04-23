# Formal Modules

## First Formal Module

This repository now exposes its first formal reusable module around Gemini browser automation.

### Layer 1: Gemini Session

Path:

- `lib/gemini/session.js`
- `lib/session-setup.js`

Purpose:

- connect to Gemini through a logged-in browser session
- normalize page targeting
- navigate to a fresh chat
- enter image mode
- provide a reusable setup helper for app selection and port choice

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
- `scripts/browser-session-setup.js`

Use this when you want a repo-level executable that demonstrates the formal module in action.
