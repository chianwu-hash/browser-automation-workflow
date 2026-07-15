const { parseArgs } = require('util');
const {
  connectToBrowser,
  ensureImageMode,
  ensureNewChat,
  getChatGPTPage,
  hasImageMode,
} = require('../lib/chatgpt/session');

function parseOptions(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      'cdp-url': { type: 'string', default: process.env.CDP_URL || 'http://127.0.0.1:9222' },
      trials: { type: 'string', default: '3' },
    },
    strict: true,
    allowPositionals: false,
  });

  const trials = Number(values.trials);
  if (!Number.isInteger(trials) || trials < 1) {
    throw new Error('--trials must be a positive integer.');
  }

  return {
    cdpUrl: values['cdp-url'],
    trials,
  };
}

async function clearImageMode(page) {
  await page.keyboard.press('Escape').catch(() => {});
  const chip = page.locator(
    '#prompt-textarea [data-inline-selection-pill][data-id="picture_v2"], ' +
    '#prompt-textarea [data-system-hint-type="picture_v2"]'
  ).first();
  if (await chip.isVisible().catch(() => false)) {
    await chip.click();
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(300);
  }

  const editor = page.locator(
    'div.ProseMirror[contenteditable="true"], #prompt-textarea, [contenteditable="true"][role="textbox"]'
  ).first();
  await editor.waitFor({ state: 'visible', timeout: 15000 });
  await editor.focus();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(300);
}

async function readImageModeState(page) {
  return page.evaluate(() => {
    const chip = document.querySelector(
      '#prompt-textarea [data-inline-selection-pill][data-id="picture_v2"], ' +
      '#prompt-textarea [data-system-hint-type="picture_v2"]'
    );
    return {
      dataId: chip ? chip.getAttribute('data-id') : null,
      hintType: chip ? chip.getAttribute('data-system-hint-type') : null,
      keyword: chip ? chip.getAttribute('data-keyword') : null,
    };
  });
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const browser = await connectToBrowser(options.cdpUrl);
  try {
    const { page } = await getChatGPTPage(browser);
    const results = [];

    for (let trial = 1; trial <= options.trials; trial += 1) {
      await ensureNewChat(page);
      await clearImageMode(page);
      const before = await hasImageMode(page);
      if (before) {
        throw new Error(`Trial ${trial}: image mode was still active after reset.`);
      }

      await ensureImageMode(page);
      const after = await hasImageMode(page);
      if (!after) {
        throw new Error(`Trial ${trial}: image mode was not active after selection.`);
      }

      results.push({
        trial,
        before,
        after,
        chip: await readImageModeState(page),
      });
      console.log(`[trial ${trial}/${options.trials}] image mode enabled`);
    }

    console.log(JSON.stringify({ passed: results.length, results }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
