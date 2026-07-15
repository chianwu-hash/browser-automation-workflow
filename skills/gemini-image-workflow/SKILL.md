---
name: gemini-image-workflow
description: Run Gemini work-browser image workflows through an already logged-in CDP session. Use when the user says Gemini 工作瀏覽器, 工作瀏覽器生成圖片, or asks Codex to generate images with Gemini instead of built-in imagegen. Supports fresh-chat image mode entry, same-chat prompt sequencing, repeatable prompt files, optional Google Drive reference insertion, and Gemini UI handling such as image mode, Workspace dialogs, and Drive picker tabs.
---

# Gemini Image Workflow

Use this skill when the task is to operate Gemini image generation through the AI work browser instead of the built-in imagegen tool or a product API.

## Quickstart

1. Run `npm run browser:init -- -- --app gemini --browser chrome --port 9222 --yes` from the workflow repo.
2. Confirm the endpoint with `npm run browser:status -- --ports 9222`.
3. Log in to Gemini in that browser if needed.
4. Run `npm run gemini:image-sequence -- -- --cdp-url http://127.0.0.1:9222 --prompt-dir <dir>`.

To trigger this skill reliably, include `Gemini 工作瀏覽器` or `工作瀏覽器` in the request, for example:

```text
請用 Gemini 工作瀏覽器幫我生成「雨中即景」照片。
```

The older `cbs-workflows` session-file route remains supported when a project or machine still uses generated browser session configs.

If you need a brand or character reference image from Drive, add:

```powershell
--drive-filename "<file>" --drive-tab starred
```

## Core Workflow

### 1. Prepare the session

- Use the repo's CBS initializer. It installs and calls `cdp-tools` transitively; do not require a machine-global launcher.
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
