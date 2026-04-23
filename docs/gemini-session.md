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

## Session Setup Guidance

Before a workflow runs, the operator should be able to answer two things:

1. Which application are we preparing a logged-in session for?
2. Which remote debugging port should the browser use?

This repo now includes a setup helper:

- `scripts/browser-session-setup.js`

It supports:

- asking the operator which app they want to log into
- asking for a preferred port
- picking a free port automatically if the operator does not know which one to use
- printing the login URL and example Chrome / Edge launch commands

Recommended flow:

1. Run `npm run browser:session-setup`
2. Start the browser with the suggested port
3. Log in to the target app in that browser
4. Run the actual automation workflow with the resulting CDP URL

## Design Notes

- Logged-in session reuse is preferred over login automation.
- UI state detection is layered rather than tied to one selector path.
- Chinese UI strings are stored as Unicode escapes in source files to avoid shell encoding issues.
