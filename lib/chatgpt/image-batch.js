const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { ZH } = require('./constants');
const { ensureImageMode, ensureNewChat } = require('./session');

const DECK_WIDE_STYLE_RULES = [
  'Deck-wide rules for the entire AI administrative workbench presentation. Apply these rules to every slide, not only the current slide.',
  '- The deck is a formal elementary-school administrative proposal. Keep it calm, readable, practical, and credible.',
  '- The main subject of each slide must be the administrative logic: case evidence, workflow, data, safety, procurement, or rollout plan.',
  '- Brand identity must support the message only. It must never become the composition, theme, or visual focus.',
  '- Reserve overlay-safe corners: keep the top-right corner clear for the official school crest, and keep the bottom-left corner clear for the page-number badge. Do not place text, icons, metrics, mascots, or important objects in those two corners.',
  '- Use restrained school-office colors, clear spacing, and information-design layout. Avoid cute poster styling, sticker-heavy compositions, giant arrows, comic excitement marks, and excessive saturation.',
  '- Use audience-friendly Traditional Chinese. Avoid unexplained engineering terms.',
  '- Use 模擬執行. If English is needed, write it once as 模擬執行（dry-run） and explain: 先預覽結果，不直接改原始資料.',
  '- Explain acronyms on first use. For example: 場租管理系統（VRMS） and Venue Rental Management System.',
  '- Every implemented application or workflow example slide must clearly mark it as a case. The visible title should start with 案例： or 場租案例一／二／三：.',
  '- Every case slide must make the AI-workbench value explicit. Show how AI reads, organizes, checks, drafts, calls APIs, prepares outputs, or supports human confirmation.',
  '- If a case uses an API, show the API in the workflow rather than only showing the final interface.',
].join('\n');

const MASCOT_INTEGRITY_RULES = [
  'Strict Dingxi mascot integrity rules. Treat these as brand QA requirements; if any rule is violated, the image is unusable.',
  '- Mascots are optional. Use 0 to 4 tiny mascots only when they do not interfere with text, data, workflow, or the slide message. It is acceptable to omit mascots on dense slides.',
  '- Mascots are small supporting accents only. Keep each mascot under about 10% of slide height, and keep all mascots together under about 15% of total slide area.',
  '- Do not place mascots in the center as the main composition. Prefer edges, corners, desk foreground, or small helper positions.',
  '- Avoid cute poster energy, oversized mascot faces, sticker-heavy layouts, comic-book excitement marks, and excessive saturation.',
  '- Use the uploaded reference only for the four mascot characters. Keep their original colors and silhouettes.',
  '- Do not invent new mascot species, substitute animals, or merge mascots together.',
  '- Never add or remove arms, hands, legs, feet, eyes, wings, tails, horns, ears, fins, claws, or extra body parts.',
  '- Props must be held by existing hands only. Do not create extra hands, fingers, arms, tentacles, tails, or support limbs to hold props.',
  '- If a pose is hard, simplify the pose or make the mascot smaller; do not change mascot anatomy.',
  '- Light mascot: yellow round body, one glowing antenna, exactly two arms/hands, exactly two legs/feet, exactly one pair of yellow wings, no tail.',
  '- Fire mascot: orange-red flame body, exactly two arms/hands, exactly two legs/feet, two front teeth, no wings, no tail, no extra flame limbs.',
  '- Water mascot: blue water-drop body, exactly one eye, exactly two arms/hands, exactly two legs/feet, no wings, no tail, no extra eyes.',
  '- Tree mascot: orange trunk body with green tree crown, exactly two arms/hands, exactly two legs/feet; leaves/birds/fruit are decoration, not extra limbs.',
].join('\n');

const NEW_IMAGE_RULES = [
  'Generate a brand-new image from scratch from the instructions below.',
  'Do not treat this as an image-editing request.',
  'Do not ask for an uploaded image or reference image before generating.',
].join('\n');

function promptMentionsMascots(prompt) {
  return /mascot|four-mascot|精靈|光精靈|火精靈|海精靈|樹精靈/i.test(prompt);
}

function withDeckWideRules(prompt) {
  const parts = [DECK_WIDE_STYLE_RULES];
  if (promptMentionsMascots(prompt)) {
    parts.push(MASCOT_INTEGRITY_RULES);
  }
  parts.push(prompt);
  return parts.join('\n\n');
}

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
    `Generate exactly one brand-new image from scratch for item 1 of ${count}.`,
    'This first image should establish the shared visual style.',
    NEW_IMAGE_RULES,
    'Create only one separate downloadable image output in this response.',
    'Never combine multiple images into one collage, contact sheet, grid, or poster.',
    '',
    withDeckWideRules(prompt),
  ].join('\n');
}

function buildSequencePrompt(promptItem, totalCount, isFirst) {
  const lines = [
    `Generate exactly one brand-new image from scratch for item ${promptItem.index} of ${totalCount}.`,
    NEW_IMAGE_RULES,
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
    withDeckWideRules(promptItem.prompt)
  );

  return lines.join('\n');
}

async function findEditor(page) {
  const candidates = [
    page.locator('div.ProseMirror[contenteditable="true"]').first(),
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

async function focusEditor(page) {
  const focused = await page.evaluate(() => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };

    const editor = [...document.querySelectorAll(
      'div.ProseMirror[contenteditable="true"], #prompt-textarea, [contenteditable="true"][role="textbox"]'
    )].find(visible);

    if (!editor) {
      return false;
    }

    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  });

  if (!focused) {
    await findEditor(page);
    throw new Error('Could not focus ChatGPT prompt textbox.');
  }
}

async function clearEditor(page) {
  await focusEditor(page);
  await page.keyboard.press('Control+A').catch(() => {});
  await page.keyboard.press('Backspace').catch(() => {});
  await page.waitForTimeout(250);
}

async function insertPromptText(page, prompt) {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('Input.insertText', { text: prompt });
  } finally {
    await session.detach().catch(() => {});
  }
}

async function getEditorText(page) {
  return page.evaluate(() => {
    const editor = document.querySelector(
      'div.ProseMirror[contenteditable="true"], #prompt-textarea, [contenteditable="true"][role="textbox"]'
    );
    return (editor ? (editor.innerText || editor.textContent || editor.value || '') : '')
      .replace(/\s+/g, ' ')
      .trim();
  });
}

async function fillPrompt(page, prompt) {
  await focusEditor(page);
  const existing = await getEditorText(page);
  const hasImageAction = existing.includes(ZH.createImageMenuText);
  if (!hasImageAction) {
    await clearEditor(page);
  }
  await insertPromptText(page, hasImageAction ? `\n${prompt}` : prompt);

  const expected = prompt.replace(/\s+/g, ' ').trim().slice(0, 80);
  const actual = await getEditorText(page);
  if (expected && !actual.includes(expected)) {
    throw new Error(`ChatGPT prompt textbox did not receive the expected text. Current text starts with: ${actual.slice(0, 120)}`);
  }
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
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };

    const contentId = (src) => {
      try {
        return new URL(src).searchParams.get('id') || src;
      } catch {
        return src;
      }
    };

    const hasAncestorClassPart = (el, part) => {
      let current = el;
      while (current) {
        if (String(current.className || '').includes(part)) return true;
        current = current.parentElement;
      }
      return false;
    };

    const scoreImage = (item) => {
      let score = item.width * item.height;
      if (item.hasImageContainer) score += 100000000;
      if (!item.inButton) score += 1000000;
      return score;
    };

    const byId = new Map();
    const candidates = [...document.querySelectorAll('img')]
      .filter(visible)
      .map((img) => {
        const rect = img.getBoundingClientRect();
        const src = img.currentSrc || img.src || '';
        const imageContainer = img.closest('[id^="image-"]');
        const userAttachment = hasAncestorClassPart(img, 'message-image') && !imageContainer;
        return {
          id: contentId(src),
          src,
          alt: img.getAttribute('alt') || '',
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          hasImageContainer: Boolean(imageContainer),
          imageContainerId: imageContainer ? imageContainer.id : '',
          inButton: Boolean(img.closest('button')),
          userAttachment,
        };
      })
      .filter((item) => item.src.includes('/backend-api/estuary/content') || item.alt.includes(generatedImageAltNeedle))
      .filter((item) => item.src && !item.userAttachment)
      .filter((item) => item.hasImageContainer || item.width >= 120 || item.height >= 120);

    for (const item of candidates) {
      const key = item.id || item.src;
      const previous = byId.get(key);
      if (!previous || scoreImage(item) > scoreImage(previous)) {
        byId.set(key, item);
      }
    }

    return [...byId.values()];
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
  let lastSignature = '';
  let stableTicks = 0;

  while (Date.now() < deadline) {
    const allImages = await getGeneratedImages(page);
    const newImages = allImages.filter((item) => !baseline.has(item.id || item.src));
    const inProgress = await isGenerationInProgress(page);
    const signature = newImages.map((item) => item.id || item.src).sort().join('|');

    if (newImages.length !== lastNewCount || signature !== lastSignature) {
      lastChangeAt = Date.now();
      lastNewCount = newImages.length;
      lastSignature = signature;
      stableTicks = 0;
    }

    const idleMs = Date.now() - lastChangeAt;
    const imageSetLooksStable = !inProgress || idleMs >= options.idleTimeoutMs;

    if (newImages.length >= options.minImages && imageSetLooksStable) {
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
    } else if (options.allowPartial && newImages.length > 0) {
      if (idleMs >= options.idleTimeoutMs) {
        return newImages;
      }
    } else {
      stableTicks = 0;
    }

    await page.waitForTimeout(options.pollMs);
  }

  const allImages = await getGeneratedImages(page);
  const newImages = allImages.filter((item) => !baseline.has(item.id || item.src));
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
      id: images[i].id,
      alt: images[i].alt,
      width: images[i].width,
      height: images[i].height,
    });
  }

  return { downloads, skipped };
}

function buildFollowupPrompt(nextIndex, totalCount, originalPrompt) {
  return [
    `Generate exactly one brand-new image from scratch for item ${nextIndex} of ${totalCount}.`,
    NEW_IMAGE_RULES,
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
    if (!options.directPrompt) {
      await ensureImageMode(page);
    }
  }

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

  const seenImageIds = new Set((await getGeneratedImages(page)).map((item) => item.id || item.src));
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

    const generatedImages = await waitForImages(page, [...seenImageIds], {
      minImages: 1,
      timeoutMs: options.timeoutMs,
      pollMs: options.pollMs,
      allowPartial: true,
      idleTimeoutMs: options.idleTimeoutMs,
    });
    const imagesThisRound = sequenceMode ? 1 : remaining;
    const freshImages = generatedImages
      .filter((item) => !seenImageIds.has(item.id || item.src))
      .slice(0, imagesThisRound);
    freshImages.forEach((item) => seenImageIds.add(item.id || item.src));

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
