function main() {
  const lines = [
    'Browser session initialization now lives in the separate cbs-workflows repo.',
    '',
    'From this workspace, run:',
    '  cd ..\\cbs-workflows',
    '  npm run browser:init',
    '',
    'Then return here and pass the generated session file to a workflow, for example:',
    '  cd ..\\browser-automation-workflow',
    '  npm run gemini:image-sequence -- -- --session-file ..\\cbs-workflows\\.browser-sessions\\gemini-chrome-9333.json --prompt-dir templates/gemini-sequence',
  ];

  console.log(lines.join('\n'));
}

main();
