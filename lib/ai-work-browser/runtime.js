'use strict';
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
// Resolve through CBS so consumers need no global CDP installation or direct dependency.
const cdp = createRequire(require.resolve('cbs-workflows'))('cdp-tools');

function localEndpoint(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('只允許本機 HTTP CDP 端點。');
  }
  return `http://127.0.0.1:${url.port || 80}`;
}

function profileFromArgs(args) {
  return args.find((arg) => arg.startsWith('--user-data-dir='))?.slice('--user-data-dir='.length);
}

function windowsProfile(port) {
  if (process.platform !== 'win32') return null;
  const raw = execFileSync('pwsh', ['-NoProfile', '-Command',
    `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Select-Object CommandLine | ConvertTo-Json -Compress`],
  { encoding: 'utf8', timeout: 10000, windowsHide: true }).trim();
  const entries = raw ? [JSON.parse(raw)].flat() : [];
  const command = entries.find((i) => new RegExp(`--remote-debugging-port=${port}(?:\\s|$)`).test(i.CommandLine || ''))?.CommandLine;
  return command?.match(/--user-data-dir=(?:"([^"]+)"|([^\s]+))/)?.slice(1).find(Boolean) || null;
}

async function verifyProfile(browser, instance) {
  const session = await browser.newBrowserCDPSession();
  let profile;
  try {
    const result = await session.send('Browser.getBrowserCommandLine').catch(() => null);
    profile = result ? profileFromArgs(result.arguments) : windowsProfile(instance.port);
  } finally { await session.detach(); }
  const comparable = (value) => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
  if (!profile || comparable(profile) !== comparable(instance.profile)) {
    throw new Error('端點與登記的資料目錄不符，或無法驗證；不會接管或更換連接埠。');
  }
}

function safePageUrl(value = 'about:blank') {
  if (value === 'about:blank') return value;
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('工作分頁 URL 無效。');
  return url.href;
}

async function openInstance(instance, { url, targetId, transport = chromium, tools = cdp } = {}) {
  const cdpUrl = `http://127.0.0.1:${instance.port}`;
  if (await tools.isPortFree(instance.port)) {
    const options = { port: instance.port, profilePath: instance.profile, allowExtensions: true, url: 'about:blank' };
    // Command-line introspection permits exact profile verification on subsequent runs.
    const args = [...tools.buildBrowserArgs(options), '--enable-automation'];
    tools.launchBrowserProcess({ ...options, args });
    await tools.waitForCdpEndpoint(cdpUrl, 15000, 1000);
  }
  const browser = await transport.connectOverCDP(cdpUrl);
  try {
    await verifyProfile(browser, instance);
    const session = await browser.newBrowserCDPSession();
    try {
      if (targetId) {
        await session.send('Target.getTargetInfo', { targetId });
        if (url) throw new Error('已有綁定分頁；請沿用該 TargetId，不建立替代分頁。');
      } else {
        ({ targetId } = await session.send('Target.createTarget', { url: safePageUrl(url) }));
      }
    } finally { await session.detach(); }
    return targetId;
  } finally { await browser.close(); }
}

async function exactPage(browser, targetId) {
  if (!targetId) throw new Error('缺少精確工作分頁 TargetId。');
  // One inventory per connection, never a polling loop or URL/order fallback.
  for (const context of browser.contexts()) {
    for (const page of context.pages()) {
      const session = await context.newCDPSession(page);
      try {
        const { targetInfo } = await session.send('Target.getTargetInfo');
        if (targetInfo.targetId === targetId) return { context, page };
      } finally { await session.detach(); }
    }
  }
  throw new Error('綁定的分頁已不存在，請停止；不可接管其他分頁。');
}

module.exports = { localEndpoint, safePageUrl, profileFromArgs, verifyProfile, openInstance, exactPage };
