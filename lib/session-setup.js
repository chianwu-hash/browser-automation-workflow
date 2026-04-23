const fs = require('fs');

function readSessionConfig(sessionFile) {
  return JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
}

function readCdpUrlFromSessionFile(sessionFile) {
  const session = readSessionConfig(sessionFile);
  if (!session.cdpUrl) {
    throw new Error(`Session file is missing cdpUrl: ${sessionFile}`);
  }
  return session.cdpUrl;
}

module.exports = {
  readCdpUrlFromSessionFile,
  readSessionConfig,
};
