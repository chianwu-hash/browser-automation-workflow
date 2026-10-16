'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { guardSession, guardPlaywright, guardPuppeteer } = require('../../lib/ai-work-browser/background-policy');
const { openInstance } = require('../../lib/ai-work-browser/runtime');

function transport(hasWindow = true) {
  const calls = [];
  return { calls, send: async (method, params) => {
    calls.push({ method, params });
    if (method === 'Target.getTargets') return { targetInfos: hasWindow ? [{ type: 'page', targetId: 'existing' }] : [] };
    if (method === 'Browser.getWindowForTarget') return { windowId: 1 };
    if (method === 'Target.createTarget') return { targetId: 'new' };
    return {};
  } };
}

test('foreground commands fail before transport; normal CDP input and screenshots work', async () => {
  const raw = transport(); const session = guardSession(raw);
  for (const method of ['Page.bringToFront', 'Target.activateTarget', 'Browser.setWindowBounds']) {
    await assert.rejects(session.send(method), { code: 'AI_BROWSER_FOREGROUND_REQUIRED' });
  }
  assert.equal(raw.calls.length, 0);
  await session.send('Input.dispatchMouseEvent', { type: 'mousePressed' });
  await session.send('Page.captureScreenshot');
  assert.deepEqual(raw.calls.map(call => call.method), ['Input.dispatchMouseEvent', 'Page.captureScreenshot']);
});

test('create target forces background and refuses new or first browser window', async () => {
  const raw = transport(); const session = guardSession(raw);
  await session.send('Target.createTarget', { url: 'about:blank', background: false });
  assert.deepEqual(raw.calls.at(-1).params, { url: 'about:blank', background: true, newWindow: false });
  await assert.rejects(session.send('Target.createTarget', { newWindow: true }), { code: 'AI_BROWSER_FOREGROUND_REQUIRED' });
  const empty = transport(false);
  await assert.rejects(guardSession(empty).send('Target.createTarget'), { code: 'AI_BROWSER_FOREGROUND_REQUIRED' });
  assert.ok(empty.calls.every(call => call.method !== 'Target.createTarget'));
});

test('authorization is strict boolean and scoped to this session', async () => {
  // Non-boolean truthy options must not grant foreground permission.
  const raw = transport();
  await guardSession(raw, { foreground: true }).send('Target.activateTarget', { targetId: 'new' });
  assert.equal(raw.calls[0].method, 'Target.activateTarget');
  for (const foreground of [undefined, false, 'true', 1]) {
    await assert.rejects(guardSession(transport(), { foreground }).send('Page.bringToFront'), { code: 'AI_BROWSER_FOREGROUND_REQUIRED' });
  }
});

test('cold launch is blocked before spawning or connecting', async () => {
  let launches = 0, connections = 0;
  await assert.rejects(openInstance({ port: 9233 }, {
    tools: { isPortFree: async () => true, launchBrowserProcess: () => launches++ },
    transport: { connectOverCDP: async () => connections++ },
  }), { code: 'AI_BROWSER_FOREGROUND_REQUIRED' });
  assert.equal(launches, 0); assert.equal(connections, 0);
});

test('Playwright protects existing and new pages and sessions', async () => {
  const page = { bringToFront: async () => assert.fail('native activation') };
  const context = Object.assign(new EventEmitter(), { pages: () => [page], newCDPSession: async () => transport() });
  const browser = guardPlaywright({ contexts: () => [context], newBrowserCDPSession: async () => transport() });
  await assert.rejects(page.bringToFront(), { code: 'AI_BROWSER_FOREGROUND_REQUIRED' });
  const popup = { bringToFront: async () => assert.fail('native activation') };
  context.emit('page', popup);
  await assert.rejects(popup.bringToFront(), { code: 'AI_BROWSER_FOREGROUND_REQUIRED' });
  await assert.rejects((await context.newCDPSession(page)).send('Page.bringToFront'), { code: 'AI_BROWSER_FOREGROUND_REQUIRED' });
  await assert.rejects(browser.newContext(), { code: 'AI_BROWSER_FOREGROUND_REQUIRED' });
});

test('Puppeteer page and target sessions cannot activate; newPage uses background target', async () => {
  const raw = transport();
  const page = { bringToFront: async () => assert.fail('native activation'), createCDPSession: async () => transport() };
  const target = { createCDPSession: async () => raw, _targetId: 'new', page: async () => page };
  const browser = Object.assign(new EventEmitter(), {
    targets: () => [target], target: () => target, pages: async () => [page],
    waitForTarget: async predicate => { assert.equal(predicate(target), true); return target; },
  });
  const guarded = await guardPuppeteer(browser);
  await assert.rejects(page.bringToFront(), { code: 'AI_BROWSER_FOREGROUND_REQUIRED' });
  await assert.rejects((await page.createCDPSession()).send('Page.bringToFront'), { code: 'AI_BROWSER_FOREGROUND_REQUIRED' });
  raw.detach = async () => {};
  assert.equal(await guarded.newPage(), page);
  assert.equal(raw.calls.at(-1).params.background, true);
});
