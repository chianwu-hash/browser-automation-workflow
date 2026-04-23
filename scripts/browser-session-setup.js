const readline = require('readline');
const {
  APPS,
  buildSetupSummary,
  findFreePort,
  isPortFree,
  isValidPort,
} = require('../lib/session-setup');

function parseArgs(argv) {
  const options = {
    app: 'gemini',
    port: null,
    autoPort: false,
    json: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--app' && argv[i + 1]) {
      options.app = argv[++i].toLowerCase();
    } else if (arg === '--port' && argv[i + 1]) {
      options.port = Number(argv[++i]);
    } else if (arg === '--auto-port') {
      options.autoPort = true;
    } else if (arg === '--json') {
      options.json = true;
    }
  }

  return options;
}

function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function chooseApp(rl, currentApp) {
  const appIds = Object.keys(APPS);
  const appPrompt = appIds.map((id, index) => `${index + 1}:${id}`).join(', ');
  const answer = (await ask(rl, `Choose app [${appPrompt}] (default: ${currentApp}): `)).trim().toLowerCase();
  if (!answer) return currentApp;

  if (APPS[answer]) return answer;

  const index = Number(answer);
  if (Number.isInteger(index) && index >= 1 && index <= appIds.length) {
    return appIds[index - 1];
  }

  return currentApp;
}

async function choosePort(rl, presetPort, autoPort) {
  if (isValidPort(presetPort)) {
    return presetPort;
  }

  if (autoPort) {
    return findFreePort();
  }

  const answer = (await ask(
    rl,
    'Enter remote debugging port, or press Enter to let the workflow pick a free port starting from 9222: '
  )).trim();

  if (!answer) {
    return findFreePort();
  }

  if (!isValidPort(answer)) {
    throw new Error('Invalid port. Use an integer between 1024 and 65535.');
  }

  const port = Number(answer);
  const free = await isPortFree(port);
  if (!free) {
    throw new Error(`Port ${port} is already in use. Run again and choose another port.`);
  }

  return port;
}

function printHumanSummary(summary) {
  console.log('');
  console.log(`App: ${summary.appName}`);
  console.log(`Login URL: ${summary.loginUrl}`);
  console.log(`Port: ${summary.port}`);
  console.log(`CDP URL: ${summary.cdpUrl}`);
  console.log('');
  console.log('Start a browser with one of these commands:');
  console.log(`  ${summary.chromeCommand}`);
  console.log(`  ${summary.edgeCommand}`);
  console.log('');
  console.log(`Then sign in to ${summary.appName} in that browser before running the workflow.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.json && isValidPort(options.port || 0)) {
    const summary = buildSetupSummary({ appId: options.app, port: options.port });
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const rl = createInterface();
  try {
    const app = await chooseApp(rl, options.app);
    const port = await choosePort(rl, options.port, options.autoPort);
    const summary = buildSetupSummary({ appId: app, port });

    if (options.json) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }

    printHumanSummary(summary);
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
