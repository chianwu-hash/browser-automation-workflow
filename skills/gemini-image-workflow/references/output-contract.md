# Output Contract

Each workflow run should leave enough evidence to debug the run without relying on chat history.

## Minimum artifacts

- one JSON metadata file
- one or more screenshots
- the prompt file paths used for the run
- the Gemini page URL used for the run
- downloaded image paths or fallback screenshot paths

## Sequence runs

For same-chat prompt sequences, prefer metadata shaped like:

- `status` as `completed` or `failed`
- `cdpUrl`
- `pageUrl`
- `promptCount`
- `promptFiles`
- `driveFilename` or `null`
- `driveTab` or `null`
- `screenshotDir`
- `results[]`
- `generatedAt`

Each `results[]` item should include:

- `index`
- `file`
- `name`
- `baselineCount`
- `imageCount`
- `newImages`
- `outputPath`
- `completedAt`

Each completed result should include `outputKind`, `bytes`, and machine-readable `checks` for prompt fill, send acceptance, generation detection, and artifact validation. Failed runs should still write metadata containing the failed step's error message and timestamp.

When Codex CLI escalation runs, preserve a sanitized brief, browser screenshot, structured DOM snapshot, JSONL event log, structured result, and an `escalation` metadata object. Never include prompt contents, cookies, tokens, or login state in the brief or structured result.

## Validation rule

Do not claim success from console text alone. Validate from:

- visible Gemini state
- saved output artifacts
- machine-readable JSON metadata
