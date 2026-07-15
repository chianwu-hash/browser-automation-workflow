const path = require('path');
const {
  openChatGPTImageChat,
  runImageBatch,
  writeRunMeta,
} = require('../lib/chatgpt');
const { readCdpUrlFromSessionFile } = require('../lib/session-setup');

function parseArgs(argv) {
  const options = {
    cdpUrl: '',
    sessionFile: '',
    promptDir: '',
    promptFile: '',
    promptText: '',
    count: null,
    minImages: null,
    maxRounds: null,
    reuseChat: false,
    directPrompt: false,
    timeoutMs: 600000,
    idleTimeoutMs: 15000,
    pollMs: 3000,
    outputDir: path.resolve(process.cwd(), 'output', 'chatgpt-image-batch'),
    outputPrefix: 'chatgpt-image',
    metaPath: path.resolve(process.cwd(), 'output', 'chatgpt-image-batch.json'),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--prompt-dir' && argv[i + 1]) {
      options.promptDir = path.resolve(process.cwd(), argv[++i]);
    } else if (arg === '--prompt-file' && argv[i + 1]) {
      options.promptFile = path.resolve(process.cwd(), argv[++i]);
    } else if (arg === '--prompt-text' && argv[i + 1]) {
      options.promptText = argv[++i];
    } else if (arg === '--count' && argv[i + 1]) {
      options.count = Number(argv[++i]);
    } else if (arg === '--min-images' && argv[i + 1]) {
      options.minImages = Number(argv[++i]);
    } else if (arg === '--max-rounds' && argv[i + 1]) {
      options.maxRounds = Number(argv[++i]);
    } else if (arg === '--cdp-url' && argv[i + 1]) {
      options.cdpUrl = argv[++i];
    } else if (arg === '--session-file' && argv[i + 1]) {
      options.sessionFile = path.resolve(process.cwd(), argv[++i]);
    } else if (arg === '--reuse-chat') {
      options.reuseChat = true;
    } else if (arg === '--direct-prompt') {
      options.directPrompt = true;
    } else if (arg === '--image-mode') {
      options.directPrompt = false;
    } else if (arg === '--timeout-ms' && argv[i + 1]) {
      options.timeoutMs = Number(argv[++i]);
    } else if (arg === '--idle-timeout-ms' && argv[i + 1]) {
      options.idleTimeoutMs = Number(argv[++i]);
    } else if (arg === '--poll-ms' && argv[i + 1]) {
      options.pollMs = Number(argv[++i]);
    } else if (arg === '--output-dir' && argv[i + 1]) {
      options.outputDir = path.resolve(process.cwd(), argv[++i]);
    } else if (arg === '--output-prefix' && argv[i + 1]) {
      options.outputPrefix = argv[++i];
    } else if (arg === '--meta' && argv[i + 1]) {
      options.metaPath = path.resolve(process.cwd(), argv[++i]);
    }
  }

  if (options.count !== null && (!Number.isInteger(options.count) || options.count < 1 || options.count > 50)) {
    throw new Error('Invalid --count. Use an integer from 1 to 50.');
  }

  if (options.minImages !== null && (!Number.isInteger(options.minImages) || options.minImages < 1)) {
    throw new Error('Invalid --min-images. Use an integer greater than 0.');
  }

  if (options.maxRounds !== null && (!Number.isInteger(options.maxRounds) || options.maxRounds < 1)) {
    throw new Error('Invalid --max-rounds. Use an integer greater than 0.');
  }

  if (options.sessionFile) {
    options.cdpUrl = readCdpUrlFromSessionFile(options.sessionFile);
  }

  return options;
}

function assertSetupReady(options) {
  if (!options.cdpUrl) {
    throw new Error(
      [
        'Missing required --cdp-url <url>.',
        'Run `npm run browser:init -- -- --app chatgpt --browser chrome --port 9222 --yes` first, then confirm with `npm run browser:status -- --ports 9222`.',
        'Then pass either --cdp-url http://127.0.0.1:9222 or a legacy --session-file <file>.',
      ].join(' ')
    );
  }

  if (!options.promptDir && !options.promptFile && !options.promptText) {
    throw new Error('Missing required --prompt-dir <dir>, --prompt-file <file>, or --prompt-text <text>. Prefer files for non-ASCII prompts.');
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  assertSetupReady(options);

  const { browser, page } = await openChatGPTImageChat(options.cdpUrl, {
    reuseChat: options.reuseChat,
    directPrompt: options.directPrompt,
  });
  try {
    const result = await runImageBatch(page, options);
    const meta = {
      cdpUrl: options.cdpUrl,
      sessionFile: options.sessionFile || null,
      pageUrl: page.url(),
      promptDir: options.promptDir || null,
      promptFile: options.promptFile || null,
      count: result.requestedCount,
      outputDir: options.outputDir,
      result,
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
