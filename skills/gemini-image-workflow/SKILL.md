---
name: gemini-image-workflow
description: Run Gemini work-browser image workflows through an already logged-in CDP session. Use when the user says Gemini 工作瀏覽器, 工作瀏覽器生成圖片, or asks Codex to generate images with Gemini instead of built-in imagegen. Supports fresh-chat image mode entry, same-chat prompt sequencing, repeatable prompt files, optional Google Drive reference insertion, and Gemini UI handling such as image mode, Workspace dialogs, and Drive picker tabs.
---

# Gemini Image Workflow

Use this skill when the task is to operate Gemini image generation through the AI work browser instead of the built-in imagegen tool or a product API.

## Quickstart

1. Open or validate the AI work browser first. If the `ai-work-browser` skill is available, use it for this step.
2. Use the endpoint and exact target returned by `ai-work-browser`, not a fixed port. With the portable manager prefer `npm run browser:run -- --workflow gemini:image-sequence -- --prompt-dir <dir>` for automatic acquisition, worker protection and release. Existing machine launchers retain their own routing.
3. Log in to Gemini in that browser if needed; the user must do login manually.
4. For a legacy explicitly prepared endpoint, run `npm run gemini:image-sequence -- --cdp-url <selected-endpoint> --prompt-dir <dir>`. Same-endpoint ChatGPT and Gemini jobs are mutually exclusive; different registered instances may run concurrently.

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

- Use `ai-work-browser` to open or validate the shared browser state when available.
- If no `ai-work-browser` launcher is available, use the repo's CBS initializer: `npm run browser:init -- --app gemini --browser chrome --port 9232 --yes`.
- Prefer the supervised wrapper for portable clones. Legacy explicit `--cdp-url` commands use the acquired endpoint, not a guessed default; register the worker and maintain the launcher lease when using an existing machine launcher.
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

### Step verification contract

Every browser-writing step must prove its own success before the next long wait begins:

- session: the selected page is on `gemini.google.com` and login controls are absent
- new chat: navigation stays on Gemini and the visible prompt textbox exists
- image mode: the selected image chip or checked image-mode state is visible
- prompt fill: the visible textbox contains the normalized prompt prefix
- send: the textbox no longer contains the prompt, a new `user-query` exists, and that query matches the prompt prefix
- generation start: within 30 seconds, observe the image-specific generating state or a new loaded generated image
- generation completion: the loaded generated-image count increases from the round baseline and becomes stable
- export: the downloaded image or screenshot fallback exists, is nonzero, and has a supported image signature

Use a short send-acceptance timeout. If the prompt remains in the textbox, fail immediately; never spend the full generation timeout waiting for a prompt that was not sent.
Use a separate short generation-start timeout. If the model completes a rejection or no generation indicator appears, fail before the long completion timeout.

The generic stop-response button is not generation-start evidence by itself because ordinary text replies also expose it. Require the image-specific generating state or a new loaded image.

For retryable send or generation-start failures, allow at most two recovery retries. After the second retry fails, capture a browser screenshot plus structured DOM snapshot, then invoke the repo-bundled Codex CLI escalation once with structured output and recursion disabled. The CLI must first classify the incident as transient model failure, UI contract drift, or system failure. A healthy browser should receive one clean fresh-chat image-mode retry before code changes. Continue only if the CLI verifies that the original workflow completed and its artifacts are valid; otherwise report the failure immediately.

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
