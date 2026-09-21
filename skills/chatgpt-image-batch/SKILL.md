---
name: chatgpt-image-batch
description: Run ChatGPT work-browser image generation through an already logged-in CDP session. Use when the user asks to generate images with the ChatGPT work browser instead of built-in imagegen. Handles the current Chat/Work experience toggle, prompt-driven generation, batch variants, and validated image downloads.
---

# ChatGPT Image Batch

Use this skill when the task is to operate ChatGPT web image generation through the AI work browser instead of the built-in imagegen tool or an API.

## Quickstart

1. Open or validate the AI work browser first. If the `ai-work-browser` skill is available, use it for this step.
2. Use `http://127.0.0.1:9232` as the default CDP URL.
3. Log in to ChatGPT in that browser if needed; the user must do login manually.
4. Prefer UTF-8 prompt files over inline prompt text, especially for Chinese prompts.
5. Current production runs use prompt-driven generation in **Chat** mode. The workflow must not remain in **Work** mode.
6. When the image depends on a supplied style, character, product, or brand reference, pass each local image with a repeated `--reference-image` argument. Verify attachment evidence before sending.

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

Run with one or more reference images:

```powershell
npm run chatgpt:image-batch -- -- --cdp-url http://127.0.0.1:9232 --prompt-file <file> --reference-image <style.png> --reference-image <character.png> --count 1 --output-dir <out>
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
- Run `npm run chatgpt:ui-contract-smoke -- -- --cdp-url http://127.0.0.1:9232` after a ChatGPT UI update or when mode selection/send behavior drifts. This check does not submit a prompt.
- Run `npm run chatgpt:reference-upload-smoke -- -- --cdp-url http://127.0.0.1:9232 --reference-image <file>` when attachment behavior drifts. It uploads to a fresh composer without sending and reports thumbnail/removal-control evidence.
- When the page exposes the `Chat` / `Work` experience toggle, require `[data-tpp-toggle-value="chatgpt"]` to have `aria-checked="true"` before filling or sending a prompt.

### 2. Choose the mode

- Use `chatgpt:image-batch` with `--prompt-dir` when prompt order matters, such as slide or card sequences.
- Use `chatgpt:image-batch` with `--prompt-file --count <n>` for variants of one brief.
- Use `chatgpt:image-multi-mvp` only to test whether the current ChatGPT UI can return several generated images from one assistant response.
- Prompt-driven image generation in Chat mode is the production default because ChatGPT officially supports creating an image by describing it directly in a conversation.
- Use `--image-mode` only as an explicit compatibility probe when the current UI exposes and verifies a stable Images action state. Do not make the composer-menu action a production prerequisite.

### 3. Run generation

- Keep prompt files as UTF-8 `.txt`.
- Put all output-specific layout, brand, mascot, text, and overlay requirements in the prompt files. The generic runner does not inject product-specific rules or fixed sizing/corner assumptions.
- Let the workflow start a fresh chat unless `--reuse-chat` is intentional.
- Let the workflow enforce Chat mode and send the explicit image-generation prompt directly. `--direct-prompt` is retained as a compatibility flag but is now the default behavior.
- Upload reference images through the active `form[data-type="unified-composer"] input#upload-files`, not the page-level `upload-photos-input` used by the Images library. Treat the upload as successful only when the composer exposes the expected preview images or per-file `aria-label` removal controls; React may clear `input.files` after accepting the upload, so do not infer failure from an empty native file list.
- Expect ChatGPT web behavior to vary by model/mode and rerun once before changing selectors.

### Step verification contract

Every browser-writing step must prove its own success before the next long wait begins:

- session: CDP page is on `chatgpt.com` and login controls are absent
- new chat: the visible composer exists after navigation
- experience mode: if the Chat/Work toggle exists, Chat is visibly selected and Work is not selected
- image request: the normalized prompt explicitly requests a new image; an image action chip is required only when `--image-mode` was explicitly requested
- prompt fill: the visible composer contains the normalized prompt prefix
- references: when requested, every local reference file exists, is nonzero, and has corresponding attachment evidence in the composer
- send: the composer no longer contains the prompt, a new user message exists, and that message matches the prompt prefix
- generation start: observe image-specific generating text in the assistant turn or the page-level image progress card (currently including `正在產生更細緻的圖片` / `圖像生成時玩貪食蛇`), or a new generated-image ID
- generation completion: at least one new generated-image ID appears after the round baseline and becomes stable
- download: the file exists, is nonzero, has a supported image signature, and its written byte count matches

Use a short send-acceptance timeout. If the prompt remains in the composer, fail immediately; never spend the full generation timeout waiting for a prompt that was not sent.
Use a separate generation-start timeout, but treat `正在思考`/`思考中` with a percentage, the active stop control, or the page-level image progress card as evidence that the accepted request is still processing. While any of these signals remains, keep waiting and never resend.

The generic stop-response button is not generation-start evidence by itself because ordinary text replies also expose it. Require image-specific text either in the latest assistant turn or the page-level image progress card, or require a new image ID.

Enforce a single-submit invariant: after the workflow proves that the composer cleared and the user message was added, no later timeout, selector drift, renderer issue, or ambiguous assistant state may automatically start a fresh chat or resend that prompt. The server-side image job may still be running. Wait up to the completion timeout, then capture evidence and stop for inspection. Recovery retries are permitted only before a prompt has been accepted.

### 4. Validate artifacts

- Check the metadata JSON, downloaded image count, and output file paths.
- Do not rely on console text alone.
- Read [references/output-contract.md](references/output-contract.md) when you need the expected artifact shape.
- Read [references/failure-policy.md](references/failure-policy.md) when a run hangs, produces too few images, or image mode drifts.

## Boundaries

This skill is for:

- ChatGPT browser session reuse
- Chat/Work experience selection and prompt-driven image requests
- optional image-action compatibility probing
- local reference-image upload with pre-send attachment verification
- prompt-file based image batches
- single-response multi-image probing
- generated image DOM detection and estuary URL download
- JSON metadata and output artifact validation

This skill is not for:

- automating ChatGPT login
- final slide composition
- deciding product-specific brand rules, mascot prominence, or crest placement on behalf of the prompt source
- guaranteeing that ChatGPT web will produce multiple images in one response
- image compositing or fixed-logo overlay after generation
