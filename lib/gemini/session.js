const { chromium } = require('playwright');
const { ZH } = require('./constants');

async function connectToBrowser(cdpUrl) {
  return chromium.connectOverCDP(cdpUrl);
}

async function getGeminiPage(browser) {
  const context = browser.contexts()[0];
  if (!context) {
    throw new Error('No CDP browser context found.');
  }

  const page =
    context.pages().find((p) => p.url().includes(ZH.geminiUrlPart)) ||
    context.pages()[0];

  if (!page) {
    throw new Error('No Gemini page found in the connected CDP browser.');
  }

  await page.bringToFront();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(800);
  return { context, page };
}

async function ensureNewChat(page) {
  const currentUrl = page.url();
  const targetUrl = currentUrl.includes('/u/2/')
    ? 'https://gemini.google.com/u/2/app?hl=zh-TW'
    : 'https://gemini.google.com/app?hl=zh-TW';
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
}

async function isGeminiLoggedOut(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };

    const textOf = (element) => (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim();
    const loginTexts = new Set(['Sign in', 'Log in', 'Login', '\u767b\u5165']);

    return [...document.querySelectorAll('button,a,[role="button"]')].some((element) => {
      if (!visible(element)) return false;
      const text = textOf(element);
      const aria = (element.getAttribute('aria-label') || '').trim();
      return loginTexts.has(text) || loginTexts.has(aria);
    });
  });
}

async function assertGeminiLoggedIn(page) {
  if (await isGeminiLoggedOut(page)) {
    throw new Error(
      [
        'Gemini is not logged in in this work browser.',
        'Ask the user to sign in to Gemini in the opened work browser.',
        'After the user says they are logged in, rerun the Gemini image workflow with the same CDP URL.',
      ].join(' ')
    );
  }
}

async function ensureImageMode(page) {
  const hasSelectedImageMode = async () => page.evaluate((labels) => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const text = (element) => (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim();
    return [...document.querySelectorAll('button,[role="button"],[role="menuitemcheckbox"]')]
      .filter(visible)
      .some((element) => {
        const aria = element.getAttribute('aria-label') || '';
        const checked = element.getAttribute('aria-checked') || '';
        return (
          aria === labels.imageModeSelectedAria ||
          (text(element) === labels.selectedImageChipText && aria.includes(labels.cancelNeedle)) ||
          (text(element).includes(labels.imageModeText) && checked === 'true')
        );
      });
  }, {
    imageModeSelectedAria: ZH.imageModeSelectedAria,
    selectedImageChipText: ZH.selectedImageChipText,
    imageModeText: ZH.imageModeText,
    cancelNeedle: '\u53d6\u6d88\u9078\u53d6',
  });

  if (await hasSelectedImageMode()) {
    return true;
  }

  const shortcutButton = page.locator('button, [role="button"]').filter({ hasText: ZH.imageShortcutText }).first();
  if (await shortcutButton.isVisible().catch(() => false)) {
    await shortcutButton.click({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(900);
    if (await hasSelectedImageMode()) {
      return true;
    }
  }

  const directImageButton = page.locator('button, [role="button"], [role="menuitemcheckbox"]').filter({ hasText: ZH.imageModeText }).first();
  if (await directImageButton.isVisible().catch(() => false)) {
    if (await directImageButton.isDisabled().catch(() => false)) {
      await assertGeminiLoggedIn(page);
      throw new Error('Gemini image mode is visible but disabled for this account or page state.');
    }
    await directImageButton.click({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(900);
    if (await hasSelectedImageMode()) {
      return true;
    }
  }

  const toolButton = page
    .locator(`button[aria-label="${ZH.toolButtonAria}"], button[aria-label="工具"], button[aria-label*="Upload"], button[aria-label*="Tools"]`)
    .first();
  await toolButton.waitFor({ state: 'visible', timeout: 15000 });
  await toolButton.click({ timeout: 10000 });

  await page.waitForTimeout(700);

  const imageMenuButton = page
    .locator('#toolbox-drawer-menu[role="menu"] button[role="menuitemcheckbox"], button[role="menuitemcheckbox"], [role="menuitemcheckbox"]')
    .filter({ hasText: ZH.imageModeText })
    .first();
  await imageMenuButton.waitFor({ state: 'visible', timeout: 10000 });
  if (await imageMenuButton.isDisabled().catch(() => false)) {
    await assertGeminiLoggedIn(page);
    throw new Error('Gemini image mode is visible but disabled for this account or page state.');
  }
  await imageMenuButton.click({ timeout: 10000 });
  await page.waitForTimeout(900);

  return await hasSelectedImageMode();
}

async function openGeminiImageChat(cdpUrl, { reuseChat = false } = {}) {
  const browser = await connectToBrowser(cdpUrl);
  const { context, page } = await getGeminiPage(browser);
  await assertGeminiLoggedIn(page);
  if (!reuseChat) {
    await ensureNewChat(page);
    await assertGeminiLoggedIn(page);
  } else {
    console.log('[session] --reuse-chat: skipping new chat navigation, staying on current page.');
    console.log(`[session] current page: ${page.url()}`);
  }
  await ensureImageMode(page);
  return { browser, context, page };
}

module.exports = {
  assertGeminiLoggedIn,
  connectToBrowser,
  ensureImageMode,
  ensureNewChat,
  getGeminiPage,
  isGeminiLoggedOut,
  openGeminiImageChat,
};
