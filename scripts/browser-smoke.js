const { chromium } = require('playwright');
const { readCdpUrlFromSessionFile } = require('../lib/session-setup');

function parseArgs(argv) {
  const options = {
    cdpUrl: process.env.CDP_URL || '',
    sessionFile: '',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--cdp-url' && argv[i + 1]) {
      options.cdpUrl = argv[++i];
    } else if (arg === '--session-file' && argv[i + 1]) {
      options.sessionFile = argv[++i];
    }
  }

  if (options.sessionFile) {
    options.cdpUrl = readCdpUrlFromSessionFile(options.sessionFile);
  }

  options.cdpUrl = options.cdpUrl || 'http://127.0.0.1:9222';
  return options;
}

async function main() {
  const { cdpUrl } = parseArgs(process.argv.slice(2));
  const browser = await chromium.connectOverCDP(cdpUrl);

  try {
    const context = browser.contexts()[0];
    if (!context) {
      throw new Error('No browser context found.');
    }

    const pages = context.pages();
    const urls = pages.map((page) => page.url());

    console.log(
      JSON.stringify(
        {
          cdpUrl,
          pageCount: pages.length,
          urls
        },
        null,
        2
      )
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
