const fs = require('fs');
const path = require('path');

async function captureBrowserEvidence(page, { metaPath, workflow }) {
  if (!page) return null;

  const evidenceDir = path.join(path.dirname(metaPath), 'codex-escalation');
  fs.mkdirSync(evidenceDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const snapshotPath = path.join(evidenceDir, `${stamp}-browser-snapshot.json`);
  const screenshotPath = path.join(evidenceDir, `${stamp}-browser.png`);

  const snapshot = await page.evaluate((workflowName) => {
    const visible = (element) => {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const normalize = (value) => (value || '').replace(/\s+/g, ' ').trim();
    const countVisible = (selector) => [...document.querySelectorAll(selector)].filter(visible).length;
    const chatgptTurns = (role) => {
      const current = [...document.querySelectorAll(`[data-turn="${role}"]`)];
      if (current.length > 0) return current;
      const legacy = [...document.querySelectorAll(`[data-message-author-role="${role}"]`)];
      if (legacy.length > 0) return legacy;
      if (role === 'user') return [...document.querySelectorAll('[data-user-message-bubble="true"]')];
      return [...document.querySelectorAll('[data-conversation-role="assistant"]')]
        .map((marker) => marker.parentElement)
        .filter(Boolean);
    };
    const geminiTurns = (role) => role === 'user'
      ? [...document.querySelectorAll('user-query')]
      : [...document.querySelectorAll('model-response')];
    const turns = workflowName.startsWith('chatgpt') ? chatgptTurns : geminiTurns;
    const userTurns = turns('user');
    const assistantTurns = turns('assistant');
    const lastAssistantText = normalize(assistantTurns.at(-1)?.innerText || assistantTurns.at(-1)?.textContent || '');
    const editors = [...document.querySelectorAll(
      '#prompt-textarea, div.ProseMirror[contenteditable="true"], [role="textbox"], .ql-editor[contenteditable="true"]'
    )].filter(visible);
    const editorText = normalize(editors.at(0)?.value || editors.at(0)?.innerText || editors.at(0)?.textContent || '');
    const imageNodes = [...document.querySelectorAll('img')].filter((image) => {
      const src = image.currentSrc || image.src || '';
      return visible(image) && (
        src.includes('/backend-api/estuary/content') ||
        image.matches('img.image.loaded, img[src^="blob:"]')
      );
    });
    const imageSpecificGenerating = /正在(?:建立|生成|產生).{0,30}(?:圖像|圖片)|creating image|generating image/i.test(lastAssistantText);
    const rejectionDetected = /未能產生|無法產生|無法生成|錯誤判定.*(?:編輯|圖片)|需要參考圖|can't (?:create|generate)|unable to (?:create|generate)|image tool/i.test(lastAssistantText);
    const bodyText = normalize(document.body?.innerText || '');
    const chatToggle = document.querySelector('[data-tpp-toggle-value="chatgpt"]');
    const workToggle = document.querySelector('[data-tpp-toggle-value="work"]');

    return {
      capturedAt: new Date().toISOString(),
      workflow: workflowName,
      url: location.href,
      editorFound: editors.length > 0,
      editorTextLength: editorText.length,
      userTurnCount: userTurns.length,
      assistantTurnCount: assistantTurns.length,
      lastAssistantText: lastAssistantText.slice(0, 500),
      imageSpecificGenerating,
      rejectionDetected,
      generatedImageCount: imageNodes.length,
      generatedImages: imageNodes.map((image) => ({
        width: image.naturalWidth || 0,
        height: image.naturalHeight || 0,
      })),
      experienceMode: {
        chatAvailable: Boolean(chatToggle),
        chatChecked: chatToggle?.getAttribute('aria-checked') || null,
        workAvailable: Boolean(workToggle),
        workChecked: workToggle?.getAttribute('aria-checked') || null,
      },
      visibleSendButtons: countVisible('[data-testid="send-button"], #composer-submit-button, button[aria-label*="傳送"], button[aria-label*="Send"]'),
      visibleStopButtons: countVisible('[data-testid="stop-button"], button[aria-label*="停止"], button[aria-label*="Stop"]'),
      imageModeSignals: countVisible('[data-inline-selection-pill][data-id="picture_v2"], [data-system-hint-type="picture_v2"], [aria-label*="取消選取"][aria-label*="圖片"]'),
      rendererError: /Out of Memory|Aw, Snap!|STATUS_BREAKPOINT/i.test(bodyText),
    };
  }, workflow);

  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf8');
  let savedScreenshotPath = null;
  try {
    await page.screenshot({ path: screenshotPath, fullPage: false });
    savedScreenshotPath = screenshotPath;
  } catch {
    // The structured snapshot remains usable when the renderer cannot capture pixels.
  }

  return { snapshotPath, screenshotPath: savedScreenshotPath, snapshot };
}

module.exports = { captureBrowserEvidence };
