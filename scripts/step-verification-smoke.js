const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const {
  clickSend: clickChatGPTSend,
  runImageBatch,
  shouldRetryRoundAttempt,
  waitForImages,
} = require('../lib/chatgpt/image-batch');
const {
  clickSend: clickGeminiSend,
  waitForImageGeneration,
} = require('../lib/gemini/image-workflow');
const { ensureChatMode } = require('../lib/chatgpt/session');
const { buildEscalationBrief, sanitizeCommandArgs } = require('../lib/escalation/codex-cli');

const prompt = '請生成校園節能月封面，並保留右上角空白。';

async function setChatGPTMock(page, accepted) {
  await page.setContent(`
    <div id="prompt-textarea" class="ProseMirror" role="textbox" contenteditable="true">${prompt}</div>
    <button data-testid="send-button" aria-label="傳送提示詞">Send</button>
  `);
  if (accepted) {
    await page.evaluate((text) => {
      const submit = () => {
        document.querySelector('#prompt-textarea').textContent = '';
        const message = document.createElement('div');
        message.setAttribute('data-message-author-role', 'user');
        message.textContent = text;
        document.body.append(message);
      };
      document.querySelector('button').addEventListener('click', submit);
      document.querySelector('#prompt-textarea').addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) submit();
      });
    }, prompt);
  }
}

async function setChatModeMock(page) {
  await page.setContent(`
    <button role="radio" data-tpp-toggle-value="chatgpt" aria-checked="false">Chat</button>
    <button role="radio" data-tpp-toggle-value="work" aria-checked="true">Work</button>
  `);
  await page.evaluate(() => {
    const chat = document.querySelector('[data-tpp-toggle-value="chatgpt"]');
    const work = document.querySelector('[data-tpp-toggle-value="work"]');
    const selectChat = () => {
      chat.setAttribute('aria-checked', 'true');
      work.setAttribute('aria-checked', 'false');
    };
    chat.addEventListener('click', selectChat);
    chat.addEventListener('keydown', (event) => {
      if (event.key === ' ' || event.key === 'Spacebar') selectChat();
    });
  });
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

    await setChatModeMock(page);
    const chatMode = await ensureChatMode(page);
    assert.equal(chatMode.confirmed, true);
    assert.equal(await page.locator('[data-tpp-toggle-value="chatgpt"]').getAttribute('aria-checked'), 'true');

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
      contentType: 'text/html; charset=utf-8',
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

    await page.unroute('https://chatgpt.com/mock');
    await page.route('https://chatgpt.com/mock-thinking', (route) => route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: `<div id="prompt-textarea" role="textbox" contenteditable="true"></div>
        <section data-testid="conversation-turn-1" data-turn="user">${prompt}</section>
        <section data-testid="conversation-turn-2" data-turn="assistant">思考中</section>
        <div id="progress">正在思考<br>80%</div>
        <button data-testid="stop-button" aria-label="停止回覆">Stop</button>
        <script>
          setTimeout(() => {
            document.querySelector('#progress').remove();
            document.querySelector('[data-testid="stop-button"]').remove();
            const container = document.createElement('div');
            container.id = 'image-test-generated';
            container.innerHTML = '<img style="width:320px;height:180px" src="https://chatgpt.com/backend-api/estuary/content?id=test-image">';
            document.body.append(container);
          }, 350);
        <\/script>`,
    }));
    await page.goto('https://chatgpt.com/mock-thinking');
    const delayedImages = await waitForImages(page, [], {
      minImages: 1,
      timeoutMs: 3000,
      pollMs: 50,
      allowPartial: true,
      idleTimeoutMs: 50,
      imageSettleMs: 50,
      prompt,
      assistantMessageCountBefore: 0,
      generationStartTimeoutMs: 100,
    });
    assert.equal(delayedImages.length, 1, 'Thinking progress must suppress premature generation-start failure.');

    await page.route('https://chatgpt.com/mock-conversation-drift', (route) => route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: `<div id="prompt-textarea" role="textbox" contenteditable="true"></div>
        <section data-turn="user">A different browser job sent this prompt.</section>
        <div id="image-other"><img alt="產生的圖片 1" style="width:200px;height:200px" src="https://chatgpt.com/backend-api/estuary/content?id=other-image"></div>`,
    }));
    await page.goto('https://chatgpt.com/mock-conversation-drift');
    await assert.rejects(
      () => waitForImages(page, [], {
        minImages: 1,
        timeoutMs: 1000,
        pollMs: 50,
        idleTimeoutMs: 50,
        imageSettleMs: 50,
        prompt,
      }),
      (error) => error.code === 'CHATGPT_CONVERSATION_DRIFT',
      'Images in another conversation must never satisfy this request.'
    );
    await page.unroute('https://chatgpt.com/mock-conversation-drift');

    await page.route('https://chatgpt.com/mock-file-card', (route) => route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: `<div><h4 data-conversation-role="assistant">ChatGPT 說：</h4>
        <span class="group/resource-row"><span class="truncate">test.png</span>
        <button aria-label="下載檔案">Download</button></span></div>
        <div>圖像生成失敗<button>再試一次</button></div>`,
    }));
    await page.goto('https://chatgpt.com/mock-file-card');
    const fileCardImages = await waitForImages(page, [], {
      minImages: 1,
      timeoutMs: 3000,
      pollMs: 50,
      allowPartial: true,
      idleTimeoutMs: 50,
      generationStartTimeoutMs: 500,
    });
    assert.equal(fileCardImages[0]?.kind, 'file-card');
    assert.equal(fileCardImages[0]?.fileName, 'test.png');

    const batchOutputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatgpt-batch-stop-'));
    try {
      const pngBytes = Buffer.concat([
        Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/gZkAAAAASUVORK5CYII=', 'base64'),
        Buffer.alloc(1024),
      ]);
      const imageUrl = `data:image/png;base64,${pngBytes.toString('base64')}`;
      await page.route('https://chatgpt.com/mock-batch-failure', (route) => route.fulfill({
        contentType: 'text/html; charset=utf-8',
        body: `<div id="prompt-textarea" class="ProseMirror" role="textbox" contenteditable="true"></div>
          <script>
            window.sendCount = 0;
            document.querySelector('#prompt-textarea').addEventListener('keydown', (event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              window.sendCount += 1;
              const editor = event.currentTarget;
              const text = editor.innerText;
              editor.textContent = '';
              const user = document.createElement('section');
              user.setAttribute('data-turn', 'user');
              user.textContent = text;
              document.body.append(user);
              const assistant = document.createElement('section');
              assistant.setAttribute('data-turn', 'assistant');
              assistant.innerHTML = '<div id="image-1"><img alt="產生的圖片 1" style="width:200px;height:200px" src="${imageUrl}"></div><span>圖像生成失敗</span>';
              document.body.append(assistant);
            });
          <\/script>`,
      }));
      await page.goto('https://chatgpt.com/mock-batch-failure');
      let batchError;
      try {
        await runImageBatch(page, {
          promptText: prompt,
          count: 2,
          minImages: 2,
          maxRounds: 2,
          referenceImages: [],
          outputDir: batchOutputDir,
          outputPrefix: 'test',
          timeoutMs: 3000,
          generationStartTimeoutMs: 500,
          idleTimeoutMs: 50,
          imageSettleMs: 50,
          pollMs: 50,
          directPrompt: true,
        });
      } catch (error) {
        batchError = error;
      }
      assert.equal(batchError?.code, 'CHATGPT_REPORTED_IMAGE_FAILURE');
      assert.equal(await page.evaluate(() => window.sendCount), 1, 'Failure in round one must stop before a second submission.');
      assert.equal(batchError.partialResult.rounds.length, 1);
      assert.equal(batchError.partialResult.downloadedCount, 1);
      assert.equal(batchError.partialResult.rounds[0].checks.assistantReportedFailure, true);
      await page.unroute('https://chatgpt.com/mock-batch-failure');
    } finally {
      fs.rmSync(batchOutputDir, { recursive: true, force: true });
    }

    assert.equal(
      shouldRetryRoundAttempt(new Error('generation did not start'), {
        composerCleared: true,
        userMessageAdded: true,
      }),
      false,
      'A verified send must never be automatically resubmitted.'
    );

    await page.route('https://gemini.google.com/mock', (route) => route.fulfill({
      contentType: 'text/html; charset=utf-8',
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
    assert(escalationBrief.includes('Remove --reuse-chat;'));
    assert(escalationBrief.includes('Do not silently switch to prompt-driven generation.'));
    assert(!escalationBrief.includes('private prompt'));

    console.log('Step verification smoke test passed for send acceptance, generation start, file cards, and first-round batch stop.');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
