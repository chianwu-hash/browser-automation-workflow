const path = require('path');
const {
  clickSend,
  downloadGeneratedImages,
  fillPrompt,
  getGeneratedImages,
  openChatGPTImageChat,
  waitForImages,
  writeRunMeta,
} = require('../lib/chatgpt');
const { readCdpUrlFromSessionFile } = require('../lib/session-setup');

function parseArgs(argv) {
  const options = {
    cdpUrl: '',
    sessionFile: '',
    promptFile: '',
    promptText: '',
    expectedImages: 3,
    allowPartial: true,
    reuseChat: false,
    directPrompt: true,
    timeoutMs: 900000,
    idleTimeoutMs: 20000,
    pollMs: 3000,
    outputDir: path.resolve(process.cwd(), 'output', 'chatgpt-image-multi-mvp'),
    outputPrefix: 'images2-mvp',
    metaPath: path.resolve(process.cwd(), 'output', 'chatgpt-image-multi-mvp.json'),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--cdp-url' && argv[i + 1]) {
      options.cdpUrl = argv[++i];
    } else if (arg === '--session-file' && argv[i + 1]) {
      options.sessionFile = path.resolve(process.cwd(), argv[++i]);
    } else if (arg === '--prompt-file' && argv[i + 1]) {
      options.promptFile = path.resolve(process.cwd(), argv[++i]);
    } else if (arg === '--prompt-text' && argv[i + 1]) {
      options.promptText = argv[++i];
    } else if (arg === '--expected-images' && argv[i + 1]) {
      options.expectedImages = Number(argv[++i]);
    } else if (arg === '--strict') {
      options.allowPartial = false;
    } else if (arg === '--allow-partial') {
      options.allowPartial = true;
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

  if (options.sessionFile) {
    options.cdpUrl = readCdpUrlFromSessionFile(options.sessionFile);
  }

  if (!options.cdpUrl) {
    throw new Error(
      [
        'Missing required --cdp-url <url> or --session-file <file>.',
        'Run `npm run browser:init -- -- --app chatgpt --browser chrome --port 9222 --yes`, confirm with `npm run browser:status -- --ports 9222`, and pass --cdp-url http://127.0.0.1:9222.',
      ].join(' ')
    );
  }

  if (!Number.isInteger(options.expectedImages) || options.expectedImages < 1 || options.expectedImages > 10) {
    throw new Error('Invalid --expected-images. Use an integer from 1 to 10.');
  }

  if (!options.promptFile && !options.promptText) {
    throw new Error('Missing required --prompt-file <file> or --prompt-text <text>. Prefer files for non-ASCII prompts.');
  }

  return options;
}

function readPrompt(options) {
  if (options.promptFile) {
    const fs = require('fs');
    const prompt = fs.readFileSync(options.promptFile, 'utf8').trim();
    if (!prompt) throw new Error(`Prompt file is empty: ${options.promptFile}`);
    return prompt;
  }

  const prompt = options.promptText.trim();
  if (!prompt) throw new Error('Prompt text is empty.');
  return prompt;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const prompt = readPrompt(options);
  const { browser, page } = await openChatGPTImageChat(options.cdpUrl, {
    reuseChat: options.reuseChat,
    directPrompt: options.directPrompt,
  });

  try {
    const baseline = new Set((await getGeneratedImages(page)).map((item) => item.id || item.src));
    await fillPrompt(page, prompt);
    await page.waitForTimeout(500);
    await clickSend(page);

    const detectedImages = await waitForImages(page, [...baseline], {
      minImages: options.expectedImages,
      timeoutMs: options.timeoutMs,
      pollMs: options.pollMs,
      allowPartial: options.allowPartial,
      idleTimeoutMs: options.idleTimeoutMs,
    });

    const freshImages = detectedImages.filter((item) => !baseline.has(item.id || item.src));
    const downloadResult = await downloadGeneratedImages(page, freshImages, {
      ...options,
      startIndex: 1,
      seenHashes: new Set(),
    });

    const meta = {
      mode: 'single-prompt-single-response-multi-image-mvp',
      cdpUrl: options.cdpUrl,
      sessionFile: options.sessionFile || null,
      pageUrl: page.url(),
      promptFile: options.promptFile || null,
      expectedImages: options.expectedImages,
      detectedNewImages: freshImages.length,
      downloadedCount: downloadResult.downloads.length,
      outputDir: options.outputDir,
      prompt,
      images: freshImages,
      downloads: downloadResult.downloads,
      skipped: downloadResult.skipped,
      completedAt: new Date().toISOString(),
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
