---
name: gemini-image-workflow
description: Run Gemini browser-based image workflows through an already logged-in CDP session, including app-and-port session setup, fresh-chat image mode entry, same-chat prompt sequencing, and optional Google Drive reference insertion. Use when Codex needs to automate Gemini image generation with repeatable prompt files, preserve same-conversation style continuity, or handle Gemini UI state such as image mode, Workspace dialogs, and Drive picker tabs.
---

# Gemini Image Workflow

Use this skill when the task is to operate Gemini image generation through a real logged-in browser session instead of a product API.

## Quickstart

1. Run `npm run browser:init` from the sibling `cbs-workflows` repo.
2. Choose the target app and either:
   - enter a remote debugging port, or
   - let the helper choose a free port.
3. Launch Chrome or Edge with the suggested command.
4. Log in to Gemini in that browser.
5. Run `npm run gemini:image-sequence -- -- --session-file <file> --prompt-dir <dir>` or pass `--cdp-url <url>`.

If you need a brand or character reference image from Drive, add:

```powershell
--drive-filename "<file>" --drive-tab starred
```

## Core Workflow

### 1. Prepare the session

- Use `..\cbs-workflows\scripts\browser-session-setup.js` first.
- Do not assume `9222`; prefer the session file or explicit `--cdp-url` produced by setup.
- Confirm the operator has logged into Gemini in the browser tied to that port.

### 2. Open a safe Gemini state

- Reuse the logged-in browser through CDP.
- Navigate to a fresh Gemini chat.
- Enter image mode through layered UI handling:
  - direct image shortcut if present
  - direct image-mode button if present
  - `tools -> image mode` fallback

### 3. Run image generation

- Read prompts from UTF-8 `.txt` files.
- Use same-chat sequencing when character or style consistency matters.
- Wait for image generation completion before sending the next prompt.
- Save screenshots and JSON metadata for each run.

### 4. Use Drive references when needed

- Use the Drive picker helper when the workflow needs a brand image or reference visual.
- Expect optional `Google Workspace` connect dialogs.
- Support common picker tabs such as recent, my drive, shared, and starred.

## Boundaries

This skill is for:

- session setup
- Gemini image chat preparation
- prompt-file execution
- same-chat multi-image workflows
- Drive reference insertion
- evidence logging

This skill is not for:

- automating Gemini login
- final slide composition
- reliable generated-image download

Treat image generation success and image download success as separate states.

## Output Contract

Read [references/output-contract.md](references/output-contract.md) when you need to know what artifacts a run must leave behind.

## Failure Handling

Read [references/failure-policy.md](references/failure-policy.md) when the workflow hits UI drift, missing CDP setup, Drive picker issues, or download instability.
