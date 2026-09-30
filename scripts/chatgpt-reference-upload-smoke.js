const { parseArgs } = require('util');
const { acquireBrowserLease } = require('../lib/chatgpt/browser-lease');
const {
  assertChatGPTLoggedIn,
  connectToBrowser,
  ensureNewChat,
  getChatGPTPage,
} = require('../lib/chatgpt/session');
const { validateReferenceImages } = require('../lib/chatgpt/image-batch');

function parseOptions(argv) {
  const { values } = parseArgs({
    args: argv.filter((arg) => arg !== '--'),
    options: {
      'cdp-url': { type: 'string', default: process.env.CDP_URL || 'http://127.0.0.1:9232' },
      'reference-image': { type: 'string', multiple: true },
    },
    strict: true,
    allowPositionals: false,
  });
  return { cdpUrl: values['cdp-url'], referenceImages: values['reference-image'] || [] };
}

async function inspectComposer(page, expectedNames) {
  return page.evaluate((names) => {
    const form = document.querySelector('form[data-type="unified-composer"], form[data-chatgpt-composer]');
    if (!form) return { formFound: false };
    const normalize = (value) => (value || '').replace(/\s+/g, ' ').trim();
    const elements = [...form.querySelectorAll('*')];
    const removalControls = elements.filter((element) => {
      const value = normalize(`${element.getAttribute('aria-label') || ''} ${element.textContent || ''}`);
      return /移除|remove|delete/i.test(value);
    });
    return {
      formFound: true,
      text: normalize(form.innerText),
      matchedNames: names.filter((name) => normalize(form.innerText).includes(name)),
      removalControlCount: removalControls.length,
      images: [...form.querySelectorAll('img')].map((image) => ({ alt: image.alt, width: image.width, height: image.height })),
      testIds: elements.map((element) => element.getAttribute('data-testid')).filter(Boolean),
      ariaLabels: elements.map((element) => element.getAttribute('aria-label')).filter(Boolean),
    };
  }, expectedNames);
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const references = validateReferenceImages(options.referenceImages);
  if (!references.length) throw new Error('Pass at least one --reference-image.');
  const releaseLease = acquireBrowserLease(options.cdpUrl);
  let browser;
  try {
    browser = await connectToBrowser(options.cdpUrl);
    const { page } = await getChatGPTPage(browser);
    await assertChatGPTLoggedIn(page);
    await ensureNewChat(page);
    const input = page.locator('form[data-type="unified-composer"] input#upload-files[type="file"], form[data-chatgpt-composer] input[type="file"][accept="image/*,video/*"]').first();
    await input.waitFor({ state: 'attached', timeout: 15000 });
    await input.setInputFiles(references.map((item) => item.path));
    const immediateFiles = await input.evaluate((element) => [...(element.files || [])].map((file) => file.name));
    const samples = [];
    for (const waitMs of [250, 1000, 3000, 6000]) {
      await page.waitForTimeout(waitMs);
      samples.push({ waitMs, state: await inspectComposer(page, references.map((item) => item.name)) });
    }
    console.log(JSON.stringify({ immediateFiles, samples }, null, 2));
  } finally {
    await browser?.close();
    releaseLease();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
