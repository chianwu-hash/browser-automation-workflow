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

  let page = context.pages().find((p) => p.url().includes(ZH.chatgptUrlPart));
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
  return page.evaluate((needle) => {
    return [...document.querySelectorAll('button[aria-label]')].some((button) => {
      const aria = button.getAttribute('aria-label') || '';
      const text = button.innerText || button.textContent || '';
      return aria.includes(needle) && text.includes(needle);
    });
  }, ZH.imageModeChipNeedle);
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

  const chip = page.locator('button').filter({ hasText: ZH.createImageText }).first();
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

  const menuItem = page.locator('[role="menuitem"]').filter({ hasText: ZH.createImageMenuText }).first();
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

async function openChatGPTImageChat(cdpUrl, { reuseChat = false } = {}) {
  const browser = await connectToBrowser(cdpUrl);
  const { context, page } = await getChatGPTPage(browser);
  if (!reuseChat) {
    await ensureNewChat(page);
  } else {
    console.log('[session] --reuse-chat: staying on current ChatGPT page.');
    console.log(`[session] current page: ${page.url()}`);
  }
  await ensureImageMode(page);
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
