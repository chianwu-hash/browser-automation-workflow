const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { ZH } = require('./constants');
const { ensureChatMode, ensureImageMode, ensureNewChat } = require('./session');

const NEW_IMAGE_RULES = [
  'Generate a brand-new image from scratch from the instructions below.',
  'Do not treat this as an image-editing request.',
].join('\n');

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

function validateReferenceImages(referenceImages = []) {
  return referenceImages.map((referencePath) => {
    const resolved = path.resolve(referencePath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Reference image does not exist: ${resolved}`);
    }
    const bytes = fs.statSync(resolved).size;
    if (bytes <= 0) {
      throw new Error(`Reference image is empty: ${resolved}`);
    }
    return { path: resolved, name: path.basename(resolved), bytes };
  });
}

async function uploadReferenceImages(page, referenceImages = []) {
  const references = validateReferenceImages(referenceImages);
  if (references.length === 0) {
    return { requestedCount: 0, uploadedCount: 0, files: [] };
  }

  // ChatGPT currently exposes several upload inputs.  The global Images/library
  // input (`upload-photos-input`) is not connected to the active composer, so
  // always prefer the unified-composer input used by the current chat.
  const uploadInput = page.locator([
    'form[data-type="unified-composer"] input#upload-files[type="file"]',
    'form[data-type="unified-composer"] input[type="file"][data-photo-upload-enabled="true"]',
    'form[data-type="unified-composer"] input[type="file"][multiple]',
  ].join(', ')).first();
  await uploadInput.waitFor({ state: 'attached', timeout: 15000 });
  await uploadInput.setInputFiles(references.map((item) => item.path));

  // React may consume and clear input.files immediately.  Verify durable
  // composer attachment UI instead of treating a cleared native input as a
  // failed upload.
  await page.waitForFunction((expectedCount) => {
    const form = document.querySelector('form[data-type="unified-composer"]');
    if (!form) return false;
    const removalControls = [...form.querySelectorAll('[aria-label]')]
      .filter((element) => /移除檔案|remove file/i.test(element.getAttribute('aria-label') || ''));
    return removalControls.length >= expectedCount;
  }, references.length, { timeout: 20000, polling: 500 }).catch(() => {});

  const attachmentState = await page.evaluate((expectedNames) => {
    const normalize = (value) => (value || '').replace(/\s+/g, ' ').trim();
    const form = document.querySelector('form[data-type="unified-composer"]');
    if (!form) return { matchedNames: [], removalControlCount: 0, previewImageCount: 0, ariaLabels: [] };
    const ariaLabels = [...form.querySelectorAll('[aria-label]')]
      .map((element) => normalize(element.getAttribute('aria-label')))
      .filter(Boolean);
    const matchedNames = expectedNames.filter((name) => ariaLabels.some((label) => label.includes(name)));
    const removalControls = ariaLabels.filter((value) => /移除檔案|remove file/i.test(value));
    return {
      matchedNames,
      removalControlCount: removalControls.length,
      previewImageCount: form.querySelectorAll('img').length,
      attachmentLabels: ariaLabels.filter((value) => /移除檔案|remove file|使用者上傳|user upload/i.test(value)),
    };
  }, references.map((item) => item.name));

  const evidenceCount = Math.max(
    attachmentState.matchedNames.length,
    attachmentState.removalControlCount,
    attachmentState.previewImageCount
  );
  if (evidenceCount < references.length) {
    throw new Error(`ChatGPT reference thumbnails were not verified: ${JSON.stringify(attachmentState)}`);
  }

  return {
    requestedCount: references.length,
    uploadedCount: references.length,
    files: references,
    attachmentState,
  };
}

function buildFirstVariantPrompt(prompt, count) {
  return [
    `Generate exactly one brand-new image from scratch for item 1 of ${count}.`,
    'This first image should establish the shared visual style.',
    NEW_IMAGE_RULES,
    'Create only one separate downloadable image output in this response.',
    'Never combine multiple images into one collage, contact sheet, grid, or poster.',
    '',
    prompt,
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
    lines.push('Keep continuity with the previous images: shared palette, tone, typography treatment, and visual style.');
    lines.push('Follow only the current item prompt below. Do not infer the current item from earlier prompts.');
  }

  lines.push(
    'Create exactly one separate downloadable image output.',
    'Never combine multiple images into one collage, contact sheet, grid, or multi-panel output.',
    '',
    `Current slide prompt file: ${promptItem.name}`,
    '',
    promptItem.prompt
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
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const editor = [...document.querySelectorAll(
      'div.ProseMirror[contenteditable="true"], #prompt-textarea, [contenteditable="true"][role="textbox"]'
    )].find(visible);
    return (editor ? (editor.innerText || editor.textContent || editor.value || '') : '')
      .replace(/\s+/g, ' ')
      .trim();
  });
}

async function getPromptSubmissionState(page, prompt) {
  const prefix = prompt.replace(/\s+/g, ' ').trim().slice(0, 80);
  return page.evaluate((expectedPrefix) => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const normalize = (value) => (value || '').replace(/\s+/g, ' ').trim();
    const editor = [...document.querySelectorAll(
      'div.ProseMirror[contenteditable="true"], #prompt-textarea, [contenteditable="true"][role="textbox"]'
    )].find(visible);
    const editorText = normalize(editor?.innerText || editor?.textContent || editor?.value || '');
    const messageTurns = (role) => {
      const currentTurns = [...document.querySelectorAll(`[data-turn="${role}"]`)];
      return currentTurns.length > 0
        ? currentTurns
        : [...document.querySelectorAll(`[data-message-author-role="${role}"]`)];
    };
    const userMessages = messageTurns('user');
    const lastUserText = normalize(userMessages.at(-1)?.innerText || userMessages.at(-1)?.textContent || '');
    const assistantMessages = messageTurns('assistant');
    const lastAssistantText = normalize(assistantMessages.at(-1)?.innerText || assistantMessages.at(-1)?.textContent || '');
    return {
      editorFound: Boolean(editor),
      editorTextLength: editorText.length,
      promptStillPresent: editorText.includes(expectedPrefix),
      userMessageCount: userMessages.length,
      lastUserMatches: lastUserText.includes(expectedPrefix),
      lastUserTextStart: lastUserText.slice(0, 120),
      assistantMessageCount: assistantMessages.length,
      lastAssistantText: lastAssistantText.slice(0, 500),
    };
  }, prefix);
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

async function clickSend(page, prompt, { timeoutMs = 10000 } = {}) {
  const before = await getPromptSubmissionState(page, prompt);
  if (!before.editorFound || !before.promptStillPresent) {
    throw new Error(`ChatGPT send precheck failed: ${JSON.stringify(before)}`);
  }

  let after = before;
  const actions = [
    async () => {
      await focusEditor(page);
      await page.keyboard.press('Enter');
    },
    async () => {
      const sendButton = page.locator('#composer-submit-button:visible, [data-testid="send-button"]:visible').first();
      await sendButton.waitFor({ state: 'visible', timeout: 15000 });
      await sendButton.evaluate((element) => element.click());
    },
    async () => {
      await focusEditor(page);
      await page.keyboard.press('Control+Enter');
    },
  ];

  for (let attempt = 1; attempt <= actions.length; attempt += 1) {
    after = await getPromptSubmissionState(page, prompt);
    if (!after.promptStillPresent) break;
    await actions[attempt - 1]();

    const accepted = await page.waitForFunction(
      ({ expectedPrompt, beforeUserMessageCount }) => {
      const visible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      };
      const normalize = (value) => (value || '').replace(/\s+/g, ' ').trim();
      const prefix = normalize(expectedPrompt).slice(0, 80);
      const editor = [...document.querySelectorAll(
        'div.ProseMirror[contenteditable="true"], #prompt-textarea, [contenteditable="true"][role="textbox"]'
      )].find(visible);
      const editorText = normalize(editor?.innerText || editor?.textContent || editor?.value || '');
      const currentUserTurns = [...document.querySelectorAll('[data-turn="user"]')];
      const userMessages = currentUserTurns.length > 0
        ? currentUserTurns
        : [...document.querySelectorAll('[data-message-author-role="user"]')];
      const lastUserText = normalize(userMessages.at(-1)?.innerText || userMessages.at(-1)?.textContent || '');
      return (
        !editorText.includes(prefix) &&
        userMessages.length > beforeUserMessageCount &&
        lastUserText.includes(prefix)
      );
      },
      { expectedPrompt: prompt, beforeUserMessageCount: before.userMessageCount },
      { timeout: timeoutMs }
    ).then(() => true).catch(() => false);

    if (accepted) {
      return {
        composerCleared: true,
        userMessageAdded: true,
        acceptedAt: new Date().toISOString(),
        assistantMessageCountBefore: before.assistantMessageCount,
        sendAttempts: attempt,
      };
    }
    after = await getPromptSubmissionState(page, prompt);
    if (!after.promptStillPresent) break;
    await page.waitForTimeout(500);
  }

  const error = new Error(`ChatGPT prompt was not accepted after three send methods: ${JSON.stringify(after)}`);
  error.code = 'CHATGPT_SEND_NOT_ACCEPTED';
  error.retryAttempts = 2;
  throw error;
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
    .locator('[data-testid="stop-button"], button[aria-label*="Stop"], button[aria-label*="stop"], button[aria-label*="停止"]')
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
  let generationStarted = false;
  const generationStartTimeoutMs = options.generationStartTimeoutMs || 120000;
  const waitStartedAt = Date.now();

  while (Date.now() < deadline) {
    if (!page.url().includes('chatgpt.com')) {
      throw new Error(`ChatGPT page navigation drifted during generation: ${page.url()}`);
    }
    const bodyText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
    if (/Out of Memory|Aw, Snap!|STATUS_BREAKPOINT/i.test(bodyText)) {
      throw new Error('ChatGPT browser renderer is unhealthy; aborting generation wait.');
    }
    let submissionState = null;
    if (options.prompt) {
      submissionState = await getPromptSubmissionState(page, options.prompt);
      if (submissionState.promptStillPresent) {
        throw new Error('ChatGPT prompt returned to or remained in the composer; aborting generation wait.');
      }
    }
    const allImages = await getGeneratedImages(page);
    const newImages = allImages.filter((item) => !baseline.has(item.id || item.src));
    const inProgress = await isGenerationInProgress(page);
    const generatingText = /正在(?:建立|生成|產生).{0,20}(?:圖像|圖片)|creating image|generating image/i.test(submissionState?.lastAssistantText || '');
    const imageProgressText = /正在產生更細緻的圖片|圖像生成時玩貪食蛇|generating a more detailed image|play snake while (?:the )?image/i.test(bodyText);
    const thinkingProgress = /(?:正在思考|思考中)[\s\S]{0,80}(?:100|[0-9]{1,2})%|(?:100|[0-9]{1,2})%[\s\S]{0,80}(?:正在思考|思考中)/i.test(bodyText);
    const requestStillProcessing = inProgress || thinkingProgress || imageProgressText;
    // The current renderer puts its progress card outside the latest assistant
    // message, where getPromptSubmissionState may report only "思考中".
    if (imageProgressText || generatingText || newImages.length > 0) {
      generationStarted = true;
    }
    const assistantAdvanced = (
      Number.isInteger(options.assistantMessageCountBefore) &&
      submissionState?.assistantMessageCount > options.assistantMessageCountBefore
    );
    const rejectionText = submissionState?.lastAssistantText || '';
    if (
      assistantAdvanced &&
      !generationStarted &&
      /未能產生|無法產生|無法生成|無法.*(?:圖像|圖片).*(?:輸出|建立|生成)|錯誤判定.*(?:編輯|圖片)|要求先有|需要參考圖|can't (?:create|generate)|unable to (?:create|generate)|image tool/i.test(rejectionText)
    ) {
      throw new Error(`ChatGPT assistant rejected image generation before it started: ${rejectionText.slice(0, 240)}`);
    }
    if (!generationStarted && !requestStillProcessing && Date.now() - waitStartedAt >= generationStartTimeoutMs) {
      const detail = assistantAdvanced
        ? `Assistant responded without starting image generation: ${rejectionText.slice(0, 240)}`
        : 'No generation indicator, assistant response, or new image appeared.';
      throw new Error(`ChatGPT image generation did not start within ${generationStartTimeoutMs}ms. ${detail}`);
    }
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

function shouldRetryRoundAttempt(error, sendCheck) {
  // An accepted prompt may keep generating server-side even when the page no
  // longer exposes a recognized progress marker. Never create a duplicate job.
  if (sendCheck?.composerCleared || sendCheck?.userMessageAdded) return false;
  return /generation did not start|rejected image generation|renderer is unhealthy/i.test(error.message);
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
  const isPng = buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isWebp = buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  if (buffer.length < 1024 || (!isPng && !isJpeg && !isWebp)) {
    throw new Error(`Downloaded ChatGPT artifact is not a valid supported image (${buffer.length} bytes).`);
  }
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const outputPath = `${outputPathWithoutExtension}${extensionFromContentType(payload.contentType)}`;
  fs.writeFileSync(outputPath, buffer);
  const writtenBytes = fs.statSync(outputPath).size;
  if (writtenBytes !== buffer.length) {
    throw new Error(`ChatGPT image write verification failed: expected ${buffer.length} bytes, found ${writtenBytes}.`);
  }
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
  let referenceUpload = null;

  for (let round = 1; round <= maxRounds && downloads.length < requestedCount; round += 1) {
    const remaining = requestedCount - downloads.length;
    const nextIndex = downloads.length + 1;
    const promptItem = sequenceMode ? promptItems[nextIndex - 1] : promptItems[0];
    const roundPrompt = sequenceMode
      ? buildSequencePrompt(promptItem, requestedCount, round === 1)
      : round === 1
        ? buildFirstVariantPrompt(promptItem.prompt, requestedCount)
        : buildFollowupPrompt(nextIndex, requestedCount, promptItem.prompt);
    let sendCheck;
    let generatedImages;
    let generationAttempts = 0;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      generationAttempts = attempt;
      try {
        if (round === 1 && (!referenceUpload || attempt > 1)) {
          referenceUpload = await uploadReferenceImages(page, options.referenceImages || []);
        }
        await fillPrompt(page, roundPrompt);
        await page.waitForTimeout(500);
        sendCheck = await clickSend(page, roundPrompt);
        generatedImages = await waitForImages(page, [...seenImageIds], {
          minImages: 1,
          timeoutMs: options.timeoutMs,
          pollMs: options.pollMs,
          allowPartial: true,
          idleTimeoutMs: options.idleTimeoutMs,
          prompt: roundPrompt,
          assistantMessageCountBefore: sendCheck.assistantMessageCountBefore,
          generationStartTimeoutMs: options.generationStartTimeoutMs,
        });
        break;
      } catch (error) {
        if (error.retryAttempts >= 2) throw error;
        const retryable = shouldRetryRoundAttempt(error, sendCheck);
        if (sendCheck?.composerCleared || sendCheck?.userMessageAdded) {
          error.code = error.code || 'CHATGPT_POST_SEND_FAILURE';
          error.resubmitSuppressed = true;
        }
        if (!retryable) throw error;
        if (attempt >= 3) {
          error.code = error.code || 'CHATGPT_GENERATION_START_FAILED';
          error.retryAttempts = 2;
          throw error;
        }
        console.warn(`[retry] ChatGPT round ${round} generation check failed; recovery ${attempt}/2: ${error.message}`);
        await ensureNewChat(page);
        await ensureChatMode(page);
        if (!options.directPrompt) await ensureImageMode(page);
      }
    }
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
      checks: {
        promptFilled: true,
        ...sendCheck,
        generationAttempts,
        generationDetected: generatedImages.length > 0,
        artifactValidated: roundDownloads.downloads.length > 0,
      },
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
    referenceUpload,
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
  getPromptSubmissionState,
  readPrompts,
  runImageBatch,
  shouldRetryRoundAttempt,
  uploadReferenceImages,
  validateReferenceImages,
  waitForImages,
  writeRunMeta,
};
