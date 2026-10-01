'use strict';
// /vwc:setup: points the Claude Code status line at the companion. Plugins can't set the
// status line themselves, so this edits the user's settings.json once.
//   node setup.js <data dir>          turn the companion on (an existing status line stays on top)
//   node setup.js <data dir> remove   put back the status line from before setup
// Always exits 0: a non-zero exit would abort the slash command before Claude can reply.

const fs = require('fs');
const os = require('os');
const path = require('path');

const [dataDir, action] = process.argv.slice(2);
const ROOT = path.resolve(__dirname, '..');
const CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const SETTINGS = path.join(CONFIG_DIR, 'settings.json');

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

function readSettings() {
  let raw;
  try {
    raw = fs.readFileSync(SETTINGS, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') {
      return {};
    }
    throw new Error(`Can't read ${SETTINGS}: ${e.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`${SETTINGS} isn't valid JSON (${e.message}), so it was left untouched. Fix it and run setup again.`);
  }
}

function writeSettings(settings) {
  if (fs.existsSync(SETTINGS)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.copyFileSync(SETTINGS, path.join(dataDir, `settings.backup-${stamp}.json`));
  }
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const tmp = `${SETTINGS}.vwc.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(settings, null, 2)}\n`);
  fs.renameSync(tmp, SETTINGS);
}

// A status line that already runs the companion, either from this plugin or from a manual
// install, is never saved as the "previous" one.
function isCompanion(statusLine) {
  const cmd = slash(String((statusLine && statusLine.command) || ''));
  return cmd.includes(slash(dataDir)) || /companion\/statusline\.js/.test(cmd);
}

function install() {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'plugin-root.txt'), slash(ROOT));
  const launcher = path.join(dataDir, 'statusline.js');
  fs.writeFileSync(launcher, LAUNCHER_SOURCE);

  const settings = readSettings();
  const current = settings.statusLine;
  const lines = [];
  if (current && current.command && !isCompanion(current)) {
    fs.writeFileSync(path.join(dataDir, 'previous-statusline.json'), JSON.stringify(current, null, 2));
    lines.push(`Your existing status line (${current.command}) was kept: it shows on top, with the companion under it.`);
  }
  const wasOn = isCompanion(current);
  settings.statusLine = { type: 'command', command: `node "${slash(launcher)}"`, refreshInterval: 1 };
  writeSettings(settings);

  lines.unshift(wasOn
    ? 'VibeWorkCompanion was already set up; the status line launcher has been refreshed.'
    : 'VibeWorkCompanion is on. The status line updates within a second.');
  lines.push('Choose your hero with /vwc:chooseclass mage, warrior or archer.');
  lines.push(`A backup of your settings is in ${slash(dataDir)}.`);
  return lines.join('\n');
}

function remove() {
  const settings = readSettings();
  if (!isCompanion(settings.statusLine)) {
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
  writeSettings(settings);
  return [
    previous ? `Your previous status line is back (${previous.command}).` : 'The status line setting was removed.',
    'To remove the plugin too, run: /plugin uninstall vwc@vibeworkcompanion',
    'Uninstalling deletes your heroes as well, unless you keep the data folder (see the README).',
  ].join('\n');
}

try {
  if (!dataDir) {
    throw new Error('Missing the data folder argument. Run this through /vwc:setup.');
  }
  const mode = String(action || '').trim().toLowerCase();
  console.log(mode === 'remove' ? remove() : install());
} catch (e) {
  console.log(`VibeWorkCompanion setup failed: ${e.message}`);
}
