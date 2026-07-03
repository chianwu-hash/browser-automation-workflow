const ZH = {
  geminiUrlPart: 'gemini.google.com',
  pickerUrlPart: 'docs.google.com/picker',
  uploadButtonLabel: '\u958b\u555f\u4e0a\u50b3\u6a94\u6848\u9078\u55ae',
  driveMenuText: '\u52a0\u5165\u96f2\u7aef\u786c\u789f\u6a94\u6848',
  workspaceDialogNeedle: 'Google Workspace',
  workspaceConnectText: '\u9023\u7d50',
  searchAria: '\u5728\u96f2\u7aef\u786c\u789f\u4e2d\u641c\u5c0b\u6216\u8cbc\u4e0a\u7db2\u5740',
  insertButtonText: '\u63d2\u5165',
  recentTab: '\u8fd1\u671f',
  myDriveTab: '\u6211\u7684\u96f2\u7aef\u786c\u789f',
  sharedTab: '\u8207\u6211\u5171\u7528',
  starredTab: '\u5df2\u52a0\u661f\u865f',
  textboxAria: '\u8acb\u8f38\u5165 Gemini \u63d0\u793a\u8a5e',
  imageShortcutText: '\u751f\u6210\u5716\u7247',
  imageModeText: '\u5efa\u7acb\u5716\u50cf',
  imageModeSelectedAria: '\u53d6\u6d88\u9078\u53d6\u300c\u5716\u7247\u300d',
  selectedImageChipText: '\u5716\u7247',
  toolButtonAria: '\u4e0a\u50b3\u8207\u5de5\u5177',
  sendAria: '\u50b3\u9001\u8a0a\u606f',
  stopAria: '\u505c\u6b62\u56de\u8986',
  generatingNeedle: '\u6b63\u5728\u7522\u751f',
  downloadOriginalImageAria: '\u4e0b\u8f09\u539f\u5c3a\u5bf8\u5716\u7247',
};

function tabTextFromKey(tabKey) {
  const normalized = String(tabKey || '').toLowerCase();
  if (normalized === 'drive' || normalized === 'my-drive' || normalized === 'mydrive') return ZH.myDriveTab;
  if (normalized === 'shared' || normalized === 'shared-with-me') return ZH.sharedTab;
  if (normalized === 'starred') return ZH.starredTab;
  return ZH.recentTab;
}

module.exports = {
  ZH,
  tabTextFromKey,
};
