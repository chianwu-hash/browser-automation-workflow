const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const CODEX_ENTRY = path.join(ROOT, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');

function sanitizeCommandArgs(args) {
  const sanitized = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    sanitized.push(arg);
    if (arg === '--prompt-text' && args[index + 1]) {
      sanitized.push('[prompt text omitted]');
      index += 1;
    }
  }
  return sanitized;
}

function buildEscalationBrief(options, commandArgs) {
  const evidence = options.browserEvidence || {};
  return [
    '# Browser workflow incident commander',
    '',
    'You are taking over one bounded recovery after the normal workflow and two automatic recoveries failed.',
    'Your job is to make a fast operational decision and, when safe, complete the original workflow. This is not an open-ended code review or research task.',
    '',
    '## Incident facts',
    '',
    `Workflow: ${options.workflow}`,
    `Failure code: ${options.error.code || 'unspecified'}`,
    `Failure after retries: ${options.error.message}`,
    `CDP URL: ${options.cdpUrl}`,
    `Failure metadata: ${options.metaPath}`,
    `Browser snapshot: ${evidence.snapshotPath || 'unavailable'}`,
    `Attached browser screenshot: ${evidence.screenshotPath ? 'yes' : 'no'}`,
    `Original Node command arguments: ${JSON.stringify(commandArgs)}`,
    '',
    'Model-side image generation is occasionally transiently unstable. When CDP, login, composer, and image mode are healthy, a clean fresh-chat retry is normally the first recovery, not a code change.',
    '',
    '## Required decision sequence',
    '',
    '1. In the first 60 seconds, inspect the attached screenshot, browser snapshot, failed metadata, and live CDP page. Classify the incident as exactly one of: transient_model_failure, ui_contract_drift, or system_failure.',
    '2. If transient_model_failure: do not edit code. Open a fresh chat, explicitly enter image mode, and rerun the original workflow once. Remove --reuse-chat and --direct-prompt; use --image-mode. Preserve the other paths and validation settings.',
    '3. If ui_contract_drift: identify live DOM evidence for the drift, make only the smallest selector/state fix, run the targeted smoke test, then perform the same clean image-mode rerun once.',
    '4. If system_failure: do not keep retrying. Return a concise structured failure with the observed system evidence.',
    '5. Spend the remaining time completing and validating the original artifacts. Do not stop after merely proposing a fix.',
    '',
    '## Time and scope rules',
    '',
    '- Do not begin with web research, broad documentation reading, repository history, or unrelated refactoring.',
    '- Read only the snapshot, metadata, relevant workflow module, and targeted failure policy unless live evidence requires more.',
    '- Treat generic stop-response buttons as ordinary response activity, not proof of image generation.',
    '- CODEX_ESCALATION_DISABLED=1 prevents recursive escalation. Do not try to invoke another Codex process.',
    '- Do not expose cookies, tokens, login data, prompt contents, or private browser state in output or committed files.',
    '- Set resolved=true only when the cause is classified and the recovery is verified.',
    '- Set workflowCompleted=true only when the original workflow metadata says completed and every required image artifact exists, is nonzero, and passes image validation.',
    '- If completion cannot be verified within this single escalation, return resolved=false and workflowCompleted=false immediately.',
  ].join('\n');
}

function escalateToCodexCli(options) {
  if (process.env.CODEX_ESCALATION_DISABLED === '1') {
    return { attempted: false, resolved: false, workflowCompleted: false, reason: 'nested escalation disabled' };
  }
  if (!fs.existsSync(CODEX_ENTRY)) {
    return { attempted: false, resolved: false, workflowCompleted: false, reason: 'Codex CLI unavailable' };
  }

  const evidenceDir = path.join(path.dirname(options.metaPath), 'codex-escalation');
  fs.mkdirSync(evidenceDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const schemaPath = path.join(evidenceDir, `${stamp}-schema.json`);
  const resultPath = path.join(evidenceDir, `${stamp}-result.json`);
  const briefPath = path.join(evidenceDir, `${stamp}-brief.md`);
  const eventLogPath = path.join(evidenceDir, `${stamp}-events.jsonl`);

  const schema = {
    type: 'object',
    properties: {
      classification: {
        type: 'string',
        enum: ['transient_model_failure', 'ui_contract_drift', 'system_failure'],
      },
      resolved: { type: 'boolean' },
      workflowCompleted: { type: 'boolean' },
      summary: { type: 'string' },
      verification: { type: 'array', items: { type: 'string' } },
    },
    required: ['classification', 'resolved', 'workflowCompleted', 'summary', 'verification'],
    additionalProperties: false,
  };
  fs.writeFileSync(schemaPath, JSON.stringify(schema, null, 2), 'utf8');

  const commandArgs = sanitizeCommandArgs(options.commandArgs || []);
  const brief = buildEscalationBrief(options, commandArgs);
  fs.writeFileSync(briefPath, brief, 'utf8');

  const args = [
    CODEX_ENTRY,
    'exec',
    '--sandbox', process.platform === 'win32' ? 'danger-full-access' : 'workspace-write',
    '--ephemeral',
    '--ignore-user-config',
    '--color', 'never',
    '--output-schema', schemaPath,
    '--output-last-message', resultPath,
    '-C', ROOT,
  ];
  for (const dir of [...new Set(options.additionalDirs || [])]) {
    if (dir && fs.existsSync(dir)) args.push('--add-dir', dir);
  }
  if (options.browserEvidence?.screenshotPath && fs.existsSync(options.browserEvidence.screenshotPath)) {
    args.push('--image', options.browserEvidence.screenshotPath);
  }
  args.push('-');

  const child = spawnSync(process.execPath, args, {
    cwd: ROOT,
    input: brief,
    encoding: 'utf8',
    timeout: options.timeoutMs || 420000,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, CODEX_ESCALATION_DISABLED: '1' },
  });
  fs.writeFileSync(eventLogPath, `${child.stdout || ''}${child.stderr || ''}`, 'utf8');

  if (child.error || child.status !== 0 || !fs.existsSync(resultPath)) {
    return {
      attempted: true,
      resolved: false,
      workflowCompleted: false,
      reason: child.error?.message || `Codex CLI exited with status ${child.status}`,
      briefPath,
      eventLogPath,
    };
  }

  try {
    const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
    return {
      attempted: true,
      classification: result.classification,
      resolved: result.resolved === true,
      workflowCompleted: result.workflowCompleted === true,
      summary: result.summary,
      verification: result.verification,
      briefPath,
      resultPath,
      eventLogPath,
    };
  } catch (error) {
    return {
      attempted: true,
      resolved: false,
      workflowCompleted: false,
      reason: `Codex CLI returned invalid structured output: ${error.message}`,
      briefPath,
      resultPath,
      eventLogPath,
    };
  }
}

module.exports = { buildEscalationBrief, escalateToCodexCli, sanitizeCommandArgs };
