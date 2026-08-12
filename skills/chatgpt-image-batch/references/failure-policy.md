# Failure Policy

Use these rules when the ChatGPT image workflow fails.

## Missing CDP URL

- Stop immediately.
- Tell the operator to run `npm run browser:init -- -- --app chatgpt --browser chrome --port 9232 --yes`, confirm with `npm run browser:status -- --ports 9232`, and pass `--cdp-url http://127.0.0.1:9232`.
- If the project uses legacy session files, ask for `--session-file <file>` instead.
- Do not silently assume the browser is already running.

## Not Logged In

- Stop immediately.
- Ask the operator to sign in to ChatGPT in the opened work browser.
- After the operator says they are logged in, rerun the same workflow with the same CDP URL.
- Treat this as a session boundary, not as selector drift or image-mode failure.

## Cannot Enter Image Mode

- Check whether the current UI exposes `建立圖像` or the `創作圖像` action state.
- Preserve the action chip when filling the prompt; clearing the whole composer can remove image mode.
- Try one rerun before changing selectors, because ChatGPT web can transiently hang after send.

## Too Few Images

- Treat one-image output as a valid ChatGPT web behavior unless `--min-images` requires more.
- For exact slide order, prefer `--prompt-dir` so each prompt gets its own round.
- For multi-image-in-one-response tests, use `chatgpt:image-multi-mvp` and record the result as a probe.

## Download Issues

- Generated ChatGPT images are normally downloaded from `/backend-api/estuary/content?id=file_...` URLs with page credentials.
- If the DOM contract changes, inspect generated image containers before adding UI-click download logic.
- Deduplicate by image ID and content hash.

## Prompt Issues

- Prefer UTF-8 prompt files over inline PowerShell strings.
- Treat the prompt file as authoritative for output type, brand identity, mascot prominence, and overlay placement. The generic runner must not silently inject project-specific rules.
- If the prompt mentions Dingxi mascots or brand assets, inspect outputs for anatomy, identity, and fake-logo errors before use.

## Send not accepted

- A visible, enabled send button is not proof that a prompt was sent.
- Require all three signals: the prompt leaves the visible composer, a new user message is added, and the new message matches the prompt prefix.
- If those signals do not appear within the short send timeout, stop before generation waiting begins.
- Record failed-run metadata with the page URL, failed step, and error message; do not record prompt contents or session secrets.

## Generation did not start

- Send acceptance and image-generation start are separate states.
- Within 30 seconds after send acceptance, require image-specific generating text in the latest assistant turn or a new generated-image ID. A generic stop-response button is not sufficient.
- Current Traditional Chinese generating text can use `正在建立圖像`, `正在生成圖像`, or `正在產生...圖片`; treat these as equivalent image-specific start evidence.
- If a new assistant message instead reports that image creation failed, requires a reference image, or was misclassified as editing, stop immediately.
- Do not consume the full generation-completion timeout when no generation-start evidence exists.

## Retry Guidance

Safe retries:

- reconnect to CDP
- start a fresh ChatGPT chat
- re-enter image mode
- rerun the same prompt once after a web-side hang

Do not auto-retry indefinitely. Use at most two recovery retries. If the same checked step still fails, capture a screenshot and DOM snapshot, then invoke the bundled Codex CLI escalation once. The CLI gets 60 seconds to classify transient model failure, UI contract drift, or system failure; when the browser is healthy it should prefer one fresh-chat image-mode rerun over exploratory code changes. If the CLI is unavailable, cannot diagnose the state, or cannot verify completed artifacts within the bounded escalation, write failed-run metadata and return an error. Keep metadata and downloaded artifacts from failing attempts.
