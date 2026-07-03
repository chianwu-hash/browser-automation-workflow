# Formal Modules

## Browser Foundation

The workflows in this repo need an already logged-in browser exposed through Chrome DevTools Protocol.

On this machine, prefer the shared local CDP launcher:

- `cdp-launch chatgpt`
- `cdp-status`
- `CDP_URL=http://127.0.0.1:9222`

The older `cbs-workflows` session-file route is still supported for portability and for machines that do not use the shared launcher:

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

This repository consumes either an explicit `--cdp-url` or the generated session config file and uses its `cdpUrl`.

## ChatGPT Module

This repository exposes a reusable ChatGPT image-generation workflow around the current ChatGPT web UI.

### Layer 1: ChatGPT Session

Path:

- `lib/chatgpt/session.js`

Purpose:

- connect to ChatGPT through a logged-in browser session
- normalize page targeting
- navigate to a fresh chat
- enter image mode when requested
- preserve the current `創作圖像` action state while filling prompts

### Layer 2: ChatGPT Image Batch

Paths:

- `lib/chatgpt/image-batch.js`
- `lib/chatgpt/index.js`

Purpose:

- collect prompt files or a single prompt
- run one-image-per-prompt batch generation
- support variant batches from one prompt
- detect generated image nodes in the DOM
- download distinct generated images from ChatGPT estuary URLs
- write JSON metadata with image IDs, output paths, and hashes

### Layer 3: ChatGPT Multi-Image Probe

Path:

- `scripts/chatgpt-image-multi-mvp.js`

Purpose:

- send one prompt and wait for multiple images in one assistant response
- verify whether the current ChatGPT web UI can produce the requested image count
- keep this behavior separate from ordered production deck generation

## Gemini Module

This repository also exposes a reusable module around Gemini browser automation.

### Layer 1: Gemini Session

Path:

- `lib/gemini/session.js`

Purpose:

- connect to Gemini through a logged-in browser session
- normalize page targeting
- navigate to a fresh chat
- enter image mode
- consume a `cdpUrl` produced by `cbs-workflows`
- consume a shared local `CDP_URL`

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
- download original-size generated images when the current UI exposes the route
- save screenshots as fallback evidence and write run metadata

### Layer 3: Gemini Result Export

Paths:

- `lib/gemini/result-targeting.js`
- `lib/gemini/export-routes.js`
- `lib/gemini/result-export.js`
- `docs/gemini-result-export.md`

Purpose:

- define a conservative export-route inspection layer separately from generation
- target the newest generated result
- detect available export routes
- normalize export-route outcomes and failure states
- support manual handoff for standalone export attempts

The production `gemini:image-sequence` path already attempts original-size downloads from the current Gemini UI and keeps screenshot fallback evidence.

## CLI Entry Points

- `scripts/chatgpt-image-batch.js`
- `scripts/chatgpt-image-multi-mvp.js`
- `scripts/gemini-image-sequence.js`

Use these when you want repo-level executables that demonstrate the formal modules in action.
