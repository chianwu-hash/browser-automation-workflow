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
  return page.evaluate(({ imageModeDataId, imageModeText, removeNeedle }) => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };

    const editor = document.querySelector('div.ProseMirror[contenteditable="true"], [contenteditable="true"][role="textbox"]');
    if (editor && visible(editor)) {
      const currentChip = editor.querySelector(
        `[data-inline-selection-pill][data-id="${imageModeDataId}"], [data-system-hint-type="${imageModeDataId}"]`
      );
      if (currentChip && visible(currentChip)) {
        return true;
      }

      const legacyChip = [...editor.querySelectorAll('[contenteditable="false"]')].find((element) => {
        const text = (element.innerText || element.textContent || '').trim();
        return visible(element) && text === imageModeText;
      });
      if (legacyChip) {
        return true;
      }
    }

    return [...document.querySelectorAll('button,[role="button"]')].some((button) => {
      if (!visible(button)) return false;
      const aria = button.getAttribute('aria-label') || '';
      const text = button.innerText || button.textContent || '';
      return text.includes(imageModeText) && aria.includes(removeNeedle);
    });
  }, {
    imageModeDataId: ZH.imageModeDataId,
    imageModeText: ZH.createImageMenuText,
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

async function clickCreateImageMenuItem(page) {
  return page.evaluate((targetText) => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };

    const label = [...document.querySelectorAll('span')]
      .find((element) => visible(element) && (element.textContent || '').trim() === targetText);
    const item = label && label.closest('.__menu-item[tabindex="0"]');
    if (!item || !visible(item)) return false;
    item.click();
    return true;
  }, ZH.createImageMenuText);
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
  const menuItem = page.locator(
    '[role="menuitem"], button, [role="button"], div.__menu-item[tabindex]'
  ).filter({ hasText: ZH.createImageMenuText }).last();

  let menuReady = await menuItem.isVisible().catch(() => false);
  for (let attempt = 0; attempt < 2 && !menuReady; attempt += 1) {
    await plus.click({ timeout: 10000 });
    await menuItem.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
    menuReady = await menuItem.isVisible().catch(() => false);
    if (!menuReady && attempt === 0) {
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(300);
    }
  }

  let selected = false;
  if (menuReady) {
    await menuItem.click({ timeout: 10000 });
    selected = true;
  } else {
    selected = await clickCreateImageMenuItem(page);
  }

  if (selected) {
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
