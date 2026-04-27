const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { ZH } = require('./constants');
const { ensureImageMode, ensureNewChat } = require('./session');

function readPromptFile(promptFile) {
  const prompt = fs.readFileSync(promptFile, 'utf8').trim();
  if (!prompt) {
    throw new Error(`Prompt file is empty: ${promptFile}`);
  }
  return prompt;
}

function readPrompts(options) {
  if (options.promptDir) {
    const names = fs
      .readdirSync(options.promptDir)
      .filter((name) => /^\d{2}-.+\.txt$/i.test(name) || /\.txt$/i.test(name))
      .sort((a, b) => a.localeCompare(b));

    if (names.length === 0) {
      throw new Error(`Prompt directory contains no .txt files: ${options.promptDir}`);
    }

    return names.map((name, index) => {
      const promptFile = path.join(options.promptDir, name);
      return {
        index: index + 1,
        name,
        promptFile,
        prompt: readPromptFile(promptFile),
      };
    });
  }

  if (options.promptFile) {
    return [
      {
        index: 1,
        name: path.basename(options.promptFile),
        promptFile: options.promptFile,
        prompt: readPromptFile(options.promptFile),
      },
    ];
  }

  if (options.promptText) {
    const prompt = options.promptText.trim();
    if (!prompt) {
      throw new Error('Prompt text is empty.');
    }
    return [
      {
        index: 1,
        name: 'prompt-text',
        promptFile: null,
        prompt,
      },
    ];
  }

  throw new Error('Missing required --prompt-dir <dir>, --prompt-file <file>, or --prompt-text <text>. Prefer files for non-ASCII prompts.');
}

function buildFirstVariantPrompt(prompt, count) {
  return [
    `Create image 1 of ${count} for this same-chat presentation image set.`,
    'This first image should establish the shared visual style.',
    'Create only one separate downloadable image output in this response.',
    'Never combine multiple images into one collage, contact sheet, grid, or poster.',
    '',
    prompt,
  ].join('\n');
}

function buildSequencePrompt(promptItem, totalCount, isFirst) {
  const lines = [
    `Create image ${promptItem.index} of ${totalCount} for this same-chat presentation image sequence.`,
  ];

  if (isFirst) {
    lines.push('This first image should establish the shared visual style for the whole sequence.');
  } else {
    lines.push('Keep continuity with the previous images: shared palette, tone, typography treatment, and presentation style.');
    lines.push('Follow only the current slide prompt below. Do not infer the current slide from earlier prompts.');
  }

  lines.push(
    'Create exactly one separate downloadable image output.',
    'Never combine multiple slides into one collage, contact sheet, grid, or poster.',
    '',
    `Current slide prompt file: ${promptItem.name}`,
    '',
    promptItem.prompt
  );

  return lines.join('\n');
}

async function findEditor(page) {
  const candidates = [
    page.locator('#prompt-textarea').first(),
    page.getByRole('textbox').first(),
    page.locator('[contenteditable="true"][role="textbox"]').first(),
  ];

  for (const candidate of candidates) {
    if (await candidate.isVisible().catch(() => false)) {
      return candidate;
    }
  }

  throw new Error('Could not find ChatGPT prompt textbox.');
}

async function fillPrompt(page, prompt) {
  const editor = await findEditor(page);
  await editor.click({ timeout: 10000 });
  await page.keyboard.press('Control+A').catch(() => {});
  await page.keyboard.press('Backspace').catch(() => {});
  await page.keyboard.insertText(prompt);
}

async function clickSend(page) {
  const sendButton = page.locator('#composer-submit-button, [data-testid="send-button"]').first();
  await sendButton.waitFor({ state: 'visible', timeout: 15000 });
  await sendButton.click({ timeout: 10000 });
}

async function getGeneratedImages(page) {
  return page.evaluate((generatedImageAltNeedle) => {
    const visible = (el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width >= 120 && rect.height >= 120 && style.display !== 'none' && style.visibility !== 'hidden';
    };

    const seen = new Set();
    return [...document.querySelectorAll('img')]
      .filter(visible)
      .map((img) => ({
        src: img.currentSrc || img.src || '',
        alt: img.getAttribute('alt') || '',
        width: Math.round(img.getBoundingClientRect().width),
        height: Math.round(img.getBoundingClientRect().height),
      }))
      .filter((item) => item.src.includes('/backend-api/estuary/content') || item.alt.includes(generatedImageAltNeedle))
      .filter((item) => {
        if (!item.src || seen.has(item.src)) return false;
        seen.add(item.src);
        return true;
      });
  }, ZH.generatedImageAltNeedle);
}

async function isGenerationInProgress(page) {
  const stopVisible = await page
    .locator('[data-testid="stop-button"], button[aria-label*="Stop"], button[aria-label*="stop"]')
    .first()
    .isVisible()
    .catch(() => false);
  return stopVisible;
}

async function waitForImages(page, baselineSrcs, options) {
  const baseline = new Set(baselineSrcs);
  const deadline = Date.now() + options.timeoutMs;
  let lastChangeAt = Date.now();
  let lastNewCount = 0;
  let stableTicks = 0;

  while (Date.now() < deadline) {
    const allImages = await getGeneratedImages(page);
    const newImages = allImages.filter((item) => !baseline.has(item.src));
    const inProgress = await isGenerationInProgress(page);

    if (newImages.length !== lastNewCount) {
      lastChangeAt = Date.now();
      lastNewCount = newImages.length;
      stableTicks = 0;
    }

    if (newImages.length >= options.minImages && !inProgress) {
      if (newImages.length === lastNewCount) {
        stableTicks += 1;
      } else {
        stableTicks = 0;
        lastNewCount = newImages.length;
      }

      if (stableTicks >= 2) {
        await page.waitForTimeout(1000);
        return newImages;
      }
    } else if (options.allowPartial && newImages.length > 0 && !inProgress) {
      const idleMs = Date.now() - lastChangeAt;
      if (idleMs >= options.idleTimeoutMs) {
        return newImages;
      }
    } else {
      stableTicks = 0;
    }

    await page.waitForTimeout(options.pollMs);
  }

  const allImages = await getGeneratedImages(page);
  const newImages = allImages.filter((item) => !baseline.has(item.src));
  throw new Error(`Timed out waiting for ${options.minImages} generated images. Found ${newImages.length}.`);
}

function extensionFromContentType(contentType) {
  if (/webp/i.test(contentType)) return '.webp';
  if (/jpe?g/i.test(contentType)) return '.jpg';
  return '.png';
}

async function downloadImageFromPage(page, src, outputPathWithoutExtension) {
  const payload = await page.evaluate(async (imageUrl) => {
    const response = await fetch(imageUrl, { credentials: 'include' });
    if (!response.ok) {
      throw new Error(`Image fetch failed with HTTP ${response.status}`);
    }
    const contentType = response.headers.get('content-type') || 'image/png';
    const buffer = await response.arrayBuffer();
    const bytes = Array.from(new Uint8Array(buffer));
    return { contentType, bytes };
  }, src);

  const buffer = Buffer.from(payload.bytes);
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const outputPath = `${outputPathWithoutExtension}${extensionFromContentType(payload.contentType)}`;
  fs.writeFileSync(outputPath, buffer);
  return {
    outputPath,
    contentType: payload.contentType,
    bytes: buffer.length,
    sha256,
  };
}

async function downloadGeneratedImages(page, images, options) {
  fs.mkdirSync(options.outputDir, { recursive: true });
  const downloads = [];
  const skipped = [];
  const seenHashes = options.seenHashes || new Set();

  for (let i = 0; i < images.length; i += 1) {
    const index = String((options.startIndex || 1) + i).padStart(2, '0');
    const basePath = path.join(options.outputDir, `${options.outputPrefix}-${index}`);
    const downloaded = await downloadImageFromPage(page, images[i].src, basePath);
    if (seenHashes.has(downloaded.sha256)) {
      fs.unlinkSync(downloaded.outputPath);
      skipped.push({
        src: images[i].src,
        reason: 'duplicate-content-hash',
        sha256: downloaded.sha256,
      });
      continue;
    }

    seenHashes.add(downloaded.sha256);
    downloads.push({
      index: (options.startIndex || 1) + i,
      outputPath: downloaded.outputPath,
      contentType: downloaded.contentType,
      bytes: downloaded.bytes,
      sha256: downloaded.sha256,
      src: images[i].src,
      alt: images[i].alt,
      width: images[i].width,
      height: images[i].height,
    });
  }

  return { downloads, skipped };
}

function buildFollowupPrompt(nextIndex, totalCount, originalPrompt) {
  return [
    `Create image ${nextIndex} of ${totalCount} for the same presentation image set.`,
    'Keep the same visual style, school-administration tone, palette, and formatting rules as the previous image.',
    'Make this image visibly different from the previous outputs: change the composition, camera angle, title-card placement, foreground objects, and staff arrangement while staying on brief.',
    'Do not recreate, upscale, edit, or lightly revise an earlier image.',
    'Create one separate downloadable image output.',
    '',
    'Continue following the original brief exactly:',
    '',
    originalPrompt,
  ].join('\n');
}

async function runImageBatch(page, options) {
  if (!options.reuseChat) {
    await ensureNewChat(page);
  }
  await ensureImageMode(page);

  const promptItems = readPrompts(options);
  const sequenceMode = Boolean(options.promptDir);
  const requestedCount = sequenceMode ? promptItems.length : options.count || 1;
  const minImages = options.minImages || requestedCount;
  const maxRounds = options.maxRounds || requestedCount;

  if (minImages > requestedCount) {
    throw new Error(`Invalid --min-images. It cannot exceed requested count ${requestedCount}.`);
  }

  if (sequenceMode && options.count !== null && options.count !== promptItems.length) {
    throw new Error(`--prompt-dir provides ${promptItems.length} prompts, so --count must be omitted or set to ${promptItems.length}.`);
  }

  const seenSrcs = new Set((await getGeneratedImages(page)).map((item) => item.src));
  const seenHashes = new Set();
  const downloads = [];
  const rounds = [];

  for (let round = 1; round <= maxRounds && downloads.length < requestedCount; round += 1) {
    const remaining = requestedCount - downloads.length;
    const nextIndex = downloads.length + 1;
    const promptItem = sequenceMode ? promptItems[nextIndex - 1] : promptItems[0];
    const roundPrompt = sequenceMode
      ? buildSequencePrompt(promptItem, requestedCount, round === 1)
      : round === 1
        ? buildFirstVariantPrompt(promptItem.prompt, requestedCount)
        : buildFollowupPrompt(nextIndex, requestedCount, promptItem.prompt);
    await fillPrompt(page, roundPrompt);
    await page.waitForTimeout(500);
    await clickSend(page);

    const generatedImages = await waitForImages(page, [...seenSrcs], {
      minImages: 1,
      timeoutMs: options.timeoutMs,
      pollMs: options.pollMs,
      allowPartial: true,
      idleTimeoutMs: options.idleTimeoutMs,
    });
    const freshImages = generatedImages.filter((item) => !seenSrcs.has(item.src)).slice(0, remaining);
    freshImages.forEach((item) => seenSrcs.add(item.src));

    const roundDownloads = await downloadGeneratedImages(page, freshImages, {
      ...options,
      startIndex: downloads.length + 1,
      seenHashes,
    });
    downloads.push(...roundDownloads.downloads);
    rounds.push({
      round,
      requestedRemaining: remaining,
      detectedNewImages: generatedImages.length,
      downloadedCount: roundDownloads.downloads.length,
      skippedCount: roundDownloads.skipped.length,
      skipped: roundDownloads.skipped,
    });

    if (roundDownloads.downloads.length === 0) {
      break;
    }
  }

  if (downloads.length < minImages) {
    throw new Error(`Downloaded ${downloads.length} images, below required minimum ${minImages}.`);
  }

  return {
    requestedCount,
    minImages,
    sequenceMode,
    promptFiles: promptItems.map((item) => item.promptFile).filter(Boolean),
    rounds,
    downloadedCount: downloads.length,
    prompt: sequenceMode ? null : promptItems[0].prompt,
    downloads,
    completedAt: new Date().toISOString(),
  };
}

function writeRunMeta(metaPath, payload) {
  fs.mkdirSync(path.dirname(metaPath), { recursive: true });
  fs.writeFileSync(metaPath, JSON.stringify(payload, null, 2), 'utf8');
}

module.exports = {
  buildFirstVariantPrompt,
  buildSequencePrompt,
  clickSend,
  downloadGeneratedImages,
  fillPrompt,
  findEditor,
  getGeneratedImages,
  readPrompts,
  runImageBatch,
  waitForImages,
  writeRunMeta,
};
