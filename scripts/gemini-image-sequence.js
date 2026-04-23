const os = require('os');
const path = require('path');
const {
  collectPromptEntries,
  openGeminiImageChat,
  runPromptSequence,
  writeRunMeta,
} = require('../lib/gemini');
const { readCdpUrlFromSessionFile } = require('../lib/session-setup');

function parseArgs(argv) {
  const options = {
    cdpUrl: '',
    sessionFile: '',
    promptDir: '',
    promptFiles: [],
    driveFilename: '',
    driveTab: 'recent',
    timeoutMs: 300000,
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
    } else if (arg === '--timeout-ms' && argv[i + 1]) {
      options.timeoutMs = Number(argv[++i]);
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
      'Run `npm run browser:init` from the sibling `cbs-workflows` repo first to launch a logged-in browser session.',
      'Then pass either `--session-file .browser-sessions/<file>.json` or `--cdp-url http://127.0.0.1:<port>`.',
      'With npm 11 on Windows, use `npm run gemini:image-sequence -- -- --session-file ...`.',
    ].join(' ')
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  assertSetupReady(options);
  const prompts = collectPromptEntries(options);
  const { browser, page } = await openGeminiImageChat(options.cdpUrl);

  try {
    const results = await runPromptSequence(page, prompts, options);
    const meta = {
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
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
