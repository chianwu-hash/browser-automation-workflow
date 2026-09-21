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
- `referenceImages[]` when supplied
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

When a failure occurs after verified send acceptance, record `resubmitSuppressed: true` and do not create a new chat or resend the prompt automatically.

When references are supplied, metadata should also include `result.referenceUpload` with the requested and uploaded counts plus attachment evidence. Do not record binary image data in metadata.

When the current Chat/Work experience toggle is present, session verification must also prove that Chat mode was selected before prompt submission. An image-mode chip is evidence only for explicit `--image-mode` probes; it is not required for production prompt-driven image generation.

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
