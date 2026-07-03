const fs = require('fs');
const path = require('path');
const { ZH } = require('./constants');
const { insertDriveFile } = require('./drive-picker');
const { ensureNewChat, ensureImageMode } = require('./session');

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
  await page.evaluate(() => {
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
  await page.keyboard.press('Control+A').catch(() => {});
  await page.keyboard.press('Backspace').catch(() => {});
  await page.waitForTimeout(250);
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('Input.insertText', { text: prompt });
  } finally {
    await session.detach().catch(() => {});
  }
}

async function clickSend(page) {
  const sendButton = page.getByLabel(ZH.sendAria).first();
  await sendButton.waitFor({ state: 'visible', timeout: 10000 });
  await sendButton.click({ timeout: 10000 });
}

async function getLoadedImageCount(page) {
  return page.locator('img.image.loaded, img[src^="blob:"]').count().catch(() => 0);
}

async function waitForImageGeneration(page, baselineCount, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let stableReadyCount = 0;

  while (Date.now() < deadline) {
    const imageCount = await getLoadedImageCount(page);
    const stopVisible = await page.getByLabel(ZH.stopAria).first().isVisible().catch(() => false);
    const bodyText = await page.locator('body').innerText().catch(() => '');
    const isGenerating = stopVisible || bodyText.includes(ZH.generatingNeedle);
    const hasNewImage = imageCount > baselineCount;

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

    await page.waitForTimeout(2000);
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
    if (options.reuseChat && entry === prompts[0]) {
      // Skip new chat for the first prompt if reuse-chat is explicitly requested
    } else {
      console.log(`[workflow] Starting new chat for prompt ${entry.index}`);
      await ensureNewChat(page);
      await ensureImageMode(page);
    }

    const baselineCount = await getLoadedImageCount(page);
    await fillPrompt(page, entry.prompt);
    await page.waitForTimeout(500);
    await clickSend(page);

    const generation = await waitForImageGeneration(page, baselineCount, options.timeoutMs);
    let outputPath = path.join(
      options.screenshotDir,
      `${path.basename(entry.name, '.txt')}.jpeg`
    );

    // Try to download the original image
    let downloaded = false;
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
          await download.saveAs(outputPath);
          downloaded = true;
        }
      }
    }

    if (!downloaded) {
      console.log(`[workflow] Fallback to screenshot for prompt ${entry.index}`);
      outputPath = outputPath.replace('.jpeg', '.png');
      await page.screenshot({ path: outputPath, fullPage: true });
    }

    results.push({
      index: entry.index,
      file: entry.file,
      name: entry.name,
      baselineCount,
      imageCount: generation.imageCount,
      newImages: generation.newImages,
      outputPath,
      completedAt: new Date().toISOString(),
    });
  }

  return results;
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
  runPromptSequence,
  waitForImageGeneration,
  writeRunMeta,
};
