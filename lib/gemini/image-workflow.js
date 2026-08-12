const fs = require('fs');
const path = require('path');
const { ZH } = require('./constants');
const { insertDriveFile } = require('./drive-picker');
const { ensureImageMode, ensureNewChat } = require('./session');

function collectPromptEntries(options) {
  let files = [];

  if (options.promptDir) {
    files = fs
      .readdirSync(options.promptDir)
      .filter((name) => name.toLowerCase().endsWith('.txt'))
      .sort((a, b) => a.localeCompare(b, 'en'))
      .map((name) => path.join(options.promptDir, name));
  } else {
    files = [...options.promptFiles];
  }

  if (!files.length) {
    throw new Error('No prompt files found.');
  }

  return files.map((file, index) => {
    const prompt = fs.readFileSync(file, 'utf8').trim();
    if (!prompt) {
      throw new Error(`Prompt file is empty: ${file}`);
    }
    return {
      index: index + 1,
      file,
      name: path.basename(file),
      prompt,
    };
  });
}

async function findEditor(page) {
  const candidates = [
    page.getByRole('textbox', { name: ZH.textboxAria }).first(),
    page.locator('[role="textbox"][aria-label]').first(),
    page.locator('[role="textbox"]').first(),
  ];

  for (const candidate of candidates) {
    if (await candidate.isVisible().catch(() => false)) {
      return candidate;
    }
  }

  throw new Error('Could not find Gemini prompt textbox.');
}

async function fillPrompt(page, prompt) {
  await findEditor(page);
  const focused = await page.evaluate(() => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const editor = [...document.querySelectorAll('[role="textbox"], .ql-editor[contenteditable="true"]')]
      .find(visible);
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
    throw new Error('Gemini prompt textbox was found but could not be focused.');
  }
  await page.keyboard.press('Control+A').catch(() => {});
  await page.keyboard.press('Backspace').catch(() => {});
  await page.waitForTimeout(250);
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('Input.insertText', { text: prompt });
  } finally {
    await session.detach().catch(() => {});
  }

  const state = await getPromptSubmissionState(page, prompt);
  if (!state.editorFound || !state.promptStillPresent) {
    throw new Error(`Gemini prompt fill verification failed: ${JSON.stringify(state)}`);
  }
  return {
    promptFilled: true,
    editorTextLength: state.editorTextLength,
  };
}

async function getPromptSubmissionState(page, prompt) {
  const prefix = prompt.replace(/\s+/g, ' ').trim().slice(0, 80);
  return page.evaluate((expectedPrefix) => {
    const visible = (element) => {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const normalize = (value) => (value || '').replace(/\s+/g, ' ').trim();
    const editor = [...document.querySelectorAll('[role="textbox"], .ql-editor[contenteditable="true"]')]
      .find(visible);
    const editorText = normalize(editor?.innerText || editor?.textContent || '');
    const userMessages = [...document.querySelectorAll('user-query')];
    const lastUserText = normalize(userMessages.at(-1)?.innerText || userMessages.at(-1)?.textContent || '');
    const modelResponses = [...document.querySelectorAll('model-response')];
    const lastModelText = normalize(modelResponses.at(-1)?.innerText || modelResponses.at(-1)?.textContent || '');
    return {
      editorFound: Boolean(editor),
      editorTextLength: editorText.length,
      promptStillPresent: editorText.includes(expectedPrefix),
      userMessageCount: userMessages.length,
      lastUserMatches: lastUserText.includes(expectedPrefix),
      lastUserTextStart: lastUserText.slice(0, 120),
      modelResponseCount: modelResponses.length,
      lastModelText: lastModelText.slice(0, 500),
    };
  }, prefix);
}

async function clickSend(page, prompt, { timeoutMs = 10000 } = {}) {
  const before = await getPromptSubmissionState(page, prompt);
  if (!before.editorFound || !before.promptStillPresent) {
    throw new Error(`Gemini send precheck failed: ${JSON.stringify(before)}`);
  }

  let after = before;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const sendButton = page.getByLabel(ZH.sendAria).filter({ visible: true }).first();
    await sendButton.waitFor({ state: 'visible', timeout: 10000 });
    await sendButton.click({ timeout: 10000, force: true });

    const accepted = await page.waitForFunction(({ expectedPrompt, beforeUserMessageCount }) => {
    const visible = (element) => {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const editor = [...document.querySelectorAll('[role="textbox"], .ql-editor[contenteditable="true"]')]
      .find(visible);
    const normalize = (value) => (value || '').replace(/\s+/g, ' ').trim();
    const prefix = normalize(expectedPrompt).slice(0, 80);
    const text = normalize(editor?.innerText || editor?.textContent || '');
    const userMessages = [...document.querySelectorAll('user-query')];
    const lastUserText = normalize(userMessages.at(-1)?.innerText || userMessages.at(-1)?.textContent || '');
    return (
      !text.includes(prefix) &&
      userMessages.length > beforeUserMessageCount &&
      lastUserText.includes(prefix)
    );
    }, {
      expectedPrompt: prompt,
      beforeUserMessageCount: before.userMessageCount,
    }, { timeout: timeoutMs }).then(() => true).catch(() => false);

    if (accepted) {
      return {
        composerCleared: true,
        userMessageAdded: true,
        acceptedAt: new Date().toISOString(),
        modelResponseCountBefore: before.modelResponseCount,
        sendAttempts: attempt,
      };
    }
    after = await getPromptSubmissionState(page, prompt);
    if (!after.promptStillPresent) break;
    await page.waitForTimeout(500);
  }

  const error = new Error(`Gemini prompt was not accepted after two retries: ${JSON.stringify(after)}`);
  error.code = 'GEMINI_SEND_NOT_ACCEPTED';
  error.retryAttempts = 2;
  throw error;
}

async function getLoadedImageCount(page) {
  return page.locator('img.image.loaded, img[src^="blob:"]').count().catch(() => 0);
}

async function waitForImageGeneration(page, baselineCount, timeoutMs, prompt = '', stepOptions = {}) {
  const deadline = Date.now() + timeoutMs;
  let stableReadyCount = 0;
  let generationStarted = false;
  const generationStartTimeoutMs = stepOptions.generationStartTimeoutMs || 30000;
  const waitStartedAt = Date.now();

  while (Date.now() < deadline) {
    if (!page.url().includes('gemini.google.com')) {
      throw new Error(`Gemini page navigation drifted during generation: ${page.url()}`);
    }
    const bodyText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
    if (/Out of Memory|Aw, Snap!|STATUS_BREAKPOINT/i.test(bodyText)) {
      throw new Error('Gemini browser renderer is unhealthy; aborting generation wait.');
    }
    let submissionState = null;
    if (prompt) {
      submissionState = await getPromptSubmissionState(page, prompt);
      if (submissionState.promptStillPresent) {
        throw new Error('Gemini prompt returned to or remained in the composer; aborting generation wait.');
      }
    }
    const imageCount = await getLoadedImageCount(page);
    const stopVisible = await page.getByLabel(ZH.stopAria).first().isVisible().catch(() => false);
    const hasImageGeneratingState = bodyText.includes(ZH.generatingNeedle);
    const isGenerating = stopVisible || hasImageGeneratingState;
    const hasNewImage = imageCount > baselineCount;
    if (hasImageGeneratingState || hasNewImage) {
      generationStarted = true;
    }
    const modelAdvanced = (
      Number.isInteger(stepOptions.modelResponseCountBefore) &&
      submissionState?.modelResponseCount > stepOptions.modelResponseCountBefore
    );
    const rejectionText = submissionState?.lastModelText || '';
    if (
      modelAdvanced &&
      !generationStarted &&
      /未能產生|無法產生|無法生成|無法.*(?:圖像|圖片).*(?:輸出|建立|生成)|錯誤判定.*(?:編輯|圖片)|需要參考圖|can't (?:create|generate)|unable to (?:create|generate)|image tool/i.test(rejectionText)
    ) {
      throw new Error(`Gemini model rejected image generation before it started: ${rejectionText.slice(0, 240)}`);
    }
    if (!generationStarted && Date.now() - waitStartedAt >= generationStartTimeoutMs) {
      const detail = modelAdvanced
        ? `Model responded without starting image generation: ${rejectionText.slice(0, 240)}`
        : 'No generation indicator, model response, or new image appeared.';
      throw new Error(`Gemini image generation did not start within ${generationStartTimeoutMs}ms. ${detail}`);
    }

    if (hasNewImage && !isGenerating) {
      stableReadyCount += 1;
    } else {
      stableReadyCount = 0;
    }

    if (stableReadyCount >= 2) {
      await page.waitForTimeout(1500);
      return {
        imageCount,
        newImages: imageCount - baselineCount,
      };
    }

    const untilStartDeadline = generationStartTimeoutMs - (Date.now() - waitStartedAt);
    const nextPollMs = generationStarted ? 5000 : Math.max(100, Math.min(5000, untilStartDeadline));
    await page.waitForTimeout(nextPollMs);
  }

  throw new Error('Timed out waiting for Gemini image generation to complete.');
}

async function runPromptSequence(page, prompts, options) {
  fs.mkdirSync(options.screenshotDir, { recursive: true });
  const results = [];

  if (options.driveFilename) {
    await insertDriveFile(page, options.driveFilename, options.driveTab, options.timeoutMs);
    await page.waitForTimeout(1200);
  }

  for (const entry of prompts) {
    let baselineCount = 0;
    let fillCheck;
    let sendCheck;
    let generation;
    let generationAttempts = 0;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      generationAttempts = attempt;
      try {
        baselineCount = await getLoadedImageCount(page);
        fillCheck = await fillPrompt(page, entry.prompt);
        await page.waitForTimeout(500);
        sendCheck = await clickSend(page, entry.prompt);
        generation = await waitForImageGeneration(page, baselineCount, options.timeoutMs, entry.prompt, {
          generationStartTimeoutMs: options.generationStartTimeoutMs,
          modelResponseCountBefore: sendCheck.modelResponseCountBefore,
        });
        break;
      } catch (error) {
        if (error.retryAttempts >= 2) throw error;
        const retryable = /generation did not start|rejected image generation|renderer is unhealthy/i.test(error.message);
        if (!retryable) throw error;
        if (attempt >= 3) {
          error.code = error.code || 'GEMINI_GENERATION_START_FAILED';
          error.retryAttempts = 2;
          throw error;
        }
        console.warn(`[retry] Gemini prompt ${entry.index} generation check failed; recovery ${attempt}/2: ${error.message}`);
        if (attempt === 1) {
          await ensureImageMode(page);
        } else {
          await ensureNewChat(page);
          await ensureImageMode(page);
          if (options.driveFilename) {
            await insertDriveFile(page, options.driveFilename, options.driveTab, options.timeoutMs);
          }
        }
      }
    }
    const outputBase = path.join(options.screenshotDir, path.basename(entry.name, '.txt'));
    let outputPath = `${outputBase}.png`;

    // Try to download the original image
    let downloaded = false;
    let outputKind = 'screenshot-fallback';
    const latestImage = page.locator('img.image.loaded, img[src^="blob:"]').last();
    if (await latestImage.isVisible().catch(() => false)) {
      await latestImage.scrollIntoViewIfNeeded().catch(() => {});
      await latestImage.hover({ force: true });
      await page.waitForTimeout(1000);
      const downloadBtn = page
        .locator(`button[data-test-id="download-generated-image-button"], button[aria-label="${ZH.downloadOriginalImageAria}"]`)
        .last();
      
      if (await downloadBtn.isVisible().catch(() => false)) {
        console.log(`[workflow] Downloading original image for prompt ${entry.index}`);
        const downloadPromise = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);
        await downloadBtn.click({ force: true });
        const download = await downloadPromise;
        if (download) {
          const suggestedExtension = path.extname(download.suggestedFilename()).toLowerCase();
          const extension = ['.png', '.jpg', '.jpeg', '.webp'].includes(suggestedExtension)
            ? suggestedExtension
            : '.png';
          outputPath = `${outputBase}${extension}`;
          await download.saveAs(outputPath);
          downloaded = true;
          outputKind = 'original-download';
        }
      }
    }

    if (!downloaded) {
      console.log(`[workflow] Fallback to screenshot for prompt ${entry.index}`);
      outputPath = `${outputBase}.png`;
      await page.screenshot({ path: outputPath, fullPage: true });
    }

    const artifact = validateImageArtifact(outputPath);

    results.push({
      index: entry.index,
      file: entry.file,
      name: entry.name,
      baselineCount,
      imageCount: generation.imageCount,
      newImages: generation.newImages,
      outputPath,
      outputKind,
      bytes: artifact.bytes,
      checks: {
        ...fillCheck,
        ...sendCheck,
        generationAttempts,
        generationDetected: generation.newImages > 0,
        artifactValidated: true,
      },
      completedAt: new Date().toISOString(),
    });
  }

  return results;
}

function validateImageArtifact(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`Gemini output artifact is missing: ${file}`);
  }
  const buffer = fs.readFileSync(file);
  const isPng = buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isWebp = buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  if (buffer.length < 1024 || (!isPng && !isJpeg && !isWebp)) {
    throw new Error(`Gemini output artifact is not a valid supported image: ${file} (${buffer.length} bytes)`);
  }
  return { bytes: buffer.length };
}

function writeRunMeta(metaPath, payload) {
  fs.mkdirSync(path.dirname(metaPath), { recursive: true });
  fs.writeFileSync(metaPath, JSON.stringify(payload, null, 2), 'utf8');
}

module.exports = {
  clickSend,
  collectPromptEntries,
  fillPrompt,
  findEditor,
  getLoadedImageCount,
  getPromptSubmissionState,
  runPromptSequence,
  validateImageArtifact,
  waitForImageGeneration,
  writeRunMeta,
};
