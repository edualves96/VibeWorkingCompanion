'use strict';
// /vwc:setup: points the Claude Code status line at the companion. Plugins can't set the
// status line themselves, so this edits the user's settings.json.
//   node setup.js <data dir>          turn the companion on (an existing status line stays on top)
//   node setup.js <data dir> remove   put back the status line from before setup
// hook.js also calls autoSetup() at session start, which turns the companion on by itself the
// first time, but only for users who have no status line at all.
// The command line always exits 0: a non-zero exit would abort the slash command.

const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const AUTO_MARKER = 'auto-setup.json';

// The plugin folder moves on every update, so the status line runs this small launcher from
// the data folder instead, and it loads whichever plugin version the hooks last reported.
const LAUNCHER_SOURCE = `'use strict';
// Written by /vwc:setup. Loads the current VibeWorkCompanion version, which the plugin's hooks
// record in plugin-root.txt, and keeps the save in this folder.
const fs = require('fs');
const path = require('path');
process.env.COMPANION_DIR = __dirname;
let root = '';
try {
  root = fs.readFileSync(path.join(__dirname, 'plugin-root.txt'), 'utf8').trim();
} catch {}
const script = root && path.join(root, 'scripts', 'statusline.js');
if (script && fs.existsSync(script)) {
  require(script);
} else {
  process.stdout.write('VibeWorkCompanion: plugin not found. Reinstall it, or run /vwc:setup remove.');
}
`;

const slash = p => p.replace(/\\/g, '/');

function settingsFile() {
  return path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'settings.json');
}

function readSettings() {
  const file = settingsFile();
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') {
      return {};
    }
    throw new Error(`Can't read ${file}: ${e.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`${file} isn't valid JSON (${e.message}), so it was left untouched. Fix it and run setup again.`);
  }
}

function writeSettings(dataDir, settings) {
  const file = settingsFile();
  if (fs.existsSync(file)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.copyFileSync(file, path.join(dataDir, `settings.backup-${stamp}.json`));
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.vwc.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(settings, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

// A status line that already runs the companion, either from this plugin or from a manual
// install, is never saved as the "previous" one.
function isCompanion(dataDir, statusLine) {
  const cmd = slash(String((statusLine && statusLine.command) || ''));
  return cmd.includes(slash(dataDir)) || /companion\/statusline\.js/.test(cmd);
}

function hasHero(dataDir) {
  try {
    return Boolean(JSON.parse(fs.readFileSync(path.join(dataDir, 'state.json'), 'utf8')).active);
  } catch {
    return false;
  }
}

// Running setup or remove by hand means the user has decided, so the automatic first-run
// setup must never act after that.
function markAutoSetupDone(dataDir, result) {
  fs.writeFileSync(path.join(dataDir, AUTO_MARKER), JSON.stringify({ at: new Date().toISOString(), result }, null, 2));
}

function install(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'plugin-root.txt'), slash(ROOT));
  const launcher = path.join(dataDir, 'statusline.js');
  fs.writeFileSync(launcher, LAUNCHER_SOURCE);

  const settings = readSettings();
  const current = settings.statusLine;
  const lines = [];
  if (current && current.command && !isCompanion(dataDir, current)) {
    fs.writeFileSync(path.join(dataDir, 'previous-statusline.json'), JSON.stringify(current, null, 2));
    lines.push(`Your existing status line (${current.command}) was kept: it shows on top, with the companion under it.`);
  }
  const wasOn = isCompanion(dataDir, current);
  settings.statusLine = { type: 'command', command: `node "${slash(launcher)}"`, refreshInterval: 1 };
  writeSettings(dataDir, settings);
  markAutoSetupDone(dataDir, 'installed');

  lines.unshift(wasOn
    ? 'VibeWorkCompanion was already set up; the status line launcher has been refreshed.'
    : 'VibeWorkCompanion is on. The status line updates within a second.');
  if (!hasHero(dataDir)) {
    lines.push('Choose your hero with /vwc:chooseclass mage, warrior or archer.');
  }
  lines.push(`A backup of your settings is in ${slash(dataDir)}.`);
  return lines.join('\n');
}

function remove(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const settings = readSettings();
  markAutoSetupDone(dataDir, 'removed');
  if (!isCompanion(dataDir, settings.statusLine)) {
    return 'The status line isn\'t using VibeWorkCompanion, so there was nothing to undo.';
  }
  let previous = null;
  try {
    previous = JSON.parse(fs.readFileSync(path.join(dataDir, 'previous-statusline.json'), 'utf8'));
  } catch {}
  if (previous) {
    settings.statusLine = previous;
  } else {
    delete settings.statusLine;
  }
  writeSettings(dataDir, settings);
  return [
    previous ? `Your previous status line is back (${previous.command}).` : 'The status line setting was removed.',
    'To remove the plugin too, run: /plugin uninstall vwc@vibeworkcompanion',
    'Uninstalling deletes your heroes as well, unless you keep the data folder (see the README).',
  ].join('\n');
}

// First session after installing: users with no status line at all get the companion right
// away. Anyone who already has a status line keeps it untouched and can opt in with
// /vwc:setup. Runs at most once, and never after setup or remove was run by hand.
function autoSetup(dataDir) {
  if (!dataDir || fs.existsSync(path.join(dataDir, AUTO_MARKER))) {
    return;
  }
  fs.mkdirSync(dataDir, { recursive: true });
  let settings;
  try {
    settings = readSettings();
  } catch {
    markAutoSetupDone(dataDir, 'skipped: settings.json could not be read');
    return;
  }
  if (settings.statusLine) {
    markAutoSetupDone(dataDir, 'skipped: a status line was already set');
    return;
  }
  install(dataDir);
}

module.exports = { install, remove, autoSetup };

if (require.main === module) {
  const [dataDir, action] = process.argv.slice(2);
  try {
    if (!dataDir) {
      throw new Error('Missing the data folder argument. Run this through /vwc:setup.');
    }
    const mode = String(action || '').trim().toLowerCase();
    console.log(mode === 'remove' ? remove(dataDir) : install(dataDir));
  } catch (e) {
    console.log(`VibeWorkCompanion setup failed: ${e.message}`);
  }
}
