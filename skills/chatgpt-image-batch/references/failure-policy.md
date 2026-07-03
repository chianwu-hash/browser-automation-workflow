# Failure Policy

Use these rules when the ChatGPT image workflow fails.

## Missing CDP URL

- Stop immediately.
- Tell the operator to run `cdp-launch chatgpt`, confirm with `cdp-status`, and pass `--cdp-url http://127.0.0.1:9222`.
- If the project uses legacy session files, ask for `--session-file <file>` instead.
- Do not silently assume the browser is already running.

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
- If the prompt mentions Dingxi mascots or brand assets, inspect outputs for anatomy, identity, and fake-logo errors before use.

## Retry Guidance

Safe retries:

- reconnect to CDP
- start a fresh ChatGPT chat
- re-enter image mode
- rerun the same prompt once after a web-side hang

Do not auto-retry indefinitely. Keep metadata and downloaded artifacts from failing attempts.
