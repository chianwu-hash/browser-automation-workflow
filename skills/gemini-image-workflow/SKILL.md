---
name: gemini-image-workflow
description: Run Gemini browser-based image workflows through an already logged-in CDP session, including app-and-port session setup, fresh-chat image mode entry, same-chat prompt sequencing, and optional Google Drive reference insertion. Use when Codex needs to automate Gemini image generation with repeatable prompt files, preserve same-conversation style continuity, or handle Gemini UI state such as image mode, Workspace dialogs, and Drive picker tabs.
---

# Gemini Image Workflow

Use this skill when the task is to operate Gemini image generation through a real logged-in browser session instead of a product API.

## Quickstart

1. Run `cdp-launch chatgpt` to open the shared AI work browser.
2. Confirm the endpoint with `cdp-status`.
3. Log in to Gemini in that browser if needed.
4. Run `npm run gemini:image-sequence -- -- --cdp-url http://127.0.0.1:9222 --prompt-dir <dir>`.

The older `cbs-workflows` session-file route remains supported when a project or machine still uses generated browser session configs.

If you need a brand or character reference image from Drive, add:

```powershell
--drive-filename "<file>" --drive-tab starred
```

## Core Workflow

### 1. Prepare the session

- Use the shared local CDP launcher first unless the project documents a different browser setup.
- Prefer an explicit `--cdp-url`, normally `http://127.0.0.1:9222` on this machine.
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
- original-size generated-image download when the current Gemini UI exposes it
- screenshot fallback when download is unavailable

This skill is not for:

- automating Gemini login
- final slide composition

Treat image generation success and image download success as separate states.

## Output Contract

Read [references/output-contract.md](references/output-contract.md) when you need to know what artifacts a run must leave behind.

## Failure Handling

Read [references/failure-policy.md](references/failure-policy.md) when the workflow hits UI drift, missing CDP setup, Drive picker issues, or download instability.
