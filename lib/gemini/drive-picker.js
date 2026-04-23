const { ZH, tabTextFromKey } = require('./constants');

async function getOpenPickerFrame(page) {
  return page.frames().find((frame) => frame.url().includes(ZH.pickerUrlPart)) || null;
}

async function dismissWorkspaceDialogIfPresent(page) {
  const dialog = page
    .locator('mat-dialog-container, [role="dialog"], .cdk-overlay-pane')
    .filter({ hasText: ZH.workspaceDialogNeedle })
    .first();

  if (!(await dialog.isVisible().catch(() => false))) {
    return false;
  }

  const connectButton = dialog.locator('button').filter({ hasText: ZH.workspaceConnectText }).first();
  if (await connectButton.isVisible().catch(() => false)) {
    await connectButton.click({ timeout: 10000 });
    await page.waitForTimeout(1500);
    return true;
  }

  return false;
}

async function ensurePickerOpen(page, timeoutMs) {
  let pickerFrame = await getOpenPickerFrame(page);
  if (pickerFrame) return pickerFrame;

  const uploadButton = page.getByLabel(ZH.uploadButtonLabel).first();
  await uploadButton.click({ timeout: 10000 });

  const driveMenuItem = page
    .locator('[role="menuitem"]')
    .filter({ hasText: ZH.driveMenuText })
    .first();
  await driveMenuItem.waitFor({ state: 'visible', timeout: 10000 });
  await driveMenuItem.click({ timeout: 10000 });

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await dismissWorkspaceDialogIfPresent(page).catch(() => false);
    pickerFrame = await getOpenPickerFrame(page);
    if (pickerFrame) return pickerFrame;
    await page.waitForTimeout(400);
  }

  throw new Error('Timed out waiting for Google Picker frame to open.');
}

async function switchPickerTabIfNeeded(pickerFrame, tabKey) {
  const tabText = tabTextFromKey(tabKey);
  const tab = pickerFrame.getByRole('tab', { name: tabText }).first();
  if (await tab.isVisible().catch(() => false)) {
    await tab.click({ timeout: 10000 });
    await pickerFrame.waitForTimeout(1200);
  }
}

async function searchFilename(pickerFrame, filename) {
  const search = pickerFrame.getByRole('combobox', { name: ZH.searchAria }).first();
  if (!(await search.isVisible().catch(() => false))) return;

  await search.click({ timeout: 10000 });
  await search.fill('');
  await search.fill(filename);
  await search.press('Enter').catch(() => {});
  await pickerFrame.waitForTimeout(2200);
}

async function findOptionByFilename(pickerFrame, filename, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const options = pickerFrame.locator('[role="option"]');
    const count = await options.count().catch(() => 0);
    for (let i = 0; i < count; i += 1) {
      const option = options.nth(i);
      const text = ((await option.innerText().catch(() => '')) || '').trim();
      if (text === filename || text.includes(filename) || filename.includes(text)) {
        return option;
      }
    }
    await pickerFrame.waitForTimeout(250);
  }
  return null;
}

async function resilientClick(locator, timeoutMs = 10000) {
  try {
    await locator.click({ timeout: timeoutMs });
    return;
  } catch (_) {}

  try {
    await locator.click({ timeout: timeoutMs, force: true });
    return;
  } catch (_) {}

  await locator.evaluate((el) => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  });
}

async function waitForInsertButton(pickerFrame, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const button = pickerFrame.locator('button').filter({ hasText: ZH.insertButtonText }).first();
    if (await button.count().catch(() => 0)) {
      return button;
    }
    await pickerFrame.waitForTimeout(300);
  }
  throw new Error('Timed out waiting for Google Picker insert button to exist.');
}

async function hasAttachmentPreview(page, filename) {
  return page.evaluate((name) => {
    const cancelButtons = [...document.querySelectorAll('[data-test-id="cancel-button"], button[aria-label]')];
    const hasNamedPreview = cancelButtons.some((el) => (el.getAttribute('aria-label') || '').includes(name));
    const hasPreviewChip =
      !!document.querySelector('uploader-file-preview-container') ||
      !!document.querySelector('.attachment-preview-wrapper') ||
      !!document.querySelector('.text-input-field.with-file-preview');
    return hasNamedPreview || hasPreviewChip;
  }, filename).catch(() => false);
}

async function insertDriveFile(page, filename, tabKey, timeoutMs) {
  const pickerFrame = await ensurePickerOpen(page, timeoutMs);
  await switchPickerTabIfNeeded(pickerFrame, tabKey);

  let option = await findOptionByFilename(pickerFrame, filename);
  if (!option) {
    await searchFilename(pickerFrame, filename);
    option = await findOptionByFilename(pickerFrame, filename);
  }
  if (!option) {
    throw new Error(`Could not find a visible Google Picker entry named "${filename}".`);
  }

  const selectedBefore = await option.getAttribute('aria-selected').catch(() => null);
  if (selectedBefore !== 'true') {
    await resilientClick(option, 10000);
    await pickerFrame.waitForTimeout(800);
  }

  const insertButton = await waitForInsertButton(pickerFrame, 10000);
  await resilientClick(insertButton, 10000);
  await page.waitForTimeout(1200);

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await hasAttachmentPreview(page, filename)) {
      return true;
    }
    await page.waitForTimeout(400);
  }

  throw new Error('Timed out waiting for Google Drive image attachment preview to appear after insert.');
}

module.exports = {
  dismissWorkspaceDialogIfPresent,
  ensurePickerOpen,
  findOptionByFilename,
  getOpenPickerFrame,
  hasAttachmentPreview,
  insertDriveFile,
  resilientClick,
  searchFilename,
  switchPickerTabIfNeeded,
};
