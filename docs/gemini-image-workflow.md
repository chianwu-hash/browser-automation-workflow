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

This first formal module does **not** yet solve every Gemini export problem.

In particular:

- generated image download remains platform-dependent and unstable
- result export should be treated as a separate concern from generation success

That separation is intentional because Gemini can succeed at generation while failing at download.
