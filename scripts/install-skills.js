const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_ROOT = path.join(ROOT, 'skills');
const DEFAULT_SKILLS = ['ai-work-browser', 'chatgpt-image-batch', 'gemini-image-workflow'];

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
  if (resolvedDest === source || isInside(source, resolvedDest) || isInside(resolvedDest, source)) {
    throw new Error('Refusing to install over the skill source tree. Choose a separate destination.');
  }
  if (!isInside(destRoot, resolvedDest)) {
    throw new Error(`Skill destination resolved outside destination root: ${resolvedDest}`);
  }

  let destination;
  try {
    destination = fs.lstatSync(resolvedDest);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  if (destination) {
    if (!options.force) {
      console.log(`[skip] ${name} already exists at ${resolvedDest}. Use --force to update it.`);
      return { name, status: 'skipped', dest: resolvedDest };
    }
    if (destination.isSymbolicLink()) {
      throw new Error(`Refusing to replace linked skill destination: ${resolvedDest}. Update its source directory directly.`);
    }
    fs.rmSync(resolvedDest, { recursive: true, force: true });
  }

  fs.mkdirSync(destRoot, { recursive: true });
  fs.cpSync(source, resolvedDest, { recursive: true });
  if (name === 'ai-work-browser') {
    fs.writeFileSync(path.join(resolvedDest, 'references', 'runtime-location.md'),
      `# 執行程式位置\n\n本次安裝來源：\`${ROOT}\`。先確認此目錄仍存在，將工作目錄切換到這裡，再執行技能列出的 npm 指令。\n\n不要將瀏覽器設定或登入資料放進技能目錄；更新技能不應改動它們。\n`, 'utf8');
  }
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
    if (results.some((item) => item.name === 'ai-work-browser' && item.status === 'installed')) {
      console.log('AI 工作瀏覽器預設使用單一瀏覽器，也支援選用分身。需要時可以說：「我想要使用 AI 工作瀏覽器分身」。');
      console.log('啟用時會引導你手動登入所需網站。登入 Chrome 同步書籤、密碼與擴充功能是選用，不會同步網站登入狀態。');
    }
  }
}

main();
