const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CHECK_DIRS = ['lib', 'scripts'];

function collectJsFiles(dir) {
  const fullDir = path.join(ROOT, dir);
  if (!fs.existsSync(fullDir)) return [];

  return fs.readdirSync(fullDir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(fullDir, entry.name);
    const relPath = path.relative(ROOT, fullPath);
    if (entry.isDirectory()) return collectJsFiles(relPath);
    if (entry.isFile() && entry.name.endsWith('.js')) return [relPath];
    return [];
  });
}

function main() {
  const files = CHECK_DIRS.flatMap(collectJsFiles).sort();
  let failed = false;

  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], {
      cwd: ROOT,
      stdio: 'inherit',
      shell: false,
    });
    if (result.status !== 0) failed = true;
  }

  if (failed) {
    process.exitCode = 1;
    return;
  }

  console.log(`Checked ${files.length} JavaScript files.`);
}

main();
