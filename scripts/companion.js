'use strict';
// Shared engine for the status line companion: save file, activity tracking,
// game simulation and rendering. Used by statusline.js, hook.js and cli.js.

const fs = require('fs');
const path = require('path');

// Where the save lives: COMPANION_DIR (set by the status line launcher, cli.js and tests),
// else the plugin's data folder (Claude Code gives hooks CLAUDE_PLUGIN_DATA), else next to this file.
const DIR = process.env.COMPANION_DIR || process.env.CLAUDE_PLUGIN_DATA || __dirname;
const COMMAND_PREFIX = '/vwc:';
const STATE_FILE = path.join(DIR, 'state.json');
const LOCK_FILE = path.join(DIR, 'state.lock');
const DEBUG_FILE = path.join(DIR, 'debug');
const BACKUP_DIR = path.join(DIR, 'backups');

const STEP_MS = 1000;             // one game step per second of active work
const MAX_GAP_MS = 30000;         // longer gaps mean sleep or a closed CLI, not work
const SESSION_STALE_MS = 60000;   // a session silent this long no longer counts as working
// A session still marked working after this long with no hook event and no transcript
// activity missed its "Claude finished" event (hooks not loaded yet, a crashed hook, an
// undetected Esc), so it stops counting as working instead of moving the hero forever.
const IDLE_CAP_MS = 10 * 60 * 1000;
const SESSION_PRUNE_MS = 86400000;
const TOKENS_PER_KILL = 2000;    // tokens worth one kill's XP in the current zone
// Enemy life grows about as fast as a hero on pace gets stronger, so a normal enemy takes
// around 5 hits and a zone boss around 35 all game long.
const ENEMY_HP = [20, 60, 0.7];   // hp = 20 + 60 x zone^0.7, give or take 20%
// Life and XP of each kind of enemy, as multiples of a normal one's. A boss waits at the end of
// every zone; reaching every 10th level summons an elder boss, and every other 5th level a mini boss.
const RANKS = {
  normal: { hp: 1, xp: 1 },
  mini: { hp: 2.5, xp: 5, prefix: 'Giant', news: '⭐ A mini boss appears' },
  boss: { hp: 5, xp: 10 },
  elder: { hp: 8, xp: 16, prefix: 'Elder', news: '👑 A boss appears' },
};
const KILL_XP = 1.6;             // longer fights mean fewer kills, so each kill is worth more
// The mini boss or boss of every 5th level drops a random skill; a hero holds this many.
const MAX_SKILLS = 2;
// Rarity multiplies a skill's strength. A boss of a 10th level rolls twice and keeps the better.
const RARITIES = [
  { name: 'common', chance: 0.55, power: 1 },
  { name: 'rare', chance: 0.3, power: 1.25 },
  { name: 'epic', chance: 0.12, power: 1.55 },
  { name: 'legendary', chance: 0.03, power: 2 },
];
const ZONE_LENGTH = 600;          // tiles per zone; with the fights, about 15 minutes of work
const VIEW_AHEAD = 40;
const WORLD_TILES = 24;           // world strip width; each tile is 2 columns
const MSG_MS = 10000;
const UPDATE_MSG_MS = 30000;      // the "updated" notice stays longer than other messages

// Shown once after an update to that version. A version without a line here gets a pointer
// to /vwc:commands instead.
const WHATS_NEW = {
  '1.3.0': 'enemies have life now, and every 5th level summons a boss',
  '1.4.0': `skills are random now, dropped by level bosses: ${COMMAND_PREFIX}skills`,
};

// floor: background and mark colors plus the ASCII marks scattered on about 1 cell in 3
// (1 column each, so the floor lines up under the 2-column world tiles in every font).
const BIOMES = [
  { name: 'Meadow', icon: '🌼', color: '38;2;134;239;172', decor: ['🌼', '🌳', '🌾'], enemies: [['🐀', 'Rat'], ['🐍', 'Snake'], ['🐗', 'Boar']], boss: ['🐻', 'Bear'],
    floor: { bg: '48;2;46;125;50', fg: '38;2;163;230;53', marks: [',', '"', '\''] } },
  { name: 'Dark Forest', icon: '🌲', color: '38;2;74;222;128', decor: ['🌲', '🍄', '🌲'], enemies: [['🐺', 'Wolf'], ['🦇', 'Bat'], ['🐗', 'Boar']], boss: ['🦍', 'Ape King'],
    floor: { bg: '48;2;20;61;34', fg: '38;2;101;163;13', marks: ['"', ','] } },
  { name: 'Caves', icon: '💎', color: '38;2;148;163;184', decor: ['🪨', '💎', '🦴'], enemies: [['🦇', 'Bat'], ['👺', 'Goblin'], ['🐛', 'Crawler']], boss: ['👹', 'Ogre'],
    floor: { bg: '48;2;64;64;72', fg: '38;2;148;163;184', marks: ['.', '_', ':'] } },
  { name: 'Coast', icon: '🌴', color: '38;2;56;189;248', decor: ['🌴', '🐚', '🌴'], enemies: [['🦀', 'Crab'], ['🦑', 'Squid'], ['🦈', 'Shark']], boss: ['🐙', 'Kraken'],
    floor: { bg: '48;2;14;90;130', fg: '38;2;125;211;252', marks: ['~'] } },
  { name: 'Desert', icon: '🌵', color: '38;2;250;204;21', decor: ['🌵', '🦴', '🐪'], enemies: [['🦂', 'Scorpion'], ['🐍', 'Viper'], ['🦅', 'Vulture']], boss: ['🦖', 'Sand Rex'],
    floor: { bg: '48;2;180;130;40', fg: '38;2;253;230;138', marks: ['.', ':'] } },
  { name: 'Graveyard', icon: '🪦', color: '38;2;192;132;252', decor: ['🪦', '🦴', '🌑'], enemies: [['💀', 'Skeleton'], ['🧟', 'Zombie'], ['👻', 'Ghost']], boss: ['🧛', 'Vampire'],
    floor: { bg: '48;2;46;30;66', fg: '38;2;120;100;140', marks: ['.', ',', '+'] } },
  { name: 'Volcano', icon: '🌋', color: '38;2;248;113;113', decor: ['🌋', '🔥', '🪨'], enemies: [['👹', 'Demon'], ['🦎', 'Salamander'], ['🐲', 'Drake']], boss: ['🐉', 'Dragon'],
    floor: { bg: '48;2;100;20;20', fg: '38;2;251;146;60', marks: ['^', '~'] } },
];

// range: how many tiles ahead the hero starts fighting. atk: [base, per level].
// crit: chance of a double-damage hit. hit: icon of a basic attack.
// Weapons unlock at `lvl` and add `atk`. Skills are rolled at random (see rollSkill): their
// name is one of `parts` (which also gives the icon) plus one of `forms`, and `power` scales
// their strength.
const CLASSES = {
  mage: {
    name: 'Mage', icon: '🧙', blurb: 'casts from 3 tiles, weak hits, strong spells',
    range: 3, atk: [1, 0.8], crit: 0, hit: '🔹',
    weapons: [
      { lvl: 1, icon: '🪵', name: 'Branch', atk: 0 },
      { lvl: 4, icon: '📜', name: 'Scroll', atk: 2 },
      { lvl: 8, icon: '🪄', name: 'Wand', atk: 5 },
      { lvl: 13, icon: '📖', name: 'Grimoire', atk: 9 },
      { lvl: 19, icon: '🔮', name: 'Orb', atk: 14 },
      { lvl: 26, icon: '💎', name: 'Gem Staff', atk: 20 },
      { lvl: 35, icon: '🌟', name: 'Star Staff', atk: 28 },
    ],
    // Spells make up for the weak hits, so mage skills roll stronger.
    skills: {
      power: 1.5,
      parts: [['🔥', 'Fire'], ['⚡', 'Storm'], ['🧊', 'Frost'], ['🌊', 'Tide'], ['💫', 'Star'], ['🌑', 'Shadow']],
      forms: ['Bolt', 'Lance', 'Nova', 'Burst', 'Orb', 'Ray'],
    },
  },
  warrior: {
    name: 'Warrior', icon: '🤺', blurb: 'melee, heavy hits, combat skills',
    range: 2, atk: [3, 1.5], crit: 0, hit: '💥',
    weapons: [
      { lvl: 1, icon: '🔪', name: 'Knife', atk: 0 },
      { lvl: 4, icon: '🏏', name: 'Club', atk: 2 },
      { lvl: 8, icon: '🪓', name: 'Axe', atk: 5 },
      { lvl: 13, icon: '🔨', name: 'War Hammer', atk: 9 },
      { lvl: 19, icon: '🔱', name: 'Trident', atk: 14 },
      { lvl: 26, icon: '🪝', name: 'Hookblade', atk: 20 },
      { lvl: 35, icon: '🌟', name: 'Star Blade', atk: 28 },
    ],
    // The hardest basic hits, so warrior skills roll a little weaker.
    skills: {
      power: 0.85,
      parts: [['💪', 'Mighty'], ['🌀', 'Whirling'], ['💢', 'Raging'], ['🩸', 'Blood'], ['🌋', 'Quake'], ['🔥', 'Blazing']],
      forms: ['Strike', 'Cleave', 'Slam', 'Smash', 'Rend', 'Charge'],
    },
  },
  archer: {
    name: 'Archer', icon: '🧝', blurb: 'shoots from 5 tiles, critical shots',
    range: 5, atk: [2, 1], crit: 0.2, hit: '🔸',
    weapons: [
      { lvl: 1, icon: '🪨', name: 'Sling', atk: 0 },
      { lvl: 4, icon: '🪃', name: 'Boomerang', atk: 2 },
      { lvl: 8, icon: '🏹', name: 'Bow', atk: 5 },
      { lvl: 13, icon: '🪶', name: 'Fletched Bow', atk: 9 },
      { lvl: 19, icon: '🌙', name: 'Moon Bow', atk: 14 },
      { lvl: 26, icon: '💘', name: 'Heartseeker', atk: 20 },
      { lvl: 35, icon: '🌟', name: 'Star Bow', atk: 28 },
    ],
    skills: {
      power: 1,
      parts: [['🎯', 'Aimed'], ['🍃', 'Wind'], ['🦅', 'Eagle'], ['💨', 'Swift'], ['🌠', 'Star'], ['🔥', 'Fire']],
      forms: ['Shot', 'Arrow', 'Volley', 'Rain', 'Barrage', 'Bolt'],
    },
  },
};

const WORK_EVENTS = new Set(['UserPromptSubmit', 'PostToolUse', 'PostToolUseFailure']);
const WAIT_EVENTS = new Set(['Stop', 'StopFailure', 'PermissionRequest', 'PreToolUse']);

// ---------- save file ----------

// The save holds one hero per class; only the `active` one moves.
function newRoot(now) {
  // A new save starts on the current version, so it never shows an "updated" notice.
  return { v: 2, active: null, heroes: {}, lastTick: now, sessions: {}, seenVersion: pluginVersion() };
}

function newHero(cls, now) {
  const c = CLASSES[cls];
  return {
    cls,
    level: 1,
    xp: 0,
    totalXp: 0,
    kills: 0,
    heroX: 0,
    step: 0,
    carryMs: 0,
    tokenCarry: 0,
    nextSpawnX: 8,
    bossZone: 0,
    enemies: [],
    skills: [],
    cooldowns: {},   // unused now; read by older versions that may still run in another window
    fx: null,
    msg: { text: `${c.icon} A new ${c.name.toLowerCase()} awakens`, at: now },
  };
}

// Version 1 kept a single hero at the top level. It already looked like a mage (🧙,
// elemental powers), so it becomes the mage save with its progress intact.
function migrate(s) {
  if (s.v !== 2) {
    const { v, lastTick, sessions, ...hero } = s;
    s = { v: 2, active: 'mage', heroes: { mage: { ...hero, cls: 'mage' } }, lastTick, sessions };
  }
  for (const h of Object.values(s.heroes)) {
    if (!h.skills) {
      grantMissedSkills(h);
    }
  }
  return s;
}

// Heroes from before skills had fixed powers instead. They get the skill drop of every
// milestone they already passed, so nobody starts over without any.
function grantMissedSkills(h) {
  h.skills = [];
  for (let level = 5; level <= h.level; level += 5) {
    learnSkill(h, rollSkill(h.cls, level, level % 10 === 0));
  }
}

function load(now) {
  let raw;
  try {
    raw = fs.readFileSync(STATE_FILE, 'utf8');
  } catch {
    return newRoot(now);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Keep the broken save for inspection instead of silently losing the heroes.
    try { fs.copyFileSync(STATE_FILE, path.join(DIR, `state.bad-${now}.json`)); } catch {}
    return newRoot(now);
  }
  // Only an unreadable file counts as broken. If migrate() fails, that's a bug in the code: the
  // error goes up and nothing is saved, instead of replacing the heroes with an empty save.
  return migrate(parsed);
}

function save(s) {
  const tmp = `${STATE_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(s));
  fs.renameSync(tmp, STATE_FILE);
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function acquireLock(waitMs) {
  const deadline = Date.now() + waitMs;
  for (;;) {
    try {
      fs.closeSync(fs.openSync(LOCK_FILE, 'wx'));
      return true;
    } catch (e) {
      if (e.code !== 'EEXIST') {
        return false;
      }
      // A process killed mid-update leaves the lock behind; reclaim it.
      try {
        if (Date.now() - fs.statSync(LOCK_FILE).mtimeMs > 3000) {
          fs.unlinkSync(LOCK_FILE);
          continue;
        }
      } catch {}
      if (Date.now() > deadline) {
        return false;
      }
      sleepMs(15);
    }
  }
}

// Loads the save, applies fn and writes it back under the lock. If the lock
// can't be had in time, fn still runs on a copy so the caller can render, but
// nothing is saved; `saved` tells the caller which happened.
function update(now, waitMs, fn) {
  try { fs.mkdirSync(DIR, { recursive: true }); } catch {}
  const locked = acquireLock(waitMs);
  try {
    const s = load(now);
    fn(s);
    if (locked) {
      save(s);
    }
    return { root: s, saved: locked };
  } finally {
    if (locked) {
      try { fs.unlinkSync(LOCK_FILE); } catch {}
    }
  }
}

function debug(line) {
  if (fs.existsSync(DEBUG_FILE)) {
    try { fs.appendFileSync(path.join(DIR, 'debug.log'), `${new Date().toISOString()} ${line}\n`); } catch {}
  }
}

function activeHero(root) {
  return root.active ? root.heroes[root.active] || null : null;
}

// ---------- activity ----------

function session(root, id, now) {
  if (!root.sessions[id]) {
    root.sessions[id] = { active: false, eventAt: 0, lastSeen: now, transcript: null, cursor: null, seen: [], turn: null };
  }
  const ss = root.sessions[id];
  ss.lastSeen = Math.max(ss.lastSeen, now);
  return ss;
}

function anyActive(root, now) {
  return Object.values(root.sessions).some(ss => ss.active
    && now - ss.lastSeen < SESSION_STALE_MS
    && now - Math.max(ss.eventAt || 0, ss.lastActivity || 0) < IDLE_CAP_MS);
}

// Advances the active hero by the working time since the last settle.
function settle(root, now) {
  const gap = now - root.lastTick;
  if (gap <= 0) {
    return;
  }
  root.lastTick = now;
  const h = activeHero(root);
  if (!h || gap > MAX_GAP_MS || !anyActive(root, now)) {
    return;
  }
  h.carryMs += gap;
  while (h.carryMs >= STEP_MS) {
    h.carryMs -= STEP_MS;
    step(h, now);
  }
}

function prune(root, now) {
  for (const [id, ss] of Object.entries(root.sessions)) {
    if (now - ss.lastSeen > SESSION_PRUNE_MS) {
      delete root.sessions[id];
    }
  }
}

const INTERRUPT = '[Request interrupted by user';

// Only a user text entry counts; tool results can quote the phrase too.
function isInterrupt(o) {
  if (o.type !== 'user' || !o.message) {
    return false;
  }
  const c = o.message.content;
  if (typeof c === 'string') {
    return c.startsWith(INTERRUPT);
  }
  return Array.isArray(c) && c.some(p => p.type === 'text' && typeof p.text === 'string' && p.text.startsWith(INTERRUPT));
}

// Reads transcript lines added since the last call: new API usage becomes XP,
// and a user interrupt (Esc) pauses the hero, since no Stop hook fires for it.
function ingestTranscript(root, ss, transcriptPath, now) {
  if (!transcriptPath) {
    return;
  }
  let size;
  try {
    size = fs.statSync(transcriptPath).size;
  } catch {
    return;
  }
  if (ss.transcript !== transcriptPath || ss.cursor == null || ss.cursor > size) {
    // First sight of this transcript: count from here on, not its history.
    ss.transcript = transcriptPath;
    ss.cursor = size;
    ss.seen = [];
    return;
  }
  if (size === ss.cursor) {
    return;
  }
  const len = Math.min(size - ss.cursor, 4 * 1024 * 1024);
  const buf = Buffer.alloc(len);
  const fd = fs.openSync(transcriptPath, 'r');
  try {
    fs.readSync(fd, buf, 0, len, ss.cursor);
  } finally {
    fs.closeSync(fd);
  }
  const lastNl = buf.lastIndexOf(10);
  if (lastNl < 0) {
    return;
  }
  ss.cursor += lastNl + 1;
  ss.lastActivity = now;

  let tokens = 0;
  for (const line of buf.toString('utf8', 0, lastNl).split('\n')) {
    if (!line.includes('"usage"') && !line.includes(INTERRUPT)) {
      continue;
    }
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    if (isInterrupt(o)) {
      ss.active = false;
      continue;
    }
    const u = o.type === 'assistant' && o.message && o.message.usage;
    if (!u || ss.seen.includes(o.message.id)) {
      continue;
    }
    // One API message is written as several lines sharing the same usage.
    ss.seen.push(o.message.id);
    if (ss.seen.length > 20) {
      ss.seen.shift();
    }
    tokens += (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.output_tokens || 0);
  }
  if (tokens > 0) {
    if (ss.turn) {
      ss.turn.tokens += tokens;
    }
    const h = activeHero(root);
    if (!h) {
      return;
    }
    h.tokenCarry += tokens;
    const kills = Math.floor(h.tokenCarry / TOKENS_PER_KILL);
    h.tokenCarry -= kills * TOKENS_PER_KILL;
    const zone = zoneOf(h.heroX);
    gainXp(h, kills * killXp(zone, Math.floor(zone / 2)), now);
  }
}

function onHookEvent(ev, at) {
  const name = ev.hook_event_name;
  return update(at, 2000, root => {
    settle(root, at);
    if (name === 'SessionEnd') {
      delete root.sessions[ev.session_id];
      return;
    }
    const ss = session(root, ev.session_id, at);
    ingestTranscript(root, ss, ev.transcript_path, at);
    if (name === 'UserPromptSubmit') {
      const h = activeHero(root);
      ss.turn = { start: at, end: null, tokens: 0, cls: root.active, xp0: h ? h.totalXp : 0 };
    }
    // Async hooks can finish out of order; an older event must not undo a newer one.
    if (at < ss.eventAt) {
      return;
    }
    ss.eventAt = at;
    if (WORK_EVENTS.has(name)) {
      ss.active = true;
    } else if (WAIT_EVENTS.has(name)) {
      ss.active = false;
      if (ss.turn && (name === 'Stop' || name === 'StopFailure')) {
        ss.turn.end = at;
      }
    }
    debug(`hook ${name} active=${ss.active}`);
  }).root;
}

function onStatusLine(data, now) {
  return update(now, 150, root => {
    if (data.session_id) {
      const ss = session(root, data.session_id, now);
      ingestTranscript(root, ss, data.transcript_path, now);
    }
    settle(root, now);
    prune(root, now);
    noticeUpdate(root, now);
    const h = activeHero(root);
    debug(`tick cols=${process.env.COLUMNS} active=${anyActive(root, now)} class=${root.active} step=${h ? h.step : '-'}`);
  }).root;
}

let versionCache;

function pluginVersion() {
  if (versionCache === undefined) {
    try {
      versionCache = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.claude-plugin', 'plugin.json'), 'utf8')).version || null;
    } catch {
      versionCache = null;
    }
  }
  return versionCache;
}

// The first tick on a new plugin version tells the player it was updated and what's new.
// A fresh install has no heroes yet, so it only records the version.
function noticeUpdate(root, now) {
  const version = pluginVersion();
  if (!version || root.seenVersion === version) {
    return;
  }
  const h = activeHero(root);
  if (h) {
    const news = WHATS_NEW[version] || `${COMMAND_PREFIX}commands lists every command`;
    h.msg = { text: `🆕 Updated to ${version} · ${news}`, at: now, ms: UPDATE_MSG_MS };
  }
  root.seenVersion = version;
}

// ---------- character commands (cli.js) ----------

function classKey(name) {
  const key = String(name || '').trim().split(/\s+/)[0].toLowerCase();
  return CLASSES[key] ? key : null;
}

function describe(h) {
  const c = CLASSES[h.cls];
  const zone = zoneOf(h.heroX);
  const b = biomeOf(zone);
  const skills = h.skills.length > 0 ? ` · ${h.skills.map(s => s.icon).join('')}` : '';
  return `${c.icon} ${c.name} Lv ${h.level} · ${weaponOf(h).icon} ${weaponOf(h).name}${skills} · ${h.kills} kills · ${b.icon} ${b.name}${cycleSuffix(zone)}`;
}

// Switches the active class, creating that hero on first use. Returns a message for the user.
function chooseClass(cls, now) {
  let text = '';
  const { saved } = update(now, 3000, root => {
    const before = activeHero(root);
    if (!root.heroes[cls]) {
      root.heroes[cls] = newHero(cls, now);
    }
    root.active = cls;
    const h = root.heroes[cls];
    if (before && before.cls === cls) {
      text = `Already playing as ${describe(h)}.`;
      return;
    }
    text = `Now playing as ${describe(h)}.`;
    if (before) {
      text += `\nYour ${CLASSES[before.cls].icon} ${CLASSES[before.cls].name} (Lv ${before.level}) is saved and waits until you switch back.`;
    }
  });
  return saved ? text : 'The save file is busy right now. Try again in a moment.';
}

// Starts a fresh hero of a class and makes it active. The old hero of that class is
// copied to backups/ first, so starting over can be undone by hand.
function createCharacter(cls, now) {
  let text = '';
  const { saved } = update(now, 3000, root => {
    const old = root.heroes[cls];
    if (old) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
      const file = path.join(BACKUP_DIR, `${cls}-${new Date(now).toISOString().replace(/[:.]/g, '-')}.json`);
      fs.writeFileSync(file, JSON.stringify(old));
      text = `Your previous ${describe(old)} was backed up to ${path.relative(DIR, file)}.\n`;
    }
    root.heroes[cls] = newHero(cls, now);
    root.active = cls;
    text += `A new ${CLASSES[cls].icon} ${CLASSES[cls].name} begins at level 1 in the 🌼 Meadow.`;
  });
  return saved ? text : 'The save file is busy right now. Try again in a moment.';
}

// For commands that only read: loading migrates an old save (rolling its skills), so save that
// right away instead of showing skills that the next tick would roll differently.
function loadSaved(now) {
  return update(now, 3000, () => {}).root;
}

function status(now) {
  const root = loadSaved(now);
  const lines = Object.keys(CLASSES).map(cls => {
    const h = root.heroes[cls];
    const marker = root.active === cls ? '▶' : ' ';
    return `${marker} ${h ? describe(h) : `${CLASSES[cls].icon} ${CLASSES[cls].name}: no hero yet (${CLASSES[cls].blurb})`}`;
  });
  return lines.join('\n');
}

const BONUS_NAMES = { damage: 'damage', crit: 'critical chance' };

function skillLine(s) {
  const what = `x${s.mult} damage every ${s.cd} s, +${s.bonus.pct}% ${BONUS_NAMES[s.bonus.kind]}`;
  return `${s.icon} ${s.name.padEnd(16)} ${s.rarity.padEnd(10)}power ${String(skillPower(s)).padStart(3)}   ${what}`;
}

function nextSkill(h) {
  const boss = h.enemies.find(e => e.drop);
  if (boss) {
    return `defeat the ${boss.icon} ${boss.name} ahead`;
  }
  const level = (Math.floor(h.level / 5) + 1) * 5;
  return `from the ${level % 10 === 0 ? 'boss' : 'mini boss'} at level ${level}`;
}

// /vwc:skills: every hero's skills with their stats, and where the next one comes from.
function skillsReport(now) {
  const root = loadSaved(now);
  const lines = [];
  for (const cls of Object.keys(CLASSES)) {
    const h = root.heroes[cls];
    if (!h) {
      continue;
    }
    const c = CLASSES[cls];
    lines.push(`${root.active === cls ? '▶' : ' '} ${c.icon} ${c.name} Lv ${h.level} · ${h.skills.length} of ${MAX_SKILLS} skills`);
    for (const s of h.skills) {
      lines.push(`    ${skillLine(s)}`);
    }
    lines.push(`    Next skill: ${nextSkill(h)}`, '');
  }
  if (lines.length === 0) {
    return `No heroes yet. Pick one with ${COMMAND_PREFIX}chooseclass.`;
  }
  lines.push('The mini boss or boss of every 5th level drops a random skill. It takes a free slot,',
    'or replaces your weaker skill if its power is higher.');
  return lines.join('\n');
}

// ---------- display (cli.js: hide / show / stats) ----------

const PARTS = { bar: 'status bar', companion: 'companion' };
const STATS_PLACES = ['above', 'below'];

function display(root) {
  return { bar: true, companion: true, stats: 'above', ...(root.display || {}) };
}

function partKey(name) {
  const key = String(name || '').trim().split(/\s+/)[0].toLowerCase();
  return key === 'all' || PARTS[key] ? key : null;
}

// Hides or shows the status bar row, the companion rows, or both ('all'). Only what's drawn
// changes: a hidden hero keeps adventuring in the background.
function setVisible(part, visible, now) {
  const parts = part === 'all' ? Object.keys(PARTS) : [part];
  let text = '';
  const { saved } = update(now, 3000, root => {
    const d = display(root);
    const changed = parts.some(p => d[p] !== visible);
    for (const p of parts) {
      d[p] = visible;
    }
    root.display = d;
    const label = parts.length > 1 ? 'The status bar and the companion' : `The ${PARTS[part]}`;
    const verb = parts.length > 1 ? 'are' : 'is';
    if (!changed) {
      text = `${label} ${verb} already ${visible ? 'visible' : 'hidden'}.`;
    } else if (visible) {
      text = `${label} ${verb} visible again.`;
    } else {
      text = `${label} ${verb} hidden.`;
      if (parts.includes('companion')) {
        text += ' Your hero keeps adventuring in the background.';
      }
      text += ` Bring ${parts.length > 1 ? 'them' : 'it'} back with ${COMMAND_PREFIX}show ${part}.`;
    }
    if (!d.bar && !d.companion && parts.length === 1 && !visible) {
      text += `\nBoth are hidden now, so the status line is empty. ${COMMAND_PREFIX}show all brings everything back.`;
    }
  });
  return saved ? text : 'The save file is busy right now. Try again in a moment.';
}

function placeKey(name) {
  const key = String(name || '').trim().split(/\s+/)[0].toLowerCase();
  return STATS_PLACES.includes(key) ? key : null;
}

// Puts the hero's stats row above or below the map. With no place it switches to the other one.
function setStatsPlace(place, now) {
  let text = '';
  const { saved } = update(now, 3000, root => {
    const d = display(root);
    const to = place || (d.stats === 'below' ? 'above' : 'below');
    text = d.stats === to ? `The stats row is already ${to} the map.` : `The stats row is now ${to} the map.`;
    d.stats = to;
    root.display = d;
    if (!d.companion) {
      text += ` The companion is hidden; ${COMMAND_PREFIX}show companion brings it back.`;
    }
  });
  return saved ? text : 'The save file is busy right now. Try again in a moment.';
}

// ---------- game ----------

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function zoneOf(x) {
  return Math.max(0, Math.floor(x / ZONE_LENGTH));
}

function biomeOf(zone) {
  return BIOMES[zone % BIOMES.length];
}

function xpNeed(level) {
  return 10 + Math.round(1.4 * Math.pow(level, 3));
}

function weaponOf(h) {
  return CLASSES[h.cls].weapons.filter(w => h.level >= w.lvl).pop();
}

function attackOf(h) {
  const [base, perLevel] = CLASSES[h.cls].atk;
  return Math.round(base + perLevel * h.level) + weaponOf(h).atk;
}

// XP for one kill in `zone`; `roll` is 0..zone, and token XP uses the average, zone / 2.
function killXp(zone, roll) {
  return Math.round((3 + zone + roll) * KILL_XP);
}

// Bosses and elder bosses are the biome's boss; normal enemies and mini bosses one of its enemies.
// `boss` marks every kind but normal, for the "Defeated" message.
function makeEnemy(x, zone, rank = 'normal') {
  const b = biomeOf(zone);
  const r = RANKS[rank];
  const [icon, name] = rank === 'boss' || rank === 'elder' ? b.boss : b.enemies[randInt(0, b.enemies.length - 1)];
  const base = ENEMY_HP[0] + ENEMY_HP[1] * Math.pow(zone, ENEMY_HP[2]);
  const hp = Math.round(base * r.hp * (rank === 'normal' ? 0.8 + Math.random() * 0.4 : 1));
  const xp = killXp(zone, randInt(0, zone)) * r.xp;
  return { x, icon, name: r.prefix ? `${r.prefix} ${name}` : name, hp, max: hp, xp, boss: rank !== 'normal' };
}

function spawnAhead(h) {
  while (h.nextSpawnX <= h.heroX + VIEW_AHEAD) {
    const bossX = (h.bossZone + 1) * ZONE_LENGTH;
    if (h.nextSpawnX >= bossX - 3) {
      h.enemies.push(makeEnemy(bossX, h.bossZone, 'boss'));
      h.bossZone++;
      h.nextSpawnX = bossX + randInt(6, 12);
    } else {
      h.enemies.push(makeEnemy(h.nextSpawnX, h.bossZone));
      h.nextSpawnX += randInt(5, 12);
    }
  }
}

// A level milestone's boss appears on the first free tile just beyond the hero's range, carrying
// that level's skill drop. Enemies stay sorted by position, since the hero fights the first one
// in range.
function summon(h, rank, now) {
  const zoneBossX = (h.bossZone + 1) * ZONE_LENGTH;
  let x = h.heroX + CLASSES[h.cls].range + 3;
  while (x === zoneBossX || h.enemies.some(e => e.x === x)) {
    x++;
  }
  const foe = makeEnemy(x, zoneOf(x), rank);
  foe.drop = h.level;
  h.enemies.push(foe);
  h.enemies.sort((a, b) => a.x - b.x);
  if (x >= h.nextSpawnX) {
    h.nextSpawnX = x + randInt(5, 12);
  }
  setMsg(h, `${RANKS[rank].news}: ${foe.icon} ${foe.name}`, now);
}

// ---------- skills ----------

function pick(list) {
  return list[randInt(0, list.length - 1)];
}

function rollRarity() {
  let r = Math.random();
  for (const rarity of RARITIES) {
    if (r < rarity.chance) {
      return rarity;
    }
    r -= rarity.chance;
  }
  return RARITIES[0];
}

// A random skill found at `level`: a special attack that hits for `mult` x damage every `cd`
// steps, plus a passive bonus to all damage or to the critical chance. Skills found later roll
// stronger, so they can replace old ones. A longer cooldown comes with a bigger multiplier.
function rollSkill(cls, level, lucky) {
  const c = CLASSES[cls].skills;
  const [icon, first] = pick(c.parts);
  let rarity = rollRarity();
  if (lucky) {
    const again = rollRarity();
    rarity = RARITIES.indexOf(again) > RARITIES.indexOf(rarity) ? again : rarity;
  }
  const spread = () => 0.85 + Math.random() * 0.3;
  const cd = randInt(6, 16);
  const strength = (1 + 0.75 * Math.sqrt(level)) * rarity.power * c.power * spread();
  return {
    icon,
    name: `${first} ${pick(c.forms)}`,
    rarity: rarity.name,
    level,
    mult: Math.round((1 + (strength * cd) / 10) * 10) / 10,
    cd,
    bonus: { kind: Math.random() < 0.5 ? 'damage' : 'crit', pct: Math.round((2 + 1.2 * Math.sqrt(level)) * rarity.power * spread()) },
    readyAt: 0,
  };
}

// One number to compare skills by: the extra damage the attack adds per step, plus the bonus.
function skillPower(s) {
  return Math.round(((s.mult - 1) / s.cd + s.bonus.pct / 100) * 100);
}

function skillBonus(h, kind) {
  return h.skills.reduce((sum, s) => sum + (s.bonus.kind === kind ? s.bonus.pct : 0), 0);
}

// A new skill fills a free slot, or replaces the weaker skill if its power is higher.
function learnSkill(h, s) {
  if (h.skills.length < MAX_SKILLS) {
    h.skills.push(s);
    return { kept: true };
  }
  const weakest = h.skills.reduce((a, b) => (skillPower(b) < skillPower(a) ? b : a));
  if (skillPower(s) <= skillPower(weakest)) {
    return { kept: false };
  }
  h.skills[h.skills.indexOf(weakest)] = s;
  return { kept: true, replaced: weakest };
}

// What the boss of milestone `level` drops; a boss of a 10th level is lucky with rarity.
function dropSkill(h, level, now) {
  const s = rollSkill(h.cls, level, level % 10 === 0);
  const { kept, replaced } = learnSkill(h, s);
  const found = `${s.icon} ${s.name} (${s.rarity})`;
  if (replaced) {
    setMsg(h, `🎁 ${found} replaces ${replaced.icon} ${replaced.name}`, now);
  } else if (kept) {
    setMsg(h, `🎁 New skill: ${found}`, now);
  } else {
    setMsg(h, `🎁 Found ${found}, weaker than your skills`, now);
  }
}

function setMsg(h, text, now) {
  // Several things can happen in one catch-up; keep them all visible together.
  if (h.msg && now - h.msg.at < 1000) {
    h.msg = { text: `${h.msg.text} · ${text}`, at: now };
  } else {
    h.msg = { text, at: now };
  }
}

function gainXp(h, xp, now) {
  if (xp <= 0) {
    return;
  }
  const c = CLASSES[h.cls];
  h.xp += xp;
  h.totalXp += xp;
  while (h.xp >= xpNeed(h.level)) {
    h.xp -= xpNeed(h.level);
    h.level++;
    setMsg(h, `🎉 Level ${h.level}!`, now);
    const w = c.weapons.find(x => x.lvl === h.level);
    if (w) {
      setMsg(h, `New weapon: ${w.icon} ${w.name}`, now);
    }
    if (h.level % 5 === 0) {
      summon(h, h.level % 10 === 0 ? 'elder' : 'mini', now);
    }
  }
}

// The nearest enemy within the class's range, which the hero is fighting.
function targetOf(h) {
  return h.enemies.find(e => e.x > h.heroX && e.x <= h.heroX + CLASSES[h.cls].range);
}

// One second of work: walk, or attack the nearest enemy within the class's range.
function step(h, now) {
  const c = CLASSES[h.cls];
  h.step++;
  spawnAhead(h);
  const foe = targetOf(h);
  if (!foe) {
    h.heroX++;
    if (h.heroX % ZONE_LENGTH === 0) {
      const b = biomeOf(zoneOf(h.heroX));
      setMsg(h, `Entered ${b.icon} ${b.name}${cycleSuffix(zoneOf(h.heroX))}`, now);
    }
    h.enemies = h.enemies.filter(e => e.x > h.heroX - 10);
    return;
  }

  let dmg = attackOf(h) * (1 + skillBonus(h, 'damage') / 100);
  let icon = c.hit;
  // The strongest skill that is off cooldown fires instead of a basic attack.
  const ready = h.skills.filter(sk => sk.readyAt <= h.step).sort((a, b) => b.mult - a.mult)[0];
  if (ready) {
    dmg *= ready.mult;
    icon = ready.icon;
    ready.readyAt = h.step + ready.cd;
  }
  const crit = Math.random() < c.crit + skillBonus(h, 'crit') / 100;
  if (crit) {
    dmg *= 2;
  }
  dmg = Math.round(dmg);
  foe.hp -= dmg;
  // The attack travels across the gap one tile per step, so ranged shots visibly fly.
  const gap = foe.x - h.heroX - 1;
  h.fx = { icon, x: h.heroX + 1 + (h.step % Math.max(1, gap)), step: h.step, dmg, crit };
  if (foe.hp <= 0) {
    h.kills++;
    h.enemies = h.enemies.filter(e => e !== foe);
    h.fx = { icon: '✨', x: foe.x, step: h.step };
    if (foe.boss) {
      setMsg(h, `🏆 Defeated ${foe.icon} ${foe.name}!`, now);
    }
    if (foe.drop) {
      dropSkill(h, foe.drop, now);
    }
    gainXp(h, foe.xp, now);
  }
}

// ---------- rendering ----------

const ESC = '\x1b[';
const RESET = `${ESC}0m`;
const GOLD = '38;2;250;204;21';
const ENEMY_RED = '38;2;248;113;113';

function color(code, text) {
  return `${ESC}${code}m${text}${RESET}`;
}

// Columns a string takes on screen. Every emoji used here is a double-width
// Emoji_Presentation character, so this simple rule is exact for our output.
function displayWidth(str) {
  let w = 0;
  for (const ch of str.replace(/\x1b\[[0-9;]*m/g, '')) {
    const cp = ch.codePointAt(0);
    w += cp >= 0x1f000 || cp === 0x26a1 || cp === 0x2728 || cp === 0x23f3 ? 2 : 1;
  }
  return w;
}

function hash(x) {
  let h = Math.imul(x, 2654435761);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  return h >>> 0;
}

function cycleSuffix(zone) {
  const cycle = Math.floor(zone / BIOMES.length) + 1;
  const roman = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  return cycle === 1 ? '' : ` ${roman[cycle] || cycle}`;
}

function scenery(x) {
  if (x < 0) {
    return '  ';
  }
  const h = hash(x);
  if (h % 7 === 0) {
    const b = biomeOf(zoneOf(x));
    return b.decor[(h >>> 8) % b.decor.length];
  }
  if (h % 3 === 0) {
    return color('2', '.') + ' ';
  }
  return '  ';
}

function formatDuration(ms) {
  const sec = Math.round(ms / 1000);
  if (sec < 60) {
    return `${sec}s`;
  }
  if (sec < 3600) {
    return `${Math.floor(sec / 60)}m${String(sec % 60).padStart(2, '0')}s`;
  }
  return `${Math.floor(sec / 3600)}h${String(Math.floor(sec / 60) % 60).padStart(2, '0')}m`;
}

function formatTokens(n) {
  return n < 1000 ? `${n}` : `${(n / 1000).toFixed(1)}k`;
}

function lastTurn(root) {
  return Object.values(root.sessions)
    .map(ss => ss.turn)
    .filter(t => t && t.end)
    .sort((a, b) => b.end - a.end)[0];
}

// The enemy being fought, its life, and while working the damage of the hit that just landed
// (with a "!" on a critical hit). Null while walking.
function targetText(h, active) {
  const foe = targetOf(h);
  if (!foe) {
    return null;
  }
  const filled = Math.max(1, Math.ceil((foe.hp / foe.max) * 10));
  const life = color(ENEMY_RED, '▰'.repeat(filled) + '▱'.repeat(10 - filled));
  // Padded so the row doesn't shift by a column as the number shrinks.
  const hp = String(foe.hp).padStart(String(foe.max).length);
  const hit = active && h.fx && h.fx.step === h.step && h.fx.dmg ? ` ${color(ENEMY_RED, `-${h.fx.dmg}${h.fx.crit ? '!' : ''}`)}` : '';
  return `${foe.icon} ${foe.name} ${life} ${hp}/${foe.max}${hit}`;
}

function statsRow(root, h, now, active, cols) {
  const c = CLASSES[h.cls];
  const need = xpNeed(h.level);
  const filled = Math.min(10, Math.floor((h.xp / need) * 10));
  const bar = '▰'.repeat(filled) + '▱'.repeat(10 - filled);
  const w = weaponOf(h);
  const skills = h.skills.map(s => s.icon).join('');
  const zone = zoneOf(h.heroX);
  const b = biomeOf(zone);

  let status = null;
  if (h.msg && now - h.msg.at < (h.msg.ms || MSG_MS)) {
    status = color(GOLD, h.msg.text);
  } else if (!active) {
    const t = lastTurn(root);
    let tail = '';
    if (t) {
      // XP is only comparable when the turn was played with the same class.
      const xp = t.cls === h.cls ? ` · +${h.totalXp - t.xp0} XP` : '';
      tail = ` · last turn ${formatDuration(t.end - t.start)} · ${formatTokens(t.tokens)} tok${xp}`;
    }
    status = color('2', `💤 waiting for you${tail}`);
  }

  // [text, priority]: lower priority is dropped first when the row is too wide.
  const parts = [
    [`${c.icon} ${c.name} ${color(GOLD, `Lv ${h.level}`)} ${color('38;2;167;139;250', bar)} ${h.xp}/${need} XP`, 6],
    [`${w.icon} ${w.name}`, 4],
    [skills, 1],
    [color(b.color, `${b.icon} ${b.name}${cycleSuffix(zone)}`), 3],
    [`💀 ${h.kills}`, 2],
    [targetText(h, active), 4.5],
    [status, 5],
  ].filter(p => p[0]);

  const sep = color('2', ' · ');
  let row = parts.map(p => p[0]).join(sep);
  while (displayWidth(row) > cols && parts.length > 1) {
    const lowest = parts.reduce((a, b) => (b[1] < a[1] ? b : a));
    parts.splice(parts.indexOf(lowest), 1);
    row = parts.map(p => p[0]).join(sep);
  }
  return row;
}

const HERO_COL = 3;

function worldTiles(cols) {
  return Math.max(10, Math.min(WORLD_TILES, Math.floor(cols / 2)));
}

function worldRow(h, active, cols) {
  const tiles = worldTiles(cols);
  let row = '';
  for (let i = 0; i < tiles; i++) {
    const x = h.heroX - HERO_COL + i;
    const foe = h.enemies.find(e => e.x === x);
    if (x === h.heroX) {
      row += CLASSES[h.cls].icon;
    } else if (!active && x === h.heroX + 1) {
      row += '💤';
    } else if (active && h.fx && h.fx.step === h.step && h.fx.x === x) {
      row += h.fx.icon;
    } else if (foe) {
      row += foe.icon;
    } else {
      row += scenery(x);
    }
  }
  return row;
}

// The companion lives in the empty bottom-right corner, so rows end at the right edge.
// Claude Code trims every status line row, so the padding starts with an invisible
// reset code that trim() leaves alone; without it the spaces would be stripped.
function alignRight(row, cols) {
  return RESET + ' '.repeat(Math.max(0, cols - displayWidth(row))) + row;
}

function floorCell(f, h) {
  return h % 3 === 0 ? f.marks[(h >>> 4) % f.marks.length] : ' ';
}

// The ground under the world row: two cells per tile, styled by the biome of that tile,
// so the next biome's floor scrolls into view before the hero reaches it.
function floorRow(heroX, cols) {
  const tiles = worldTiles(cols);
  let row = '';
  let style = null;
  for (let i = 0; i < tiles; i++) {
    const x = heroX - HERO_COL + i;
    if (x < 0) {
      if (style !== null) {
        row += RESET;
        style = null;
      }
      row += '  ';
      continue;
    }
    const f = biomeOf(zoneOf(x)).floor;
    const code = `${f.bg};${f.fg}`;
    if (code !== style) {
      row += `${ESC}${code}m`;
      style = code;
    }
    const hsh = hash(x + 7919);
    row += floorCell(f, hsh) + floorCell(f, hsh >>> 12);
  }
  return row + RESET;
}

// Before the first class is chosen: the three heroes wait in the meadow.
function pickerRows(cols) {
  const keys = Object.keys(CLASSES);
  const title = color(GOLD, `🎭 Choose your hero: ${COMMAND_PREFIX}chooseclass ${keys.join(' | ')}`);
  let world = '';
  for (let i = 0; i < worldTiles(cols); i++) {
    const at = [HERO_COL, HERO_COL + 3, HERO_COL + 6].indexOf(i);
    world += at >= 0 ? CLASSES[keys[at]].icon : scenery(i);
  }
  return [title, world, floorRow(HERO_COL, cols)];
}

function render(root, now, cols) {
  const h = activeHero(root);
  let rows;
  if (!h) {
    rows = pickerRows(cols);
  } else {
    const active = anyActive(root, now);
    rows = [statsRow(root, h, now, active, cols), worldRow(h, active, cols), floorRow(h.heroX, cols)];
  }
  // /vwc:stats below moves the text row (stats, or the picker's title) under the map.
  const [text, ...map] = rows;
  const ordered = display(root).stats === 'below' ? [...map, text] : rows;
  return ordered.map(row => alignRight(row, cols));
}

module.exports = {
  DIR, COMMAND_PREFIX, CLASSES, classKey, chooseClass, createCharacter, status,
  display, partKey, setVisible, placeKey, setStatsPlace, load, loadSaved, pluginVersion, skillsReport,
  onHookEvent, onStatusLine, render, displayWidth,
  newRoot, newHero, migrate, step, xpNeed, attackOf, weaponOf, rollSkill, skillPower, learnSkill,
};
