const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_ROOT = path.join(ROOT, 'skills');
const DEFAULT_SKILLS = ['chatgpt-image-batch', 'gemini-image-workflow'];

function isInside(parent, target) {
  const relative = path.relative(parent, target);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function parseArgs(argv) {
  const options = {
    force: false,
    skills: [],
    destRoot: process.env.CODEX_HOME
      ? path.join(process.env.CODEX_HOME, 'skills')
      : path.join(os.homedir(), '.codex', 'skills'),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--force') {
      options.force = true;
    } else if (arg === '--dest' && argv[i + 1]) {
      options.destRoot = path.resolve(process.cwd(), argv[++i]);
    } else if (arg === '--skill' && argv[i + 1]) {
      options.skills.push(argv[++i]);
    }
  }

  if (options.skills.length === 0) {
    options.skills = DEFAULT_SKILLS;
  }

  return options;
}

function assertSkillSource(name) {
  if (!/^[a-z0-9-]+$/.test(name)) {
    throw new Error(`Invalid skill name: ${name}`);
  }

  const source = path.join(SOURCE_ROOT, name);
  const resolved = path.resolve(source);
  if (!isInside(SOURCE_ROOT, resolved)) {
    throw new Error(`Skill source resolved outside skills root: ${resolved}`);
  }
  if (!fs.existsSync(path.join(resolved, 'SKILL.md'))) {
    throw new Error(`Missing SKILL.md for skill: ${name}`);
  }
  return resolved;
}

function installSkill(name, options) {
  const source = assertSkillSource(name);
  const destRoot = path.resolve(options.destRoot);
  const dest = path.join(destRoot, name);
  const resolvedDest = path.resolve(dest);
  if (!isInside(destRoot, resolvedDest)) {
    throw new Error(`Skill destination resolved outside destination root: ${resolvedDest}`);
  }

  if (fs.existsSync(resolvedDest)) {
    if (!options.force) {
      console.log(`[skip] ${name} already exists at ${resolvedDest}. Use --force to update it.`);
      return { name, status: 'skipped', dest: resolvedDest };
    }
    fs.rmSync(resolvedDest, { recursive: true, force: true });
  }

  fs.mkdirSync(destRoot, { recursive: true });
  fs.cpSync(source, resolvedDest, { recursive: true });
  console.log(`[ok] installed ${name} -> ${resolvedDest}`);
  return { name, status: 'installed', dest: resolvedDest };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const results = options.skills.map((name) => installSkill(name, options));
  const installed = results.filter((item) => item.status === 'installed').length;

  if (installed > 0) {
    console.log('');
    console.log('Restart Codex to pick up newly installed or updated skills.');
  }
}

main();
