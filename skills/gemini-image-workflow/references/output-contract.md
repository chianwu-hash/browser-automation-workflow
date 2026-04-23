# Output Contract

Each workflow run should leave enough evidence to debug the run without relying on chat history.

## Minimum artifacts

- one JSON metadata file
- one or more screenshots
- the prompt file paths used for the run
- the Gemini page URL used for the run

## Sequence runs

For same-chat prompt sequences, prefer metadata shaped like:

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
- `screenshotPath`
- `completedAt`

## Validation rule

Do not claim success from console text alone. Validate from:

- visible Gemini state
- saved screenshot artifacts
- machine-readable JSON metadata
