'use strict';
const { execFileSync } = require('child_process');

function quoteArg(value) {
  const text = String(value);
  return /\s/.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text;
}

// Cold-starts a process minimized and inactive (SW_SHOWMINNOACTIVE = 7), so opening
// the AI work browser never takes the foreground. Creating it through WMI also means
// it inherits no handles from the caller. Verified 2026-10-17: Chrome honours this
// for its first window and CDP works normally. Returns the new PID, or null when the
// platform has no equivalent (callers then keep requiring explicit foreground).
function launchMinimizedNoActivate(executable, args) {
  if (process.platform !== 'win32') return null;
  const script = [
    '$si = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ ShowWindow = [uint16]7 }',
    '$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $env:AI_BROWSER_LAUNCH_COMMAND; ProcessStartupInformation = $si }',
    'if ($r.ReturnValue -ne 0) { throw "Win32_Process.Create failed with $($r.ReturnValue)" }',
    '$r.ProcessId',
  ].join('; ');
  const output = execFileSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 30000,
    env: { ...process.env, AI_BROWSER_LAUNCH_COMMAND: [executable, ...args].map(quoteArg).join(' ') },
  });
  return Number(output.trim());
}

module.exports = { launchMinimizedNoActivate };
