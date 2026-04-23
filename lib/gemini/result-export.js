const fs = require('fs');
const path = require('path');
const { getLatestResultTarget } = require('./result-targeting');
const { detectExportRoutes, choosePreferredRoute } = require('./export-routes');

function normalizeExportOptions(options = {}) {
  return {
    outDir: options.outDir || path.resolve(process.cwd(), 'output', 'gemini-export'),
    outputName: options.outputName || '',
    timeoutMs: Number(options.timeoutMs || 30000),
    mode: options.mode || 'latest',
    fallbackPolicy: options.fallbackPolicy || 'manual_required',
    screenshotPath: options.screenshotPath || '',
  };
}

async function exportLatestResult(page, options = {}) {
  const normalized = normalizeExportOptions(options);

  if (normalized.mode !== 'latest') {
    const error = new Error('Only mode="latest" is supported in gemini-result-export v1.');
    error.code = 'EXPORT_ROUTE_NOT_FOUND';
    throw error;
  }

  const target = await getLatestResultTarget(page);
  const routes = await detectExportRoutes(page);
  const route = choosePreferredRoute(routes);

  fs.mkdirSync(normalized.outDir, { recursive: true });

  let screenshotPath = normalized.screenshotPath;
  if (!screenshotPath) {
    screenshotPath = path.join(normalized.outDir, 'gemini-result-export-latest.png');
  }
  await page.screenshot({ path: screenshotPath, fullPage: true });

  if (route === 'none') {
    return {
      status: 'failed',
      route,
      savePath: null,
      suggestedFilename: null,
      screenshotPath,
      exportedAt: new Date().toISOString(),
      errorCode: 'EXPORT_ROUTE_NOT_FOUND',
      targetKind: target.kind,
      targetIndex: target.index,
    };
  }

  return {
    status: normalized.fallbackPolicy === 'manual_required' ? 'manual_required' : 'failed',
    route,
    savePath: null,
    suggestedFilename: normalized.outputName || null,
    screenshotPath,
    exportedAt: new Date().toISOString(),
    errorCode: 'MANUAL_EXPORT_REQUIRED',
    targetKind: target.kind,
    targetIndex: target.index,
  };
}

module.exports = {
  exportLatestResult,
  normalizeExportOptions,
};
