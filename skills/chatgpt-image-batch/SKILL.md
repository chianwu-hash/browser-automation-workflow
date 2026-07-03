---
name: chatgpt-image-batch
description: Run ChatGPT web image-generation workflows through an already logged-in CDP browser session. Use when Codex needs to generate one image per UTF-8 prompt file, produce same-brief variants, probe whether ChatGPT can return multiple images from one response, preserve ChatGPT image mode, or download generated ChatGPT Images from DOM estuary URLs.
---

# ChatGPT Image Batch

Use this skill when the task is to operate ChatGPT web image generation through a real logged-in browser session instead of an API.

## Quickstart

1. Run `cdp-launch chatgpt` to open the shared AI work browser.
2. Confirm the endpoint with `cdp-status`.
3. Log in to ChatGPT in that browser if needed.
4. Prefer UTF-8 prompt files over inline prompt text, especially for Chinese prompts.

Run one image per prompt file:

```powershell
npm run chatgpt:image-batch -- -- --cdp-url http://127.0.0.1:9222 --prompt-dir <dir> --output-dir <out>
```

Run same-brief variants from one prompt file:

```powershell
npm run chatgpt:image-batch -- -- --cdp-url http://127.0.0.1:9222 --prompt-file <file> --count 4 --output-dir <out>
```

Probe a single response for multiple images:

```powershell
npm run chatgpt:image-multi-mvp -- -- --cdp-url http://127.0.0.1:9222 --prompt-file <file> --expected-images 3 --output-dir <out>
```

## Core Workflow

### 1. Prepare the session

- Use the shared local CDP launcher first unless the project documents a different browser setup.
- Prefer an explicit `--cdp-url`, normally `http://127.0.0.1:9222` on this machine.
- Confirm ChatGPT is logged in before running the workflow.

### 2. Choose the mode

- Use `chatgpt:image-batch` with `--prompt-dir` when prompt order matters, such as slide or card sequences.
- Use `chatgpt:image-batch` with `--prompt-file --count <n>` for variants of one brief.
- Use `chatgpt:image-multi-mvp` only to test whether the current ChatGPT UI can return several generated images from one assistant response.

### 3. Run generation

- Keep prompt files as UTF-8 `.txt`.
- Let the workflow start a fresh chat unless `--reuse-chat` is intentional.
- Use default image-mode behavior for production; use `--direct-prompt` only for simple probes.
- Expect ChatGPT web behavior to vary by model/mode and rerun once before changing selectors.

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
- guaranteeing that ChatGPT web will produce multiple images in one response
- editing or uploading reference images as a formal production path
