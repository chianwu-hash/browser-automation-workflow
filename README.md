# browser-automation-workflow

Reusable browser automation workflows for AI tools, built around logged-in sessions, prompt orchestration, and reliable UI state handling.

## Purpose

This repository is a shared foundation for browser-based AI workflows that depend on:

- already logged-in browser sessions
- CDP / Playwright automation
- prompt files stored as UTF-8 text
- repeatable UI interaction patterns
- screenshots and JSON logs for verification

It is intended to hold reusable patterns that can be shared across projects such as:

- AI image generation workflows
- NotebookLM research workflows
- Canva / ChatGPT workflow automation
- browser-driven content pipelines

## Scope

This repo focuses on the workflow layer, not product-specific business logic.

Examples of what belongs here:

- browser connection helpers
- session and page targeting
- formal workflow modules
- prompt-file execution patterns
- modal / overlay / iframe handling
- screenshot and metadata logging
- encoding-safe automation guidance

Examples of what should stay in project-specific repos:

- school website business logic
- lesson content
- presentation-specific prompts and assets
- product-specific output content

## Repository Structure

- `docs/`
  workflow docs, SOPs, and conventions
- `lib/`
  reusable formal modules
- `scripts/`
  reusable automation entry points and smoke tests
- `templates/`
  starter prompt files and metadata templates

## Quick Start

Install dependencies:

```powershell
npm install
```

Install the bundled Codex skills:

```powershell
npm run skills:install
```

If the skills are already installed and you want to update them from this repo, run:

```powershell
npm run skills:install:force
```

Restart Codex after installing or updating skills.

Open the shared AI work browser, then confirm the CDP endpoint:

```powershell
cdp-launch chatgpt
cdp-status
$env:CDP_URL = "http://127.0.0.1:9222"
```

Run the browser smoke test:

```powershell
npm run browser:smoke
```

Run repository checks:

```powershell
npm run check
```

Run ChatGPT image batch generation:

```powershell
npm run chatgpt:image-batch -- -- --cdp-url $env:CDP_URL --prompt-file templates\prompt-example.txt
```

The prompt example is intentionally pure prompt text. Keep workflow notes in docs, not inside prompt files that will be sent to AI tools.

Run Gemini image sequencing:

```powershell
npm run gemini:image-sequence -- -- --cdp-url $env:CDP_URL --prompt-dir templates\gemini-sequence
```

Recommended order:

1. run `cdp-launch chatgpt`
2. log in to the sites needed by the workflow, such as ChatGPT and Gemini
3. confirm the endpoint with `cdp-status`
4. pass `--cdp-url $env:CDP_URL` to the workflow command

## Design Principles

- Prefer UTF-8 prompt files over inline shell prompt strings.
- Prefer logged-in browser reuse over repeated auth automation.
- Always leave evidence: screenshots, JSON logs, or both.
- Treat UI state detection as a first-class concern.
- Build workflows that degrade gracefully when platform UI changes.

## Browser Foundation

On this machine, prefer the shared local CDP tools:

- `cdp-launch chatgpt`
- `cdp-status`
- default `CDP_URL=http://127.0.0.1:9222`

The older `cbs-workflows` foundation remains supported for repos or machines that still use generated session files:

- `cbs-workflows`
- https://github.com/chianwu-hash/cbs-workflows
- `npm run browser:init:legacy`

This repo can consume either an explicit `--cdp-url` or a session config produced by `cbs-workflows`.

## Installed Skill Usage

After installing the skills into Codex, include `工作瀏覽器` in user-facing requests so Codex chooses the browser workflow instead of the built-in image generator.

Recommended prompts:

```text
請用 ChatGPT 工作瀏覽器幫我生成「雨中即景」照片。
請用 Gemini 工作瀏覽器幫我生成「雨中即景」照片。
```

Avoid vague prompts such as `用 ChatGPT 生成圖片`; they can be interpreted as a normal image-generation request and may trigger the built-in imagegen tool instead of this repo's browser workflows.

## Formal Modules

### ChatGPT Image Batch

- `lib/chatgpt/session.js`
- `lib/chatgpt/image-batch.js`
- `scripts/chatgpt-image-batch.js`
- `scripts/chatgpt-image-multi-mvp.js`
- `skills/chatgpt-image-batch/SKILL.md`

Together they provide:

- ChatGPT session control
- image mode handling for the current web UI
- one-image-per-prompt batch generation
- single-response multi-image probing
- generated image DOM download and run metadata

See:

- [docs/chatgpt-image-batch.md](docs/chatgpt-image-batch.md)

### Gemini Image Workflow

- `lib/gemini/session.js`
- `lib/gemini/drive-picker.js`
- `lib/gemini/image-workflow.js`

Together they provide:

- Gemini session control
- Gemini image workflow sequencing
- optional Google Drive reference insertion
- original-size image download with screenshot fallback
- JSON run logging

See:

- [docs/modules.md](docs/modules.md)
- [docs/gemini-session.md](docs/gemini-session.md)
- [docs/gemini-image-workflow.md](docs/gemini-image-workflow.md)
