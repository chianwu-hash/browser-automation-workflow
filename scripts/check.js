const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CHECK_DIRS = ['lib', 'scripts'];
const SKILLS_DIR = path.join(ROOT, 'skills');

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

function parseFrontmatter(content, file) {
  const start = content.match(/^---\r?\n/);
  if (!start) {
    throw new Error(`${file} is missing YAML frontmatter.`);
  }

  const end = content.indexOf('\n---', start[0].length);
  if (end === -1) {
    throw new Error(`${file} has unterminated YAML frontmatter.`);
  }

  const yaml = content.slice(start[0].length, end).trim();
  const values = {};
  for (const line of yaml.split(/\r?\n/)) {
    const match = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (match) {
      values[match[1]] = match[2].replace(/^"|"$/g, '');
    }
  }
  return values;
}

function validateOpenAiYaml(skillDir) {
  const file = path.join(skillDir, 'agents', 'openai.yaml');
  if (!fs.existsSync(file)) {
    throw new Error(`${path.relative(ROOT, file)} is missing.`);
  }

  const content = fs.readFileSync(file, 'utf8');
  for (const key of ['display_name', 'short_description', 'default_prompt']) {
    if (!new RegExp(`^\\s*${key}:\\s*".+"`, 'm').test(content)) {
      throw new Error(`${path.relative(ROOT, file)} is missing interface.${key}.`);
    }
  }
}

function validateReferencedFiles(skillDir, skillContent) {
  const links = [...skillContent.matchAll(/\]\((references\/[^)]+)\)/g)].map((match) => match[1]);
  for (const link of links) {
    const target = path.join(skillDir, link);
    if (!fs.existsSync(target)) {
      throw new Error(`${path.relative(ROOT, skillDir)} references missing file: ${link}`);
    }
  }
}

function validateSkill(skillDir) {
  const name = path.basename(skillDir);
  const skillFile = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillFile)) {
    throw new Error(`${path.relative(ROOT, skillDir)} is missing SKILL.md.`);
  }

  const content = fs.readFileSync(skillFile, 'utf8');
  const frontmatter = parseFrontmatter(content, path.relative(ROOT, skillFile));
  if (frontmatter.name !== name) {
    throw new Error(`${path.relative(ROOT, skillFile)} frontmatter name must be "${name}".`);
  }
  if (!frontmatter.description || frontmatter.description.length < 40) {
    throw new Error(`${path.relative(ROOT, skillFile)} needs a meaningful description.`);
  }
  if (/TODO|FIXME/.test(content)) {
    throw new Error(`${path.relative(ROOT, skillFile)} still contains TODO/FIXME text.`);
  }

  validateOpenAiYaml(skillDir);
  validateReferencedFiles(skillDir, content);
}

function validateSkills() {
  if (!fs.existsSync(SKILLS_DIR)) return 0;

  const skillDirs = fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(SKILLS_DIR, entry.name))
    .filter((dir) => fs.existsSync(path.join(dir, 'SKILL.md')))
    .sort();

  for (const skillDir of skillDirs) {
    validateSkill(skillDir);
  }

  return skillDirs.length;
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

  try {
    const skillCount = validateSkills();
    console.log(`Checked ${files.length} JavaScript files and ${skillCount} skills.`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}

main();
