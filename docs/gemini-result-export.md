# Gemini Result Export

## Purpose

`gemini-result-export` is the export layer for Gemini image workflows.

Its job is to take a result that has already been generated in Gemini and turn it into a stable output artifact, while keeping generation success separate from export success.

## Why This Is Separate

The current workflow already handles:

- session setup
- Gemini chat preparation
- image mode entry
- prompt sequencing
- generation completion

What remains unstable is export:

- the available download route varies by account and UI state
- Gemini may successfully generate an image while failing to export it
- manual download may still be needed in some runs

Because of that, export should not be mixed into the main generation pipeline.

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

V1 does not claim stable automatic download.

Instead it:

- detects the most plausible export route
- records the route in metadata
- returns `manual_required` when Gemini export still needs a human

### 4. Artifact Logging

- saves a screenshot of the current result state
- writes normalized export metadata when used by a higher-level workflow

## Planned Next Step

Later versions may add:

- route-specific download attempts
- browser download-event waiting
- alternative route retries

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
5. Do not pretend unstable platform export has been solved.
