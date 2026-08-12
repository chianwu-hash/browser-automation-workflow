# Failure Policy

Use these rules when the Gemini workflow fails.

## Missing CDP URL

- Stop immediately.
- Tell the operator to run `npm run browser:init -- -- --app gemini --browser chrome --port 9232 --yes`, confirm with `npm run browser:status -- --ports 9232`, and pass `--cdp-url http://127.0.0.1:9232`.
- If the project uses legacy session files, ask for `--session-file <file>` instead.
- Do not silently assume the browser is already running.

## Not Logged In

- Stop immediately.
- Ask the operator to sign in to Gemini in the opened work browser.
- After the operator says they are logged in, rerun the same workflow with the same CDP URL.
- Treat disabled image-mode controls on a signed-out page as a login boundary, not as selector drift.

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
- Inspect whether the prompt actually left the composer. If it remains visible, the send action failed; do not wait through another full generation timeout.
- Composer clearing alone is insufficient. Also require a new `user-query` whose normalized text matches the prompt prefix.
- If either signal is missing after the short send timeout, stop before generation waiting begins and write failed-run metadata.
- After send acceptance, use a separate 30-second generation-start timeout. Require the image-specific generating state or a new loaded image; a generic stop-response button is not sufficient.
- If the model completes a rejection before generation starts, stop immediately instead of consuming the full completion timeout.

## Chrome Out Of Memory

- Treat Chrome's `Out of Memory` error page as a browser-process failure, not a Gemini generation timeout or selector change.
- Preserve one screenshot of the error state, reload or restart the shared work browser, and verify the configured profile and CDP endpoint before one retry.
- Do not repeatedly reconnect Playwright while the renderer is unresponsive; CDP handshakes may connect and then time out until the affected tab is reloaded.

## Current UI Contract

As verified in the Traditional Chinese Gemini UI:

- prompt textbox: `role="textbox"`, aria-label `請輸入 Gemini 提示詞`
- tools button: aria-label `上傳與工具`
- image menu item: `role="menuitemcheckbox"`, text `建立圖像`
- selected image chip: aria-label `取消選取「圖片」`
- send button: aria-label `傳送訊息`
- stop button: aria-label `停止回覆`
- generated image: `img.image.loaded`
- original download: `data-test-id="download-generated-image-button"` or aria-label `下載原尺寸圖片`

If these selectors still match, investigate browser health and send-state verification before declaring UI drift.

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

Do not auto-retry indefinitely. Use at most two recovery retries. If the same checked step still fails, capture a screenshot and DOM snapshot, then invoke the bundled Codex CLI escalation once. The CLI gets 60 seconds to classify transient model failure, UI contract drift, or system failure; when the browser is healthy it should prefer one fresh-chat image-mode rerun over exploratory code changes. If the CLI is unavailable, cannot diagnose the state, or cannot verify completed artifacts within the bounded escalation, write failed-run metadata and return an error. Leave artifacts from the failing attempt first.
