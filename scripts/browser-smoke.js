const { chromium } = require('playwright');

async function main() {
  const cdpUrl = process.env.CDP_URL || 'http://127.0.0.1:9222';
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
