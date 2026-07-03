const { chromium } = require('playwright');
const { ZH } = require('./constants');

async function connectToBrowser(cdpUrl) {
  return chromium.connectOverCDP(cdpUrl);
}

async function getChatGPTPage(browser) {
  const context = browser.contexts()[0];
  if (!context) {
    throw new Error('No CDP browser context found.');
  }

  const chatgptPages = context.pages().filter((p) => p.url().includes(ZH.chatgptUrlPart));
  let page = chatgptPages.find((p) => !p.url().includes('/codex/')) || chatgptPages[0];
  if (!page) {
    page = await context.newPage();
    await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded' });
  }

  await page.bringToFront();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1200);
  return { context, page };
}

async function ensureNewChat(page) {
  await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
}

async function hasImageMode(page) {
  return page.evaluate(({ imageNeedle, removeNeedle }) => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };

    const editor = document.querySelector('div.ProseMirror[contenteditable="true"], [contenteditable="true"][role="textbox"]');
    if (editor && visible(editor) && (editor.innerText || editor.textContent || '').includes(imageNeedle)) {
      return true;
    }

    return [...document.querySelectorAll('button,[role="button"]')].some((button) => {
      if (!visible(button)) return false;
      const aria = button.getAttribute('aria-label') || '';
      const text = button.innerText || button.textContent || '';
      return text.includes(imageNeedle) && aria.includes(removeNeedle);
    });
  }, {
    imageNeedle: ZH.imageModeChipNeedle,
    removeNeedle: ZH.imageModeChipRemoveAriaNeedle,
  });
}

async function clickVisibleButtonByText(page, text) {
  return page.evaluate((targetText) => {
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };

    const button = [...document.querySelectorAll('button')]
      .find((item) => isVisible(item) && (item.innerText || item.textContent || '').trim() === targetText);
    if (!button) return false;
    button.click();
    return true;
  }, text);
}

async function ensureImageMode(page) {
  if (await hasImageMode(page)) {
    return true;
  }

  const chip = page.locator('button, [role="button"]').filter({ hasText: ZH.createImageText }).first();
  if (await chip.isVisible().catch(() => false)) {
    await chip.click({ timeout: 10000, force: true }).catch(() => {});
    await page.waitForTimeout(1200);
    if (await hasImageMode(page)) {
      return true;
    }

    await clickVisibleButtonByText(page, ZH.createImageText);
    await page.waitForTimeout(1200);
    if (await hasImageMode(page)) {
      return true;
    }
  }

  const plus = page.locator('#composer-plus-btn, [data-testid="composer-plus-btn"]').first();
  await plus.waitFor({ state: 'visible', timeout: 15000 });
  await plus.click({ timeout: 10000 });
  await page.waitForTimeout(500);

  const menuItem = page
    .locator('[role="menuitem"], button, [role="button"]')
    .filter({ hasText: ZH.createImageMenuText })
    .first();
  if (await menuItem.isVisible().catch(() => false)) {
    await menuItem.click({ timeout: 10000 });
    await page.waitForTimeout(1200);
  } else {
    await page.keyboard.press('Escape').catch(() => {});
  }

  if (!(await hasImageMode(page))) {
    throw new Error('Could not enable ChatGPT image mode.');
  }

  return true;
}

async function openChatGPTImageChat(cdpUrl, { reuseChat = false, directPrompt = false } = {}) {
  const browser = await connectToBrowser(cdpUrl);
  const { context, page } = await getChatGPTPage(browser);
  if (!reuseChat) {
    await ensureNewChat(page);
    if (directPrompt) {
      console.log('[session] direct prompt mode: skipping explicit ChatGPT image-mode selection.');
    } else {
      await ensureImageMode(page);
    }
  } else {
    console.log('[session] --reuse-chat: staying on current ChatGPT page.');
    console.log(`[session] current page: ${page.url()}`);
    console.log('[session] --reuse-chat: skipping ensureImageMode — trusting current chat state.');
  }
  return { browser, context, page };
}

module.exports = {
  connectToBrowser,
  ensureImageMode,
  ensureNewChat,
  getChatGPTPage,
  hasImageMode,
  openChatGPTImageChat,
};
