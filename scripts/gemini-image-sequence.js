const os = require('os');
const path = require('path');
const {
  collectPromptEntries,
  openGeminiImageChat,
  runPromptSequence,
  writeRunMeta,
} = require('../lib/gemini');
const { readCdpUrlFromSessionFile } = require('../lib/session-setup');
const { escalateToCodexCli } = require('../lib/escalation/codex-cli');
const { captureBrowserEvidence } = require('../lib/escalation/browser-evidence');

function parseArgs(argv) {
  const options = {
    cdpUrl: '',
    sessionFile: '',
    promptDir: '',
    promptFiles: [],
    driveFilename: '',
    driveTab: 'recent',
    reuseChat: false,
    timeoutMs: 300000,
    generationStartTimeoutMs: 30000,
    screenshotDir: path.resolve(process.cwd(), 'output', 'gemini-sequence'),
    metaPath: path.resolve(process.cwd(), 'output', 'gemini-prompt-sequence.json'),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--prompt-dir' && argv[i + 1]) {
      options.promptDir = path.resolve(process.cwd(), argv[++i]);
    } else if (arg === '--prompt-files' && argv[i + 1]) {
      options.promptFiles = argv[++i]
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => path.resolve(process.cwd(), part));
    } else if (arg === '--drive-filename' && argv[i + 1]) {
      options.driveFilename = argv[++i];
    } else if (arg === '--drive-tab' && argv[i + 1]) {
      options.driveTab = argv[++i];
    } else if (arg === '--cdp-url' && argv[i + 1]) {
      options.cdpUrl = argv[++i];
    } else if (arg === '--session-file' && argv[i + 1]) {
      options.sessionFile = path.resolve(process.cwd(), argv[++i]);
    } else if (arg === '--reuse-chat') {
      options.reuseChat = true;
    } else if (arg === '--timeout-ms' && argv[i + 1]) {
      options.timeoutMs = Number(argv[++i]);
    } else if (arg === '--generation-start-timeout-ms' && argv[i + 1]) {
      options.generationStartTimeoutMs = Number(argv[++i]);
    } else if (arg === '--screenshot-dir' && argv[i + 1]) {
      options.screenshotDir = path.resolve(process.cwd(), argv[++i]);
    } else if (arg === '--meta' && argv[i + 1]) {
      options.metaPath = path.resolve(process.cwd(), argv[++i]);
    }
  }

  if (!options.promptDir && options.promptFiles.length === 0) {
    throw new Error('Missing required --prompt-dir <dir> or --prompt-files <file1,file2,...>.');
  }

  if (options.sessionFile) {
    options.cdpUrl = readCdpUrlFromSessionFile(options.sessionFile);
  }

  return options;
}

function assertSetupReady(options) {
  if (options.cdpUrl) {
    return;
  }

  throw new Error(
    [
      'Missing required --cdp-url <url>.',
      'Use a configured `ai-browser-launch` when available; otherwise run `npm run browser:init -- --app gemini --browser chrome --port 9232 --yes`. Confirm with `npm run browser:status -- --ports 9232`.',
      'Then pass either `--cdp-url http://127.0.0.1:9232` or a legacy `--session-file .browser-sessions/<file>.json`.',
      'With npm 11 on Windows, use `npm run gemini:image-sequence -- --session-file ...`.',
    ].join(' ')
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  assertSetupReady(options);
  const prompts = collectPromptEntries(options);
  let browser;
  let page;
  try {
    ({ browser, page } = await openGeminiImageChat(options.cdpUrl, { reuseChat: options.reuseChat }));
    const results = await runPromptSequence(page, prompts, options);
    const meta = {
      status: 'completed',
      cdpUrl: options.cdpUrl,
      sessionFile: options.sessionFile || null,
      pageUrl: page.url(),
      promptCount: prompts.length,
      promptFiles: prompts.map((item) => item.file),
      driveFilename: options.driveFilename || null,
      driveTab: options.driveFilename ? options.driveTab : null,
      screenshotDir: options.screenshotDir,
      results,
      generatedAt: new Date().toISOString(),
    };

    writeRunMeta(options.metaPath, meta);
    console.log(JSON.stringify(meta, null, 2));
  } catch (error) {
    const failureMeta = {
      status: 'failed',
      cdpUrl: options.cdpUrl,
      sessionFile: options.sessionFile || null,
      pageUrl: page?.url() || null,
      promptCount: prompts.length,
      promptFiles: prompts.map((item) => item.file),
      screenshotDir: options.screenshotDir,
      failure: {
        message: error.message,
        failedAt: new Date().toISOString(),
      },
      escalation: null,
      generatedAt: new Date().toISOString(),
    };
    writeRunMeta(options.metaPath, failureMeta);
    const browserEvidence = error.retryAttempts >= 2
      ? await captureBrowserEvidence(page, {
        metaPath: options.metaPath,
        workflow: 'gemini-image-sequence',
      }).catch((evidenceError) => ({
        captureError: evidenceError.message,
        snapshotPath: null,
        screenshotPath: null,
      }))
      : null;
    const escalation = error.retryAttempts >= 2
      ? escalateToCodexCli({
        workflow: 'gemini-image-sequence',
        error,
        cdpUrl: options.cdpUrl,
        metaPath: options.metaPath,
        commandArgs: process.argv.slice(1),
        browserEvidence,
        additionalDirs: [
          options.screenshotDir,
          options.promptDir,
          ...options.promptFiles.map((file) => path.dirname(file)),
          path.dirname(options.metaPath),
        ],
      })
      : null;
    if (escalation?.resolved && escalation.workflowCompleted) {
      console.log(JSON.stringify({ status: 'completed-by-codex-escalation', escalation }, null, 2));
      return;
    }
    failureMeta.escalation = escalation;
    failureMeta.browserEvidence = browserEvidence
      ? {
        snapshotPath: browserEvidence.snapshotPath || null,
        screenshotPath: browserEvidence.screenshotPath || null,
        captureError: browserEvidence.captureError || null,
      }
      : null;
    writeRunMeta(options.metaPath, failureMeta);
    throw error;
  } finally {
    await browser?.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
