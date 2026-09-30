# Failure Policy

Use these rules when the ChatGPT image workflow fails.

## Missing CDP URL

- Stop immediately.
- Use a configured `ai-browser-launch` when available. Otherwise run `npm run browser:init -- --app chatgpt --browser chrome --port 9232 --yes`. Confirm with `npm run browser:status -- --ports 9232` and pass `--cdp-url http://127.0.0.1:9232`.
- If the project uses legacy session files, ask for `--session-file <file>` instead.
- Do not silently assume the browser is already running.

## Not Logged In

- Stop immediately.
- Ask the operator to sign in to ChatGPT in the opened work browser.
- After the operator says they are logged in, rerun the same workflow with the same CDP URL.
- Treat this as a session boundary, not as selector drift or image-mode failure.

## Wrong Experience Mode

- If the page exposes Chat/Work toggles, require the Chat toggle to be selected before filling or sending.
- Do not treat a visible composer in Work mode as a valid ChatGPT image session.
- If the toggle cannot be moved to Chat mode and verified through `aria-checked="true"`, stop before filling the prompt.

## Shared Browser Busy or Conversation Drift

- If another ChatGPT workflow already owns the shared browser, stop before navigating or submitting. Wait for that workflow to finish.
- If the latest visible user message no longer matches the accepted prompt while waiting, stop without resubmitting. ChatGPT may change the conversation URL during normal creation, so do not treat the URL change alone as drift. Do not download or credit images from another conversation.
- Preserve a downloaded but misattributed artifact as failure evidence only; mark its metadata `failed`.

## Cannot Enter the Images Action

- The verified Images action is the default. If it cannot be selected and verified, stop before sending; do not silently fall back to prompt-driven generation.
- Use `--direct-prompt` only for an intentional compatibility probe after deciding that its different routing is acceptable.
- Current composer menus may render `創作圖像` as a focusable `div.__menu-item[tabindex="0"]` without `role="menuitem"`; do not assume button semantics.

## Too Few Images

- Treat one-image output as a valid ChatGPT web behavior unless `--min-images` requires more.
- For exact slide order, prefer `--prompt-dir` so each prompt gets its own round.
- For multi-image-in-one-response tests, use `chatgpt:image-multi-mvp` and record the result as a probe.

## Download Issues

- Generated ChatGPT images are normally downloaded from `/backend-api/estuary/content?id=file_...` URLs with page credentials.
- The current UI may instead place a valid PNG/JPEG/WebP in an assistant file card with a `下載檔案` button. The preview button can intercept pointer clicks; activate the card's download button directly, then verify the downloaded image signature and bytes.
- If the same response also says `圖像生成失敗`, mark the run failed and preserve the validated file and partial result in failure metadata. The image is usable evidence, but the failure message prevents a success claim.
- If the DOM contract changes, inspect generated image containers before adding UI-click download logic.
- Deduplicate by image ID and content hash.

## Prompt Issues

- Prefer UTF-8 prompt files over inline PowerShell strings.
- Treat the prompt file as authoritative for output type, brand identity, mascot prominence, and overlay placement. The generic runner must not silently inject project-specific rules.
- If the prompt mentions Dingxi mascots or brand assets, inspect outputs for anatomy, identity, and fake-logo errors before use.

## Reference Upload Issues

- Pass each reference through a repeated `--reference-image` argument; do not encode binary files into prompt text.
- Verify that every source path exists and is nonzero before browser interaction.
- Upload through the active unified composer (`form[data-type="unified-composer"] input#upload-files`), never the page-level Images-library input (`upload-photos-input`). After upload, require the expected preview-image count or per-file `aria-label` removal controls in that composer before sending. React may clear `input.files` after acceptance.
- If ChatGPT asks for a reference that the request depends on, do not keep retrying the same text-only prompt. Attach the required reference or stop and report the missing asset.
- When a separate brand skill governs the reference, follow its asset routing and upload boundaries before this workflow.

## Send not accepted

- A visible, enabled send button is not proof that a prompt was sent.
- Prefer a focused-composer Enter key event, then fall back to a DOM button activation. The current UI can expose a visible button while pointer hit-testing is intercepted by the document root.
- Require all three signals: the prompt leaves the visible composer, a new user message is added, and the new message matches the prompt prefix.
- If those signals do not appear within the short send timeout, stop before generation waiting begins.
- Record failed-run metadata with the page URL, failed step, and error message; do not record prompt contents or session secrets.

## Generation did not start

- Send acceptance and image-generation start are separate states.
- After send acceptance, image-specific generating text, the page-level renderer progress card, or a new generated-image ID confirms image generation. `正在思考`/`思考中` with a percentage or an active stop control means the accepted request is still processing; keep waiting even though it does not yet prove image-tool start.
- Current Traditional Chinese generating text can use `正在建立圖像`, `正在生成圖像`, or `正在產生...圖片`; treat these as equivalent image-specific start evidence.
- If a new assistant message instead reports that image creation failed, requires a reference image, or was misclassified as editing, stop immediately.
- Do not consume the full generation-completion timeout when no generation-start evidence exists.

## Retry Guidance

Safe retries:

- reconnect to CDP
- start a fresh ChatGPT chat
- re-confirm Chat mode
- rerun the same prompt once after a web-side hang

Never resend after send acceptance has been verified. A server-side image job can survive page-side selector drift or navigation, so starting a fresh chat at that point can create duplicate generations. Recovery retries are allowed only before acceptance. After an accepted request times out or becomes ambiguous, capture evidence, preserve any artifacts, write failed-run metadata with `resubmitSuppressed: true`, and stop for inspection.
