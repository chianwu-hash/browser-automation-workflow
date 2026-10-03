'use strict';
// Read-only, no-launch validation. Acquire through the configured launcher first.
const { chromium } = require('playwright');
const { verifyProfile, exactPage } = require('../lib/ai-work-browser/runtime');
async function main() {
  const [cdpUrl, profile, targetId] = process.argv.slice(2);
  if (!cdpUrl || !profile || !targetId) throw new Error('需要已取得占用的端點、預期資料目錄與 TargetId。');
  const browser = await chromium.connectOverCDP(cdpUrl);
  try {
    await verifyProfile(browser, { port: Number(new URL(cdpUrl).port), profile });
    await exactPage(browser, targetId);
    console.log('PASS registered profile and exact target; no navigation, submission or download interception.');
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
