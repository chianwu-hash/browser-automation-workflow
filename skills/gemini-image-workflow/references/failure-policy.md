# Failure Policy

Use these rules when the Gemini workflow fails.

## Missing CDP URL

- Stop immediately.
- Tell the operator to run `npm run browser:init` from the sibling `cbs-workflows` repo.
- Do not silently assume port `9222`.

## No Gemini tab found

- Verify the operator opened Gemini in the browser launched with the chosen remote debugging port.
- Reconnect only after checking the correct browser window.

## Cannot enter image mode

- Try layered detection in this order:
  - image shortcut
  - direct `建立圖像`
  - `工具 -> 建立圖像`
- If all fail, treat it as UI drift and leave a screenshot.

## Drive picker issues

- Expect the optional `Google Workspace` dialog and dismiss it through the supported connect path.
- Scope picker actions to the picker frame.
- Prefer tab-specific selection over global page guesses.

## Prompt generation timeout

- Treat as generation failure, not download failure.
- Save a screenshot and the run metadata before stopping.

## Download instability

- Do not treat download failure as proof that generation failed.
- Gemini may generate successfully while export remains unstable.
- Prefer manual download if platform behavior is flaky.

## Retry guidance

Safe retries:

- reconnect to CDP
- reopen a fresh Gemini chat
- re-enter image mode
- reopen Drive picker

Do not auto-retry indefinitely. Leave artifacts from the failing attempt first.
