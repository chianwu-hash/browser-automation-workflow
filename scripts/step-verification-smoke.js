const assert = require('assert');
const { chromium } = require('playwright');
const {
  clickSend: clickChatGPTSend,
  waitForImages,
} = require('../lib/chatgpt/image-batch');
const {
  clickSend: clickGeminiSend,
  waitForImageGeneration,
} = require('../lib/gemini/image-workflow');
const { buildEscalationBrief, sanitizeCommandArgs } = require('../lib/escalation/codex-cli');

const prompt = '請生成校園節能月封面，並保留右上角空白。';

async function setChatGPTMock(page, accepted) {
  await page.setContent(`
    <div id="prompt-textarea" class="ProseMirror" role="textbox" contenteditable="true">${prompt}</div>
    <button data-testid="send-button" aria-label="傳送提示詞">Send</button>
  `);
  if (accepted) {
    await page.evaluate((text) => {
      document.querySelector('button').addEventListener('click', () => {
        document.querySelector('#prompt-textarea').textContent = '';
        const message = document.createElement('div');
        message.setAttribute('data-message-author-role', 'user');
        message.textContent = text;
        document.body.append(message);
      });
    }, prompt);
  }
}

async function setGeminiMock(page, accepted) {
  await page.setContent(`
    <div role="textbox" aria-label="請輸入 Gemini 提示詞" contenteditable="true">${prompt}</div>
    <button aria-label="傳送訊息">Send</button>
  `);
  if (accepted) {
    await page.evaluate((text) => {
      document.querySelector('button').addEventListener('click', () => {
        document.querySelector('[role="textbox"]').textContent = '';
        const message = document.createElement('user-query');
        message.textContent = `你說了 ${text}`;
        document.body.append(message);
      });
    }, prompt);
  }
}

async function expectFastFailure(action, messagePattern) {
  const started = Date.now();
  await assert.rejects(action, messagePattern);
  assert(Date.now() - started < 2000, 'Unaccepted send should fail fast in the smoke test.');
}

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();

    await setChatGPTMock(page, true);
    const chatgptAccepted = await clickChatGPTSend(page, prompt, { timeoutMs: 500 });
    assert.equal(chatgptAccepted.userMessageAdded, true);

    await setChatGPTMock(page, false);
    await expectFastFailure(
      () => clickChatGPTSend(page, prompt, { timeoutMs: 100 }),
      /ChatGPT prompt was not accepted/
    );

    await setGeminiMock(page, true);
    const geminiAccepted = await clickGeminiSend(page, prompt, { timeoutMs: 500 });
    assert.equal(geminiAccepted.userMessageAdded, true);

    await setGeminiMock(page, false);
    await expectFastFailure(
      () => clickGeminiSend(page, prompt, { timeoutMs: 100 }),
      /Gemini prompt was not accepted/
    );

    await page.route('https://chatgpt.com/mock', (route) => route.fulfill({
      contentType: 'text/html',
      body: `<div id="prompt-textarea" role="textbox" contenteditable="true"></div>
        <section data-testid="conversation-turn-1" data-turn="user">${prompt}</section>
        <section data-testid="conversation-turn-2" data-turn="assistant">目前圖像工具未能產生圖像，需要參考圖。</section>
        <button data-testid="stop-button" aria-label="停止回覆">Stop</button>`,
    }));
    await page.goto('https://chatgpt.com/mock');
    await expectFastFailure(
      () => waitForImages(page, [], {
        minImages: 1,
        timeoutMs: 5000,
        pollMs: 50,
        allowPartial: true,
        idleTimeoutMs: 50,
        prompt,
        assistantMessageCountBefore: 0,
        generationStartTimeoutMs: 500,
      }),
      /rejected image generation before it started|image generation did not start/
    );

    await page.route('https://gemini.google.com/mock', (route) => route.fulfill({
      contentType: 'text/html',
      body: `<div role="textbox" contenteditable="true"></div>
        <user-query>你說了 ${prompt}</user-query>
        <model-response>目前無法產生圖像，需要參考圖。</model-response>
        <button aria-label="停止回覆">Stop</button>`,
    }));
    await page.goto('https://gemini.google.com/mock');
    await expectFastFailure(
      () => waitForImageGeneration(page, 0, 5000, prompt, {
        modelResponseCountBefore: 0,
        generationStartTimeoutMs: 500,
      }),
      /rejected image generation before it started|image generation did not start/
    );

    const sanitizedArgs = sanitizeCommandArgs(['--prompt-text', 'private prompt', '--image-mode']);
    assert(!sanitizedArgs.includes('private prompt'));
    const escalationBrief = buildEscalationBrief({
      workflow: 'chatgpt-image-batch',
      error: Object.assign(new Error('generation did not start'), { code: 'TEST_FAILURE' }),
      cdpUrl: 'http://127.0.0.1:9232',
      metaPath: 'C:/temp/run-meta.json',
      browserEvidence: {
        snapshotPath: 'C:/temp/browser-snapshot.json',
        screenshotPath: 'C:/temp/browser.png',
      },
    }, sanitizedArgs);
    assert(escalationBrief.includes('first 60 seconds'));
    assert(escalationBrief.includes('transient_model_failure'));
    assert(escalationBrief.includes('Remove --reuse-chat and --direct-prompt; use --image-mode'));
    assert(!escalationBrief.includes('private prompt'));

    console.log('Step verification smoke test passed for send acceptance and generation start.');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
