const { ZH, tabTextFromKey } = require('./constants');
const session = require('./session');
const drivePicker = require('./drive-picker');
const imageWorkflow = require('./image-workflow');
const resultTargeting = require('./result-targeting');
const exportRoutes = require('./export-routes');
const resultExport = require('./result-export');

module.exports = {
  ZH,
  tabTextFromKey,
  ...session,
  ...drivePicker,
  ...imageWorkflow,
  ...resultTargeting,
  ...exportRoutes,
  ...resultExport,
};
