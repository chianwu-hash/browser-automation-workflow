# Project Memory

Last reviewed: 2026-08-08

## Project identity

- Project name: `browser-automation-workflow`
- Repository: `https://github.com/chianwu-hash/browser-automation-workflow.git`
- Main local path: `D:\projects\browser-automation-workflow`
- Main branch: `main`
- Runtime: Node.js CommonJS, Playwright, `cbs-workflows`, transitive `cdp-tools`
- Purpose: reusable browser automation workflows for AI tools that depend on already logged-in browser sessions, CDP / Playwright automation, UTF-8 prompt files, UI state handling, screenshots, and JSON logs.

## Source-of-truth order

1. Repo files and current Git state.
2. `docs/PROJECT_MEMORY.md`, `docs/RUNBOOK.md`, and `docs/OPERATIONS_LOG.md` for orientation.
3. Workflow skills and their references for exact execution contracts:
   - `skills/chatgpt-image-batch/SKILL.md`
   - `skills/chatgpt-image-batch/references/output-contract.md`
   - `skills/chatgpt-image-batch/references/failure-policy.md`
   - `skills/gemini-image-workflow/SKILL.md`
   - `skills/gemini-image-workflow/references/output-contract.md`
   - `skills/gemini-image-workflow/references/failure-policy.md`
4. Nowledge Memory for cross-tool recall only.
5. Raw Threads as unverified evidence only.

## Current architecture

This repo is workflow infrastructure, not product-specific business logic.

The browser foundation is:

```text
browser-automation-workflow
  -> cbs-workflows
    -> cdp-tools
```

This repository calls CBS-facing commands and consumes either:

- an explicit local `--cdp-url`, normally `http://127.0.0.1:9222`, or
- a CBS-generated local session config.

The top-level workflow should not require machine-global CDP commands or PATH changes. CBS owns guided session setup and delegates browser discovery, profiles, ports, launch, and status checks to `cdp-tools`.

## Main workflow surfaces

### ChatGPT image batch

Primary files:

- `lib/chatgpt/session.js`
- `lib/chatgpt/image-batch.js`
- `lib/chatgpt/index.js`
- `scripts/chatgpt-image-batch.js`
- `scripts/chatgpt-image-multi-mvp.js`
- `skills/chatgpt-image-batch/SKILL.md`

Core behavior:

- connect to an already logged-in ChatGPT browser session through CDP
- start a fresh chat by default
- enter and preserve ChatGPT image mode
- prefer UTF-8 prompt files
- support one-image-per-prompt directory runs
- support same-brief variants from one prompt
- keep single-response multi-image probing separate from ordered production generation
- download distinct generated images from ChatGPT `/backend-api/estuary/content?id=file_...` URLs using page credentials
- write metadata with output paths, source URLs, byte sizes, SHA-256 hashes, and generated image IDs

Known ChatGPT UI facts:

- ChatGPT web may produce one image even when asked for several. Treat that as valid web behavior unless `--min-images` requires more.
- For exact slide order, use `--prompt-dir`; avoid one combined prompt that asks ChatGPT to infer slide numbers.
- Multi-image in one assistant response is a probe, not a production guarantee.
- The workflow supports both older role-based `建立圖像` menu items and newer focusable `div.__menu-item[tabindex]` markup, and verifies current image mode through the `picture_v2` chip when available.
- If the web UI hangs after send, rerun once before changing selectors.

### Gemini image workflow

Primary files:

- `lib/gemini/session.js`
- `lib/gemini/drive-picker.js`
- `lib/gemini/image-workflow.js`
- `lib/gemini/result-targeting.js`
- `lib/gemini/export-routes.js`
- `lib/gemini/result-export.js`
- `scripts/gemini-image-sequence.js`
- `skills/gemini-image-workflow/SKILL.md`

Core behavior:

- connect to an already logged-in Gemini browser session through CDP
- navigate to a fresh Gemini chat
- enter image mode through layered UI handling
- run same-chat prompt sequences from UTF-8 prompt files
- optionally insert Google Drive reference images through the Drive picker helper
- save screenshots and JSON metadata
- attempt original-size generated-image downloads when the current UI exposes them
- treat screenshot fallback as evidence when download is unavailable

Known Gemini UI facts:

- Traditional Chinese UI anchors observed in 2026 include `請輸入 Gemini 提示詞`, `上傳與工具`, `建立圖像`, selected chip `圖片`, and `下載原尺寸圖片`.
- Generation success and download success are separate states. A failed download does not prove generation failed.
- Drive picker actions should be scoped to the picker frame and may need to handle Google Workspace connect dialogs.

## Active decisions

### 2026-08-08 Use repo-owned CBS entry points for browser setup

Status: active
Scope: browser session setup
Source: README, `docs/browser-automation-workflow.md`, `docs/modules.md`

Decision:

- Use `npm run browser:init` and `npm run browser:status` from this repo.
- Do not require global `cdp-tools` binaries or machine PATH changes.
- Treat `cbs-workflows` as the direct session-setup dependency and `cdp-tools` as its transitive lower-level dependency.

Reason:

- Keeps setup repeatable across machines.
- Avoids hidden global tool assumptions.
- Keeps browser profile, port, and session behavior behind the CBS contract.

Next-time warnings:

- Do not silently assume the browser is running.
- If `--cdp-url` is missing, stop and ask the operator to initialize and confirm the browser session.

### 2026-08-08 Prefer UTF-8 prompt files over inline prompt strings

Status: active
Scope: prompts, PowerShell, Chinese content
Source: README, `docs/powershell-encoding.md`, workflow skill files

Decision:

- Use `--prompt-file` or `--prompt-dir` for Chinese prompts, long prompts, reusable prompts, or versioned prompts.
- Keep workflow notes in docs, not inside prompt files that will be sent to AI tools.

Reason:

- Inline PowerShell text can become mojibake through here-strings, piping, nested commands, or mixed toolchains.
- Prompt files are easier to inspect and reproduce.

### 2026-08-08 Validate artifacts, not console claims

Status: active
Scope: all browser AI workflow runs
Source: ChatGPT and Gemini output contracts

Decision:

- A run is not successful just because the console says it completed.
- Validate downloaded files, nonzero byte sizes, JSON metadata, screenshots, and distinct SHA-256 hashes where uniqueness matters.

Reason:

- Browser UIs drift and can produce partial output.
- Generation success, detection success, and download success are different states.

## External services and sensitive surfaces

| Surface | Purpose | Where configured | Secret policy |
|---|---|---|---|
| Logged-in browser profile | Reuse human login state for ChatGPT/Gemini workflows | Local browser profile managed through CBS / CDP setup | Do not store cookies, profile data, or full session config contents in memory or chat. |
| CDP endpoint | Connect Playwright to the work browser | Usually `http://127.0.0.1:9222` during local runs | Local endpoint only; do not expose externally unless explicitly authorized. |
| ChatGPT web | Browser-based image generation | Existing logged-in browser session | Do not automate login or capture credentials. |
| Gemini web | Browser-based image generation and optional Drive references | Existing logged-in browser session | Do not automate login or capture credentials. |
| Google Drive picker | Optional reference image insertion for Gemini | Existing logged-in browser session | Do not store private Drive URLs, file contents, or access tokens in memory. |

## Known failure modes

| Issue | Root cause | Fix or first response | Last verified |
|---|---|---|---|
| Missing CDP URL | Browser session not initialized or endpoint not passed | Run `npm run browser:init`, confirm with `npm run browser:status`, pass `--cdp-url` explicitly | 2026-08-08 docs |
| Chinese prompt mojibake | Inline PowerShell / nested shell encoding | Move prompt to UTF-8 `.txt` and use `--prompt-file` or `--prompt-dir` | 2026-08-08 docs |
| ChatGPT image mode lost | Clearing composer removes the image action chip | Preserve image action state; rerun once before changing selectors | 2026-07-03 / 2026-07-15 notes |
| Too few ChatGPT images | ChatGPT web behavior varies by mode/UI | For exact order use `--prompt-dir`; use multi-image probe only as current behavior evidence | 2026-05-27 / 2026-07-15 notes |
| Gemini generated but did not download | Export route unstable or unavailable | Treat generation and download separately; keep screenshot fallback and metadata | 2026-08-08 docs |
| Drive picker mis-click | Picker is iframe/modal state, not global page state | Scope interactions to picker frame and selected tab | 2026-08-08 docs |

## Terminology

| Term | Meaning |
|---|---|
| AI work browser | A logged-in browser launched or reused for AI web automation. |
| CDP | Chrome DevTools Protocol endpoint used by Playwright to control the browser. |
| CBS | `cbs-workflows`, the direct dependency that owns guided browser setup for this repo. |
| cdp-tools | Lower-level transitive dependency used by CBS for browser launch/discovery/status. |
| Prompt directory | Sorted `.txt` prompt files used for ordered deck/card generation. |
| Multi-image probe | A test of whether the current ChatGPT web UI returns multiple images in one assistant response; not a production guarantee. |

## User preferences for this project

- Use Traditional Chinese when communicating with the user.
- Prefer direct, evidence-based engineering communication.
- Keep secrets and logged-in browser state out of memory.
