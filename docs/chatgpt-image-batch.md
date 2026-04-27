# ChatGPT Image Batch

`chatgpt-image-batch` automates ChatGPT web image generation through an already logged-in CDP browser session.

The current ChatGPT UI should be treated as a one-image-per-turn tool. It can sometimes produce multiple image outputs from one prompt, but that behavior is not reliable enough for production deck work. This workflow therefore uses a safer same-chat rhythm:

1. Start a fresh ChatGPT chat.
2. Enable image mode.
3. Send exactly one slide prompt.
4. Wait for one generated image and download it.
5. Send the next slide prompt in the same chat.
6. Continue until every prompt file has one downloaded image or the round limit is reached.

This preserves visual continuity while avoiding long waits for images that may never appear. For multi-slide decks, prefer `--prompt-dir` over combining many slide prompts into one large prompt; the latter can cause the model to drift and regenerate the wrong slide.

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

## Current Behavior Notes

In manual testing with the `school-property-inventory-115` prompts, ChatGPT produced one image per response even when asked for several separate images in one request. Follow-up prompts in the same chat produced additional images.

For a real deck sequence, do not put all slide prompts into one combined prompt and ask ChatGPT to pick `image N of total`. That caused slide-order drift in testing. Use `--prompt-dir` so each round contains only the current slide prompt.

For single-prompt variants, follow-up prompts can look too similar if they simply say "generate more", so the workflow labels each request as `image N of total` and asks for visibly different composition, camera angle, title-card placement, foreground objects, and staff arrangement while preserving the original brief.
