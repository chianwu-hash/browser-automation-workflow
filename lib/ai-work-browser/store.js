'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const { execFileSync } = require('child_process');

function defaultRoot() {
  return path.join(process.platform === 'win32' ? (process.env.LOCALAPPDATA || os.homedir())
    : path.join(os.homedir(), '.local', 'share'), 'ai-work-browser');
}

function processIdentity(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try {
    if (process.platform === 'win32') {
      return execFileSync('pwsh', ['-NoProfile', '-Command',
        `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToUniversalTime().Ticks.ToString()`],
      { encoding: 'utf8', windowsHide: true, timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    }
    if (process.platform === 'linux') {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
      return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19];
    }
    return execFileSync('ps', ['-p', String(pid), '-o', 'lstart='],
      { encoding: 'utf8', timeout: 5000 }).trim() || null;
  } catch (error) {
    // Uncertain inspection must not cause a live worker to be reclaimed.
    try { process.kill(pid, 0); return 'unknown'; } catch (probe) {
      return probe.code === 'EPERM' ? 'unknown' : null;
    }
  }
}

class BrowserStore {
  constructor(root = defaultRoot(), { now = Date.now, identity = processIdentity } = {}) {
    this.root = path.resolve(root);
    this.now = now;
    this.identity = identity;
    fs.mkdirSync(this.root, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path.join(this.root, 'state.sqlite'));
    this.db.exec('PRAGMA busy_timeout=10000; CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY, data TEXT NOT NULL)');
  }

  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const row = this.db.prepare('SELECT data FROM state WHERE id=1').get();
      const state = row ? JSON.parse(row.data) : { version: 1, enabled: false, instances: [], leases: [], affinity: {} };
      const result = fn(state);
      this.db.prepare('INSERT INTO state VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data')
        .run(JSON.stringify(state));
      this.db.exec('COMMIT');
      return result;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  alive(worker) {
    const current = this.identity(worker.pid);
    return current !== null && (current === 'unknown' || current === worker.identity);
  }

  reclaim(state) {
    state.leases = state.leases.filter((lease) => lease.expires > this.now() || lease.workers.some((w) => this.alive(w)));
  }

  initialize({ sessionFile, port = 9232 } = {}) {
    return this.transaction((state) => {
      if (state.instances.length) return state.instances[0];
      let profile = path.join(this.root, 'profiles', 'main');
      if (sessionFile) {
        const prior = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
        profile = prior.userDataDir;
        port = prior.port || Number(new URL(prior.cdpUrl).port);
        if (!profile || !path.isAbsolute(profile)) throw new Error('既有 CBS 設定缺少絕對 profile 路徑。');
      }
      if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('CDP 連接埠無效。');
      const instance = { id: 'main', port, profile: path.resolve(profile), setup: false, disabled: false };
      state.instances.push(instance);
      return instance;
    });
  }

  enable() {
    return this.transaction((state) => {
      if (!state.instances.length) throw new Error('請先初始化工作瀏覽器。');
      this.reclaim(state);
      if (state.leases.length) throw new Error('請等待既有工作釋放後，再啟用或擴充分身。');
      if (state.enabled) return state.instances.find((i) => i.id !== 'main');
      let clone = state.instances.find((i) => i.id === '01');
      if (!clone) {
        const port = state.instances[0].port + 1;
        if (port > 65535) throw new Error('無可用的分身連接埠。');
        clone = { id: '01', port, profile: path.join(this.root, 'profiles', '01'), setup: true, disabled: false };
        state.instances.push(clone);
      }
      for (const instance of state.instances) instance.disabled = false;
      state.enabled = true;
      return clone;
    });
  }

  addClone() {
    return this.transaction((state) => {
      this.reclaim(state);
      if (!state.enabled || state.leases.length) throw new Error('先啟用分身並等待工作結束，才能擴充。');
      if (state.instances.length >= 3) throw new Error('第一版最多三個實例，請先觀察資源使用。');
      const id = String(state.instances.length).padStart(2, '0');
      const port = Math.max(...state.instances.map((i) => i.port)) + 1;
      if (port > 65535) throw new Error('無可用的分身連接埠。');
      const clone = { id, port, profile: path.join(this.root, 'profiles', id), setup: true, disabled: false };
      state.instances.push(clone);
      return clone;
    });
  }

  ready(id) {
    return this.transaction((state) => {
      this.reclaim(state);
      const instance = state.instances.find((i) => i.id === id);
      if (!instance) throw new Error('找不到分身。');
      if (state.leases.some((l) => l.instance === id)) throw new Error('分身仍被占用。');
      instance.setup = false;
      return instance;
    });
  }

  disable() {
    return this.transaction((state) => {
      state.enabled = false;
      for (const instance of state.instances) if (instance.id !== 'main') instance.disabled = true;
      return { action: 'disabled', message: '停止新的分身分配；既有工作可完成，登入資料與分頁保留。' };
    });
  }

  acquire({ owner, leaseId, instanceId, setup = false } = {}) {
    return this.transaction((state) => {
      this.reclaim(state);
      if (leaseId) return this.validate(state, owner, leaseId);
      if (!owner) throw new Error('缺少穩定對話 ID；只能使用單瀏覽器的 browser:run 受監督模式。');
      const existing = state.leases.find((l) => l.owner === owner);
      if (existing) throw new Error('此對話已有占用，請傳入原 LeaseId；不可建立第二個工作。');
      const choices = state.instances.filter((i) => !i.disabled && (state.enabled || i.id === 'main') &&
        (setup ? i.setup && i.id === instanceId : !i.setup) && (!instanceId || i.id === instanceId));
      choices.sort((a, b) => Number(b.id === state.affinity[owner]) - Number(a.id === state.affinity[owner]));
      const instance = choices.find((i) => !state.leases.some((l) => l.instance === i.id) &&
        !(state.jobs || []).some((job) => job.endpoint === `http://127.0.0.1:${i.port}` && this.alive(job)));
      if (!instance) return { action: 'busy' };
      const lease = { id: crypto.randomUUID(), instance: instance.id, owner, expires: this.now() + 900000, workers: [], targetId: null };
      state.leases.push(lease);
      state.affinity[owner] = instance.id;
      return this.describe(state, lease);
    });
  }

  describe(state, lease) {
    const instance = state.instances.find((i) => i.id === lease.instance);
    return { action: 'acquired', instance: instance.id, cdpUrl: `http://127.0.0.1:${instance.port}`,
      leaseId: lease.id, expiresUtc: new Date(lease.expires).toISOString(), targetId: lease.targetId };
  }

  validate(state, owner, id) {
    const lease = state.leases.find((l) => l.id === id && l.owner === owner);
    if (!lease || (lease.expires <= this.now() && !lease.workers.some((w) => this.alive(w)))) {
      throw new Error('占用已失效，請停止操作；不可靜默改用其他分身。');
    }
    return this.describe(state, lease);
  }

  heartbeat(owner, id, workerPid) {
    return this.transaction((state) => {
      this.validate(state, owner, id);
      const lease = state.leases.find((l) => l.id === id);
      if (workerPid !== undefined) {
        if (lease.workers.some((w) => this.alive(w) && w.pid !== workerPid)) throw new Error('此占用已有存活工作程序。');
        const identity = this.identity(workerPid);
        if (!identity || identity === 'unknown') throw new Error('無法確認工作程序啟動時間。');
        lease.workers = [{ pid: workerPid, identity }];
      }
      lease.expires = this.now() + 900000;
      return this.describe(state, lease);
    });
  }

  setTarget(owner, id, targetId) {
    return this.transaction((state) => {
      this.validate(state, owner, id);
      state.leases.find((l) => l.id === id).targetId = targetId;
    });
  }

  detachWorker(owner, id, pid) {
    return this.transaction((state) => {
      const lease = state.leases.find((l) => l.id === id && l.owner === owner);
      if (!lease) throw new Error('占用憑證不符。');
      if (pid !== process.pid && lease.workers.some((w) => w.pid === pid && this.alive(w))) {
        throw new Error('工作程序仍存活，不可解除保護。');
      }
      lease.workers = lease.workers.filter((w) => w.pid !== pid);
    });
  }

  release(owner, id) {
    return this.transaction((state) => {
      const lease = state.leases.find((l) => l.id === id && l.owner === owner);
      if (!lease) throw new Error('占用憑證不符。');
      if (lease.workers.some((w) => this.alive(w))) throw new Error('先停止並斷開已登記的工作程序，再釋放。');
      state.leases = state.leases.filter((l) => l !== lease);
      return { action: 'released' };
    });
  }

  status() {
    return this.transaction((state) => {
      this.reclaim(state);
      return { clonesSupported: true, enabled: state.enabled, instances: state.instances.map((i) =>
        ({ id: i.id, port: i.port, setup: i.setup, disabled: i.disabled, busy: state.leases.some((l) => l.instance === i.id) })) };
    });
  }
  close() { this.db.close(); }
}
module.exports = { BrowserStore, defaultRoot, processIdentity };
