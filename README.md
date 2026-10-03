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

If the skills are already installed as ordinary directories and you want to
replace them from this repo, run:

```powershell
npm run skills:install:force
```

The force installer refuses to replace a symlink or Windows junction. If an
installed skill is linked to a skill vault, update the source directory through
that vault's normal workflow instead.

Restart Codex after installing or updating skills.

AI 工作瀏覽器預設使用單一持久瀏覽器。需要並行工作時，可對 AI 說「我想要使用 AI 工作瀏覽器分身」，再依引導啟用及手動登入所需網站。Chrome 帳號登入與同步是選用，不會同步網站登入工作階段。公開管理器需要 Node.js 22.13 以上；Windows 另需 PowerShell 7 的 `pwsh`，用來核對程序啟動時間與舊瀏覽器資料目錄。

沒有本機共用啟動器時，使用 `npm run browser:manage -- init` 初始化；若已有 CBS 瀏覽器設定，改用 `init --session-file <原設定檔>`，保留原 profile。一般工作使用：

```powershell
npm run browser:run -- --workflow chatgpt:image-batch -- --prompt-file <file> --output-dir <out>
```

分身預設不啟用；`enable` 新增一個設定中的分身，完成手動登入並標記 `ready` 後才供對話分配。詳見 [分身設定與占用管理](skills/ai-work-browser/references/clones.md)。Windows 為目前驗證平台，其他平台尚未實機驗收。使用者資料放 repo 外，更新技能不刪登入資料。

Open the shared AI work browser. If your machine has `ai-browser-launch`, use
that stable launcher:

```powershell
ai-browser-launch https://chatgpt.com/
ai-browser-launch -Status
```

Otherwise, use the repo-owned CBS entry point, then confirm the CDP endpoint:

```powershell
npm run browser:init -- --app chatgpt --browser chrome --port 9232 --yes
npm run browser:status -- --ports 9232
$env:CDP_URL = "http://127.0.0.1:9232"
```

`npm install` brings in `cbs-workflows`, which brings in `cdp-tools`. No
machine-global CDP commands or PATH changes are required.

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
npm run chatgpt:image-batch -- --cdp-url $env:CDP_URL --prompt-file templates\prompt-example.txt
```

The prompt example is intentionally pure prompt text. Keep workflow notes in docs, not inside prompt files that will be sent to AI tools.

Run Gemini image sequencing:

```powershell
npm run gemini:image-sequence -- --cdp-url $env:CDP_URL --prompt-dir templates\gemini-sequence
```

Recommended order:

1. open the AI work browser with `ai-browser-launch`, or run `npm run browser:init -- --app chatgpt --browser chrome --port 9232 --yes`
2. log in to the sites needed by the workflow, such as ChatGPT and Gemini
3. confirm the endpoint with `npm run browser:status -- --ports 9232`
4. pass `--cdp-url $env:CDP_URL` to the workflow command

Before browser workflows that require downloads or extensions, confirm the
active browser uses the expected persistent profile. Verify that its download
directory is the current user's Downloads folder, downloads are permitted, and
extensions are enabled. A successful status check alone does not verify these
settings. See [the runbook](docs/RUNBOOK.md#verify-downloads-and-extensions).

## Design Principles

- Prefer UTF-8 prompt files over inline shell prompt strings.
- Prefer logged-in browser reuse over repeated auth automation.
- Always leave evidence: screenshots, JSON logs, or both.
- Treat UI state detection as a first-class concern.
- Build workflows that degrade gracefully when platform UI changes.

## Browser Foundation

The runtime dependency chain is:

```text
browser-automation-workflow
  -> cbs-workflows
    -> cdp-tools
```

This repository calls CBS-facing commands only. CBS owns guided session setup
and delegates browser discovery, profiles, ports, launch, and status checks to
`cdp-tools`. Workflows can consume either an explicit local `--cdp-url` or a
session config produced by CBS.

## Installed Skill Usage

After installing the skills into Codex, use `開啟 AI 工作瀏覽器` when you want Codex to reopen the same logged-in work browser. Include `ChatGPT 工作瀏覽器` or `Gemini 工作瀏覽器` when you want a product-specific image workflow instead of the built-in image generator.

Recommended prompts:

```text
開啟 AI 工作瀏覽器。
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

### AI Work Browser

- `skills/ai-work-browser/SKILL.md`

This skill owns the browser entry point and safety boundary: reuse the same AI work browser, preserve login state when possible, and default downstream workflows to `http://127.0.0.1:9232`.

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
