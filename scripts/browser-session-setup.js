function main() {
  const lines = [
    'Use the shared local CDP work browser for this repo.',
    '',
    'Recommended setup:',
    '  cdp-launch chatgpt',
    '  cdp-status',
    '  $env:CDP_URL = "http://127.0.0.1:9222"',
    '',
    'Then run a workflow, for example:',
    '  npm run browser:smoke',
    '  npm run chatgpt:image-batch -- -- --cdp-url $env:CDP_URL --prompt-file templates\\prompt-example.txt',
    '  npm run gemini:image-sequence -- -- --cdp-url $env:CDP_URL --prompt-dir templates\\gemini-sequence',
    '',
    'Legacy session-file setup is still available through:',
    '  npm run browser:init:legacy',
  ];

  console.log(lines.join('\n'));
}

main();
