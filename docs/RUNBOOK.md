# Project Runbook

Last reviewed: 2026-09-30
Owner: project maintainers and authorized AI assistants

## Scope

This runbook covers repeatable local operations for `browser-automation-workflow`:

- dependency installation
- Codex skill installation
- browser session setup through CBS
- ChatGPT and Gemini browser workflow execution
- smoke tests and artifact validation
- failure handling boundaries

It does not cover product-specific content, final slide composition, account login automation, credential handling, payment flows, or administrative account changes.

## Safety rules

- Do not store cookies, tokens, passwords, API keys, private keys, one-time codes, full session config contents, or sensitive screenshot contents in this file, memory docs, Nowledge Memory, or chat.
- Treat browser profiles, session configs, screenshots, downloaded artifacts, and CDP endpoints as potentially sensitive local data.
- Ask the operator to log in manually when a site requires login.
- Do not automate login, account recovery, payment, identity verification, admin-account changes, or credential extraction unless the user explicitly authorizes the exact scope.
- Verify current branch and worktree state before editing or committing.
- Do not claim success from console text alone. Validate artifacts.

## Environment map

| Environment or system | Purpose | Configuration location | Access or safety note |
|---|---|---|---|
| Local repo | Workflow source, scripts, and bundled skills | `D:\projects\browser-automation-workflow` | Check Git status before changes. |
| Node.js dependencies | Playwright, CBS workflow helpers | `package.json`, `package-lock.json` | Use repo scripts; avoid hidden global CDP assumptions. |
| AI work browser | Logged-in browser session for ChatGPT/Gemini | Shared launcher when configured; otherwise CBS / CDP setup, normally port `9232` | Login is manual; profile/session contents are sensitive. |
| ChatGPT web | Browser-based image generation | Existing logged-in work browser | Do not automate credentials. |
| Gemini web | Browser-based image generation and Drive references | Existing logged-in work browser | Generation and download success are separate. |
| Google Drive picker | Optional reference image insertion | Gemini browser workflow | Do not store private Drive URLs or access tokens. |

## Routine procedures

### Install dependencies

Purpose: prepare local scripts and workflow dependencies.

Prerequisites:

- Node.js and npm are available.
- Current directory is `D:\projects\browser-automation-workflow`.

Steps:

1. Run `npm install`.
2. Run `npm run check`.

Validation:

- `npm run check` exits successfully.
- `package-lock.json` changes only when dependency updates are intentional.

Escalation:

- Stop if install prompts for credentials or writes unexpected global configuration.

### Install or update bundled Codex skills

Purpose: make this repo's browser workflow skills available to Codex.

Steps:

1. Run `npm run skills:install`.
2. If replacing ordinary installed directories is intentional, run `npm run skills:install:force`. The installer refuses to replace linked directories or Windows junctions; update their source directories instead.
3. Restart Codex after installation or update.

Validation:

- The installed skill names are available in Codex:
  - `ai-work-browser`
  - `chatgpt-image-batch`
  - `gemini-image-workflow`

Escalation:

- Stop if the target skill directory is ambiguous or if overwriting user-modified installed skills was not authorized.

### Prepare a work browser session

Purpose: expose an already logged-in browser to Playwright through CDP.

Steps:

1. If the machine has a configured `ai-browser-launch`, run `ai-browser-launch` and `ai-browser-launch -Status`. Otherwise, from this repo run one of:
   - `npm run browser:init -- --app chatgpt --browser chrome --port 9232 --yes`
   - `npm run browser:init -- --app gemini --browser chrome --port 9232 --yes`
2. Ask the operator to log in manually if needed.
3. Confirm the endpoint:
   - `npm run browser:status -- --ports 9232`
4. Set the local session variable in the current shell:
   - `$env:CDP_URL = "http://127.0.0.1:9232"`

Validation:

- `browser:status` reports the selected port.
- Playwright can connect through CDP.
- The relevant site is open and logged in in the browser tied to that port.
- Download and extension settings pass the checks below when the workflow needs them.

Escalation:

- Stop if the browser is not under the expected local port.
- Stop if login or account verification is required; the operator must handle it.

### Verify downloads and extensions

Purpose: ensure the active persistent browser can save files to the current user's Downloads folder and permits extensions.

Steps:

1. Confirm the active browser and profile with `ai-browser-launch -Status -Json` when the shared launcher is configured. On other machines, inspect the profile reported by `browser:status`. Do not create another profile just to change these settings.
2. In that browser, open `chrome://settings/downloads`. Check that the download location is the user's Downloads folder and that downloads are allowed. Decide whether the “ask where to save each file” setting suits the workflow; unattended downloads require it off.
3. Open `chrome://extensions` and `chrome://policy`. Confirm extensions are enabled and no install-blocking policy applies. If an extension is actually needed, verify its install button is available before running that workflow.
4. For a download-dependent workflow, download a harmless test file and confirm that it appears in the expected Downloads folder. Remove the test file afterward.

Validation:

- The checked profile is the profile used by the workflow's CDP endpoint.
- The test download lands in the user's Downloads folder without a blocking prompt.
- Extension installation is available in the active browser; no extension needs to be installed solely for this check.

If any check fails, fix the local launcher or Chrome profile settings and repeat the check before running the dependent workflow. Keep machine-specific paths and profile routing outside this repo.

### Run repository checks

Purpose: validate scripts and repo consistency after code or docs changes.

Steps:

1. Run `npm run check`.
2. If scripts changed, run the relevant smoke test:
   - `npm run browser:smoke`
   - `npm run chatgpt:image-mode-smoke -- --cdp-url http://127.0.0.1:9232 --trials 3`

Validation:

- Checks exit successfully.
- Smoke-test artifacts or logs support the result.

Escalation:

- If the smoke test requires a logged-in browser and the operator has not prepared it, stop and ask for browser setup instead of guessing.

### Run ChatGPT image batch

Purpose: generate images through ChatGPT web in a logged-in work browser.

Prerequisites:

- CDP endpoint is confirmed.
- ChatGPT is logged in manually.
- Prompt text is stored in UTF-8 `.txt` files.
- Each prompt file already contains every output-specific layout, brand, mascot, and overlay rule needed for that image. The generic runner does not inject product-specific rules.

Recommended deck mode:

```powershell
npm run chatgpt:image-batch -- --cdp-url $env:CDP_URL --prompt-dir <prompt-dir> --output-dir <output-dir> --output-prefix <prefix> --meta <output-dir>\run-meta.json
```

Recommended variant mode:

```powershell
npm run chatgpt:image-batch -- --cdp-url $env:CDP_URL --prompt-file <prompt-file> --count <n> --output-dir <output-dir> --output-prefix <prefix> --meta <output-dir>\run-meta.json
```

Multi-image probe only:

```powershell
npm run chatgpt:image-multi-mvp -- --cdp-url $env:CDP_URL --prompt-file <prompt-file> --expected-images <n> --output-dir <output-dir> --output-prefix <prefix> --meta <output-dir>\run-meta.json
```

Validation:

- Confirm each round records step checks for prompt fill, send acceptance, generation detection, and artifact validation.
- Check downloaded image files.
- Check nonzero byte sizes.
- Check metadata JSON.
- Check distinct SHA-256 hashes when uniqueness matters.
- Check that prompt files were used in the intended order.

Recovery:

- For a web-side hang, reconnect, start a fresh chat, re-enter image mode, and rerun once.
- Do not retry indefinitely.
- Preserve metadata and artifacts from failed attempts.

### Run Gemini image sequence

Purpose: generate images through Gemini web in a logged-in work browser.

Prerequisites:

- CDP endpoint is confirmed.
- Gemini is logged in manually.
- Prompt text is stored in UTF-8 `.txt` files.

Recommended command:

```powershell
npm run gemini:image-sequence -- --cdp-url $env:CDP_URL --prompt-dir <prompt-dir> --output-dir <output-dir>
```

With Drive reference:

```powershell
npm run gemini:image-sequence -- --cdp-url $env:CDP_URL --prompt-dir <prompt-dir> --output-dir <output-dir> --drive-filename "<file>" --drive-tab starred
```

Validation:

- Confirm each result records step checks for prompt fill, send acceptance, generation detection, and artifact validation.
- Check metadata JSON.
- Check screenshots.
- Check generated-image download paths or fallback screenshot paths.
- Treat generation success and download success separately.

Recovery:

- Reconnect to CDP.
- Reopen a fresh Gemini chat.
- Re-enter image mode.
- Reopen Drive picker if needed.
- Do not retry indefinitely.

## Incident diagnosis

| Symptom | First checks | Confirmed fix or next action |
|---|---|---|
| Command lacks `--cdp-url` | Check whether `CDP_URL` is set and `browser:status` sees port 9232 | Confirm the browser session and pass explicit `--cdp-url`. |
| Chinese prompt corrupted | Check whether prompt was passed inline through PowerShell | Move prompt to UTF-8 file and use `--prompt-file` or `--prompt-dir`. |
| ChatGPT does not enter image mode | Check for `建立圖像`, `創作圖像`, and `picture_v2` chip state | Preserve action chip; rerun once before selector changes. |
| Prompt is visible but generation wait continues | Check prompt-fill and send-acceptance evidence separately | Require composer clear plus a matching new user message; fail within the short send timeout. |
| ChatGPT returns too few images | Check mode, prompt shape, `--min-images`, and metadata | Use `--prompt-dir` for exact order; use multi-image probe only as evidence. |
| Gemini generation succeeds but no download appears | Check screenshots and metadata before declaring failure | Treat as export/download issue; use screenshot fallback or manual download. |
| Drive picker action misses | Check iframe/picker scope and tab selection | Scope selectors to picker frame and selected Drive tab. |

## Maintenance

Update this runbook when a repeatable workflow, CDP/session setup path, installed skill behavior, output contract, UI selector strategy, or failure recovery path changes. Record major dated changes in `docs/OPERATIONS_LOG.md` and durable project decisions in `docs/PROJECT_MEMORY.md`.
