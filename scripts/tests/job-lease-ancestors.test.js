'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { findLegacyConflict } = require('../../lib/ai-work-browser/job-lease');

const endpoint = 'http://127.0.0.1:9233';
const wrapperCmd = 'node D:/ai-browser/run-background.cjs --lease-id x D:/projects/browser-automation-workflow/scripts/chatgpt-image-batch.js --cdp-url http://127.0.0.1:9233 --prompt-file p.txt';
const otherJobCmd = 'node D:/projects/browser-automation-workflow/scripts/chatgpt-image-batch.js --cdp-url http://127.0.0.1:9233 --prompt-file other.txt';

// bash(10) -> run-background wrapper(20) -> background-worker(30, this job)
const chain = [
  { ProcessId: 10, ParentProcessId: 1, Name: 'bash.exe', CommandLine: 'bash' },
  { ProcessId: 20, ParentProcessId: 10, Name: 'node.exe', CommandLine: wrapperCmd },
  { ProcessId: 30, ParentProcessId: 20, Name: 'node.exe', CommandLine: 'node D:/ai-browser/background-worker.cjs' },
];

test('run-background wrapper on our own parent chain is not a conflict', () => {
  assert.equal(findLegacyConflict(chain, { pid: 30, endpoint }), null);
});

test('an unrelated image job on the same endpoint is still a conflict', () => {
  const entries = [...chain, { ProcessId: 40, ParentProcessId: 1, Name: 'node.exe', CommandLine: otherJobCmd }];
  assert.equal(findLegacyConflict(entries, { pid: 30, endpoint })?.ProcessId, 40);
});

test('a second wrapper that is not our ancestor is still a conflict', () => {
  const entries = [...chain, { ProcessId: 50, ParentProcessId: 1, Name: 'node.exe', CommandLine: wrapperCmd }];
  assert.equal(findLegacyConflict(entries, { pid: 30, endpoint })?.ProcessId, 50);
});

test('same command for another endpoint, registered jobs and released parent are ignored', () => {
  const other = [{ ProcessId: 60, ParentProcessId: 1, Name: 'node.exe', CommandLine: otherJobCmd.replace('9233', '9234') }];
  assert.equal(findLegacyConflict([...chain, ...other], { pid: 30, endpoint }), null);
  const job = [{ ProcessId: 70, ParentProcessId: 1, Name: 'node.exe', CommandLine: otherJobCmd }];
  assert.equal(findLegacyConflict([...chain, ...job], { pid: 30, endpoint, registeredPids: [70] }), null);
  assert.equal(findLegacyConflict([...chain, ...job], { pid: 30, endpoint, releasedParent: 70 }), null);
});

test('non-node processes and parent cycles do not break the scan', () => {
  const entries = [
    { ProcessId: 30, ParentProcessId: 31, Name: 'node.exe', CommandLine: 'worker' },
    { ProcessId: 31, ParentProcessId: 30, Name: 'node.exe', CommandLine: 'x' },
    { ProcessId: 80, ParentProcessId: 1, Name: 'powershell.exe', CommandLine: otherJobCmd },
  ];
  assert.equal(findLegacyConflict(entries, { pid: 30, endpoint }), null);
});
