'use strict';

// Authorization is explicit per invocation; never inferred from an environment
// variable, login permission, setup mode, or a previous browser lease.
function foregroundError() {
  const error = new Error('未取得使用者明確的前景指示；禁止啟用 AI 工作瀏覽器。請自行啟動瀏覽器，或明確指定顯示。');
  error.code = 'AI_BROWSER_FOREGROUND_REQUIRED';
  return error;
}

function guardSession(session, { foreground = false } = {}) {
  foreground = foreground === true;
  if (session.__aiBackgroundGuard) return session;
  const send = session.send.bind(session);
  session.send = async (method, params = {}) => {
    if (!foreground && ['Page.bringToFront', 'Target.activateTarget', 'Browser.setWindowBounds'].includes(method)) {
      throw foregroundError();
    }
    if (!foreground && method === 'Target.createTarget') {
      if (params.newWindow || params.forTab === false) throw foregroundError();
      const { targetInfos } = await send('Target.getTargets', {});
      let hasWindow = false;
      for (const target of targetInfos.filter(target => target.type === 'page')) {
        try { await send('Browser.getWindowForTarget', { targetId: target.targetId }); hasWindow = true; break; } catch {}
      }
      if (!hasWindow) throw foregroundError();
      params = { ...params, background: true, newWindow: false };
    }
    return send(method, params);
  };
  Object.defineProperty(session, '__aiBackgroundGuard', { value: true });
  return session;
}

async function newBackgroundPage(browser, context) {
  const session = await browser.newBrowserCDPSession();
  try {
    const pageEvent = context.waitForEvent('page', { timeout: 10000 }).catch(() => null);
    const { targetId } = await session.send('Target.createTarget', {
      url: 'about:blank', background: true, newWindow: false,
    });
    const page = await pageEvent;
    if (!page) throw new Error('背景分頁尚未連線；停止，不啟用其他分頁。');
    const probe = await context.newCDPSession(page);
    try {
      const { targetInfo } = await probe.send('Target.getTargetInfo');
      if (targetInfo.targetId !== targetId) throw new Error('背景分頁識別不符；停止，不接管其他分頁。');
      return page;
    } finally { await probe.detach(); }
  } finally { await session.detach(); }
}

function guardPlaywright(browser) {
  if (browser.__aiBackgroundGuard) return browser;
  const guardPage = page => {
    page.bringToFront = async () => { throw foregroundError(); };
  };
  const makeSession = browser.newBrowserCDPSession.bind(browser);
  browser.newContext = async () => { throw foregroundError(); };
  browser.newPage = async () => { throw foregroundError(); };
  browser.newBrowserCDPSession = async (...args) => guardSession(await makeSession(...args));
  for (const context of browser.contexts()) {
    const makePageSession = context.newCDPSession.bind(context);
    context.newCDPSession = async (...args) => guardSession(await makePageSession(...args));
    context.newPage = () => newBackgroundPage(browser, context);
    context.pages().forEach(guardPage);
    context.on('page', guardPage);
  }
  Object.defineProperty(browser, '__aiBackgroundGuard', { value: true });
  return browser;
}

async function guardPuppeteer(browser) {
  if (browser.__aiBackgroundGuard) return browser;
  browser.createBrowserContext = async () => { throw foregroundError(); };
  const guardPage = page => {
    page.bringToFront = async () => { throw foregroundError(); };
    const make = page.createCDPSession?.bind(page);
    if (make) page.createCDPSession = async (...args) => guardSession(await make(...args));
  };
  const guardTarget = target => {
    const make = target.createCDPSession.bind(target);
    target.createCDPSession = async (...args) => guardSession(await make(...args));
  };
  browser.targets().forEach(guardTarget);
  browser.on('targetcreated', target => {
    guardTarget(target);
    if (target.type() === 'page') target.page().then(page => page && guardPage(page)).catch(() => {});
  });
  (await browser.pages()).forEach(guardPage);
  browser.newPage = async () => {
    const session = await browser.target().createCDPSession();
    try {
      const { targetId } = await session.send('Target.createTarget', {
        url: 'about:blank', background: true, newWindow: false,
      });
      const target = await browser.waitForTarget(t => t._targetId === targetId, { timeout: 10000 });
      const page = await target.page();
      if (!page) throw new Error('背景分頁無法連線。');
      guardPage(page);
      return page;
    } finally { await session.detach(); }
  };
  Object.defineProperty(browser, '__aiBackgroundGuard', { value: true });
  return browser;
}

module.exports = { foregroundError, guardSession, guardPlaywright, guardPuppeteer, newBackgroundPage };
