# Gemini Result Export

## Purpose

`gemini-result-export` is a conservative helper layer for inspecting export routes on an already-generated Gemini result.

The main `gemini:image-sequence` workflow now attempts the current original-size download route directly through `下載原尺寸圖片`, with screenshot fallback when the download event does not fire. This document remains useful for the lower-level route-detection layer and for future standalone export tooling.

## Why This Is Separate

The current workflow already handles:

- session setup
- Gemini chat preparation
- image mode entry
- prompt sequencing
- generation completion

Export can still vary by UI state:

- the available download route varies by account and UI state
- Gemini may successfully generate an image while failing to export it
- manual download may still be needed in unusual runs

Because of that, route detection stays separate from generation logic.

## Current V1 Responsibilities

### 1. Result Targeting

- locate the latest generated result
- optionally support selecting a result by index
- avoid acting on an older result card by mistake

### 2. Export Route Detection

Probe the available route for the current Gemini UI state, such as:

- three-dot menu export
- hover-triggered download
- lightbox download

### 3. Export Classification

V1 does not perform the download itself.

Instead it:

- detects the most plausible export route
- records the route in metadata
- returns `manual_required` when a standalone export attempt still needs a human

### 4. Artifact Logging

- saves a screenshot of the current result state
- writes normalized export metadata when used by a higher-level workflow

## Relationship To `gemini:image-sequence`

`gemini:image-sequence` is the production path for prompt sequencing and result saving. It already:

- enters image mode
- sends prompts
- waits for generation
- downloads original-size generated images when the current route is visible
- saves a screenshot fallback when download fails

`gemini-result-export` should not duplicate that flow unless it becomes a standalone CLI for exporting a result that is already open in Gemini.

## Planned Next Step

Later versions may either:

- stay as a conservative route-inspection helper, or
- become a standalone export command with route-specific download attempts and browser download-event waiting

## Non-goals

- entering image mode
- sending prompts
- waiting for image generation
- slide assembly
- brand prompt design

## V1 Input Contract

Minimum expected inputs:

- `page`
- `outDir`
- `outputName` or naming rule
- `mode`
  - `latest`
- `timeoutMs`
- `fallbackPolicy`
- `screenshotPath`

V1 supports only `mode: latest`.

## V1 Output Contract

Prefer a normalized result like:

- `status`
  - `manual_required`
  - `failed`
- `route`
  - `menu`
  - `hover`
  - `lightbox`
  - `none`
- `savePath`
- `suggestedFilename`
- `screenshotPath`
- `exportedAt`
- `errorCode`
- `targetKind`
- `targetIndex`

## Error Categories

Recommended categories:

- `RESULT_NOT_FOUND`
- `EXPORT_ROUTE_NOT_FOUND`
- `DOWNLOAD_EVENT_TIMEOUT`
- `DOWNLOAD_UI_CLICK_FAILED`
- `FALLBACK_NOT_AVAILABLE`
- `MANUAL_EXPORT_REQUIRED`

## V1 Scope

V1 is intentionally conservative:

1. Support only the latest result.
2. Detect the major export routes.
3. Save a screenshot artifact.
4. Return `manual_required` or `failed`.
5. Do not duplicate the production download path in `gemini:image-sequence`.
