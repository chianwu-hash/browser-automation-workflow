const { parseArgs } = require('util');
const { acquireBrowserLease } = require('../lib/chatgpt/browser-lease');
const {
  assertChatGPTLoggedIn,
  connectToBrowser,
  ensureChatMode,
  getChatGPTPage,
} = require('../lib/chatgpt/session');

function parseOptions(argv) {
  const { values } = parseArgs({
    args: argv.filter((arg) => arg !== '--'),
    options: {
      'cdp-url': { type: 'string', default: process.env.CDP_URL || 'http://127.0.0.1:9232' },
    },
    strict: true,
    allowPositionals: false,
  });
  return { cdpUrl: values['cdp-url'] };
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const releaseLease = acquireBrowserLease(options.cdpUrl);
  let browser;
  try {
    browser = await connectToBrowser(options.cdpUrl);
    const { page } = await getChatGPTPage(browser);
    await assertChatGPTLoggedIn(page);
    const chatMode = await ensureChatMode(page);
    const composer = page.locator(
      'div.ProseMirror[contenteditable="true"], #prompt-textarea, [contenteditable="true"][role="textbox"]'
    ).first();
    const send = page.locator('#composer-submit-button, [data-testid="send-button"], form[data-chatgpt-composer] button[type="submit"][aria-label="傳送"]').first();
    const plus = page.locator('#composer-plus-btn, [data-testid="composer-plus-btn"], form[data-chatgpt-composer] button[aria-label="新增檔案和更多內容"]').first();
    const sendInitiallyAttached = await send.count().then((count) => count > 0).catch(() => false);
    let sendButtonReady = sendInitiallyAttached;
    if (!sendInitiallyAttached) {
      await composer.fill('UI contract probe');
      sendButtonReady = await send.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);
      await composer.fill('');
    }
    const result = {
      pageUrl: page.url(),
      chatMode,
      composerVisible: await composer.isVisible().catch(() => false),
      sendInitiallyAttached,
      sendButtonReady,
      plusButtonVisible: await plus.isVisible().catch(() => false),
      checkedAt: new Date().toISOString(),
    };
    if (!result.composerVisible || !result.sendButtonReady || !result.plusButtonVisible) {
      throw new Error(`ChatGPT UI contract check failed: ${JSON.stringify(result)}`);
    }
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser?.close();
    releaseLease();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
