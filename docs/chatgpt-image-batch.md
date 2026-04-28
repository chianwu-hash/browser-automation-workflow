# ChatGPT Image Batch

`chatgpt-image-batch` automates ChatGPT web image generation through an already logged-in CDP browser session.

The current ChatGPT UI can produce multiple images in one response, especially when image generation is used with Thinking mode. It can also produce only one image, stop early, or interrupt generation. This workflow therefore supports multi-image detection but keeps a safe same-chat fallback rhythm:

1. Start a fresh ChatGPT chat.
2. Enable image mode.
3. Send exactly one slide prompt.
4. Wait for generated images and download every distinct generated image found in the response.
5. Send the next slide prompt in the same chat.
6. Continue until every prompt file has one downloaded image or the round limit is reached.

This preserves visual continuity while avoiding long waits for images that may never appear. For multi-slide decks, prefer `--prompt-dir` when exact slide order matters. For variant batches, a single prompt can return more than one image in the same response.

## Usage

Prepare a logged-in ChatGPT browser session from `cbs-workflows`:

```powershell
cd ..\cbs-workflows
npm run browser:init -- -- --app chatgpt --browser chrome --port 9333 --yes --no-wait
```

Run one image per UTF-8 prompt file from a directory:

```powershell
cd ..\browser-automation-workflow
npm run chatgpt:image-batch -- -- --cdp-url http://127.0.0.1:9333 --prompt-dir C:\path\to\prompts --output-dir C:\path\to\outputs --output-prefix slide --meta C:\path\to\outputs\run-meta.json
```

Prompt files are sorted by filename, so use prefixes such as `01-cover.txt`, `02-context.txt`, and so on. For Windows and Chinese prompts, prefer `--prompt-dir` or `--prompt-file` over `--prompt-text` so PowerShell does not corrupt non-ASCII text.

You can still generate multiple same-brief variants from one prompt file:

```powershell
npm run chatgpt:image-batch -- -- --cdp-url http://127.0.0.1:9333 --prompt-file C:\path\to\prompt.txt --count 4 --output-dir C:\path\to\outputs --output-prefix variant --meta C:\path\to\outputs\run-meta.json
```

## Important Options

- `--prompt-dir <dir>`
  Preferred deck mode. Generates one image per sorted `.txt` prompt file.
- `--prompt-file <file>`
  Single-prompt mode. Use with `--count` for variants of the same brief.
- `--count 1..50`
  Number of images to produce in single-prompt mode. In `--prompt-dir` mode, omit this or set it to the number of prompt files.
- `--min-images <n>`
  Minimum successful downloads required before the run can be considered successful. Defaults to the requested count.
- `--max-rounds <n>`
  Maximum prompt rounds in the same chat. Defaults to the requested count.
- `--idle-timeout-ms <n>`
  How long to wait after a new image appears before treating the current round as complete. Defaults to 15000.
- `--reuse-chat`
  Stay in the current ChatGPT conversation instead of starting a new one.

## Output

The workflow downloads images from ChatGPT's generated image URLs and writes:

- image files named `<output-prefix>-01.png`, `<output-prefix>-02.png`, etc.
- run metadata JSON with prompt, page URL, download paths, source URLs, byte sizes, and SHA-256 hashes

The workflow deduplicates by image URL and by downloaded content hash.

## Multi-Image DOM Download

ChatGPT multi-image responses are rendered as a main image plus a right-side thumbnail strip. The thumbnail `<img>` nodes still carry full `/backend-api/estuary/content?id=file_...` URLs that can be fetched directly with page credentials.

The downloader therefore:

- scans image nodes inside assistant image-generation containers, not only the main preview image
- excludes user-uploaded reference images and message attachments
- deduplicates by the `id=file_...` query value rather than by raw URL or DOM node count
- keeps the best visible representative for each image id
- downloads each distinct generated image URL directly without clicking thumbnails or opening the editor view

This avoids the slower UI path of selecting each thumbnail, opening the image view, and pressing the download button. UI download remains a possible fallback if the DOM contract changes.

## Current Behavior Notes

In manual testing with the `school-property-inventory-115` prompts, normal image mode often produced one image per response even when asked for several separate images in one request. In later testing with Thinking mode and an uploaded brand reference, ChatGPT produced two distinct generated images in one assistant response; both were downloadable directly from DOM estuary URLs.

For a real deck sequence, be careful about putting all slide prompts into one combined prompt and asking ChatGPT to pick `image N of total`; that caused slide-order drift in testing. Use `--prompt-dir` when each slide must follow its own exact prompt. Use single-prompt multi-image generation for variants or for small batches where a combined prompt is acceptable.

For single-prompt variants, follow-up prompts can look too similar if they simply say "generate more", so the workflow labels each request as `image N of total` and asks for visibly different composition, camera angle, title-card placement, foreground objects, and staff arrangement while preserving the original brief.
