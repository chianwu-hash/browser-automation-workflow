#!/usr/bin/env node
'use strict';
const path = require('path');
const { fork, execFileSync } = require('child_process');
const { BrowserStore } = require('../lib/ai-work-browser/store');
const { openInstance, safePageUrl } = require('../lib/ai-work-browser/runtime');
const WORKFLOWS = {
  'chatgpt:image-batch': 'chatgpt-image-batch.js',
  'chatgpt:image-multi-mvp': 'chatgpt-image-multi-mvp.js',
  'chatgpt:image-mode-smoke': 'chatgpt-image-mode-smoke.js',
  'chatgpt:ui-contract-smoke': 'chatgpt-ui-contract-smoke.js',
  'chatgpt:reference-upload-smoke': 'chatgpt-reference-upload-smoke.js',
  'gemini:image-sequence': 'gemini-image-sequence.js',
};
function stopWorker(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    } else {
      process.kill(-child.pid, 'SIGTERM');
    }
  } catch { child.kill(); }
}
function parse(argv) {
  const options = { action: argv[0] || 'status', owner: process.env.CODEX_THREAD_ID, args: [] };
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--') { options.args = argv.slice(i + 1); break; }
    if (argv[i] === '--setup') { options.setup = true; continue; }
    const key = { '--root': 'root', '--owner': 'owner', '--lease-id': 'leaseId', '--instance': 'instanceId',
      '--url': 'url', '--session-file': 'sessionFile', '--port': 'port', '--worker-pid': 'workerPid', '--workflow': 'workflow' }[argv[i]];
    if (!key || !argv[i + 1]) throw new Error(`無效參數：${argv[i]}`);
    options[key] = argv[++i];
  }
  if (options.port) options.port = Number(options.port);
  if (options.workerPid) options.workerPid = Number(options.workerPid);
  return options;
}
async function openLease(store, options, opener = openInstance) {
  const lease = store.acquire(options);
  if (lease.action === 'busy') return lease;
  let protectedStartup = false;
  try {
    store.heartbeat(options.owner, lease.leaseId, process.pid);
    protectedStartup = true;
    const instance = store.transaction((state) => state.instances.find((i) => i.id === lease.instance));
    const targetId = await opener(instance, { url: options.url, targetId: lease.targetId });
    store.setTarget(options.owner, lease.leaseId, targetId);
    return { ...lease, targetId };
  } catch (error) {
    if (protectedStartup) store.detachWorker(options.owner, lease.leaseId, process.pid);
    // Do not clear someone else's active worker if registration was rejected.
    const liveOtherWorker = store.transaction((state) => state.leases.find((l) => l.id === lease.leaseId)
      ?.workers.some((w) => w.pid !== process.pid && store.alive(w)));
    if (!liveOtherWorker) store.release(options.owner, lease.leaseId);
    throw error;
  } finally {
    // release may already have removed the failed-start lease.
    store.transaction((state) => {
      const current = state.leases.find((l) => l.id === lease.leaseId && l.owner === options.owner);
      if (current && protectedStartup) current.workers = current.workers.filter((w) => w.pid !== process.pid);
    });
  }
}
async function run(store, options, { opener = openInstance, workflows = WORKFLOWS } = {}) {
  const file = workflows[options.workflow];
  if (!file) throw new Error('請指定支援的 --workflow。');
  if (options.args.some((arg) => /^--(?:cdp-url|session-file)(?:=|$)/.test(arg))) throw new Error('受監督工作不接受自行覆寫端點。');
  if (!options.owner) { options.owner = `manual:${process.pid}:${require('crypto').randomUUID()}`; options.instanceId = 'main'; }
  const url = options.url || (options.workflow.startsWith('gemini:') ? 'https://gemini.google.com/app' : 'https://chatgpt.com/');
  const lease = await openLease(store, { ...options, url: options.leaseId ? undefined : url }, opener);
  if (lease.action === 'busy') return lease;
  let child;
  let timer;
  const stop = () => stopWorker(child);
  try {
    child = fork(path.join(__dirname, 'ai-work-browser-worker.js'), [], { env: { ...process.env,
      AI_WORK_BROWSER_ROOT: store.root, AI_WORK_BROWSER_OWNER: options.owner,
      AI_WORK_BROWSER_LEASE_ID: lease.leaseId, AI_WORK_BROWSER_TARGET_ID: lease.targetId },
    detached: process.platform !== 'win32', stdio: ['inherit', 'inherit', 'inherit', 'ipc'] });
    const done = new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0))); });
    store.heartbeat(options.owner, lease.leaseId, child.pid);
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    timer = setInterval(() => { try { store.heartbeat(options.owner, lease.leaseId); } catch { stop(); } }, 30000);
    child.send({ script: path.resolve(__dirname, file), args: ['--cdp-url', lease.cdpUrl, ...options.args] });
    const code = await done;
    process.exitCode = code;
    return { action: 'finished', code, instance: lease.instance };
  } finally {
    clearInterval(timer);
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
      const stopped = new Promise((resolve) => child.once('exit', resolve));
      stop();
      await stopped;
    }
    if (child?.pid) store.detachWorker(options.owner, lease.leaseId, child.pid);
    store.release(options.owner, lease.leaseId);
  }
}
async function main(argv = process.argv.slice(2)) {
  const options = parse(argv);
  if (options.url) safePageUrl(options.url);
  const store = new BrowserStore(options.root);
  try {
    let result;
    switch (options.action) {
      case 'status': result = store.status(); break;
      case 'init': result = store.initialize(options); break;
      case 'enable': store.initialize(options); result = store.enable(); break;
      case 'add': result = store.addClone(); break;
      case 'ready': result = store.ready(options.instanceId); break;
      case 'disable': result = store.disable(); break;
      case 'acquire': store.initialize(options); result = await openLease(store, options); break;
      case 'heartbeat': result = store.heartbeat(options.owner, options.leaseId, options.workerPid); break;
      case 'release': result = store.release(options.owner, options.leaseId); break;
      case 'run': store.initialize(options); result = await run(store, options); break;
      default: throw new Error('未知操作。');
    }
    console.log(JSON.stringify(result, null, 2));
    if (result.action === 'busy') process.exitCode = 2;
    return result;
  } finally { store.close(); }
}
if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { parse, main, openLease, run, stopWorker, WORKFLOWS };
