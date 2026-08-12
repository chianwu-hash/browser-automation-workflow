---
name: chatgpt-image-batch
description: Run ChatGPT work-browser image-generation workflows through an already logged-in CDP browser session. Use when the user says ChatGPT 工作瀏覽器, 工作瀏覽器生成圖片, or asks Codex to generate images with ChatGPT instead of built-in imagegen. Supports one image per UTF-8 prompt file, same-brief variants, multi-image response probes, ChatGPT image mode preservation, and generated-image DOM estuary URL downloads.
---

# ChatGPT Image Batch

Use this skill when the task is to operate ChatGPT web image generation through the AI work browser instead of the built-in imagegen tool or an API.

## Quickstart

1. Open or validate the AI work browser first. If the `ai-work-browser` skill is available, use it for this step.
2. Use `http://127.0.0.1:9232` as the default CDP URL.
3. Log in to ChatGPT in that browser if needed; the user must do login manually.
4. Prefer UTF-8 prompt files over inline prompt text, especially for Chinese prompts.

To trigger this skill reliably, include `ChatGPT 工作瀏覽器` or `工作瀏覽器` in the request, for example:

```text
請用 ChatGPT 工作瀏覽器幫我生成「雨中即景」照片。
```

Run one image per prompt file:

```powershell
npm run chatgpt:image-batch -- -- --cdp-url http://127.0.0.1:9232 --prompt-dir <dir> --output-dir <out>
```

Run same-brief variants from one prompt file:

```powershell
npm run chatgpt:image-batch -- -- --cdp-url http://127.0.0.1:9232 --prompt-file <file> --count 4 --output-dir <out>
```

Probe a single response for multiple images:

```powershell
npm run chatgpt:image-multi-mvp -- -- --cdp-url http://127.0.0.1:9232 --prompt-file <file> --expected-images 3 --output-dir <out>
```

## Core Workflow

### 1. Prepare the session

- Use `ai-work-browser` to open or validate the shared browser state when available.
- If no `ai-work-browser` launcher is available, use the repo's CBS initializer: `npm run browser:init -- --app chatgpt --browser chrome --port 9232 --yes`.
- Prefer an explicit `--cdp-url`, normally `http://127.0.0.1:9232`.
- Confirm ChatGPT is logged in before running the workflow.

### 2. Choose the mode

- Use `chatgpt:image-batch` with `--prompt-dir` when prompt order matters, such as slide or card sequences.
- Use `chatgpt:image-batch` with `--prompt-file --count <n>` for variants of one brief.
- Use `chatgpt:image-multi-mvp` only to test whether the current ChatGPT UI can return several generated images from one assistant response.

### 3. Run generation

- Keep prompt files as UTF-8 `.txt`.
- Put all output-specific layout, brand, mascot, text, and overlay requirements in the prompt files. The generic runner does not inject product-specific rules or fixed sizing/corner assumptions.
- Let the workflow start a fresh chat unless `--reuse-chat` is intentional.
- Use default image-mode behavior for production; use `--direct-prompt` only for simple probes.
- Expect ChatGPT web behavior to vary by model/mode and rerun once before changing selectors.

### Step verification contract

Every browser-writing step must prove its own success before the next long wait begins:

- session: CDP page is on `chatgpt.com` and login controls are absent
- new chat: the visible composer exists after navigation
- image mode: the image action chip or selected mode state is visible
- prompt fill: the visible composer contains the normalized prompt prefix
- send: the composer no longer contains the prompt, a new user message exists, and that message matches the prompt prefix
- generation start: within 30 seconds, observe image-specific generating text in the latest assistant turn or a new generated-image ID
- generation completion: at least one new generated-image ID appears after the round baseline and becomes stable
- download: the file exists, is nonzero, has a supported image signature, and its written byte count matches

Use a short send-acceptance timeout. If the prompt remains in the composer, fail immediately; never spend the full generation timeout waiting for a prompt that was not sent.
Use a separate short generation-start timeout. If the assistant completes a rejection or no generation indicator appears, fail before the long completion timeout.

The generic stop-response button is not generation-start evidence by itself because ordinary text replies also expose it. Require image-specific generating text in the latest assistant turn or a new image ID.

For retryable send or generation-start failures, allow at most two recovery retries. After the second retry fails, capture a browser screenshot plus structured DOM snapshot, then invoke the repo-bundled Codex CLI escalation once with structured output and recursion disabled. The CLI must first classify the incident as transient model failure, UI contract drift, or system failure. A healthy browser should receive one clean fresh-chat image-mode retry before code changes. Continue only if the CLI verifies that the original workflow completed and its artifacts are valid; otherwise report the failure immediately.

### 4. Validate artifacts

- Check the metadata JSON, downloaded image count, and output file paths.
- Do not rely on console text alone.
- Read [references/output-contract.md](references/output-contract.md) when you need the expected artifact shape.
- Read [references/failure-policy.md](references/failure-policy.md) when a run hangs, produces too few images, or image mode drifts.

## Boundaries

This skill is for:

- ChatGPT browser session reuse
- image mode setup and prompt insertion
- prompt-file based image batches
- single-response multi-image probing
- generated image DOM detection and estuary URL download
- JSON metadata and output artifact validation

This skill is not for:

- automating ChatGPT login
- final slide composition
- deciding product-specific brand rules, mascot prominence, or crest placement on behalf of the prompt source
- guaranteeing that ChatGPT web will produce multiple images in one response
- editing or uploading reference images as a formal production path
