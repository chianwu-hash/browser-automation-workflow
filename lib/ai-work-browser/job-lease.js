'use strict';
const { execFileSync } = require('child_process');
const { BrowserStore } = require('./store');
const { localEndpoint } = require('./runtime');
const WORKFLOW_SCRIPT = /(?:chatgpt-(?:image-batch|image-multi-mvp|image-mode-smoke|ui-contract-smoke|reference-upload-smoke)|gemini-image-sequence)\.js/i;

function legacyConflicts(command, endpoint) {
  if (!WORKFLOW_SCRIPT.test(command || '')) return false;
  const match = command.match(/--cdp-url(?:=|\s+)(?:"([^"]+)"|([^\s]+))/);
  if (!match) return true;
  try { return localEndpoint(match[1] || match[2]) === localEndpoint(endpoint); } catch { return true; }
}

// Processes on our own parent chain (e.g. the D:/ai-browser/run-background.cjs wrapper,
// whose command line repeats this script and --cdp-url) are this job, not a competing one.
function ancestorPids(entries, pid) {
  const parentOf = new Map(entries.filter(Boolean).map((item) => [item.ProcessId, item.ParentProcessId]));
  const ancestors = new Set();
  for (let current = parentOf.get(pid); current && !ancestors.has(current) && ancestors.size < 64; current = parentOf.get(current)) {
    ancestors.add(current);
  }
  return ancestors;
}

function findLegacyConflict(entries, { pid, endpoint, registeredPids = [], releasedParent }) {
  const ancestors = ancestorPids(entries, pid);
  return entries.find((item) => item && /^node(?:\.exe)?$/i.test(item.Name || 'node.exe') && item.ProcessId !== pid &&
    item.ProcessId !== releasedParent && !ancestors.has(item.ProcessId) &&
    !registeredPids.includes(item.ProcessId) && legacyConflicts(item.CommandLine, endpoint)) || null;
}

function assertNoLegacyWindowsJob(endpoint, registeredPids) {
  if (process.platform !== 'win32') return;
  const command = "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress";
  const raw = execFileSync('pwsh', ['-NoProfile', '-Command', command], {
    encoding: 'utf8', timeout: 10000, windowsHide: true, maxBuffer: 64 * 1024 * 1024,
  }).trim();
  const entries = raw ? [JSON.parse(raw)].flat() : [];
  const conflict = findLegacyConflict(entries, {
    pid: process.pid, endpoint, registeredPids,
    releasedParent: Number(process.env.CHATGPT_BROWSER_RELEASED_PARENT_PID),
  });
  if (conflict) throw new Error(`另一個舊版瀏覽器工作仍在執行（PID ${conflict.ProcessId}），請等候完成。`);
}

function acquireBrowserLease(cdpUrl) {
  const endpoint = localEndpoint(cdpUrl);
  const store = new BrowserStore(process.env.AI_WORK_BROWSER_ROOT);
  const token = require('crypto').randomUUID();
  const owner = process.env.AI_WORK_BROWSER_OWNER;
  const leaseId = process.env.AI_WORK_BROWSER_LEASE_ID;
  let timer;
  try {
    const registeredPids = store.transaction((state) => (state.jobs || []).filter((job) => store.alive(job)).map((job) => job.pid));
    assertNoLegacyWindowsJob(endpoint, registeredPids);
    const identity = store.identity(process.pid);
    if (!identity || identity === 'unknown') throw new Error('無法驗證工作程序。');
    store.transaction((state) => {
      state.jobs = (state.jobs || []).filter((job) => store.alive(job));
      if (state.jobs.some((job) => job.endpoint === endpoint)) throw new Error('此瀏覽器已有工作，請等待完成。');
      store.reclaim(state);
      const holder = state.leases.find((lease) => store.describe(state, lease).cdpUrl === endpoint);
      if (holder && (!leaseId || holder.id !== leaseId || holder.owner !== owner)) throw new Error('此端點已由另一個對話占用。');
      if (leaseId) {
        const lease = store.validate(state, owner, leaseId);
        if (localEndpoint(lease.cdpUrl) !== endpoint || !lease.targetId || lease.targetId !== process.env.AI_WORK_BROWSER_TARGET_ID) {
          throw new Error('工作端點或 TargetId 與占用不符。');
        }
        if (holder.workers.some((w) => store.alive(w) && w.pid !== process.pid)) throw new Error('此占用已有存活工作程序。');
        holder.workers = [{ pid: process.pid, identity }];
        holder.expires = store.now() + 900000;
      }
      state.jobs.push({ endpoint, pid: process.pid, identity, token });
    });
    if (leaseId) {
      timer = setInterval(() => {
        try { store.heartbeat(owner, leaseId); } catch (error) { console.error(error.message); process.exit(1); }
      }, 30000);
      timer.unref();
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      clearInterval(timer);
      try {
        store.transaction((state) => { state.jobs = (state.jobs || []).filter((job) => job.token !== token); });
        if (leaseId) store.detachWorker(owner, leaseId, process.pid);
      } finally { store.close(); }
    };
  } catch (error) { store.close(); throw error; }
}
module.exports = { acquireBrowserLease, legacyConflicts, findLegacyConflict };
