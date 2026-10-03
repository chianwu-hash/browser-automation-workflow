'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync, fork } = require('child_process');
const { BrowserStore } = require('../../lib/ai-work-browser/store');
const { localEndpoint, safePageUrl, verifyProfile, openInstance, exactPage } = require('../../lib/ai-work-browser/runtime');
const { legacyConflicts } = require('../../lib/ai-work-browser/job-lease');
const { openLease, parse, run, stopWorker } = require('../ai-work-browser');
const roots = [];
function store(options) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-browser-test-'));
  roots.push(root);
  return new BrowserStore(root, options);
}
function mockBrowser(profile, targetId = 'owned', calls = []) {
  return {
    close: async () => { calls.push('disconnect'); },
    newBrowserCDPSession: async () => ({ detach: async () => {}, send: async (name, args) => {
      calls.push(name);
      if (name === 'Browser.getBrowserCommandLine') return { arguments: [`--user-data-dir=${profile}`] };
      if (name === 'Target.createTarget') return { targetId };
      if (name === 'Target.getTargetInfo') return { targetInfo: { targetId: args.targetId } };
      throw new Error(name);
    } }),
  };
}

test('default single browser is exclusive; same owner must retain its credential', () => {
  const s = store();
  try {
    s.initialize();
    const a = s.acquire({ owner: 'thread-a' });
    assert.equal(a.instance, 'main');
    assert.equal(s.acquire({ owner: 'thread-b' }).action, 'busy');
    assert.throws(() => s.acquire({ owner: 'thread-a' }), /LeaseId/);
    assert.equal(s.acquire({ owner: 'thread-a', leaseId: a.leaseId }).leaseId, a.leaseId);
    assert.throws(() => s.acquire({ owner: 'thread-b', leaseId: a.leaseId }), /失效/);
    s.release('thread-a', a.leaseId);
    assert.equal(s.acquire({ owner: 'thread-b' }).instance, 'main');
  } finally { s.close(); }
});

test('optional clones start in setup, are idempotent, and become independently available', () => {
  const s = store();
  try {
    s.initialize();
    const clone = s.enable();
    assert.equal(s.enable().profile, clone.profile);
    const main = s.acquire({ owner: 'a' });
    assert.equal(s.acquire({ owner: 'b' }).action, 'busy');
    const setup = s.acquire({ owner: 'setup', instanceId: '01', setup: true });
    assert.equal(setup.instance, '01');
    assert.throws(() => s.ready('01'), /占用/);
    s.release('setup', setup.leaseId);
    s.ready('01');
    assert.equal(s.acquire({ owner: 'b' }).instance, '01');
    assert.equal(s.acquire({ owner: 'c' }).action, 'busy');
    assert.throws(() => s.enable(), /等待/);
    assert.throws(() => s.addClone(), /等待/);
    s.release('a', main.leaseId);
  } finally { s.close(); }
});

test('disable drains live work, reenables without deleting profiles, expansion capped at three', () => {
  const s = store();
  try {
    s.initialize(); s.enable(); s.ready('01');
    const a = s.acquire({ owner: 'a' });
    const b = s.acquire({ owner: 'b' });
    s.disable();
    s.heartbeat('b', b.leaseId);
    assert.equal(s.acquire({ owner: 'c' }).action, 'busy');
    s.release('a', a.leaseId); s.release('b', b.leaseId);
    const before = s.transaction((state) => state.instances.map((i) => i.profile));
    s.enable();
    assert.deepEqual(s.transaction((state) => state.instances.map((i) => i.profile)), before);
    assert.equal(s.addClone().id, '02');
    assert.throws(() => s.addClone(), /最多/);
  } finally { s.close(); }
});

test('expired credentials fail; live worker start identity prevents reclamation', () => {
  let clock = 1000;
  let identity = 'birth-1';
  const s = store({ now: () => clock, identity: () => identity });
  try {
    s.initialize();
    const a = s.acquire({ owner: 'a' });
    s.heartbeat('a', a.leaseId, 999);
    clock += 900001;
    assert.equal(s.acquire({ owner: 'b' }).action, 'busy');
    assert.throws(() => s.release('a', a.leaseId), /停止/);
    s.heartbeat('a', a.leaseId);
    clock += 900001;
    identity = 'birth-2'; // PID reuse is not the same worker.
    assert.equal(s.acquire({ owner: 'b' }).instance, 'main');
    assert.throws(() => s.heartbeat('a', a.leaseId), /失效/);
  } finally { s.close(); }
});

test('uncertain worker inspection stays conservative and a second worker cannot join', () => {
  let identity = 'birth';
  let clock = 1000;
  const s = store({ now: () => clock, identity: () => identity });
  try {
    s.initialize(); const a = s.acquire({ owner: 'a' }); s.heartbeat('a', a.leaseId, 123);
    assert.throws(() => s.heartbeat('a', a.leaseId, 456), /存活/);
    identity = 'unknown'; clock += 900001;
    assert.equal(s.acquire({ owner: 'b' }).action, 'busy');
    identity = null;
    assert.equal(s.acquire({ owner: 'b' }).instance, 'main');
  } finally { s.close(); }
});

test('stable ID required and legacy CBS adoption preserves path and file contents', () => {
  const s = store();
  try {
    const prior = path.join(s.root, 'legacy.json');
    const profile = path.join(s.root, 'existing-profile');
    const content = JSON.stringify({ userDataDir: profile, port: 9444, cdpUrl: 'http://127.0.0.1:9444' });
    fs.writeFileSync(prior, content);
    assert.equal(s.initialize({ sessionFile: prior }).profile, profile);
    assert.equal(s.initialize({ port: 9555 }).port, 9444);
    assert.equal(fs.readFileSync(prior, 'utf8'), content);
    assert.throws(() => s.acquire(), /穩定/);
  } finally { s.close(); }
});

test('local endpoint aliases share a key; unsafe endpoint and page URLs rejected', () => {
  assert.equal(localEndpoint('http://localhost:9232'), localEndpoint('http://127.0.0.1:9232/'));
  assert.throws(() => localEndpoint('https://example.com:9232'), /本機/);
  assert.throws(() => localEndpoint('http://user:pass@localhost:9232'), /本機/);
  assert.throws(() => safePageUrl('javascript:alert(1)'), /無效/);
  assert.throws(() => safePageUrl('https://user:pass@example.com'), /無效/);
});

test('legacy jobs on other explicit endpoints do not block; unknown routing does', () => {
  assert.equal(legacyConflicts('node chatgpt-image-batch.js --cdp-url http://localhost:9233', 'http://127.0.0.1:9232'), false);
  assert.equal(legacyConflicts('node gemini-image-sequence.js --cdp-url=http://localhost:9232', 'http://127.0.0.1:9232'), true);
  assert.equal(legacyConflicts('node chatgpt-image-batch.js --session-file old.json', 'http://127.0.0.1:9232'), true);
});

test('runtime verifies profile before creating a page and always disconnects', async () => {
  const calls = [];
  const instance = { port: 9232, profile: path.resolve('fixture-profile') };
  const tools = { isPortFree: async () => false };
  const browser = mockBrowser(instance.profile, 'target-owned', calls);
  assert.equal(await openInstance(instance, { url: 'https://example.invalid', tools, transport: { connectOverCDP: async () => browser } }), 'target-owned');
  assert.deepEqual(calls, ['Browser.getBrowserCommandLine', 'Target.createTarget', 'disconnect']);
  const badCalls = [];
  await assert.rejects(openInstance(instance, { tools, transport: { connectOverCDP: async () => mockBrowser(path.resolve('wrong-profile'), 'x', badCalls) } }), /不符/);
  assert.deepEqual(badCalls, ['Browser.getBrowserCommandLine', 'disconnect']);
});

test('runtime launches registered profile with extensions and no download interception', async () => {
  const profile = path.resolve('fixture-profile');
  let launched;
  const tools = { isPortFree: async () => true, buildBrowserArgs: (o) => [`--user-data-dir=${o.profilePath}`],
    launchBrowserProcess: (o) => { launched = o; }, waitForCdpEndpoint: async () => {} };
  await openInstance({ port: 9232, profile }, { tools, transport: { connectOverCDP: async () => mockBrowser(profile) } });
  assert.equal(launched.profilePath, profile);
  assert.equal(launched.allowExtensions, true);
  assert.ok(launched.args.includes('--enable-automation'));
});

test('exact target ignores same-URL and frontmost pages; missing target fails', async () => {
  const pages = ['other', 'owned'].map((id) => ({ id }));
  const context = { pages: () => pages, newCDPSession: async (page) => ({ send: async () => ({ targetInfo: { targetId: page.id } }), detach: async () => {} }) };
  const browser = { contexts: () => [context] };
  assert.equal((await exactPage(browser, 'owned')).page.id, 'owned');
  await assert.rejects(exactPage(browser, 'missing'), /不存在/);
});

test('failed startup releases lease; successful startup binds target and clears startup worker', async () => {
  const s = store({ identity: () => 'fixture' });
  try {
    s.initialize();
    await assert.rejects(openLease(s, { owner: 'a' }, async () => { throw new Error('endpoint conflict'); }), /conflict/);
    assert.equal(s.status().instances[0].busy, false);
    const lease = await openLease(s, { owner: 'a' }, async () => 'owned');
    assert.equal(lease.targetId, 'owned');
    assert.equal(s.transaction((state) => state.leases[0].workers.length), 0);
    s.release('a', lease.leaseId);
  } finally { s.close(); }
});

test('cross-process acquisition is atomic even with many contenders', async () => {
  const s = store(); s.initialize(); const root = s.root; s.close();
  const modulePath = require.resolve('../../lib/ai-work-browser/store');
  const children = Array.from({ length: 8 }, (_, index) => new Promise((resolve, reject) => {
    const code = `const {BrowserStore}=require(${JSON.stringify(modulePath)});const s=new BrowserStore(${JSON.stringify(root)});console.log(JSON.stringify(s.acquire({owner:'race-${index}'})));s.close();`;
    const child = spawn(process.execPath, ['-e', code]);
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; }); child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject); child.once('exit', (exit) => exit ? reject(new Error(stderr)) : resolve(JSON.parse(stdout)));
  }));
  const outcomes = await Promise.all(children);
  assert.equal(outcomes.filter((r) => r.action === 'acquired').length, 1);
  assert.equal(outcomes.filter((r) => r.action === 'busy').length, 7);
});

test('worker startup gate does not execute before parent sends registered work', async () => {
  const s = store(); s.initialize(); const a = s.acquire({ owner: 'gate' });
  const marker = path.join(s.root, 'gate-marker');
  const script = path.join(s.root, 'fixture.js');
  fs.writeFileSync(script, `require('fs').writeFileSync(${JSON.stringify(marker)}, 'ok');`);
  const child = fork(path.join(__dirname, '../ai-work-browser-worker.js'), [], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  try {
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(fs.existsSync(marker), false);
    s.heartbeat('gate', a.leaseId, child.pid);
    const exited = new Promise((resolve) => child.once('exit', resolve));
    child.send({ script, args: [] }); await exited;
    assert.equal(fs.readFileSync(marker, 'utf8'), 'ok');
    s.detachWorker('gate', a.leaseId, child.pid); s.release('gate', a.leaseId);
  } finally { if (child.exitCode === null) child.kill(); s.close(); }
});

test('installer fresh/update notices match available clones and preserve browser data', () => {
  const s = store(); s.initialize(); s.enable(); const root = s.root; s.close();
  const dest = path.join(root, 'installed-skills');
  const script = path.join(__dirname, '../install-skills.js');
  for (const args of [[], ['--force']]) {
    const result = spawnSync(process.execPath, [script, '--dest', dest, '--skill', 'ai-work-browser', ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /我想要使用 AI 工作瀏覽器分身/);
    assert.match(result.stdout, /選用/);
    assert.ok(fs.existsSync(path.join(dest, 'ai-work-browser', 'references', 'runtime-location.md')));
  }
  const reopened = new BrowserStore(root);
  assert.equal(reopened.status().enabled, true); reopened.close();
});

test('parser keeps downstream args separate and exposes no automatic capacity switch', () => {
  const options = parse(['run', '--owner', 'thread', '--workflow', 'chatgpt:image-batch', '--', '--prompt-file', 'a.txt']);
  assert.deepEqual(options.args, ['--prompt-file', 'a.txt']);
  assert.throws(() => parse(['enable', '--capacity', '99']), /無效/);
});

test('endpoint job guard allows different endpoints, rejects aliases, and blocks uncredentialed takeover', () => {
  const s = store(); s.initialize();
  const priorRoot = process.env.AI_WORK_BROWSER_ROOT;
  process.env.AI_WORK_BROWSER_ROOT = s.root;
  const { acquireBrowserLease } = require('../../lib/ai-work-browser/job-lease');
  let releaseA; let releaseB;
  try {
    releaseA = acquireBrowserLease('http://127.0.0.1:9661');
    assert.throws(() => acquireBrowserLease('http://localhost:9661'), /已有工作/);
    releaseB = acquireBrowserLease('http://127.0.0.1:9662');
    const lease = s.acquire({ owner: 'owner' });
    assert.throws(() => acquireBrowserLease(lease.cdpUrl), /另一個對話/);
    s.release('owner', lease.leaseId);
  } finally {
    releaseA?.(); releaseB?.(); s.close();
    if (priorRoot === undefined) delete process.env.AI_WORK_BROWSER_ROOT; else process.env.AI_WORK_BROWSER_ROOT = priorRoot;
  }
});

test('supervisor propagates worker failure and finally releases the registered live worker', async () => {
  const s = store(); s.initialize();
  const fixture = path.join(s.root, 'exit-fixture.js');
  fs.writeFileSync(fixture, 'process.exitCode = 7;');
  const priorExit = process.exitCode;
  try {
    const result = await run(s, { workflow: 'fixture', owner: 'wrapper', args: [] }, {
      opener: async () => 'owned', workflows: { fixture },
    });
    assert.equal(result.code, 7);
    assert.equal(s.status().instances[0].busy, false);
    await assert.rejects(run(s, { workflow: 'fixture', owner: 'wrapper', args: ['--cdp-url', 'http://localhost:1'] }, {
      opener: async () => 'owned', workflows: { fixture },
    }), /覆寫/);
  } finally { s.close(); process.exitCode = priorExit; }
});

test('startup identity failure releases new lease but never releases another live worker', async () => {
  let known = false;
  const s = store({ identity: () => known ? 'fixture' : null });
  try {
    s.initialize();
    await assert.rejects(openLease(s, { owner: 'a' }, async () => 'never'), /啟動時間/);
    assert.equal(s.status().instances[0].busy, false);
    known = true;
    const lease = s.acquire({ owner: 'a' });
    s.heartbeat('a', lease.leaseId, 999);
    await assert.rejects(openLease(s, { owner: 'a', leaseId: lease.leaseId }, async () => 'never'), /存活/);
    assert.equal(s.status().instances[0].busy, true);
    assert.equal(s.transaction((state) => state.leases[0].workers[0].pid), 999);
  } finally { s.close(); }
});

test('managed job guard refuses a wrong exact target and accepts only its retained lease', () => {
  const s = store(); s.initialize();
  const lease = s.acquire({ owner: 'thread' }); s.setTarget('thread', lease.leaseId, 'owned');
  const keys = ['AI_WORK_BROWSER_ROOT', 'AI_WORK_BROWSER_OWNER', 'AI_WORK_BROWSER_LEASE_ID', 'AI_WORK_BROWSER_TARGET_ID'];
  const old = keys.map((key) => process.env[key]);
  [s.root, 'thread', lease.leaseId, 'wrong'].forEach((value, index) => { process.env[keys[index]] = value; });
  const { acquireBrowserLease } = require('../../lib/ai-work-browser/job-lease');
  let release;
  try {
    assert.throws(() => acquireBrowserLease(lease.cdpUrl), /TargetId/);
    process.env.AI_WORK_BROWSER_TARGET_ID = 'owned';
    release = acquireBrowserLease(lease.cdpUrl);
    assert.equal(s.transaction((state) => state.leases[0].workers[0].pid), process.pid);
    release(); release = null;
    s.release('thread', lease.leaseId);
  } finally {
    release?.(); s.close(); keys.forEach((key, i) => { if (old[i] === undefined) delete process.env[key]; else process.env[key] = old[i]; });
  }
});

test('retained fixtures are isolated outside the repository', () => {
  for (const root of roots) assert.ok(root.startsWith(os.tmpdir()));
});

test('cancellation stops the owned worker without deleting browser data', async () => {
  const s = store(); s.initialize();
  const lease = s.acquire({ owner: 'cancel' });
  const child = fork(path.join(__dirname, '../ai-work-browser-worker.js'), [], {
    detached: process.platform !== 'win32', stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  try {
    s.heartbeat('cancel', lease.leaseId, child.pid);
    const stopped = new Promise((resolve) => child.once('exit', resolve));
    stopWorker(child); await stopped;
    s.detachWorker('cancel', lease.leaseId, child.pid); s.release('cancel', lease.leaseId);
    assert.equal(s.status().instances[0].busy, false);
    assert.ok(fs.existsSync(path.join(s.root, 'state.sqlite')));
  } finally { stopWorker(child); s.close(); }
});
