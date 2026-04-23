const net = require('net');

const APPS = {
  gemini: {
    id: 'gemini',
    name: 'Gemini',
    loginUrl: 'https://gemini.google.com/',
  },
  notebooklm: {
    id: 'notebooklm',
    name: 'NotebookLM',
    loginUrl: 'https://notebooklm.google.com/',
  },
  chatgpt: {
    id: 'chatgpt',
    name: 'ChatGPT',
    loginUrl: 'https://chatgpt.com/',
  },
  canva: {
    id: 'canva',
    name: 'Canva',
    loginUrl: 'https://www.canva.com/',
  },
};

function isValidPort(value) {
  const port = Number(value);
  return Number.isInteger(port) && port >= 1024 && port <= 65535;
}

function isPortFree(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on('error', () => resolve(false));
    server.listen(port, host, () => {
      server.close(() => resolve(true));
    });
  });
}

async function findFreePort(startPort = 9222, host = '127.0.0.1', attempts = 50) {
  for (let offset = 0; offset < attempts; offset += 1) {
    const port = startPort + offset;
    if (await isPortFree(port, host)) {
      return port;
    }
  }
  throw new Error(`Could not find a free port starting from ${startPort}.`);
}

function getAppConfig(appId = 'gemini') {
  return APPS[appId] || APPS.gemini;
}

function buildChromeLaunchCommand(port) {
  return `chrome.exe --remote-debugging-port=${port}`;
}

function buildEdgeLaunchCommand(port) {
  return `msedge.exe --remote-debugging-port=${port}`;
}

function buildSetupSummary({ appId, port }) {
  const app = getAppConfig(appId);
  return {
    appId: app.id,
    appName: app.name,
    loginUrl: app.loginUrl,
    port,
    cdpUrl: `http://127.0.0.1:${port}`,
    chromeCommand: buildChromeLaunchCommand(port),
    edgeCommand: buildEdgeLaunchCommand(port),
  };
}

module.exports = {
  APPS,
  buildChromeLaunchCommand,
  buildEdgeLaunchCommand,
  buildSetupSummary,
  findFreePort,
  getAppConfig,
  isPortFree,
  isValidPort,
};
