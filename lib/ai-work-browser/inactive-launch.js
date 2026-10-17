'use strict';
const { execFileSync } = require('child_process');

function quoteArg(value) {
  const text = String(value);
  return /\s/.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text;
}

// Shared PowerShell helper: find a process's Chrome top-level windows; restore minimized
// ones without activation (SW_SHOWNOACTIVATE) and move them to the bottom of the z-order
// (HWND_BOTTOM, SWP_NOACTIVATE). Never activates a window. Not minimized on purpose:
// ChatGPT does not render background tabs of a minimized window (verified 2026-10-17).
const WINDOW_HELPER = `
if (-not ('AiWorkBrowser.Windows' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
namespace AiWorkBrowser {
  public static class Windows {
    delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc proc, IntPtr lParam);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] static extern int GetClassName(IntPtr hWnd, StringBuilder name, int max);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int cmd);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
    public static List<IntPtr> Find(uint processId) {
      var found = new List<IntPtr>();
      EnumWindows((hWnd, lParam) => {
        uint pid; GetWindowThreadProcessId(hWnd, out pid);
        var name = new StringBuilder(64); GetClassName(hWnd, name, 64);
        if (pid == processId && IsWindowVisible(hWnd) && name.ToString() == "Chrome_WidgetWin_1") found.Add(hWnd);
        return true;
      }, IntPtr.Zero);
      return found;
    }
  }
}
'@
}
function Set-Behind([uint32] $ProcessId, [int] $WaitMs, [bool] $OnlyIfMinimized) {
  $deadline = (Get-Date).AddMilliseconds($WaitMs)
  do { $handles = [AiWorkBrowser.Windows]::Find($ProcessId); if ($handles.Count -gt 0) { break }; Start-Sleep -Milliseconds 100 } while ((Get-Date) -lt $deadline)
  foreach ($h in $handles) {
    $min = [AiWorkBrowser.Windows]::IsIconic($h)
    if ($OnlyIfMinimized -and -not $min) { continue }
    if ($min) { [void][AiWorkBrowser.Windows]::ShowWindow($h, 4) }
    [void][AiWorkBrowser.Windows]::SetWindowPos($h, [IntPtr] 1, 0, 0, 0, 0, 0x13)
  }
}
`;

function runPowerShell(script, env) {
  return execFileSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8', windowsHide: true, timeout: 30000, env: { ...process.env, ...env },
  }).trim();
}

// Cold-starts a process shown but inactive (SW_SHOWNOACTIVATE = 4) through WMI, which
// also inherits no handles from the caller, then moves its windows behind all others.
// Returns the new PID, or null where the platform has no equivalent (callers then keep
// requiring an explicit foreground request).
function launchInactiveBehind(executable, args) {
  if (process.platform !== 'win32') return null;
  const output = runPowerShell(`${WINDOW_HELPER}
$si = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ ShowWindow = [uint16]4 }
$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $env:AI_BROWSER_LAUNCH_COMMAND; ProcessStartupInformation = $si }
if ($r.ReturnValue -ne 0) { throw "Win32_Process.Create failed with $($r.ReturnValue)" }
Set-Behind $r.ProcessId 10000 $false
$r.ProcessId`, { AI_BROWSER_LAUNCH_COMMAND: [executable, ...args].map(quoteArg).join(' ') });
  return Number(output.split(/\r?\n/).pop());
}

// Restores minimized windows of the browser listening on this CDP port, inactive and
// behind all others. Windows the user already has open are left as they are.
function restoreMinimizedBehind(port) {
  if (process.platform !== 'win32') return;
  runPowerShell(`${WINDOW_HELPER}
$p = Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -match "--remote-debugging-port=$env:AI_BROWSER_PORT(\\s|$)" -and $_.CommandLine -notmatch '--type=' } | Select-Object -First 1
if ($p) { Set-Behind $p.ProcessId 0 $true }`, { AI_BROWSER_PORT: String(port) });
}

module.exports = { launchInactiveBehind, restoreMinimizedBehind };
