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
// `atk` multiplies their damage, and they strike every `every` steps: bosses hit slower but harder.
const RANKS = {
  normal: { hp: 1, xp: 1, atk: 1, every: 1 },
  mini: { hp: 2.5, xp: 5, atk: 1.5, every: 2, prefix: 'Giant', news: '⭐ A mini boss appears' },
  boss: { hp: 5, xp: 10, atk: 1.5, every: 2 },
  elder: { hp: 8, xp: 16, atk: 2, every: 2, prefix: 'Elder', news: '👑 A boss appears' },
};
// Enemies fight back. The nearest one ahead notices the hero AGGRO tiles away and closes in:
// to the next tile, or to SHOT_RANGE tiles for enemies that shoot. A hit does ENEMY_ATK times a
// normal enemy's base life in that zone (times the rank's `atk`), give or take 15%.
const ENEMY_ATK = 0.085;
const AGGRO = 8;
const SHOT_RANGE = 4;
// Hero life: (40 + 12 x level^1.4) x the class's `life`, plus the gear's life bonus. It comes back
// REGEN of the maximum per step out of combat, and all of it on a level up.
const HERO_LIFE = [40, 12, 1.4];
const REGEN = 0.02;
// Potions: dropped by POTION_DROP of normal enemies and every boss, up to MAX_POTIONS, and drunk
// on their own below POTION_AT of the maximum life, giving back POTION_HEAL of it.
const POTION_DROP = 0.05;
const MAX_POTIONS = 3;
const POTION_AT = 0.3;
const POTION_HEAL = 0.5;
// A hero at 0 life is knocked out: it rests KO_STEPS steps while the enemy heals, then gets up
// with full life and RALLY more damage per knockout until its next win, so it can never get stuck.
const KO_STEPS = 15;
const RALLY = 0.25;
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
// Gear: one piece per slot, all heroes start with none. A normal enemy drops a piece this often;
// every boss drops one, rolling rarity twice like a skill from the boss of a 10th level.
const GEAR_DROP = 0.03;
const GEAR_SLOTS = {
  helmet: { icon: '🪖', name: 'Helmet', bases: ['Helm', 'Hood', 'Cap', 'Circlet'] },
  chest: { icon: '🥋', name: 'Chest', bases: ['Armor', 'Robe', 'Tunic', 'Hauberk'] },
  pants: { icon: '👖', name: 'Pants', bases: ['Leggings', 'Greaves', 'Trousers', 'Kilt'] },
  shoulders: { icon: '🧣', name: 'Shoulders', bases: ['Pauldrons', 'Mantle', 'Spaulders', 'Shawl'] },
  gloves: { icon: '🧤', name: 'Gloves', bases: ['Gloves', 'Gauntlets', 'Grips', 'Bracers'] },
  boots: { icon: '🥾', name: 'Boots', bases: ['Boots', 'Sabatons', 'Treads', 'Sandals'] },
};
// The material names how deep in the game a piece was found: [from level, material].
const GEAR_MATERIALS = [[1, 'Leather'], [5, 'Bronze'], [10, 'Iron'], [15, 'Steel'], [20, 'Silver'], [25, 'Mithril'], [35, 'Dragonscale']];
// What gear can give, in percent. Every point is worth about the same (a +1% critical chance is
// +1% damage on average), so a piece's power is the sum of its stats.
const GEAR_STATS = { damage: 'damage', crit: 'critical chance', xp: 'XP', life: 'life' };
const ZONE_LENGTH = 600;          // tiles per zone; with the fights, about 15 minutes of work
const VIEW_AHEAD = 40;
const WORLD_TILES = 24;           // world strip width; each tile is 2 columns
const MSG_MS = 10000;
const UPDATE_MSG_MS = 30000;      // the "updated" notice stays longer than other messages

// Shown once after an update to that version (a function gets the save). A version without a
// line here gets a pointer to /vwc:commands instead.
const WHATS_NEW = {
  '1.3.0': 'enemies have life now, and every 5th level summons a boss',
  '1.4.0': `skills are random now, dropped by level bosses: ${COMMAND_PREFIX}skills`,
  '1.6.0': root => (olderThan(root.seenVersion, '1.5.0')
    ? `💗 life, enemies that fight back, gear and achievements: ${COMMAND_PREFIX}commands`
    : '💗 your hero has life now, and enemies fight back'),
  '1.5.0': root => `🏅 achievements! ${earnedCount(root)} of ${ACHIEVEMENTS.length} earned so far: ${COMMAND_PREFIX}achievements`,
};

// Achievements are shared by all heroes. Each is earned when the fact `of` (see
// achievementFacts) reaches `goal`, and stays earned. Secret ones show as ??? until earned.
const ACHIEVEMENT_GROUPS = {
  Combat: [
    { id: 'first-blood', name: 'First Blood', what: 'defeat an enemy', of: 'kills', goal: 1 },
    { id: 'hunter', name: 'Monster Hunter', what: 'defeat 100 enemies', of: 'kills', goal: 100 },
    { id: 'slayer', name: 'Slayer', what: 'defeat 1,000 enemies', of: 'kills', goal: 1000 },
    { id: 'exterminator', name: 'Exterminator', what: 'defeat 10,000 enemies', of: 'kills', goal: 10000 },
    { id: 'heavy-hitter', name: 'Heavy Hitter', what: 'land a hit of 250 damage', of: 'maxHit', goal: 250 },
    { id: 'devastator', name: 'Devastator', what: 'land a hit of 2,500 damage', of: 'maxHit', goal: 2500 },
    { id: 'perfect-strike', name: 'Perfect Strike', what: 'land a critical hit with a skill', of: 'skillCrits', goal: 1 },
  ],
  Bosses: [
    { id: 'boss-fight', name: 'Boss Fight', what: 'defeat the 🐻 Bear at the end of the 🌼 Meadow', of: 'zone', goal: 1 },
    { id: 'giant-slayer', name: 'Giant Slayer', what: 'defeat a Giant mini boss (levels 5, 15, 25…)', of: 'minis', goal: 1 },
    { id: 'elder-hunter', name: 'Elder Hunter', what: 'defeat an Elder boss (levels 10, 20, 30…)', of: 'elders', goal: 1 },
    { id: 'kingslayer', name: 'Kingslayer', what: 'defeat 5 Elder bosses', of: 'elders', goal: 5 },
    { id: 'dragonslayer', name: 'Dragonslayer', what: 'defeat the 🐉 Dragon of the 🌋 Volcano', of: 'zone', goal: 7 },
    { id: 'dragon-bane', name: 'Dragon Bane', what: 'defeat the 🐉 Dragon of 🌋 Volcano X', of: 'zone', goal: 70 },
  ],
  Survival: [
    { id: 'first-aid', name: 'First Aid', what: 'drink a potion', of: 'potions', goal: 1 },
    { id: 'bottoms-up', name: 'Bottoms Up', what: 'drink 100 potions', of: 'potions', goal: 100 },
    { id: 'close-call', name: 'Close Call', what: 'win a fight with less than 10% of your life left', of: 'closeCalls', goal: 1 },
    { id: 'back-on-your-feet', name: 'Back on Your Feet', what: 'get knocked out, and get back up', of: 'knockouts', goal: 1 },
  ],
  Journey: [
    { id: 'level-5', name: 'Adventurer', what: 'reach level 5', of: 'level', goal: 5 },
    { id: 'level-10', name: 'Seasoned', what: 'reach level 10', of: 'level', goal: 10 },
    { id: 'level-20', name: 'Veteran', what: 'reach level 20', of: 'level', goal: 20 },
    { id: 'level-30', name: 'Champion', what: 'reach level 30', of: 'level', goal: 30 },
    { id: 'star-power', name: 'Star Power', what: 'wield a 🌟 star weapon (level 35)', of: 'level', goal: 35 },
    { id: 'world-walker', name: 'World Walker', what: 'reach all 7 biomes', of: 'zone', goal: 6 },
    { id: 'full-party', name: 'Full Party', what: 'play every class', of: 'heroes', goal: 3 },
    { id: 'all-rounder', name: 'All-Rounder', what: 'get every class to level 10', of: 'everyClass', goal: 10 },
  ],
  Skills: [
    { id: 'gifted', name: 'Gifted', what: 'find a skill', of: 'skillsFound', goal: 1 },
    { id: 'double-trouble', name: 'Double Trouble', what: 'hold two skills at once', of: 'heldSkills', goal: 2 },
    { id: 'upgrade', name: 'Out with the Old', what: 'replace a skill with a stronger one', of: 'upgrades', goal: 1 },
    { id: 'epic-find', name: 'Epic Find', what: 'find an epic or legendary skill', of: 'epic', goal: 1 },
    { id: 'lucky-find', name: 'Lucky Find', what: 'find a legendary skill', of: 'legendary', goal: 1 },
    { id: 'golden-touch', name: 'Golden Touch', what: 'hold two legendary skills at once', of: 'heldLegendary', goal: 2 },
  ],
  Gear: [
    { id: 'finders-keepers', name: 'Finders Keepers', what: 'find a piece of gear', of: 'gearFound', goal: 1 },
    { id: 'fully-equipped', name: 'Fully Equipped', what: 'wear gear in all 6 slots', of: 'gearWorn', goal: 6 },
    { id: 'shiny', name: 'Shiny', what: 'find an epic or legendary piece of gear', of: 'gearEpic', goal: 1 },
    { id: 'treasure-hunter', name: 'Treasure Hunter', what: 'find a legendary piece of gear', of: 'gearLegendary', goal: 1 },
    { id: 'picky', name: 'Picky', what: 'leave 100 pieces of gear behind', of: 'gearLeft', goal: 100 },
  ],
  Work: [
    { id: 'clocked-in', name: 'Clocked In', what: 'work for 1 hour', of: 'workHours', goal: 1 },
    { id: 'full-shift', name: 'Full Shift', what: 'work for 8 hours', of: 'workHours', goal: 8 },
    { id: 'work-week', name: 'Work Week', what: 'work for 40 hours', of: 'workHours', goal: 40 },
    { id: 'token-burner', name: 'Token Burner', what: 'use 1 million tokens', of: 'tokens', goal: 1e6 },
    { id: 'token-furnace', name: 'Token Furnace', what: 'use 10 million tokens', of: 'tokens', goal: 1e7 },
    { id: 'deep-work', name: 'Deep Work', what: 'a single Claude turn that runs for 30 minutes', of: 'longestTurn', goal: 30 },
    { id: 'night-owl', name: 'Night Owl', what: 'work between midnight and 5 a.m.', of: 'night', goal: 1, secret: true },
    { id: 'weekend-warrior', name: 'Weekend Warrior', what: 'work on a Saturday or Sunday', of: 'weekend', goal: 1, secret: true },
  ],
};
const ACHIEVEMENTS = Object.entries(ACHIEVEMENT_GROUPS).flatMap(([group, list]) => list.map(a => ({ ...a, group })));

// enemies and boss: [icon, name], plus the icon of what it shoots for an enemy that attacks from
// SHOT_RANGE tiles instead of walking up to the hero.
// floor: background and mark colors plus the ASCII marks scattered on about 1 cell in 3
// (1 column each, so the floor lines up under the 2-column world tiles in every font).
const BIOMES = [
  { name: 'Meadow', icon: '🌼', color: '38;2;134;239;172', decor: ['🌼', '🌳', '🌾'], enemies: [['🐀', 'Rat'], ['🐍', 'Snake', '🟢'], ['🐗', 'Boar']], boss: ['🐻', 'Bear'],
    floor: { bg: '48;2;46;125;50', fg: '38;2;163;230;53', marks: [',', '"', '\''] } },
  { name: 'Dark Forest', icon: '🌲', color: '38;2;74;222;128', decor: ['🌲', '🍄', '🌲'], enemies: [['🐺', 'Wolf'], ['🦇', 'Bat', '🟣'], ['🐗', 'Boar']], boss: ['🦍', 'Ape King'],
    floor: { bg: '48;2;20;61;34', fg: '38;2;101;163;13', marks: ['"', ','] } },
  { name: 'Caves', icon: '💎', color: '38;2;148;163;184', decor: ['🪨', '💎', '🦴'], enemies: [['🦇', 'Bat', '🟣'], ['👺', 'Goblin', '🟤'], ['🐛', 'Crawler']], boss: ['👹', 'Ogre'],
    floor: { bg: '48;2;64;64;72', fg: '38;2;148;163;184', marks: ['.', '_', ':'] } },
  { name: 'Coast', icon: '🌴', color: '38;2;56;189;248', decor: ['🌴', '🐚', '🌴'], enemies: [['🦀', 'Crab'], ['🦑', 'Squid', '💧'], ['🦈', 'Shark']], boss: ['🐙', 'Kraken', '💧'],
    floor: { bg: '48;2;14;90;130', fg: '38;2;125;211;252', marks: ['~'] } },
  { name: 'Desert', icon: '🌵', color: '38;2;250;204;21', decor: ['🌵', '🦴', '🐪'], enemies: [['🦂', 'Scorpion'], ['🐍', 'Viper', '🟢'], ['🦅', 'Vulture']], boss: ['🦖', 'Sand Rex'],
    floor: { bg: '48;2;180;130;40', fg: '38;2;253;230;138', marks: ['.', ':'] } },
  { name: 'Graveyard', icon: '🪦', color: '38;2;192;132;252', decor: ['🪦', '🦴', '🌑'], enemies: [['💀', 'Skeleton'], ['🧟', 'Zombie'], ['👻', 'Ghost', '🟣']], boss: ['🧛', 'Vampire'],
    floor: { bg: '48;2;46;30;66', fg: '38;2;120;100;140', marks: ['.', ',', '+'] } },
  { name: 'Volcano', icon: '🌋', color: '38;2;248;113;113', decor: ['🌋', '🔥', '🪨'], enemies: [['👹', 'Demon'], ['🦎', 'Salamander'], ['🐲', 'Drake', '🔴']], boss: ['🐉', 'Dragon', '🔴'],
    floor: { bg: '48;2;100;20;20', fg: '38;2;251;146;60', marks: ['^', '~'] } },
];

// range: how many tiles ahead the hero starts fighting. atk: [base, per level].
// crit: chance of a double-damage hit. hit: icon of a basic attack. life: multiplies the hero's life.
// Weapons unlock at `lvl` and add `atk`. Skills are rolled at random (see rollSkill): their
// name is one of `parts` (which also gives the icon) plus one of `forms`, and `power` scales
// their strength.
const CLASSES = {
  mage: {
    name: 'Mage', icon: '🧙', blurb: 'casts from 3 tiles, weak hits, strong spells',
    range: 3, atk: [1, 0.8], crit: 0, hit: '🔹', life: 1.15,
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
    range: 2, atk: [3, 1.5], crit: 0, hit: '💥', life: 1.35,
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
    range: 5, atk: [2, 1], crit: 0.2, hit: '🔸', life: 0.75,
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
  return { v: 2, active: null, heroes: {}, lastTick: now, sessions: {}, seenVersion: pluginVersion(), stats: newStats(), achievements: {} };
}

// Shared by all heroes: tokens used, the longest turn (ms), and the counts of heroes replaced
// by /vwc:createchar, so lifetime totals keep what they did.
function newStats() {
  return { tokens: 0, longestTurn: 0, retired: {} };
}

// What a hero did that achievements count but the hero doesn't otherwise keep: `found` counts
// skills and `gear` pieces of gear by rarity, `left` the gear left behind, `closeCalls` wins with
// under 10% life left, `potions` the potions drunk.
function newTally() {
  const byRarity = () => ({ common: 0, rare: 0, epic: 0, legendary: 0 });
  return {
    maxHit: 0, skillCrits: 0, minis: 0, elders: 0, replaced: 0, found: byRarity(), gear: byRarity(), left: 0,
    knockouts: 0, closeCalls: 0, potions: 0,
  };
}

// Life, potions held, steps left resting after a knockout, and knockouts since the last win.
function newLife(h) {
  return { life: maxLife(h), potions: 0, down: 0, rally: 0 };
}

function newHero(cls, now) {
  const c = CLASSES[cls];
  const h = {
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
    gear: {},        // slot -> the piece worn there
    loot: [],        // gear left behind on the ground, until it scrolls out of view
    tally: newTally(),
    cooldowns: {},   // unused now; read by older versions that may still run in another window
    fx: null,
    msg: { text: `${c.icon} A new ${c.name.toLowerCase()} awakens`, at: now },
  };
  return Object.assign(h, newLife(h));
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
    // Counts added in later versions start at 0.
    h.tally = h.tally ? { ...newTally(), ...h.tally } : pastTally(h);
    if (!h.gear) {
      h.gear = {};
      h.loot = [];
    }
    if (h.life == null) {
      Object.assign(h, newLife(h));
    }
    // Enemies from before 1.6.0 didn't fight back.
    for (const e of h.enemies) {
      if (e.atk == null) {
        const rank = e.drop ? (e.drop % 10 === 0 ? 'elder' : 'mini') : e.boss ? 'boss' : 'normal';
        Object.assign(e, enemyAttack(zoneOf(e.x), rank));
      }
    }
  }
  if (!s.stats) {
    s.stats = newStats();
  }
  return s;
}

// Heroes from before achievements get credit for what their save still shows: the level bosses
// of the milestones they passed (minus any still waiting ahead), each of which dropped a skill.
function pastTally(h) {
  const t = newTally();
  const waiting = elder => h.enemies.filter(e => e.drop && (e.drop % 10 === 0) === elder).length;
  t.elders = Math.floor(h.level / 10) - waiting(true);
  t.minis = Math.floor((h.level + 5) / 10) - waiting(false);
  // The rarity of the skills held is known; the ones no longer held count as common.
  for (const s of h.skills) {
    t.found[s.rarity]++;
  }
  t.found.common += Math.max(0, t.elders + t.minis - h.skills.length);
  // The first drops filled the free slots, so a skill held from a later milestone replaced one.
  t.replaced = h.skills.filter(s => s.level > 5 * MAX_SKILLS).length;
  return t;
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

// Advances the active hero by the working time since the last settle. Returns the steps taken.
function settle(root, now) {
  const gap = now - root.lastTick;
  if (gap <= 0) {
    return 0;
  }
  root.lastTick = now;
  const h = activeHero(root);
  if (!h || gap > MAX_GAP_MS || !anyActive(root, now)) {
    return 0;
  }
  h.carryMs += gap;
  let steps = 0;
  while (h.carryMs >= STEP_MS) {
    h.carryMs -= STEP_MS;
    step(h, now);
    steps++;
  }
  return steps;
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
    root.stats.tokens += tokens;
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
  return update(at, 2000, root => {
    const worked = settle(root, at) > 0;
    applyHookEvent(root, ev, at);
    checkAchievements(root, at, worked);
  }).root;
}

function applyHookEvent(root, ev, at) {
  const name = ev.hook_event_name;
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
      root.stats.longestTurn = Math.max(root.stats.longestTurn, at - ss.turn.start);
    }
  }
  debug(`hook ${name} active=${ss.active}`);
}

function onStatusLine(data, now) {
  return update(now, 150, root => {
    if (data.session_id) {
      const ss = session(root, data.session_id, now);
      ingestTranscript(root, ss, data.transcript_path, now);
    }
    const worked = settle(root, now) > 0;
    prune(root, now);
    // Before the update notice, which reports what a save from an older version already earned.
    checkAchievements(root, now, worked);
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

// Whether version `a` (missing on saves from before update notices) comes before `b`.
function olderThan(a, b) {
  const [x, y] = [a || '0', b].map(v => v.split('.').map(Number));
  for (let i = 0; i < 3; i++) {
    if ((x[i] || 0) !== (y[i] || 0)) {
      return (x[i] || 0) < (y[i] || 0);
    }
  }
  return false;
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
    const entry = WHATS_NEW[version];
    const news = typeof entry === 'function' ? entry(root) : entry || `${COMMAND_PREFIX}commands lists every command`;
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
    text += announce(checkAchievements(root, now));
  });
  return saved ? text : 'The save file is busy right now. Try again in a moment.';
}

function announce(earned) {
  return earned.map(a => `\n🏅 Achievement unlocked: ${a.name} (${a.what})`).join('');
}

// A hero replaced by /vwc:createchar still counts toward the lifetime totals.
function retire(root, h) {
  const r = root.stats.retired;
  for (const [k, n] of Object.entries(counts(h))) {
    r[k] = (r[k] || 0) + n;
  }
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
      retire(root, old);
    }
    root.heroes[cls] = newHero(cls, now);
    root.active = cls;
    text += `A new ${CLASSES[cls].icon} ${CLASSES[cls].name} begins at level 1 in the 🌼 Meadow.`;
    text += announce(checkAchievements(root, now));
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

// Pads to `width` columns, counting emoji as 2.
function padCols(text, width) {
  return text + ' '.repeat(Math.max(0, width - displayWidth(text)));
}

// /vwc:gear: what every hero wears, slot by slot, and what it adds up to.
function gearReport(now) {
  const root = loadSaved(now);
  const lines = [];
  for (const cls of Object.keys(CLASSES)) {
    const h = root.heroes[cls];
    if (!h) {
      continue;
    }
    const c = CLASSES[cls];
    const total = {};
    for (const k of Object.keys(GEAR_STATS)) {
      if (gearBonus(h, k) > 0) {
        total[k] = gearBonus(h, k);
      }
    }
    const worn = Object.keys(h.gear).length;
    lines.push(`${root.active === cls ? '▶' : ' '} ${c.icon} ${c.name} Lv ${h.level} · ${worn} of ${Object.keys(GEAR_SLOTS).length} slots · ${worn > 0 ? statsText(total) : 'no gear yet'} · 💗 ${maxLife(h)} life`);
    for (const [slot, g] of Object.entries(GEAR_SLOTS)) {
      const item = h.gear[slot];
      const what = item
        ? `${item.name.padEnd(20)} ${item.rarity.padEnd(10)}power ${String(gearPower(item)).padStart(2)}   ${statsText(item.stats)}`
        : '(empty)';
      lines.push(`    ${g.icon} ${g.name.padEnd(10)} ${what}`);
    }
    lines.push('');
  }
  if (lines.length === 0) {
    return `No heroes yet. Pick one with ${COMMAND_PREFIX}chooseclass.`;
  }
  lines.push(`Enemies sometimes drop gear, and bosses always do. A piece with more power than the one`,
    'worn in its slot is equipped; a weaker one is left behind.');
  return lines.join('\n');
}

function shortNumber(n) {
  if (n >= 1e6) {
    return `${+(n / 1e6).toFixed(1)}M`;
  }
  return n >= 1e4 ? `${Math.floor(n / 1e3)}k` : Math.floor(n).toLocaleString('en-US');
}

// How far along an achievement that isn't earned yet is. Yes-or-no ones show nothing.
function progressText(a, n) {
  n = n || 0;
  if (a.goal === 1) {
    return '';
  }
  if (a.of === 'workHours') {
    return `${n.toFixed(1)}/${a.goal} h`;
  }
  if (a.of === 'longestTurn') {
    return `${Math.floor(n)}/${a.goal} min`;
  }
  return `${shortNumber(n)}/${shortNumber(a.goal)}`;
}

function localDate(at) {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// /vwc:achievements: every achievement by group, earned or with its progress.
function achievementsReport(now) {
  const { root } = update(now, 3000, r => checkAchievements(r, now));
  const facts = achievementFacts(root, now, false);
  const lines = [`🏅 Achievements · ${earnedCount(root)} of ${ACHIEVEMENTS.length} earned`];
  for (const [group, list] of Object.entries(ACHIEVEMENT_GROUPS)) {
    lines.push('', group);
    for (const a of list) {
      const got = root.achievements[a.id];
      if (!got && a.secret) {
        lines.push(`  ⬜ ${padCols('???', 18)} a secret achievement`);
        continue;
      }
      const when = got ? [got.at ? localDate(got.at) : '', got.cls && CLASSES[got.cls] ? CLASSES[got.cls].icon : ''].filter(Boolean).join(' ') : progressText(a, facts[a.of]);
      lines.push(`  ${got ? '✅' : '⬜'} ${padCols(a.name, 18)} ${padCols(a.what, 46)} ${when}`.trimEnd());
    }
  }
  lines.push('', 'Achievements are shared by all your heroes. Secret ones show up once earned.');
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
  const [icon, name, shot] = rank === 'boss' || rank === 'elder' ? b.boss : b.enemies[randInt(0, b.enemies.length - 1)];
  const hp = Math.round(baseLife(zone) * r.hp * (rank === 'normal' ? 0.8 + Math.random() * 0.4 : 1));
  const xp = killXp(zone, randInt(0, zone)) * r.xp;
  const foe = { x, icon, name: r.prefix ? `${r.prefix} ${name}` : name, hp, max: hp, xp, boss: rank !== 'normal', ...enemyAttack(zone, rank) };
  if (shot) {
    foe.shot = shot;
  }
  return foe;
}

// A normal enemy's life in `zone`, before the 20% spread.
function baseLife(zone) {
  return ENEMY_HP[0] + ENEMY_HP[1] * Math.pow(zone, ENEMY_HP[2]);
}

function enemyAttack(zone, rank) {
  return { atk: Math.max(1, Math.round(baseLife(zone) * ENEMY_ATK * RANKS[rank].atk)), every: RANKS[rank].every };
}

function maxLife(h) {
  const [base, perLevel, power] = HERO_LIFE;
  return Math.round((base + perLevel * Math.pow(h.level, power)) * CLASSES[h.cls].life * (1 + gearBonus(h, 'life') / 100));
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
// A lucky roll is rolled twice, keeping the rarer result.
function luckyRarity(lucky) {
  const rarity = rollRarity();
  if (!lucky) {
    return rarity;
  }
  const again = rollRarity();
  return RARITIES.indexOf(again) > RARITIES.indexOf(rarity) ? again : rarity;
}

function rollSkill(cls, level, lucky) {
  const c = CLASSES[cls].skills;
  const [icon, first] = pick(c.parts);
  const rarity = luckyRarity(lucky);
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
  h.tally.found[s.rarity]++;
  const found = `${s.icon} ${s.name} (${s.rarity})`;
  if (replaced) {
    h.tally.replaced++;
    setMsg(h, `🎁 ${found} replaces ${replaced.icon} ${replaced.name}`, now);
  } else if (kept) {
    setMsg(h, `🎁 New skill: ${found}`, now);
  } else {
    setMsg(h, `🎁 Found ${found}, weaker than your skills`, now);
  }
}

// ---------- gear ----------

// A random piece of gear found at `level`, for a random slot. Its power grows with the level
// and the rarity, and is spread over one or two stats.
function rollGear(level, lucky) {
  const slot = pick(Object.keys(GEAR_SLOTS));
  const g = GEAR_SLOTS[slot];
  const rarity = luckyRarity(lucky);
  const material = GEAR_MATERIALS.filter(([from]) => level >= from).pop()[1];
  const power = Math.max(1, Math.round((1.5 + 0.8 * Math.sqrt(level)) * rarity.power * (0.8 + Math.random() * 0.4)));
  const kinds = Object.keys(GEAR_STATS);
  const first = Math.random() < 0.5 ? 'damage' : pick(kinds);
  const stats = { [first]: power };
  if (power >= 2 && Math.random() < 0.4) {
    const second = pick(kinds.filter(k => k !== first));
    stats[second] = Math.max(1, Math.round(power * (0.3 + Math.random() * 0.2)));
    stats[first] = power - stats[second];
  }
  return { slot, icon: g.icon, name: `${material} ${pick(g.bases)}`, rarity: rarity.name, level, stats };
}

function gearPower(item) {
  return item ? Object.values(item.stats).reduce((a, b) => a + b, 0) : 0;
}

// The percent of `kind` that all the gear worn adds up to.
function gearBonus(h, kind) {
  return Object.values(h.gear).reduce((sum, item) => sum + (item.stats[kind] || 0), 0);
}

function statsText(stats) {
  return Object.entries(stats).map(([k, pct]) => `+${pct}% ${GEAR_STATS[k]}`).join(', ');
}

// A dropped piece is worn if it beats the piece in its slot (or the slot is empty), and is
// otherwise left lying where it fell, keeping the old piece.
function dropGear(h, x, lucky, now) {
  const item = rollGear(h.level, lucky);
  h.tally.gear[item.rarity]++;
  const found = `${item.icon} ${item.name} (${item.rarity})`;
  const old = h.gear[item.slot];
  if (gearPower(item) > gearPower(old)) {
    h.gear[item.slot] = item;
    setMsg(h, `🎁 ${found} ${old ? `replaces ${old.name}` : 'equipped'}`, now);
  } else {
    h.tally.left++;
    h.loot.push({ x, icon: item.icon });
    setMsg(h, `🎁 ${found} left behind, yours is better`, now);
  }
}

// ---------- achievements ----------

// What one hero did that adds up across heroes.
function counts(h) {
  const t = h.tally;
  const sum = byRarity => Object.values(byRarity).reduce((a, b) => a + b, 0);
  return {
    kills: h.kills,
    workSec: h.step,
    minis: t.minis,
    elders: t.elders,
    skillCrits: t.skillCrits,
    upgrades: t.replaced,
    skillsFound: sum(t.found),
    epic: t.found.epic + t.found.legendary,
    legendary: t.found.legendary,
    gearFound: sum(t.gear),
    gearEpic: t.gear.epic + t.gear.legendary,
    gearLegendary: t.gear.legendary,
    gearLeft: t.left,
    knockouts: t.knockouts,
    closeCalls: t.closeCalls,
    potions: t.potions,
  };
}

// Everything achievements are measured by. Totals add up every hero, including those replaced by
// /vwc:createchar; records are the best of the current heroes. `worked`: the hero just moved.
function achievementFacts(root, now, worked) {
  const heroes = Object.values(root.heroes);
  const best = f => heroes.reduce((n, h) => Math.max(n, f(h)), 0);
  const totals = { ...root.stats.retired };
  for (const h of heroes) {
    for (const [k, n] of Object.entries(counts(h))) {
      totals[k] = (totals[k] || 0) + n;
    }
  }
  const day = new Date(now);
  return {
    ...totals,
    workHours: (totals.workSec || 0) / 3600,
    maxHit: best(h => h.tally.maxHit),
    // A zone's boss must be beaten to leave it, so this is also how many zone bosses fell.
    zone: best(h => zoneOf(h.heroX)),
    level: best(h => h.level),
    heroes: heroes.length,
    everyClass: Math.min(...Object.keys(CLASSES).map(k => (root.heroes[k] ? root.heroes[k].level : 0))),
    heldSkills: best(h => h.skills.length),
    heldLegendary: best(h => h.skills.filter(s => s.rarity === 'legendary').length),
    gearWorn: best(h => Object.keys(h.gear).length),
    tokens: root.stats.tokens,
    longestTurn: root.stats.longestTurn / 60000,
    night: worked && day.getHours() < 5 ? 1 : 0,
    weekend: worked && (day.getDay() === 0 || day.getDay() === 6) ? 1 : 0,
  };
}

// Earns every achievement whose goal was reached and announces it on the stats row. A save from
// before achievements has none recorded: its first check quietly records what was already done,
// and the update notice says how many. Returns the achievements announced.
function checkAchievements(root, now, worked = false) {
  const quiet = !root.achievements;
  root.achievements = root.achievements || {};
  const facts = achievementFacts(root, now, worked);
  const earned = ACHIEVEMENTS.filter(a => !root.achievements[a.id] && facts[a.of] >= a.goal);
  for (const a of earned) {
    root.achievements[a.id] = quiet ? { at: null, cls: null } : { at: now, cls: root.active };
  }
  const h = activeHero(root);
  if (quiet || earned.length === 0) {
    return [];
  }
  if (h) {
    setMsg(h, `🏅 ${earned.length > 1 ? 'Achievements' : 'Achievement'}: ${earned.map(a => a.name).join(', ')}`, now);
  }
  return earned;
}

function earnedCount(root) {
  return ACHIEVEMENTS.filter(a => root.achievements && root.achievements[a.id]).length;
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
  xp = Math.round(xp * (1 + gearBonus(h, 'xp') / 100));
  h.xp += xp;
  h.totalXp += xp;
  const before = h.level;
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
  // A level up restores all life, but doesn't wake a knocked out hero.
  if (h.level > before && !h.down) {
    h.life = maxLife(h);
  }
}

// The nearest enemy within the class's range, which the hero is fighting.
function targetOf(h) {
  return h.enemies.find(e => e.x > h.heroX && e.x <= h.heroX + CLASSES[h.cls].range);
}

// The nearest enemy ahead: the only one that closes in and attacks, so fights stay one at a time.
function frontOf(h) {
  return h.enemies.find(e => e.x > h.heroX);
}

// How close an enemy must be to attack: next to the hero, or SHOT_RANGE tiles for one that shoots.
function reachOf(foe) {
  return foe.shot ? SHOT_RANGE : 1;
}

// One second of work: the hero walks, or attacks the nearest enemy within its range; then the
// nearest enemy closes in or strikes back. Out of combat, life comes back. A knocked out hero
// only rests.
function step(h, now) {
  h.step++;
  spawnAhead(h);
  if (h.down > 0) {
    h.down--;
    if (h.down === 0) {
      h.life = maxLife(h);
      setMsg(h, `💪 Back on your feet, +${Math.round(h.rally * RALLY * 100)}% damage until the next win`, now);
    }
    return;
  }
  const attacked = heroTurn(h, now);
  const fought = enemyTurn(h, now) || attacked;
  if (!fought) {
    h.life = Math.min(maxLife(h), h.life + Math.ceil(maxLife(h) * REGEN));
  }
}

// The hero's half of a step. Returns whether it attacked.
function heroTurn(h, now) {
  const c = CLASSES[h.cls];
  const foe = targetOf(h);
  if (!foe) {
    h.heroX++;
    if (h.heroX % ZONE_LENGTH === 0) {
      const b = biomeOf(zoneOf(h.heroX));
      setMsg(h, `Entered ${b.icon} ${b.name}${cycleSuffix(zoneOf(h.heroX))}`, now);
    }
    h.enemies = h.enemies.filter(e => e.x > h.heroX - 10);
    h.loot = h.loot.filter(l => l.x > h.heroX - 10);
    return false;
  }

  let dmg = attackOf(h) * (1 + (skillBonus(h, 'damage') + gearBonus(h, 'damage')) / 100) * (1 + RALLY * h.rally);
  let icon = c.hit;
  // The strongest skill that is off cooldown fires instead of a basic attack.
  const ready = h.skills.filter(sk => sk.readyAt <= h.step).sort((a, b) => b.mult - a.mult)[0];
  if (ready) {
    dmg *= ready.mult;
    icon = ready.icon;
    ready.readyAt = h.step + ready.cd;
  }
  const crit = Math.random() < c.crit + (skillBonus(h, 'crit') + gearBonus(h, 'crit')) / 100;
  if (crit) {
    dmg *= 2;
    if (ready) {
      h.tally.skillCrits++;
    }
  }
  dmg = Math.round(dmg);
  h.tally.maxHit = Math.max(h.tally.maxHit, dmg);
  foe.hp -= dmg;
  // The attack travels across the gap one tile per step, so ranged shots visibly fly.
  const gap = foe.x - h.heroX - 1;
  h.fx = { icon, x: h.heroX + 1 + (h.step % Math.max(1, gap)), step: h.step, dmg, crit };
  if (foe.hp <= 0) {
    h.kills++;
    h.enemies = h.enemies.filter(e => e !== foe);
    h.fx = { icon: '✨', x: foe.x, step: h.step };
    h.rally = 0;
    if (h.life < maxLife(h) * 0.1) {
      h.tally.closeCalls++;
    }
    if (foe.boss) {
      setMsg(h, `🏆 Defeated ${foe.icon} ${foe.name}!`, now);
    }
    if (foe.drop) {
      h.tally[foe.drop % 10 === 0 ? 'elders' : 'minis']++;
      dropSkill(h, foe.drop, now);
    }
    if (foe.boss || Math.random() < GEAR_DROP) {
      dropGear(h, foe.x, foe.boss, now);
    }
    if (h.potions < MAX_POTIONS && (foe.boss || Math.random() < POTION_DROP)) {
      h.potions++;
    }
    gainXp(h, foe.xp, now);
  }
  return true;
}

// The enemy's half of a step: the nearest enemy ahead notices the hero within AGGRO tiles and
// closes in one tile per step until the hero is within its reach, then attacks every `every`
// steps. Returns whether the hero is in a fight with it.
function enemyTurn(h, now) {
  const foe = frontOf(h);
  const d = foe ? foe.x - h.heroX : Infinity;
  if (d > AGGRO) {
    return false;
  }
  if (d > reachOf(foe)) {
    foe.x--;
    return false;
  }
  if (h.step % foe.every !== 0) {
    return true;
  }
  const dmg = Math.max(1, Math.round(foe.atk * (0.85 + Math.random() * 0.3)));
  h.life -= dmg;
  h.hurt = { step: h.step, dmg };
  // A shot travels toward the hero one tile per step, like the hero's own.
  if (foe.shot) {
    h.efx = { icon: foe.shot, x: foe.x - 1 - (h.step % Math.max(1, d - 1)), step: h.step };
  }
  if (h.life <= 0) {
    knockOut(h, foe, now);
  } else if (h.life < maxLife(h) * POTION_AT && h.potions > 0) {
    h.potions--;
    h.tally.potions++;
    h.life = Math.min(maxLife(h), h.life + Math.round(maxLife(h) * POTION_HEAL));
    setMsg(h, `🧪 Drank a potion`, now);
  }
  return true;
}

// The hero rests for KO_STEPS while the enemy heals, then gets up stronger (see step).
function knockOut(h, foe, now) {
  h.life = 0;
  h.down = KO_STEPS;
  h.rally++;
  h.tally.knockouts++;
  foe.hp = foe.max;
  setMsg(h, `😵 Knocked out by ${foe.icon} ${foe.name}! Resting for ${KO_STEPS} s`, now);
}

// ---------- rendering ----------

const ESC = '\x1b[';
const RESET = `${ESC}0m`;
const GOLD = '38;2;250;204;21';
const ENEMY_RED = '38;2;248;113;113';
const LIFE_GREEN = '38;2;34;197;94';
const SEP = `${ESC}2m · ${RESET}`;

function color(code, text) {
  return `${ESC}${code}m${text}${RESET}`;
}

// Columns a string takes on screen. Every emoji used here is a double-width
// Emoji_Presentation character, so this simple rule is exact for our output.
// The ones below U+1F000: ⚡ ✨ ⏳ ⭐ ✅ ⬜.
const WIDE_BELOW_1F000 = new Set([0x26a1, 0x2728, 0x23f3, 0x2b50, 0x2705, 0x2b1c]);

function displayWidth(str) {
  let w = 0;
  for (const ch of str.replace(/\x1b\[[0-9;]*m/g, '')) {
    const cp = ch.codePointAt(0);
    w += cp >= 0x1f000 || WIDE_BELOW_1F000.has(cp) ? 2 : 1;
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

// The enemy being fought (the one in the hero's range, or one shooting from beyond it), its life,
// and while working the damage of the hit that just landed (with a "!" on a critical hit).
// Null while walking.
function targetText(h, active) {
  const front = frontOf(h);
  const foe = targetOf(h) || (front && front.x - h.heroX <= reachOf(front) ? front : null);
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

  // The status is a [color, text] pair, so it can be shortened instead of dropped.
  let status = null;
  if (h.msg && now - h.msg.at < (h.msg.ms || MSG_MS)) {
    status = [GOLD, h.msg.text];
  } else if (!active) {
    const t = lastTurn(root);
    let tail = '';
    if (t) {
      // XP is only comparable when the turn was played with the same class.
      const xp = t.cls === h.cls ? ` · +${h.totalXp - t.xp0} XP` : '';
      tail = ` · last turn ${formatDuration(t.end - t.start)} · ${formatTokens(t.tokens)} tok${xp}`;
    }
    status = ['2', `💤 waiting for you${tail}`];
  }

  // [text, priority]: lower priority is dropped first when the row is too wide.
  const parts = [
    [`${c.icon} ${c.name} ${color(GOLD, `Lv ${h.level}`)} ${color('38;2;167;139;250', bar)} ${h.xp}/${need} XP`, 6],
    [`${w.icon} ${w.name}`, 4],
    [skills, 1],
    [color(b.color, `${b.icon} ${b.name}${cycleSuffix(zone)}`), 3],
    [`💀 ${h.kills}`, 2],
    [targetText(h, active), 4.5],
    [status && color(...status), 5],
  ].filter(p => p[0]);

  let row = parts.map(p => p[0]).join(SEP);
  while (displayWidth(row) > cols && parts.length > 1) {
    const lowest = parts.reduce((a, b) => (b[1] < a[1] ? b : a));
    // A message that is next in line to go is cut short instead, if a useful part of it fits.
    const room = cols - (displayWidth(row) - displayWidth(lowest[0]));
    if (status && lowest[1] === 5 && room >= 20) {
      lowest[0] = color(status[0], cutToWidth(status[1], room));
    } else {
      parts.splice(parts.indexOf(lowest), 1);
    }
    row = parts.map(p => p[0]).join(SEP);
  }
  return row;
}

// The start of `text` that fits in `width` columns, ending in "…" if anything was cut.
function cutToWidth(text, width) {
  if (displayWidth(text) <= width) {
    return text;
  }
  let out = '';
  for (const ch of text) {
    if (displayWidth(out + ch) > width - 1) {
      break;
    }
    out += ch;
  }
  return `${out}…`;
}

// The hero's life bar, green, then yellow below half and red below a quarter. While working it
// shows the damage of the hit just taken; then a knockout's rest, the potions held and the extra
// damage a knockout gave, dropped from the end while the row is wider than `room`.
function lifeRow(h, active, room) {
  const max = maxLife(h);
  const life = Math.max(0, Math.min(h.life, max));
  const filled = life > 0 ? Math.max(1, Math.ceil((life / max) * 10)) : 0;
  const tint = life > max / 2 ? LIFE_GREEN : life > max / 4 ? GOLD : ENEMY_RED;
  // Padded so the row doesn't shift by a column as the number changes.
  let text = `💗 ${color(tint, '▰'.repeat(filled) + '▱'.repeat(10 - filled))} ${String(life).padStart(String(max).length)}/${max}`;
  if (active && h.hurt && h.hurt.step === h.step) {
    text += ` ${color(ENEMY_RED, `-${h.hurt.dmg}`)}`;
  }
  const parts = [text];
  if (h.down > 0) {
    parts.push(color(ENEMY_RED, `😵 knocked out, back up in ${h.down} s`));
  }
  if (h.potions > 0) {
    parts.push(`🧪 ${h.potions}`);
  }
  if (h.rally > 0 && h.down === 0) {
    parts.push(color(GOLD, `💪 +${Math.round(h.rally * RALLY * 100)}% damage until the next win`));
  }
  let row = parts.join(SEP);
  while (displayWidth(row) > room && parts.length > 1) {
    parts.pop();
    row = parts.join(SEP);
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
      row += h.down > 0 ? '😵' : CLASSES[h.cls].icon;
    } else if (foe) {
      row += foe.icon;
    } else if (!active && x === h.heroX + 1) {
      row += '💤';
    } else if (active && h.fx && h.fx.step === h.step && h.fx.x === x) {
      row += h.fx.icon;
    } else if (active && h.efx && h.efx.step === h.step && h.efx.x === x) {
      row += h.efx.icon;
    } else if (h.loot.some(l => l.x === x)) {
      row += h.loot.find(l => l.x === x).icon;
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
  let text;
  let map;
  if (!h) {
    [text, ...map] = pickerRows(cols).map(row => alignRight(row, cols));
    text = [text];
  } else {
    const active = anyActive(root, now);
    const stats = statsRow(root, h, now, active, cols);
    // The life bar sits right under the XP bar, which follows "<icon> <class> Lv <level> " in the
    // right-aligned stats row; if the life row still doesn't fit there, it ends at the right edge.
    const c = CLASSES[h.cls];
    const xpCol = cols - displayWidth(stats) + displayWidth(`${c.icon} ${c.name} Lv ${h.level} `);
    const at = Math.max(0, xpCol - displayWidth('💗 '));
    const life = lifeRow(h, active, cols - at);
    const lifeCol = Math.min(at, Math.max(0, cols - displayWidth(life)));
    text = [alignRight(stats, cols), RESET + ' '.repeat(lifeCol) + life];
    map = [worldRow(h, active, cols), floorRow(h.heroX, cols)].map(row => alignRight(row, cols));
  }
  // /vwc:stats below moves the text rows (stats and life, or the picker's title) under the map.
  return display(root).stats === 'below' ? [...map, ...text] : [...text, ...map];
}

module.exports = {
  DIR, COMMAND_PREFIX, CLASSES, classKey, chooseClass, createCharacter, status,
  display, partKey, setVisible, placeKey, setStatsPlace, load, loadSaved, pluginVersion, skillsReport,
  gearReport, achievementsReport, earnedCount, ACHIEVEMENTS,
  onHookEvent, onStatusLine, render, displayWidth,
  newRoot, newHero, migrate, step, xpNeed, attackOf, weaponOf, rollSkill, skillPower, learnSkill,
  rollGear, gearPower, gearBonus, gainXp, checkAchievements, achievementFacts, maxLife,
};
