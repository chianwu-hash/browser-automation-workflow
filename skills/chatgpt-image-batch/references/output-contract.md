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
- `src` (may be `null` for a downloaded file card)
- `id`
- `sourceType` as `image-node` or `file-card`, and `fileName` for a file card

Each completed round should include machine-readable `checks` for prompt fill, send acceptance, generation detection, and artifact validation. Failed runs should still write metadata containing the failed step's error message and timestamp.

If a downloadable image file card is valid while ChatGPT also reports image-generation failure, retain the validated file and record `checks.fileCardRecovered: true` and `checks.assistantReportedFailure: true`. Mark the run `failed` and preserve its partial result; a valid file alone does not establish successful generation. Do not treat a card label alone as a valid image; verify the downloaded bytes and image signature.

When a failure occurs after verified send acceptance, record `resubmitSuppressed: true` and do not create a new chat or resend the prompt automatically.
When the latest visible user message changes to another request, record `CHATGPT_CONVERSATION_DRIFT` and never count that conversation's image as this run's output. A URL change with the same accepted user message is allowed.

When references are supplied, metadata should also include `result.referenceUpload` with the requested and uploaded counts plus attachment evidence. Do not record binary image data in metadata.

When the current Chat/Work experience toggle is present, session verification must prove that Chat mode was selected before prompt submission. Default runs must also verify the Images action chip; only an explicit `--direct-prompt` probe may proceed without it.

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
