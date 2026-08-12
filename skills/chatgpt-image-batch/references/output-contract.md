# Output Contract

Each workflow run should leave enough evidence to debug the run without relying on ChatGPT conversation history.

## Batch Runs

Expected artifacts:

- downloaded image files in `outputDir`
- one JSON metadata file at `metaPath`
- source prompt file paths when `--prompt-dir` or `--prompt-file` is used
- ChatGPT page URL used for the run

Metadata should include:

- `status` as `completed` or `failed`
- `cdpUrl`
- `sessionFile` or `null`
- `pageUrl`
- `promptDir` or `promptFile`
- `count`
- `outputDir`
- `result.downloadedCount`
- `result.downloads[]`
- `generatedAt`

Each `downloads[]` item should include:

- `index`
- `outputPath`
- `contentType`
- `bytes`
- `sha256`
- `src`
- `id`

Each completed round should include machine-readable `checks` for prompt fill, send acceptance, generation detection, and artifact validation. Failed runs should still write metadata containing the failed step's error message and timestamp.

When Codex CLI escalation runs, preserve a sanitized brief, browser screenshot, structured DOM snapshot, JSONL event log, structured result, and an `escalation` metadata object. Never include prompt contents, cookies, tokens, or login state in the brief or structured result.

## Multi-Image Probe Runs

The `chatgpt:image-multi-mvp` probe should record:

- `expectedImages`
- `detectedNewImages`
- `downloadedCount`
- `downloads[]`
- `skipped[]`

Use this probe as evidence of current ChatGPT web behavior, not as a production guarantee.

## Validation Rule

Do not claim success from console text alone. Validate from:

- downloaded files on disk
- nonzero byte sizes
- metadata JSON
- distinct SHA-256 hashes when uniqueness matters
