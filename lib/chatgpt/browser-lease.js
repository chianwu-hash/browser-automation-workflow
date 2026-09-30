const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const WORKFLOW_SCRIPT = /chatgpt-(?:image-batch|image-multi-mvp|image-mode-smoke|ui-contract-smoke|reference-upload-smoke)\.js/i;

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function assertNoLegacyWindowsJob() {
  if (process.platform !== 'win32') return;
  const command = "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress";
  const raw = execFileSync('powershell.exe', ['-NoProfile', '-Command', command], {
    encoding: 'utf8',
    timeout: 10000,
    windowsHide: true,
  }).trim();
  const processes = raw ? JSON.parse(raw) : [];
  const releasedParentPid = Number(process.env.CHATGPT_BROWSER_RELEASED_PARENT_PID);
  const conflicting = [processes].flat().find((item) =>
    item && item.ProcessId !== process.pid && item.ProcessId !== releasedParentPid &&
    WORKFLOW_SCRIPT.test(item.CommandLine || '')
  );
  if (conflicting) {
    throw new Error(`Another ChatGPT browser workflow is already running (PID ${conflicting.ProcessId}). Wait for it to finish before using the shared browser.`);
  }
}

function acquireBrowserLease(cdpUrl) {
  assertNoLegacyWindowsJob();
  const key = crypto.createHash('sha256').update(cdpUrl).digest('hex').slice(0, 16);
  const lockPath = path.join(os.tmpdir(), `chatgpt-browser-${key}.lock`);
  const token = crypto.randomUUID();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, token }), { flag: 'wx' });
      return () => {
        try {
          const current = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
          if (current.token === token) fs.unlinkSync(lockPath);
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let holder;
      try {
        holder = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      } catch (readError) {
        if (readError.code === 'ENOENT') continue;
        throw readError;
      }
      if (processIsAlive(holder.pid)) {
        throw new Error(`ChatGPT browser is already reserved by PID ${holder.pid}. Wait for that workflow to finish.`);
      }
      fs.unlinkSync(lockPath);
    }
  }
  throw new Error('Could not reserve the shared ChatGPT browser.');
}

module.exports = { acquireBrowserLease };
