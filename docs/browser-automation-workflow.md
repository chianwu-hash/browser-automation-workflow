# Browser Automation Workflow

## Core Idea

Many AI tools are easiest to automate after a human has already logged in.

The workflow pattern in this repo is:

1. Prepare a logged-in browser session through the separate `cbs-workflows` repo.
2. Reuse that browser session through CDP.
3. Detect the correct page and current UI state.
4. Execute prompts or workflow steps from UTF-8 files.
5. Wait for observable completion signals.
6. Save evidence such as screenshots and JSON metadata.

## Shared Concerns

### 1. Session Reuse

- Prefer connecting to an existing browser over automating login.
- Reuse the same profile when the workflow depends on product memory or conversation state.
- Treat browser profiles and session config files as sensitive local data.

### 2. Prompt Delivery

- Store prompts in UTF-8 text files.
- Avoid inline PowerShell prompt strings when the content includes Chinese.

### 3. UI State Detection

- Do not assume one fixed button path.
- Expect multiple states:
  - home page
  - active conversation
  - image mode
  - modal open
  - iframe picker open
  - generation in progress
  - generation completed

### 4. Evidence

- Save a screenshot after meaningful state transitions.
- Save machine-readable metadata for later debugging.

### 5. Fallback Design

- Prefer layered selectors over single brittle selectors.
- Prefer scoped interactions over page-global guesses.
- If a platform is unstable, separate "generation succeeded" from "download succeeded".

## Recommended Output Set

For each workflow run, prefer saving:

- one JSON metadata file
- one or more screenshots
- prompt file references
- final output locations when available
