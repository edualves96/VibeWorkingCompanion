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
const SESSION_PRUNE_MS = 86400000;
const TOKENS_PER_KILL = 2000;    // tokens worth one kill's XP in the current zone
const ZONE_LENGTH = 600;          // steps per zone, about 10 minutes of work
const VIEW_AHEAD = 40;
const WORLD_TILES = 24;           // world strip width; each tile is 2 columns
const MSG_MS = 10000;

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
// Weapons unlock at `lvl` and add `atk`; powers unlock at `lvl`, hit for `mult` x damage
// and can be used again `cd` steps later.
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
    powers: [
      { lvl: 3, icon: '🔥', name: 'Fireball', mult: 3, cd: 6 },
      { lvl: 6, icon: '⚡', name: 'Lightning', mult: 4, cd: 10 },
      { lvl: 10, icon: '🧊', name: 'Frost', mult: 5, cd: 14 },
      { lvl: 16, icon: '🌊', name: 'Tidal Wave', mult: 7, cd: 20 },
      { lvl: 23, icon: '💫', name: 'Meteor', mult: 10, cd: 26 },
    ],
  },
  warrior: {
    name: 'Warrior', icon: '🤺', blurb: 'melee, heavy hits, combat skills',
    range: 2, atk: [3, 1.2], crit: 0, hit: '💥',
    weapons: [
      { lvl: 1, icon: '🔪', name: 'Knife', atk: 0 },
      { lvl: 4, icon: '🏏', name: 'Club', atk: 2 },
      { lvl: 8, icon: '🪓', name: 'Axe', atk: 5 },
      { lvl: 13, icon: '🔨', name: 'War Hammer', atk: 9 },
      { lvl: 19, icon: '🔱', name: 'Trident', atk: 14 },
      { lvl: 26, icon: '🪝', name: 'Hookblade', atk: 20 },
      { lvl: 35, icon: '🌟', name: 'Star Blade', atk: 28 },
    ],
    powers: [
      { lvl: 3, icon: '💪', name: 'Power Strike', mult: 2.5, cd: 7 },
      { lvl: 6, icon: '🌀', name: 'Whirlwind', mult: 3.5, cd: 11 },
      { lvl: 10, icon: '💢', name: 'Berserk', mult: 4.5, cd: 15 },
      { lvl: 16, icon: '🩸', name: 'Rend', mult: 6, cd: 21 },
      { lvl: 23, icon: '🌋', name: 'Earthshaker', mult: 8, cd: 28 },
    ],
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
    powers: [
      { lvl: 3, icon: '🎯', name: 'Aimed Shot', mult: 3, cd: 7 },
      { lvl: 6, icon: '🍃', name: 'Wind Arrow', mult: 4, cd: 11 },
      { lvl: 10, icon: '🦅', name: 'Eagle Strike', mult: 5.5, cd: 15 },
      { lvl: 16, icon: '💨', name: 'Volley', mult: 7, cd: 21 },
      { lvl: 23, icon: '🌠', name: 'Starfall', mult: 9, cd: 28 },
    ],
  },
};

const WORK_EVENTS = new Set(['UserPromptSubmit', 'PostToolUse', 'PostToolUseFailure']);
const WAIT_EVENTS = new Set(['Stop', 'StopFailure', 'PermissionRequest', 'PreToolUse']);

// ---------- save file ----------

// The save holds one hero per class; only the `active` one moves.
function newRoot(now) {
  return { v: 2, active: null, heroes: {}, lastTick: now, sessions: {} };
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
    cooldowns: {},
    fx: null,
    msg: { text: `${c.icon} A new ${c.name.toLowerCase()} awakens`, at: now },
  };
}

// Version 1 kept a single hero at the top level. It already looked like a mage (🧙,
// elemental powers), so it becomes the mage save with its progress intact.
function migrate(s) {
  if (s.v === 2) {
    return s;
  }
  const { v, lastTick, sessions, ...hero } = s;
  return { v: 2, active: 'mage', heroes: { mage: { ...hero, cls: 'mage' } }, lastTick, sessions };
}

function load(now) {
  let raw;
  try {
    raw = fs.readFileSync(STATE_FILE, 'utf8');
  } catch {
    return newRoot(now);
  }
  try {
    return migrate(JSON.parse(raw));
  } catch {
    // Keep the broken save for inspection instead of silently losing the heroes.
    try { fs.copyFileSync(STATE_FILE, path.join(DIR, `state.bad-${now}.json`)); } catch {}
    return newRoot(now);
  }
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
  return Object.values(root.sessions).some(ss => ss.active && now - ss.lastSeen < SESSION_STALE_MS);
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
function ingestTranscript(root, ss, transcriptPath) {
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
    gainXp(h, kills * (3 + zone + Math.floor(zone / 2)), Date.now());
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
    ingestTranscript(root, ss, ev.transcript_path);
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
      ingestTranscript(root, ss, data.transcript_path);
    }
    settle(root, now);
    prune(root, now);
    const h = activeHero(root);
    debug(`tick cols=${process.env.COLUMNS} active=${anyActive(root, now)} class=${root.active} step=${h ? h.step : '-'}`);
  }).root;
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
  return `${c.icon} ${c.name} Lv ${h.level} · ${weaponOf(h).icon} ${weaponOf(h).name} · ${h.kills} kills · ${b.icon} ${b.name}${cycleSuffix(zone)}`;
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

function status(now) {
  const root = load(now);
  const lines = Object.keys(CLASSES).map(cls => {
    const h = root.heroes[cls];
    const marker = root.active === cls ? '▶' : ' ';
    return `${marker} ${h ? describe(h) : `${CLASSES[cls].icon} ${CLASSES[cls].name}: no hero yet (${CLASSES[cls].blurb})`}`;
  });
  return lines.join('\n');
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

function makeEnemy(x, zone, boss) {
  const b = biomeOf(zone);
  const [icon, name] = boss ? b.boss : b.enemies[randInt(0, b.enemies.length - 1)];
  const base = 10 + 5 * zone;
  const hp = boss ? base * 8 : Math.round(base * (0.8 + Math.random() * 0.5));
  const xp = (3 + zone + randInt(0, zone)) * (boss ? 10 : 1);
  return { x, icon, name, hp, max: hp, xp, boss };
}

function spawnAhead(h) {
  while (h.nextSpawnX <= h.heroX + VIEW_AHEAD) {
    const bossX = (h.bossZone + 1) * ZONE_LENGTH;
    if (h.nextSpawnX >= bossX - 3) {
      h.enemies.push(makeEnemy(bossX, h.bossZone, true));
      h.bossZone++;
      h.nextSpawnX = bossX + randInt(6, 12);
    } else {
      h.enemies.push(makeEnemy(h.nextSpawnX, h.bossZone, false));
      h.nextSpawnX += randInt(5, 12);
    }
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
    const p = c.powers.find(x => x.lvl === h.level);
    if (p) {
      setMsg(h, `New power: ${p.icon} ${p.name}`, now);
    }
  }
}

// One second of work: walk, or attack the nearest enemy within the class's range.
function step(h, now) {
  const c = CLASSES[h.cls];
  h.step++;
  spawnAhead(h);
  const foe = h.enemies.find(e => e.x > h.heroX && e.x <= h.heroX + c.range);
  if (!foe) {
    h.heroX++;
    if (h.heroX % ZONE_LENGTH === 0) {
      const b = biomeOf(zoneOf(h.heroX));
      setMsg(h, `Entered ${b.icon} ${b.name}${cycleSuffix(zoneOf(h.heroX))}`, now);
    }
    h.enemies = h.enemies.filter(e => e.x > h.heroX - 10);
    return;
  }

  let dmg = attackOf(h);
  let icon = c.hit;
  const ready = c.powers.filter(p => h.level >= p.lvl && (h.cooldowns[p.name] || 0) <= h.step).pop();
  if (ready) {
    dmg *= ready.mult;
    icon = ready.icon;
    h.cooldowns[ready.name] = h.step + ready.cd;
  }
  if (Math.random() < c.crit) {
    dmg *= 2;
  }
  foe.hp -= Math.round(dmg);
  // The attack travels across the gap one tile per step, so ranged shots visibly fly.
  const gap = foe.x - h.heroX - 1;
  h.fx = { icon, x: h.heroX + 1 + (h.step % Math.max(1, gap)), step: h.step };
  if (foe.hp <= 0) {
    h.kills++;
    h.enemies = h.enemies.filter(e => e !== foe);
    h.fx = { icon: '✨', x: foe.x, step: h.step };
    if (foe.boss) {
      setMsg(h, `🏆 Defeated ${foe.icon} ${foe.name}!`, now);
    }
    gainXp(h, foe.xp, now);
  }
}

// ---------- rendering ----------

const ESC = '\x1b[';
const RESET = `${ESC}0m`;
const GOLD = '38;2;250;204;21';

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

function statsRow(root, h, now, active, cols) {
  const c = CLASSES[h.cls];
  const need = xpNeed(h.level);
  const filled = Math.min(10, Math.floor((h.xp / need) * 10));
  const bar = '▰'.repeat(filled) + '▱'.repeat(10 - filled);
  const w = weaponOf(h);
  const powers = c.powers.filter(p => h.level >= p.lvl).map(p => p.icon).join('');
  const zone = zoneOf(h.heroX);
  const b = biomeOf(zone);

  let status = null;
  if (h.msg && now - h.msg.at < MSG_MS) {
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
    [powers, 1],
    [color(b.color, `${b.icon} ${b.name}${cycleSuffix(zone)}`), 3],
    [`💀 ${h.kills}`, 2],
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
  if (!h) {
    return pickerRows(cols).map(row => alignRight(row, cols));
  }
  const active = anyActive(root, now);
  return [statsRow(root, h, now, active, cols), worldRow(h, active, cols), floorRow(h.heroX, cols)].map(row => alignRight(row, cols));
}

module.exports = {
  DIR, COMMAND_PREFIX, CLASSES, classKey, chooseClass, createCharacter, status,
  onHookEvent, onStatusLine, render, displayWidth,
  newRoot, newHero, migrate, step, xpNeed, attackOf, weaponOf,
};
