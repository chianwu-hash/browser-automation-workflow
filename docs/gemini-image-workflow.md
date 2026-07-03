# Gemini Image Workflow

## Purpose

`gemini-image-workflow` is the reusable image-generation layer built on top of `gemini-session`.

It is responsible for getting prompts into Gemini image mode, optionally attaching a Drive reference image, waiting for new image results, and recording evidence for each run.

## Responsibilities

- collect prompt files from a directory or explicit file list
- read prompt files as UTF-8
- fill the Gemini prompt editor safely
- optionally attach a Google Drive reference image
- send prompts in the same chat for style or character continuity
- wait for each image round to complete before sending the next prompt
- save screenshots and JSON metadata for every run

## Public Entry Points

- `collectPromptEntries(options)`
- `fillPrompt(page, prompt)`
- `clickSend(page)`
- `waitForImageGeneration(page, baselineCount, timeoutMs)`
- `runPromptSequence(page, prompts, options)`
- `writeRunMeta(metaPath, payload)`

## Drive Reference Support

This module can reuse the Drive picker workflow when a run needs a brand image or another visual reference.

The current reusable Drive behavior includes:

- opening the upload menu
- selecting `加入雲端硬碟檔案`
- handling the optional Google Workspace connect dialog
- switching picker tabs such as `近期`, `我的雲端硬碟`, `與我共用`, or `已加星號`
- inserting a chosen Drive file and confirming attachment preview

## Current Boundaries

This module now attempts the current Gemini original-size download route, while still treating export as a separate state from generation.

In particular:

- generated image download currently works through the `下載原尺寸圖片` button when it is visible
- screenshot fallback remains available when the download event does not fire
- result export should still be treated as a separate concern from generation success

That separation is intentional because Gemini can succeed at generation while failing at download.

## UI Drift Notes

### 2026-07-03

The current Gemini web UI in Traditional Chinese uses these image-generation anchors:

- the prompt editor is a Quill-style `role="textbox"` editor with aria label `請輸入 Gemini 提示詞`
- the tools menu button is labeled `上傳與工具`
- image mode is selected from `建立圖像`
- after image mode is enabled, the selected chip is `圖片` with aria label `取消選取「圖片」`
- generated images render as loaded blob images such as `img.image.loaded` / `img[src^="blob:"]`
- the original image download button is labeled `下載原尺寸圖片`

Smoke validation after the selector update:

- 3 consecutive one-prompt runs succeeded
- all 3 runs produced one new image
- all 3 runs downloaded an original-size JPEG instead of using screenshot fallback
