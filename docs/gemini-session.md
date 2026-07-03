# Gemini Session

## Purpose

`gemini-session` is the reusable session-control layer for Gemini browser automation.

It is responsible for turning a logged-in Gemini tab into a predictable execution target before any prompt or image task runs.

## Responsibilities

- connect to an existing browser session through CDP
- help the operator decide which app and CDP port to use before the run starts
- locate the active Gemini tab
- bring the Gemini tab to the front and wait for a safe DOM-ready state
- navigate to a fresh Gemini chat when workflow isolation is required
- switch into image mode through layered UI paths
- tolerate UI variance such as:
  - home page vs existing chat
  - direct image shortcut vs `工具 -> 建立圖像`
  - `/app` vs `/u/2/app` account paths

## Non-goals

- prompt sequencing
- image generation completion logic
- result download
- prompt storage conventions

Those belong to `gemini-image-workflow`.

## Public Entry Points

- `connectToBrowser(cdpUrl)`
- `getGeminiPage(browser)`
- `ensureNewChat(page)`
- `ensureImageMode(page)`
- `openGeminiImageChat(cdpUrl)`

## Browser Session Setup

Before a Gemini workflow runs, prepare a browser that is already logged in and reachable through CDP.

On this machine, prefer the shared local CDP launcher:

```powershell
cdp-launch chatgpt
cdp-status
$env:CDP_URL = "http://127.0.0.1:9222"
npm run gemini:image-sequence -- -- --cdp-url $env:CDP_URL --prompt-dir templates\gemini-sequence
```

The older `cbs-workflows` initializer remains supported for machines or repos that still use generated session files.

The initializer answers:

- which application is being prepared
- which browser is used
- which remote debugging port is active
- which persistent profile / user data dir stores login state
- whether Playwright can connect through CDP

Relevant files:

- `..\cbs-workflows\lib\browser-session-init\index.js`
- `..\cbs-workflows\scripts\browser-session-setup.js`
- `..\cbs-workflows\docs\browser-session-init.md`

Legacy session-file flow:

1. From `..\cbs-workflows`, run `npm run browser:init` and choose Gemini, or use `npm run browser:init -- -- --app gemini --yes`
2. Log in to Gemini in the browser opened by the initializer
3. Let the initializer write `.browser-sessions/<name>.json`
4. Run Gemini with either:

```powershell
npm run gemini:image-sequence -- -- --session-file ..\cbs-workflows\.browser-sessions\<name>.json --prompt-dir templates\gemini-sequence
```

or:

```powershell
npm run gemini:image-sequence -- -- --cdp-url http://127.0.0.1:<legacy-port> --prompt-dir templates\gemini-sequence
```

## Design Notes

- Logged-in session reuse is preferred over login automation.
- UI state detection is layered rather than tied to one selector path.
- Chinese UI strings are stored as Unicode escapes in source files to avoid shell encoding issues.
