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

async function ensureImageMode(page) {
  const selectedButton = page.locator(`button[aria-label="${ZH.imageModeSelectedAria}"]`).first();
  if (await selectedButton.isVisible().catch(() => false)) {
    return true;
  }

  const shortcutButton = page.locator('button').filter({ hasText: ZH.imageShortcutText }).first();
  if (await shortcutButton.isVisible().catch(() => false)) {
    await shortcutButton.click({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(900);
    if (await selectedButton.isVisible().catch(() => false)) {
      return true;
    }
  }

  const directImageButton = page.locator('button').filter({ hasText: ZH.imageModeText }).first();
  if (await directImageButton.isVisible().catch(() => false)) {
    await directImageButton.click({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(900);
    return await selectedButton.isVisible().catch(() => false);
  }

  const toolButton = page.locator(`button[aria-label="${ZH.toolButtonAria}"][aria-haspopup="menu"]`).first();
  await toolButton.waitFor({ state: 'visible', timeout: 15000 });
  await toolButton.click({ timeout: 10000 });

  const toolboxMenu = page.locator('#toolbox-drawer-menu[role="menu"]').first();
  await toolboxMenu.waitFor({ state: 'visible', timeout: 10000 });

  const imageMenuButton = toolboxMenu
    .locator('button[role="menuitemcheckbox"]')
    .filter({ hasText: ZH.imageModeText })
    .first();
  await imageMenuButton.waitFor({ state: 'visible', timeout: 10000 });
  await imageMenuButton.click({ timeout: 10000 });
  await page.waitForTimeout(900);

  return await selectedButton.isVisible().catch(() => false);
}

async function openGeminiImageChat(cdpUrl) {
  const browser = await connectToBrowser(cdpUrl);
  const { context, page } = await getGeminiPage(browser);
  await ensureNewChat(page);
  await ensureImageMode(page);
  return { browser, context, page };
}

module.exports = {
  connectToBrowser,
  ensureImageMode,
  ensureNewChat,
  getGeminiPage,
  openGeminiImageChat,
};
