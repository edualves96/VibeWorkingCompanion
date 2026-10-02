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
// Enemies come in groups of 1 to 4 side by side, with these chances; a group closes in and
// fights together. GROUP_GAP more tiles follow a group per extra enemy, so enemies don't get
// much more frequent overall.
const GROUP_SIZES = [0.6, 0.2, 0.12, 0.08];
const GROUP_GAP = 3;
// A group's enemies are weaker than one alone: GROUP_MEMBER of its life, damage and XP.
const GROUP_MEMBER = 0.65;
// Elite enemies: ELITE_CHANCE of the normal enemies (twice that at night) roll one of the TRAITS,
// shown before their name in gold. They have ELITE.hp times the life and give ELITE.xp times the
// XP, drop a piece of gear ELITE.gear of the time (with the rarity rolled twice, like a boss's),
// and drop potions ELITE.potion times as often.
const ELITE_CHANCE = 0.05;
const ELITE = { hp: 2.5, xp: 3, gear: 0.25, potion: 3 };
const TRAITS = {
  swift: { name: 'Swift', what: 'dodges 1 hit in 4', dodge: 0.25 },
  armored: { name: 'Armored', what: 'takes 40% less damage', armor: 0.4 },
  vampiric: { name: 'Vampiric', what: 'heals by half the damage it deals', drain: 0.5 },
  explosive: { name: 'Explosive', what: 'explodes when defeated, for 15% of the hero\'s life', blast: 0.15 },
};
// Area skills hit the target and every enemy up to AREA tiles behind it, adding AREA_MULT of the
// extra damage a single-target skill of the same strength would.
const AREA = 3;
const AREA_MULT = 0.85;
const RALLY = 0.25;
const KILL_XP = 1.6;             // longer fights mean fewer kills, so each kill is worth more
// The mini boss or boss of every 5th level drops a random skill; a hero holds this many.
const MAX_SKILLS = 2;
// Rarity multiplies a skill's strength. A boss of a 10th level rolls twice and keeps the better.
// `shards`: what a piece of gear of that rarity is salvaged into.
const RARITIES = [
  { name: 'common', chance: 0.55, power: 1, shards: 1 },
  { name: 'rare', chance: 0.3, power: 1.25, shards: 2 },
  { name: 'epic', chance: 0.12, power: 1.55, shards: 3 },
  { name: 'legendary', chance: 0.03, power: 2, shards: 5 },
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
// A piece weaker than the one worn is salvaged into shards (see RARITIES), and shards reforge the
// weakest piece worn: +1 to its biggest stat. The first reforge of a piece costs REFORGE_COST
// shards, and each one after that REFORGE_COST more, so reforges slow down as they add up.
const REFORGE_COST = 10;
// Every subagent Claude runs brings an ally that fights beside the hero until it finishes, up to
// MAX_ALLIES at a time. Each strikes the hero's target every step for ALLY_DAMAGE of a basic hit.
// An ally whose subagent sent nothing for ALLY_STALE_MS has left (its "finished" event was missed).
const MAX_ALLIES = 2;
const ALLY_DAMAGE = 0.3;
const ALLY_STALE_MS = 10 * 60 * 1000;
const ALLY_KINDS = [
  { icon: '🦊', name: 'Fox', a: 'A fox', hit: '🐾' },
  { icon: '🦉', name: 'Owl', a: 'An owl', hit: '🪶' },
  { icon: '🐕', name: 'Hound', a: 'A hound', hit: '🐾' },
  { icon: '🧚', name: 'Fairy', a: 'A fairy', hit: '🌸' },
  { icon: '🦄', name: 'Unicorn', a: 'A unicorn', hit: '🌈' },
];
// Rested XP: a break from work longer than RESTED_AFTER fills the hero's rested pool with
// RESTED_RATE of the rest of the break, up to RESTED_MAX. While the pool lasts, each second of
// work spends a second of it, and kills give RESTED_XP more XP (+100%).
const RESTED_AFTER = 5 * 60 * 1000;
const RESTED_RATE = 0.5;
const RESTED_MAX = 60 * 60 * 1000;
const RESTED_XP = 1;
const RESTED_PURPLE = '38;2;167;139;250';  // the color of the XP bar
// When Claude compacts the conversation (the PreCompact hook), the hero makes camp: it gets all its
// life back (and gets up, if knocked out) and CAMP_DAMAGE more damage for CAMP_MS of work. It sits
// by the fire for CAMP_REST steps before moving on, so the camp can be seen.
const CAMP_DAMAGE = 0.25;
const CAMP_MS = 10 * 60 * 1000;
const CAMP_REST = 15;
// Day and night follow the local clock: night runs from NIGHT_FROM to NIGHT_TO o'clock, with an
// hour of dusk before it and of dawn after. At night the floor is NIGHT_LIGHT as bright, and
// bluer, and each biome's night creature (`night` in BIOMES) comes out with the other enemies.
const NIGHT_FROM = 20;
const NIGHT_TO = 6;
const NIGHT_LIGHT = 0.45;
// Seasonal events, by month (0 is January), from the 1st to the last day. A season adds its decor
// to a third of every biome's and is announced on its first day (`news`). At Halloween, enemies
// drop 🍬 candy CANDY_DROP of the time, which heals CANDY_HEAL of the hero's life as it walks over
// it, and GHOST_WAVE of the groups are a `wave` of ghosts. In Winter, `enemy` is SEASON_ENEMY of
// the enemies and `snow` covers the floor, except in a `hot` biome.
const SEASONS = {
  9: {
    name: 'Halloween', icon: '🎃', decor: '🎃', candy: true, wave: ['👻', 'Ghost', '🟣'],
    news: '🎃 Halloween: pumpkins, 🍬 candy and 👻 ghost waves until the 31st',
  },
  11: {
    name: 'Winter', icon: '🎄', decor: '🎄', enemy: ['⛄', 'Snowman', '⚪'],
    snow: { fg: '38;2;241;245;249', marks: ['*', '*', '.'] },
    news: '🎄 Winter: trees, ⛄ snowmen and snow until the 31st',
  },
};
const CANDY_DROP = 0.08;
const CANDY_HEAL = 0.2;
const GHOST_WAVE = 0.15;
const SEASON_ENEMY = 0.12;
// /vwc:journal: each hero keeps its last JOURNAL_SIZE notable moments, and the journal shows the
// last JOURNAL_SHOWN lines of all heroes together.
const JOURNAL_SIZE = 100;
const JOURNAL_SHOWN = 50;
const ZONE_LENGTH = 600;         // tiles per zone; with the fights, about 15 minutes of work
const VIEW_AHEAD = 40;
const WORLD_TILES = 24;           // world strip width; each tile is 2 columns
const MSG_MS = 10000;
const UPDATE_MSG_MS = 30000;      // the "updated" notice stays longer than other messages

// Shown once after an update to that version (a function gets the save). A version without a
// line here gets a pointer to /vwc:commands instead.
const WHATS_NEW = {
  '1.3.0': 'enemies have life now, and every 5th level summons a boss',
  '1.4.0': `skills are random now, dropped by level bosses: ${COMMAND_PREFIX}skills`,
  '1.18.0': root => (olderThan(root.seenVersion, '1.17.0')
    ? `⛺ campfires when Claude compacts, 📇 ${COMMAND_PREFIX}card, 💠 elite enemies, 🎃 seasonal events`
    : `⛺ Claude compacts, the hero makes camp: full life, +${CAMP_DAMAGE * 100}% damage`),
  '1.17.0': root => (olderThan(root.seenVersion, '1.16.0')
    ? `📇 ${COMMAND_PREFIX}card to share your hero, and ${COMMAND_PREFIX}journal ${root.active || 'archer'} for one hero's journal`
    : `📜 ${COMMAND_PREFIX}journal ${root.active || 'archer'} shows one hero's journal, ${COMMAND_PREFIX}journal all everything kept`),
  '1.16.0': root => (olderThan(root.seenVersion, '1.15.0')
    ? `📇 ${COMMAND_PREFIX}card to share your hero, 💠 elite enemies, 🎃 seasonal events`
    : `📇 ${COMMAND_PREFIX}card: a card of your hero to paste in Slack or a PR`),
  '1.15.0': root => (olderThan(root.seenVersion, '1.14.0')
    ? `💠 elite enemies, 🎃 seasonal events${olderThan(root.seenVersion, '1.13.0') ? ', 🌙 day and night' : ''}`
    : '💠 elite enemies: Swift, Armored, Vampiric or Explosive, with better loot'),
  '1.14.0': root => {
    const s = season(Date.now());
    const what = s ? s.news : '🎃 seasonal events: Halloween in October, Winter in December';
    return olderThan(root.seenVersion, '1.13.0') ? `🌙 day and night · ${what}` : what;
  },
  '1.13.0': root => (olderThan(root.seenVersion, '1.12.0')
    ? `🌙 day and night, 💤 rested XP after breaks, 🦊 subagent allies, ${COMMAND_PREFIX}journal`
    : '🌙 day and night: the floor follows your clock, and night creatures come out'),
  '1.12.0': root => (olderThan(root.seenVersion, '1.11.0')
    ? `💤 rested XP after breaks, 🦊 subagent allies, 🔩 reforges, ${COMMAND_PREFIX}journal`
    : '💤 take a break: you come back rested, with double XP from kills'),
  '1.11.0': root => (olderThan(root.seenVersion, '1.10.0')
    ? `🦊 subagent allies, 🔩 reforges, ${COMMAND_PREFIX}journal, ${COMMAND_PREFIX}statistics`
    : `🦊 subagents fight beside you, 🔩 gear reforges, ${COMMAND_PREFIX}journal`),
  '1.10.0': `📊 each hero's work time, tokens, turns, kills and more: ${COMMAND_PREFIX}statistics`,
  '1.9.0': root => (olderThan(root.seenVersion, '1.8.0')
    ? `🧭 biome progress on this row, and ${COMMAND_PREFIX}showprogress off for just the map`
    : '🧭 the biome shows how far through it you are; its boss waits at 100%'),
  '1.8.0': `just want the map? ${COMMAND_PREFIX}showprogress off hides this row and the life bar`,
  '1.7.0': root => (olderThan(root.seenVersion, '1.6.0')
    ? `💗 life, groups, area skills, gear: ${COMMAND_PREFIX}commands`
    : 'enemies come in groups, area skills hit them all'),
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
    { id: 'crowd-control', name: 'Crowd Control', what: 'hit 4 enemies with one area skill', of: 'areaHits', goal: 4 },
    { id: 'pack-hunter', name: 'Pack Hunter', what: 'defeat 500 groups of enemies', of: 'groups', goal: 500 },
    { id: 'fellowship', name: 'Fellowship', what: 'be joined by an ally (a subagent)', of: 'allies', goal: 1 },
    { id: 'elite-hunter', name: 'Elite Hunter', what: 'defeat 100 elite enemies', of: 'elites', goal: 100 },
    { id: 'night-stalker', name: 'Night Stalker', what: 'defeat 50 creatures of the night', of: 'nightKills', goal: 50 },
    { id: 'better-together', name: 'Better Together', what: 'defeat 100 enemies with an ally at your side', of: 'allyKills', goal: 100 },
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
    { id: 'picky', name: 'Picky', what: 'salvage 100 pieces of gear', of: 'gearLeft', goal: 100 },
    { id: 'tinkerer', name: 'Tinkerer', what: 'reforge a piece of gear', of: 'forged', goal: 1 },
    { id: 'master-smith', name: 'Master Smith', what: 'reforge gear 50 times', of: 'forged', goal: 50 },
  ],
  Seasons: [
    { id: 'trick-or-treat', name: 'Trick or Treat', what: 'eat 31 pieces of 🍬 candy at Halloween', of: 'candy', goal: 31 },
    { id: 'snowball-fight', name: 'Snowball Fight', what: 'defeat 100 ⛄ snowmen in December', of: 'snowmen', goal: 100 },
  ],
  Work: [
    { id: 'clocked-in', name: 'Clocked In', what: 'work for 1 hour', of: 'workHours', goal: 1 },
    { id: 'full-shift', name: 'Full Shift', what: 'work for 8 hours', of: 'workHours', goal: 8 },
    { id: 'work-week', name: 'Work Week', what: 'work for 40 hours', of: 'workHours', goal: 40 },
    { id: 'token-burner', name: 'Token Burner', what: 'use 1 million tokens', of: 'tokens', goal: 1e6 },
    { id: 'token-furnace', name: 'Token Furnace', what: 'use 10 million tokens', of: 'tokens', goal: 1e7 },
    { id: 'well-rested', name: 'Well Rested', what: 'come back to a full hour of rested XP', of: 'fullRests', goal: 1 },
    { id: 'deep-work', name: 'Deep Work', what: 'a single Claude turn that runs for 30 minutes', of: 'longestTurn', goal: 30 },
    { id: 'happy-camper', name: 'Happy Camper', what: 'make camp 10 times (when Claude compacts)', of: 'camps', goal: 10 },
    { id: 'night-owl', name: 'Night Owl', what: 'work between midnight and 5 a.m.', of: 'night', goal: 1, secret: true },
    { id: 'weekend-warrior', name: 'Weekend Warrior', what: 'work on a Saturday or Sunday', of: 'weekend', goal: 1, secret: true },
  ],
};
const ACHIEVEMENTS = Object.entries(ACHIEVEMENT_GROUPS).flatMap(([group, list]) => list.map(a => ({ ...a, group })));

// enemies and boss: [icon, name], plus the icon of what it shoots for an enemy that attacks from
// SHOT_RANGE tiles instead of walking up to the hero. night: the enemy that joins them at night.
// floor: background and mark colors plus the ASCII marks scattered on about 1 cell in 3
// (1 column each, so the floor lines up under the 2-column world tiles in every font).
const BIOMES = [
  { name: 'Meadow', icon: '🌼', color: '38;2;134;239;172', decor: ['🌼', '🌳', '🌾'], enemies: [['🐀', 'Rat'], ['🐍', 'Snake', '🟢'], ['🐗', 'Boar']], night: ['🐺', 'Wolf'], boss: ['🐻', 'Bear'],
    floor: { bg: '48;2;46;125;50', fg: '38;2;163;230;53', marks: [',', '"', '\''] } },
  { name: 'Dark Forest', icon: '🌲', color: '38;2;74;222;128', decor: ['🌲', '🍄', '🌲'], enemies: [['🐺', 'Wolf'], ['🦇', 'Bat', '🟣'], ['🐗', 'Boar']], night: ['👻', 'Wisp', '🟣'], boss: ['🦍', 'Ape King'],
    floor: { bg: '48;2;20;61;34', fg: '38;2;101;163;13', marks: ['"', ','] } },
  { name: 'Caves', icon: '💎', color: '38;2;148;163;184', decor: ['🪨', '💎', '🦴'], enemies: [['🦇', 'Bat', '🟣'], ['👺', 'Goblin', '🟤'], ['🐛', 'Crawler']], night: ['🧟', 'Ghoul'], boss: ['👹', 'Ogre'],
    floor: { bg: '48;2;64;64;72', fg: '38;2;148;163;184', marks: ['.', '_', ':'] } },
  { name: 'Coast', icon: '🌴', color: '38;2;56;189;248', decor: ['🌴', '🐚', '🌴'], enemies: [['🦀', 'Crab'], ['🦑', 'Squid', '💧'], ['🦈', 'Shark']], night: ['🧜', 'Siren', '🎵'], boss: ['🐙', 'Kraken', '💧'],
    floor: { bg: '48;2;14;90;130', fg: '38;2;125;211;252', marks: ['~'] } },
  { name: 'Desert', icon: '🌵', color: '38;2;250;204;21', decor: ['🌵', '🦴', '🐪'], enemies: [['🦂', 'Scorpion'], ['🐍', 'Viper', '🟢'], ['🦅', 'Vulture']], night: ['🪲', 'Scarab'], boss: ['🦖', 'Sand Rex'],
    floor: { bg: '48;2;180;130;40', fg: '38;2;253;230;138', marks: ['.', ':'] } },
  { name: 'Graveyard', icon: '🪦', color: '38;2;192;132;252', decor: ['🪦', '🦴', '🌑'], enemies: [['💀', 'Skeleton'], ['🧟', 'Zombie'], ['👻', 'Ghost', '🟣']], night: ['🦇', 'Vampire Bat', '🟣'], boss: ['🧛', 'Vampire'],
    floor: { bg: '48;2;46;30;66', fg: '38;2;120;100;140', marks: ['.', ',', '+'] } },
  { name: 'Volcano', icon: '🌋', color: '38;2;248;113;113', hot: true, decor: ['🌋', '🔥', '🪨'], enemies: [['👹', 'Demon'], ['🦎', 'Salamander'], ['🐲', 'Drake', '🔴']], night: ['🧞', 'Ifrit', '🔴'], boss: ['🐉', 'Dragon', '🔴'],
    floor: { bg: '48;2;100;20;20', fg: '38;2;251;146;60', marks: ['^', '~'] } },
];

// range: how many tiles ahead the hero starts fighting. atk: [base, per level].
// crit: chance of a double-damage hit. hit: icon of a basic attack. life: multiplies the hero's life.
// Weapons unlock at `lvl` and add `atk`. Skills are rolled at random (see rollSkill): their
// name is one of `parts` (which also gives the icon) plus one of `forms` (single target) or
// `areaForms` (area skills), and `power` scales their strength.
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
      forms: ['Bolt', 'Lance', 'Orb', 'Ray'],
      areaForms: ['Nova', 'Burst', 'Wave'],
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
      forms: ['Strike', 'Rend', 'Charge'],
      areaForms: ['Cleave', 'Slam', 'Smash'],
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
      forms: ['Shot', 'Arrow', 'Bolt'],
      areaForms: ['Volley', 'Rain', 'Barrage'],
    },
  },
};

const WORK_EVENTS = new Set(['UserPromptSubmit', 'PostToolUse', 'PostToolUseFailure']);
const WAIT_EVENTS = new Set(['Stop', 'StopFailure', 'PermissionRequest', 'PreToolUse']);

// ---------- save file ----------

// The save holds one hero per class; only the `active` one moves. `allies` are the subagents
// running now, by agent id, and `alliesGone` the ids of the last ones that finished.
function newRoot(now) {
  // A new save starts on the current version, so it never shows an "updated" notice.
  return { v: 2, active: null, heroes: {}, lastTick: now, sessions: {}, seenVersion: pluginVersion(), stats: newStats(), achievements: {}, allies: {}, alliesGone: [] };
}

// Shared by all heroes: tokens used, the longest turn (ms), and the counts of heroes replaced
// by /vwc:createchar, so lifetime totals keep what they did.
function newStats() {
  return { tokens: 0, longestTurn: 0, retired: {} };
}

// What a hero did that achievements count but the hero doesn't otherwise keep: `found` counts
// skills and `gear` pieces of gear by rarity, `left` the gear left behind, `closeCalls` wins with
// under 10% life left, `potions` the potions drunk, `maxAreaHits` the most enemies one area skill
// hit, `groups` the groups of enemies defeated, `allies` the allies that joined, `allyKills` the
// enemies defeated with an ally at the hero's side, `forged` the reforges, `restedXp` the extra
// XP that rested kills gave and `fullRests` the times the hero came back to a full rested pool and `nightKills` the night
// creatures defeated, `candy` the candy eaten, `snowmen` the snowmen defeated and `elites` the
// elite enemies defeated and `camps` the camps made.
// For /vwc:statistics: `tokens` used while the hero was active, and the Claude turns played with
// it: how many, their total time (ms) and tokens, the longest and shortest (ms, null before the
// first) and the most tokens in one. Heroes from before 1.10.0 count these from `countedFrom` on.
function newTally() {
  const byRarity = () => ({ common: 0, rare: 0, epic: 0, legendary: 0 });
  return {
    maxHit: 0, skillCrits: 0, minis: 0, elders: 0, replaced: 0, found: byRarity(), gear: byRarity(), left: 0,
    knockouts: 0, closeCalls: 0, potions: 0, maxAreaHits: 0, groups: 0, allies: 0, allyKills: 0, forged: 0, restedXp: 0, fullRests: 0, nightKills: 0, candy: 0, snowmen: 0, elites: 0, camps: 0,
    tokens: 0, turns: 0, turnMs: 0, turnTokens: 0, longestTurn: 0, shortestTurn: null, mostTokens: 0,
  };
}

// Life, potions held, steps left resting after a knockout, and knockouts since the last win.
function newLife(h) {
  return { life: maxLife(h), potions: 0, down: 0, rally: 0 };
}

function newHero(cls, now) {
  const c = CLASSES[cls];
  const awakens = `${c.icon} A new ${c.name.toLowerCase()} awakens`;
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
    loot: [],        // what salvaged gear left on the ground, until it scrolls out of view
    shards: 0,       // from salvaged gear, until there are enough for a reforge
    rested: 0,       // ms of rested XP left (see RESTED_MAX)
    lastWorked: null, // when the hero last worked, so a break can be measured
    camp: null,      // where the hero last made camp ({ x })
    camped: 0,       // ms of the camp's extra damage left
    resting: 0,      // steps left sitting by the camp's fire
    tally: newTally(),
    cooldowns: {},   // unused now; read by older versions that may still run in another window
    fx: null,
    msg: { text: awakens, at: now },
    journal: [{ at: now, text: awakens }],
  };
  return Object.assign(h, newLife(h));
}

// Version 1 kept a single hero at the top level. It already looked like a mage (🧙,
// elemental powers), so it becomes the mage save with its progress intact.
function migrate(s, now = Date.now()) {
  if (s.v !== 2) {
    const { v, lastTick, sessions, ...hero } = s;
    s = { v: 2, active: 'mage', heroes: { mage: { ...hero, cls: 'mage' } }, lastTick, sessions };
  }
  for (const h of Object.values(s.heroes)) {
    if (!h.skills) {
      grantMissedSkills(h);
    }
    for (const sk of h.skills) {
      if (sk.area == null) {
        sk.area = CLASSES[h.cls].skills.areaForms.includes(sk.name.split(' ').pop());
        if (sk.area) {
          sk.mult = areaMult(sk.mult);
        }
      }
    }
    // Counts added in later versions start at 0. Tokens and turns weren't kept per hero before
    // 1.10.0, so /vwc:statistics says when they started counting.
    const counted = h.tally && h.tally.turns != null;
    h.tally = h.tally ? { ...newTally(), ...h.tally } : pastTally(h);
    if (!counted) {
      h.tally.countedFrom = now;
    }
    if (!h.gear) {
      h.gear = {};
      h.loot = [];
    }
    if (h.life == null) {
      Object.assign(h, newLife(h));
    }
    if (!h.journal) {
      h.journal = [];
    }
    if (h.camped == null) {
      h.camp = null;
      h.camped = 0;
      h.resting = 0;
    }
    // Rested XP starts counting at the first break after 1.12.0.
    if (h.rested == null) {
      h.rested = 0;
      h.lastWorked = null;
    }
    // Gear left behind before 1.11.0 is salvaged too, as common pieces, and reforged right away.
    // Only the journal says so, leaving the stats row to the update notice.
    if (h.shards == null) {
      h.shards = h.tally.left * RARITIES[0].shards;
      if (h.shards > 0) {
        record(h, `🔩 The ${plural(h.tally.left, 'piece')} of gear left behind before 1.11.0 became ${plural(h.shards, 'shard')}`, now);
        reforge(h, now, record);
      }
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
  if (!s.allies) {
    s.allies = {};
    s.alliesGone = [];
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
  return migrate(parsed, now);
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
  comeBack(h, now);
  h.carryMs += gap;
  const allies = fightingAllies(root, now);
  let steps = 0;
  while (h.carryMs >= STEP_MS) {
    h.carryMs -= STEP_MS;
    step(h, now, allies);
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
  for (const [id, a] of Object.entries(root.allies)) {
    if (now - a.seen > ALLY_STALE_MS) {
      leave(root, id);
    }
  }
}

// ---------- rested XP ----------

// The hero's rested pool (ms) at `now`: what's left of it, plus what the break since the hero
// last worked adds. A hero that never worked yet has had no break.
function restedPool(h, now) {
  const rest = h.lastWorked ? now - h.lastWorked - RESTED_AFTER : 0;
  return Math.max(h.rested, Math.min(RESTED_MAX, h.rested + Math.max(0, rest) * RESTED_RATE));
}

// Work is going on: a break that just ended goes into the rested pool.
function comeBack(h, now) {
  const pool = restedPool(h, now);
  if (pool > h.rested) {
    h.rested = pool;
    if (pool >= RESTED_MAX) {
      h.tally.fullRests++;
    }
    setMsg(h, `💤 Rested: +${RESTED_XP * 100}% XP from kills for ${restedText(pool)}`, now);
  }
  h.lastWorked = now;
}

// "12m", rounded up so a pool that's nearly gone still shows.
function restedText(ms) {
  return `${Math.ceil(ms / 60000)}m`;
}

// ---------- allies ----------

// The allies at the hero's side: the first MAX_ALLIES to arrive. The others wait their turn.
function fightingAllies(root, now) {
  return Object.values(root.allies)
    .filter(a => now - a.seen <= ALLY_STALE_MS)
    .sort((a, b) => a.since - b.since)
    .slice(0, MAX_ALLIES);
}

// Something a subagent did. Its first event brings an ally, its SubagentStop sends it home, and
// everything in between keeps it there. A subagent never wakes a waiting hero, but while its
// session works, the subagent's activity keeps it from counting as idle (see IDLE_CAP_MS).
function applyAgentEvent(root, ev, at) {
  const ss = root.sessions[ev.session_id];
  if (ss) {
    ss.lastActivity = Math.max(ss.lastActivity || 0, at);
  }
  const id = ev.agent_id;
  if (ev.hook_event_name === 'SubagentStop') {
    // Without an id, the session's ally that arrived first goes.
    const mine = Object.entries(root.allies).filter(([, a]) => a.session === ev.session_id).sort((a, b) => a[1].since - b[1].since);
    const gone = id || (mine[0] && mine[0][0]);
    if (gone) {
      leave(root, gone);
    }
    return;
  }
  if (!id) {
    return;
  }
  const ally = root.allies[id];
  if (ally) {
    ally.seen = Math.max(ally.seen, at);
    return;
  }
  // Async hooks can finish out of order: a late event from a finished subagent doesn't bring it back.
  if (root.alliesGone.includes(id)) {
    return;
  }
  const taken = Object.values(root.allies).map(a => a.icon);
  const free = ALLY_KINDS.filter(k => !taken.includes(k.icon));
  const kind = pick(free.length > 0 ? free : ALLY_KINDS);
  const joined = { icon: kind.icon, name: kind.name, hit: kind.hit, session: ev.session_id, since: at, seen: at };
  root.allies[id] = joined;
  const h = activeHero(root);
  if (h && fightingAllies(root, at).includes(joined)) {
    h.tally.allies++;
    setMsg(h, `${kind.icon} ${kind.a} joins the fight`, at);
  }
}

function leave(root, id) {
  delete root.allies[id];
  root.alliesGone.push(id);
  if (root.alliesGone.length > 20) {
    root.alliesGone.shift();
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
    h.tally.tokens += tokens;
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

// A hook event from inside a subagent, or about one starting or stopping (see applyAgentEvent).
function onAgentEvent(ev, at) {
  return update(at, 2000, root => {
    const worked = settle(root, at) > 0;
    applyAgentEvent(root, ev, at);
    checkAchievements(root, at, worked);
  }).root;
}

function applyHookEvent(root, ev, at) {
  const name = ev.hook_event_name;
  if (name === 'SessionEnd') {
    delete root.sessions[ev.session_id];
    for (const [id, a] of Object.entries(root.allies)) {
      if (a.session === ev.session_id) {
        leave(root, id);
      }
    }
    return;
  }
  const ss = session(root, ev.session_id, at);
  ingestTranscript(root, ss, ev.transcript_path, at);
  if (name === 'PreCompact') {
    makeCamp(activeHero(root), at);
  }
  if (name === 'UserPromptSubmit') {
    const h = activeHero(root);
    ss.turn = { start: at, end: null, tokens: 0, cls: root.active, xp0: h ? h.totalXp : 0 };
    if (isCompanionCommand(ev.prompt)) {
      ss.turn.cmd = true;
    }
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
    // Only the first Stop ends a turn, so a turn is never counted twice.
    if (ss.turn && !ss.turn.end && (name === 'Stop' || name === 'StopFailure')) {
      ss.turn.end = at;
      root.stats.longestTurn = Math.max(root.stats.longestTurn, at - ss.turn.start);
      countTurn(root.heroes[ss.turn.cls], ss.turn);
    }
  }
  debug(`hook ${name} active=${ss.active}`);
}

// The conversation is being compacted: the hero makes camp (see CAMP_DAMAGE). Only that it
// happens counts, never the instructions given to /compact.
function makeCamp(h, now) {
  if (!h) {
    return;
  }
  h.camp = { x: h.heroX };
  h.down = 0;
  h.life = maxLife(h);
  h.camped = CAMP_MS;
  h.resting = CAMP_REST;
  h.tally.camps++;
  news(h, `⛺ Camp while Claude compacts the conversation: full life, +${CAMP_DAMAGE * 100}% damage for ${restedText(CAMP_MS)}`, now);
}

// A /vwc: command is a turn too, but a few seconds of showing a list isn't work, so it would
// only ever be the shortest turn. The prompt is the typed command, or its expanded form.
function isCompanionCommand(prompt) {
  return typeof prompt === 'string'
    && (prompt.trimStart().startsWith(COMMAND_PREFIX) || prompt.includes(`<command-name>${COMMAND_PREFIX}`));
}

// Adds a finished turn to the hero it was played with (the one active when you sent the message).
function countTurn(h, turn) {
  if (!h || turn.cmd) {
    return;
  }
  const t = h.tally;
  const ms = turn.end - turn.start;
  t.turns++;
  t.turnMs += ms;
  t.turnTokens += turn.tokens;
  t.longestTurn = Math.max(t.longestTurn, ms);
  t.shortestTurn = t.shortestTurn == null ? ms : Math.min(t.shortestTurn, ms);
  t.mostTokens = Math.max(t.mostTokens, turn.tokens);
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
    noticeNightfall(root, now);
    noticeSeason(root, now);
    noticeUpdate(root, now);
    const h = activeHero(root);
    debug(`tick cols=${process.env.COLUMNS} active=${anyActive(root, now)} class=${root.active} step=${h ? h.step : '-'}`);
  }).root;
}

let manifestCache;

// The plugin's .claude-plugin/plugin.json, or {} if it can't be read.
function manifest() {
  if (manifestCache === undefined) {
    try {
      manifestCache = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.claude-plugin', 'plugin.json'), 'utf8'));
    } catch {
      manifestCache = {};
    }
  }
  return manifestCache;
}

function pluginVersion() {
  return manifest().version || null;
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
    record(h, `🆕 Updated to ${version}`, now);
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
  const skills = h.skills.length > 0 ? ` · ${h.skills.map(s => s.icon).join('')}` : '';
  return `${c.icon} ${c.name} Lv ${h.level} · ${weaponOf(h).icon} ${weaponOf(h).name}${skills} · ${h.kills} kills · ${whereText(h)}`;
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
  const what = `x${s.mult} ${s.area ? 'area ' : ''}damage every ${s.cd} s, +${s.bonus.pct}% ${BONUS_NAMES[s.bonus.kind]}`;
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
    'or replaces your weaker skill if its power is higher. Area skills hit the target and every',
    `enemy up to ${AREA} tiles behind it, for less damage each.`);
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
    lines.push(`${root.active === cls ? '▶' : ' '} ${c.icon} ${c.name} Lv ${h.level} · ${worn} of ${Object.keys(GEAR_SLOTS).length} slots · ${worn > 0 ? statsText(total) : 'no gear yet'} · 💗 ${maxLife(h)} life · 🔩 ${h.shards}/${nextReforge(h).cost} shards`);
    for (const [slot, g] of Object.entries(GEAR_SLOTS)) {
      const item = h.gear[slot];
      const what = item
        ? `${gearName(item).padEnd(25)} ${item.rarity.padEnd(10)}power ${String(gearPower(item)).padStart(2)}   ${statsText(item.stats)}`
        : '(empty)';
      lines.push(`    ${g.icon} ${g.name.padEnd(10)} ${what}`);
    }
    lines.push('');
  }
  if (lines.length === 0) {
    return `No heroes yet. Pick one with ${COMMAND_PREFIX}chooseclass.`;
  }
  const shards = RARITIES.map(r => `${r.shards} ${r.name}`).join(', ');
  lines.push(`Enemies sometimes drop gear, and bosses always do. A piece with more power than the one`,
    `worn in its slot is equipped; a weaker one is salvaged into 🔩 shards (${shards}).`,
    `Shards reforge your weakest piece: +1 to its biggest stat, and +1 on its name. A piece's first`,
    `reforge costs ${REFORGE_COST} shards, its second ${REFORGE_COST * 2}, its third ${REFORGE_COST * 3}, and so on.`);
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

// "1 group", "12 groups".
function plural(n, one, many = `${one}s`) {
  return `${shortNumber(n)} ${n === 1 ? one : many}`;
}

// How many were found, and how many of those were epic or legendary: "12 · 2 epic · 1 legendary".
function foundText(byRarity) {
  const total = Object.values(byRarity).reduce((a, b) => a + b, 0);
  const rare = ['epic', 'legendary'].filter(r => byRarity[r] > 0).map(r => `${byRarity[r]} ${r}`);
  return [shortNumber(total), ...rare].join(' · ');
}

// " · 355 an hour", once there are 10 minutes of work to go by.
function perHour(n, workSec) {
  return workSec >= 600 ? ` · ${shortNumber(Math.round((n * 3600) / workSec))} an hour` : '';
}

// One hero's lines for /vwc:statistics. Work time is the hero's steps, one per second of work.
function heroStatistics(h) {
  const t = h.tally;
  const since = t.countedFrom ? ` · since ${localDate(t.countedFrom)}` : '';
  const perTurn = t.turns > 0 ? ` · ${shortNumber(Math.round(t.turnTokens / t.turns))} a turn · most in one ${shortNumber(t.mostTokens)}` : '';
  const turns = t.turns > 0
    ? `${shortNumber(t.turns)} · longest ${formatDuration(t.longestTurn)} · shortest ${formatDuration(t.shortestTurn)} · average ${formatDuration(t.turnMs / t.turns)}`
    : 'none finished yet';
  const rows = [
    ['Work time', h.step > 0 ? formatDuration(h.step * 1000) : 'none yet'],
    ['Tokens', `${shortNumber(t.tokens)}${perTurn}${since}`],
    ['Turns', `${turns}${since}`],
    ['XP', `${shortNumber(h.totalXp)}${perHour(h.totalXp, h.step)}${t.restedXp > 0 ? ` · ${shortNumber(t.restedXp)} from rested kills` : ''}`],
    ['Kills', `${shortNumber(h.kills)} · ${plural(t.groups, 'group')} · ${plural(t.elites, 'elite')}${perHour(h.kills, h.step)}`],
    // A zone's boss must be beaten to leave it, so the zone is also how many zone bosses fell.
    ['Bosses', `${plural(zoneOf(h.heroX), 'zone boss', 'zone bosses')} · ${plural(t.minis, 'mini boss', 'mini bosses')} · ${plural(t.elders, 'Elder boss', 'Elder bosses')}`],
    ['Hits', `biggest ${shortNumber(t.maxHit)} · ${plural(t.skillCrits, 'critical skill hit')}`],
    ['Skills found', `${foundText(t.found)} · ${shortNumber(t.replaced)} replaced`],
    ['Gear found', `${foundText(t.gear)} · ${shortNumber(t.left)} salvaged · ${plural(t.forged, 'reforge')}`],
    ['Survival', `${plural(t.potions, 'potion')} drunk · ${plural(t.knockouts, 'knockout')} · ${plural(t.closeCalls, 'close call')}${t.candy > 0 ? ` · ${plural(t.candy, 'candy', 'candies')} eaten` : ''}${t.camps > 0 ? ` · ${plural(t.camps, 'camp')}` : ''}`],
    ['Allies', `${plural(t.allies, 'ally', 'allies')} joined · ${plural(t.allyKills, 'kill')} together`],
  ];
  return rows.map(([label, value]) => `    ${label.padEnd(14)}${value}`);
}

// /vwc:statistics: what every hero did, then the totals of all of them.
function statisticsReport(now) {
  const root = loadSaved(now);
  const lines = ['📊 Statistics'];
  for (const cls of Object.keys(CLASSES)) {
    const h = root.heroes[cls];
    if (!h) {
      continue;
    }
    const c = CLASSES[cls];
    const w = weaponOf(h);
    lines.push('', `${root.active === cls ? '▶' : ' '} ${c.icon} ${c.name} Lv ${h.level} · ${w.icon} ${w.name} · ${whereText(h)}`, ...heroStatistics(h));
  }
  if (lines.length === 1) {
    return `No heroes yet. Pick one with ${COMMAND_PREFIX}chooseclass.`;
  }
  // The totals include heroes replaced by /vwc:createchar; tokens and the longest turn are
  // counted for the whole save, even before any hero was picked.
  const f = achievementFacts(root, now, false);
  const all = [`${formatDuration((f.workSec || 0) * 1000)} of work`, `${shortNumber(root.stats.tokens)} tokens`, plural(f.kills || 0, 'kill')];
  if (f.turns > 0) {
    all.push(plural(f.turns, 'turn'));
  }
  if (root.stats.longestTurn > 0) {
    all.push(`longest turn ${formatDuration(root.stats.longestTurn)}`);
  }
  lines.push('', `All heroes · ${all.join(' · ')}`, '',
    'Work time counts only while Claude works. A turn runs from your message to Claude\'s answer;',
    `${COMMAND_PREFIX} commands and turns stopped with Esc don't count.`);
  if (Object.values(root.heroes).some(h => h.tally.countedFrom)) {
    lines.push('Heroes from before 1.10.0 count their tokens and turns from the day you updated.');
  }
  return lines.join('\n');
}

// /vwc:card: one hero (the active one, a class, or "all") as a short card to paste in a chat or a
// PR. It has no right border: emoji widths differ between apps, so a right edge would be jagged.
function cardReport(arg, now) {
  const root = loadSaved(now);
  const word = String(arg || '').trim().toLowerCase();
  const usage = `Usage: ${COMMAND_PREFIX}card, ${COMMAND_PREFIX}card <${Object.keys(CLASSES).join(' | ')}> or ${COMMAND_PREFIX}card all`;
  if (Object.keys(root.heroes).length === 0) {
    return `No heroes yet. Pick one with ${COMMAND_PREFIX}chooseclass.`;
  }
  let classes;
  if (!word) {
    classes = [root.active];
  } else if (word === 'all') {
    classes = Object.keys(CLASSES).filter(k => root.heroes[k]);
  } else if (classKey(word)) {
    classes = [classKey(word)];
  } else {
    return `"${arg.trim()}" is not a class. ${usage}`;
  }
  const missing = classes.find(k => !root.heroes[k]);
  if (missing) {
    return `No ${CLASSES[missing].icon} ${CLASSES[missing].name} yet. ${usage}`;
  }
  return classes.map(k => heroCard(root, root.heroes[k])).join('\n\n');
}

function heroCard(root, h) {
  const c = CLASSES[h.cls];
  const t = h.tally;
  const w = weaponOf(h);
  const title = `${c.icon} ${c.name} · Level ${h.level}`;
  const skills = h.skills.map(s => `${s.icon} ${s.name} (${s.rarity})`);
  const bosses = zoneOf(h.heroX) + t.minis + t.elders;
  const fights = [whereText(h), `💀 ${plural(h.kills, 'kill')}`, `🏆 ${plural(bosses, 'boss', 'bosses')}`];
  if (t.maxHit > 0) {
    fights.push(`💥 biggest hit ${shortNumber(t.maxHit)}`);
  }
  const worn = Object.values(h.gear);
  let gear = 'no gear yet';
  if (worn.length > 0) {
    const best = worn.reduce((a, b) => (gearPower(b) > gearPower(a) ? b : a));
    const total = {};
    for (const k of Object.keys(GEAR_STATS)) {
      if (gearBonus(h, k) > 0) {
        total[k] = gearBonus(h, k);
      }
    }
    gear = `${best.icon} ${gearName(best)} (${best.rarity}) · ${worn.length} of ${Object.keys(GEAR_SLOTS).length} gear slots · ${statsText(total)}`;
  }
  const work = [`⏳ ${formatDuration(h.step * 1000)} of work`];
  if (t.tokens > 0) {
    work.push(`${shortNumber(t.tokens)} tokens`);
  }
  work.push(`🏅 ${earnedCount(root)} of ${ACHIEVEMENTS.length} achievements`);
  const link = String(manifest().homepage || '').replace(/^https?:\/\//, '');
  const footer = ['VibeWorkCompanion', pluginVersion(), link && `· ${link}`].filter(Boolean).join(' ');
  const lines = [[`${w.icon} ${w.name}`, ...skills].join(' · '), fights.join(' · '), gear, work.join(' · ')];
  const width = Math.max(displayWidth(title), displayWidth(footer)) + 6;
  const rule = text => `─ ${text} ${'─'.repeat(Math.max(3, width - displayWidth(text)))}`;
  return [`╭${rule(title)}`, ...lines.map(l => `│ ${l}`), `╰${rule(footer)}`].join('\n');
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function localTime(at) {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// /vwc:journal: every hero's notable moments by day, oldest first, so the newest end up right
// above your prompt. A hero's moments from the same minute share a line. `arg` can name a class
// for that hero's moments only, and say "all" for everything kept instead of the last
// JOURNAL_SHOWN lines.
function journalReport(arg, now) {
  const root = loadSaved(now);
  if (Object.keys(root.heroes).length === 0) {
    return `No heroes yet. Pick one with ${COMMAND_PREFIX}chooseclass.`;
  }
  const usage = `Usage: ${COMMAND_PREFIX}journal, ${COMMAND_PREFIX}journal <${Object.keys(CLASSES).join(' | ')}>, ${COMMAND_PREFIX}journal all, or a class and all`;
  const words = String(arg || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  const unknown = words.find(w => w !== 'all' && !classKey(w));
  if (unknown) {
    return `"${unknown}" is not a class or "all". ${usage}`;
  }
  const all = words.includes('all');
  const only = words.map(classKey).find(Boolean) || null;
  if (only && !root.heroes[only]) {
    return `No ${CLASSES[only].icon} ${CLASSES[only].name} yet. ${usage}`;
  }
  const minute = at => `${localDate(at)} ${localTime(at)}`;
  const moments = [];
  for (const [cls, h] of Object.entries(root.heroes).filter(([cls]) => !only || cls === only)) {
    let last = null;
    for (const e of h.journal) {
      if (last && minute(last.at) === minute(e.at)) {
        last.texts.push(e.text);
      } else {
        last = { cls, at: e.at, texts: [e.text] };
        moments.push(last);
      }
    }
  }
  const what = 'Level ups, new weapons and biomes, bosses, skills, gear worn, epic and legendary gear salvaged,'
    + '\nreforges, knockouts, camps and achievements';
  const whose = only ? ` · ${CLASSES[only].icon} ${CLASSES[only].name}` : '';
  if (moments.length === 0) {
    return `📜 Journal${whose} · nothing written yet\n\n${what} are written down as they happen.`;
  }
  // A stable sort, so each hero's moments keep their order.
  moments.sort((a, b) => a.at - b.at);
  const shown = all ? moments : moments.slice(-JOURNAL_SHOWN);
  const count = shown.length < moments.length ? `the last ${shown.length} of ${moments.length} moments` : plural(moments.length, 'moment');
  const lines = [`📜 Journal${whose} · ${count}`];
  let day = null;
  for (const m of shown) {
    if (localDate(m.at) !== day) {
      day = localDate(m.at);
      lines.push('', `${WEEKDAYS[new Date(m.at).getDay()]} ${day}`);
    }
    lines.push(`  ${localTime(m.at)} ${CLASSES[m.cls].icon} ${m.texts.join(' · ')}`);
  }
  lines.push('', `${what} are written down as they happen. Each hero keeps its last ${JOURNAL_SIZE}.`);
  const tips = [];
  if (!only && Object.keys(root.heroes).length > 1) {
    tips.push(`${COMMAND_PREFIX}journal <class> shows one hero`);
  }
  if (shown.length < moments.length) {
    tips.push(`${COMMAND_PREFIX}journal ${only ? `${only} ` : ''}all shows all ${moments.length}`);
  }
  if (tips.length > 0) {
    lines.push(`${tips.join(', and ')}.`);
  }
  return lines.join('\n');
}

// ---------- display (cli.js: hide / show / stats / progress) ----------

const PARTS = { bar: 'status bar', companion: 'companion' };
const STATS_PLACES = ['above', 'below'];
const PROGRESS_ON = ['on', 'show'];
const PROGRESS_OFF = ['off', 'hide'];

function display(root) {
  return { bar: true, companion: true, stats: 'above', progress: true, ...(root.display || {}) };
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
    } else if (!d.progress) {
      text += ` It's hidden for now; ${COMMAND_PREFIX}showprogress on brings it back.`;
    }
  });
  return saved ? text : 'The save file is busy right now. Try again in a moment.';
}

// true for on, false for off, null for anything else (including nothing).
function progressKey(name) {
  const key = String(name || '').trim().split(/\s+/)[0].toLowerCase();
  return PROGRESS_ON.includes(key) ? true : PROGRESS_OFF.includes(key) ? false : null;
}

// Shows or hides the hero's progress (the stats row and the life bar), so the companion can be
// just the map. With no choice it switches. Only what's drawn changes.
function setProgress(visible, now) {
  let text = '';
  const { saved } = update(now, 3000, root => {
    const d = display(root);
    const to = visible === null ? !d.progress : visible;
    if (d.progress === to) {
      text = `The hero's progress is already ${to ? 'shown' : 'hidden'}.`;
    } else if (to) {
      text = 'The hero\'s progress (the stats row and the life bar) is shown again.';
    } else {
      text = 'The hero\'s progress (the stats row and the life bar) is hidden, so only the map is shown.'
        + ` Bring it back with ${COMMAND_PREFIX}showprogress on.`;
    }
    d.progress = to;
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

// How far through its zone the hero is, 0 to 99%. The zone's boss waits at 100%, the first tile
// of the next zone.
function zoneProgress(h) {
  return Math.floor(((h.heroX % ZONE_LENGTH) / ZONE_LENGTH) * 100);
}

// Where the hero is: the biome (with the loop's numeral) and how far through it, "🌼 Meadow 42%".
function whereText(h) {
  const zone = zoneOf(h.heroX);
  const b = biomeOf(zone);
  return `${b.icon} ${b.name}${cycleSuffix(zone)} ${zoneProgress(h)}%`;
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

// Bosses and elder bosses are the biome's boss; normal enemies and mini bosses one of its enemies,
// or at night its night creature too (marked `night`), and in season the season's enemy. `forced`
// picks the kind instead (a ghost wave's ghosts). `boss` marks every kind but normal, for the
// "Defeated" message.
function makeEnemy(x, zone, rank = 'normal', now = Date.now(), forced = null) {
  const b = biomeOf(zone);
  const r = RANKS[rank];
  const s = season(now);
  const bossy = rank === 'boss' || rank === 'elder';
  const seasonal = s && s.enemy && !b.hot && Math.random() < SEASON_ENEMY;
  const kind = forced || (bossy ? b.boss : seasonal ? s.enemy : pick(isNight(now) ? [...b.enemies, b.night] : b.enemies));
  const [icon, name, shot] = kind;
  const hp = Math.round(baseLife(zone) * r.hp * (rank === 'normal' ? 0.8 + Math.random() * 0.4 : 1));
  const xp = killXp(zone, randInt(0, zone)) * r.xp;
  const foe = { x, icon, name: r.prefix ? `${r.prefix} ${name}` : name, hp, max: hp, xp, boss: rank !== 'normal', ...enemyAttack(zone, rank) };
  if (shot) {
    foe.shot = shot;
  }
  if (kind === b.night) {
    foe.night = true;
  }
  if (s && kind === s.enemy) {
    foe.snowman = true;
  }
  if (rank === 'normal' && Math.random() < ELITE_CHANCE * (isNight(now) ? 2 : 1)) {
    makeElite(foe);
  }
  return foe;
}

function makeElite(foe) {
  const trait = pick(Object.keys(TRAITS));
  foe.trait = trait;
  foe.elite = true;
  foe.name = `${TRAITS[trait].name} ${foe.name}`;
  foe.hp = foe.max = Math.round(foe.max * ELITE.hp);
  foe.xp = Math.round(foe.xp * ELITE.xp);
}

// Deals `dmg` to `e`: less to an armored elite, and nothing if a swift one dodges. Returns the
// damage dealt, or null for a dodge.
function strike(e, dmg) {
  const t = TRAITS[e.trait];
  if (t && t.dodge && Math.random() < t.dodge) {
    return null;
  }
  const dealt = t && t.armor ? Math.max(1, Math.round(dmg * (1 - t.armor))) : dmg;
  e.hp -= dealt;
  return dealt;
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

function spawnAhead(h, now) {
  while (h.nextSpawnX <= h.heroX + VIEW_AHEAD) {
    const bossX = (h.bossZone + 1) * ZONE_LENGTH;
    if (h.nextSpawnX >= bossX - 3) {
      h.enemies.push(makeEnemy(bossX, h.bossZone, 'boss', now));
      h.bossZone++;
      h.nextSpawnX = bossX + randInt(6, 12);
    } else {
      // A group's enemies share `group` (where it spawned), so they fight together.
      const size = Math.min(groupSize(), bossX - 1 - h.nextSpawnX);
      const s = season(now);
      const wave = size > 1 && s && s.wave && Math.random() < GHOST_WAVE ? s.wave : null;
      for (let i = 0; i < size; i++) {
        const foe = makeEnemy(h.nextSpawnX + i, h.bossZone, 'normal', now, wave);
        if (size > 1) {
          foe.group = h.nextSpawnX;
          foe.hp = foe.max = Math.max(1, Math.round(foe.max * GROUP_MEMBER));
          foe.atk = Math.max(1, Math.round(foe.atk * GROUP_MEMBER));
          foe.xp = Math.max(1, Math.round(foe.xp * GROUP_MEMBER));
        }
        h.enemies.push(foe);
      }
      h.nextSpawnX += size - 1 + randInt(5, 12) + (size - 1) * GROUP_GAP;
    }
  }
}

function groupSize() {
  let r = Math.random();
  for (let i = 0; i < GROUP_SIZES.length; i++) {
    if (r < GROUP_SIZES[i]) {
      return i + 1;
    }
    r -= GROUP_SIZES[i];
  }
  return 1;
}

// The enemies that fight together with `foe`: its group, or just itself.
function groupOf(h, foe) {
  return foe.group == null ? [foe] : h.enemies.filter(e => e.group === foe.group);
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
  const foe = makeEnemy(x, zoneOf(x), rank, now);
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

// A lucky roll is rolled twice, keeping the rarer result.
function luckyRarity(lucky) {
  const rarity = rollRarity();
  if (!lucky) {
    return rarity;
  }
  const again = rollRarity();
  return RARITIES.indexOf(again) > RARITIES.indexOf(rarity) ? again : rarity;
}

// A random skill found at `level`: a special attack that hits for `mult` x damage every `cd`
// steps, plus a passive bonus to all damage or to the critical chance. Skills found later roll
// stronger, so they can replace old ones. A longer cooldown comes with a bigger multiplier.
// The form decides whether it's an area skill, which hits several enemies for less.
function rollSkill(cls, level, lucky) {
  const c = CLASSES[cls].skills;
  const [icon, first] = pick(c.parts);
  const form = pick([...c.forms, ...c.areaForms]);
  const area = c.areaForms.includes(form);
  const rarity = luckyRarity(lucky);
  const spread = () => 0.85 + Math.random() * 0.3;
  const cd = randInt(6, 16);
  const strength = (1 + 0.75 * Math.sqrt(level)) * rarity.power * c.power * spread();
  const mult = 1 + (strength * cd) / 10;
  return {
    icon,
    name: `${first} ${form}`,
    rarity: rarity.name,
    level,
    area,
    mult: area ? areaMult(mult) : Math.round(mult * 10) / 10,
    cd,
    bonus: { kind: Math.random() < 0.5 ? 'damage' : 'crit', pct: Math.round((2 + 1.2 * Math.sqrt(level)) * rarity.power * spread()) },
    readyAt: 0,
  };
}

// The multiplier of an area skill as strong as a single-target one with multiplier `mult`.
function areaMult(mult) {
  return Math.round((1 + (mult - 1) * AREA_MULT) * 10) / 10;
}

// One number to compare skills by: the extra damage the attack adds per step, plus the bonus.
// An area skill counts as the single-target skill it was rolled from: weaker on one enemy, but
// stronger on a group.
function skillPower(s) {
  return Math.round(((s.mult - 1) / (s.area ? AREA_MULT : 1) / s.cd + s.bonus.pct / 100) * 100);
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
    news(h, `🎁 ${found} replaces ${replaced.icon} ${replaced.name}`, now);
  } else if (kept) {
    news(h, `🎁 New skill: ${found}`, now);
  } else {
    news(h, `🎁 Found ${found}, weaker than your skills`, now);
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

// "Iron Grips", or "Iron Grips +2" once reforged twice.
function gearName(item) {
  return item.forged ? `${item.name} +${item.forged}` : item.name;
}

// A dropped piece is worn if it beats the piece in its slot (or the slot is empty). Otherwise it
// is salvaged into shards, leaving a 🔩 where it fell, and the old piece is kept.
function dropGear(h, x, lucky, now) {
  const item = rollGear(h.level, lucky);
  h.tally.gear[item.rarity]++;
  const found = `${item.icon} ${item.name} (${item.rarity})`;
  const old = h.gear[item.slot];
  if (gearPower(item) > gearPower(old)) {
    h.gear[item.slot] = item;
    news(h, `🎁 ${found} ${old ? `replaces ${gearName(old)}` : 'equipped'}`, now);
  } else {
    const shards = RARITIES.find(r => r.name === item.rarity).shards;
    h.tally.left++;
    h.shards += shards;
    h.loot.push({ x, icon: '🔩' });
    const text = `🎁 ${found} salvaged for 🔩 ${shards}, yours is better`;
    // Only the salvage of a rare find is worth a line in the journal.
    if (shards >= RARITIES[2].shards) {
      news(h, text, now);
    } else {
      setMsg(h, text, now);
    }
  }
  reforge(h, now);
}

// The weakest piece worn (of two as weak, the one reforged less), which the next reforge goes to,
// and the shards it costs. A hero without gear gets its first piece's price.
function nextReforge(h) {
  const worn = Object.values(h.gear);
  if (worn.length === 0) {
    return { piece: null, cost: REFORGE_COST };
  }
  const weaker = (a, b) => gearPower(a) - gearPower(b) || (a.forged || 0) - (b.forged || 0);
  const piece = worn.reduce((a, b) => (weaker(b, a) < 0 ? b : a));
  return { piece, cost: REFORGE_COST * ((piece.forged || 0) + 1) };
}

// Spends the shards on reforges while there are enough: +1 to the biggest stat of the weakest
// piece worn. `say` tells about it (news, or record for the journal alone).
function reforge(h, now, say = news) {
  const done = new Map();   // piece -> [stat, times reforged now]
  for (let next = nextReforge(h); next.piece && h.shards >= next.cost; next = nextReforge(h)) {
    const weakest = next.piece;
    const [kind] = Object.entries(weakest.stats).reduce((a, b) => (b[1] > a[1] ? b : a));
    weakest.stats[kind]++;
    weakest.forged = (weakest.forged || 0) + 1;
    h.shards -= next.cost;
    h.tally.forged++;
    done.set(weakest, [kind, (done.has(weakest) ? done.get(weakest)[1] : 0) + 1]);
  }
  if (done.size > 0) {
    const what = [...done].map(([g, [kind, n]]) => `${g.icon} ${gearName(g)} (+${n}% ${GEAR_STATS[kind]})`);
    say(h, `🔩 Reforged ${what.join(', ')}`, now);
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
    groups: t.groups,
    turns: t.turns,
    allies: t.allies,
    allyKills: t.allyKills,
    forged: t.forged,
    fullRests: t.fullRests,
    nightKills: t.nightKills,
    candy: t.candy,
    snowmen: t.snowmen,
    elites: t.elites,
    camps: t.camps,
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
    areaHits: best(h => h.tally.maxAreaHits),
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
    news(h, `🏅 ${earned.length > 1 ? 'Achievements' : 'Achievement'}: ${earned.map(a => a.name).join(', ')}`, now);
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

// Writes a moment in the hero's journal (/vwc:journal), which keeps the last JOURNAL_SIZE.
function record(h, text, now) {
  h.journal.push({ at: now, text });
  if (h.journal.length > JOURNAL_SIZE) {
    h.journal.splice(0, h.journal.length - JOURNAL_SIZE);
  }
}

// A message worth keeping: shown on the stats row and written in the journal.
function news(h, text, now) {
  setMsg(h, text, now);
  record(h, text, now);
}

// Returns the XP gained, with the gear's XP bonus.
function gainXp(h, xp, now) {
  if (xp <= 0) {
    return 0;
  }
  const c = CLASSES[h.cls];
  xp = Math.round(xp * (1 + gearBonus(h, 'xp') / 100));
  h.xp += xp;
  h.totalXp += xp;
  const before = h.level;
  while (h.xp >= xpNeed(h.level)) {
    h.xp -= xpNeed(h.level);
    h.level++;
    news(h, `🎉 Level ${h.level}!`, now);
    const w = c.weapons.find(x => x.lvl === h.level);
    if (w) {
      news(h, `New weapon: ${w.icon} ${w.name}`, now);
    }
    if (h.level % 5 === 0) {
      summon(h, h.level % 10 === 0 ? 'elder' : 'mini', now);
    }
  }
  // A level up restores all life, but doesn't wake a knocked out hero.
  if (h.level > before && !h.down) {
    h.life = maxLife(h);
  }
  return xp;
}

// The nearest enemy within the class's range, which the hero is fighting.
function targetOf(h) {
  return h.enemies.find(e => e.x > h.heroX && e.x <= h.heroX + CLASSES[h.cls].range);
}

// The nearest enemy ahead. Only it and its group close in and attack, so fights stay one at a time.
function frontOf(h) {
  return h.enemies.find(e => e.x > h.heroX);
}

// How close an enemy must be to attack: next to the hero, or SHOT_RANGE tiles for one that shoots.
function reachOf(foe) {
  return foe.shot ? SHOT_RANGE : 1;
}

// One second of work: the hero walks, or attacks the nearest enemy within its range (and its
// `allies` with it); then the nearest enemy closes in or strikes back. Out of combat, life comes
// back. A knocked out hero only rests, and so does one sitting by its camp's fire. Every step
// spends a second of rested XP and of a camp's buff.
function step(h, now, allies = []) {
  h.step++;
  spawnAhead(h, now);
  if (h.down > 0) {
    h.down--;
    if (h.down === 0) {
      h.life = maxLife(h);
      setMsg(h, `💪 Back on your feet, +${Math.round(h.rally * RALLY * 100)}% damage until the next win`, now);
    }
  } else if (h.resting > 0) {
    h.resting--;
  } else {
    const attacked = heroTurn(h, now, allies.length > 0);
    if (attacked && allies.length > 0) {
      allyTurn(h, allies, now);
    }
    const fought = enemyTurn(h, now) || attacked;
    if (!fought) {
      h.life = Math.min(maxLife(h), h.life + Math.ceil(maxLife(h) * REGEN));
    }
  }
  h.rested = Math.max(0, h.rested - STEP_MS);
  h.camped = Math.max(0, h.camped - STEP_MS);
}

// The hero's half of a step. Returns whether it attacked. `allied`: an ally is at its side.
function heroTurn(h, now, allied) {
  const c = CLASSES[h.cls];
  const foe = targetOf(h);
  if (!foe) {
    h.heroX++;
    if (h.heroX % ZONE_LENGTH === 0) {
      const b = biomeOf(zoneOf(h.heroX));
      news(h, `Entered ${b.icon} ${b.name}${cycleSuffix(zoneOf(h.heroX))}`, now);
    }
    h.enemies = h.enemies.filter(e => e.x > h.heroX - 10);
    h.loot = h.loot.filter(l => l.x > h.heroX - 10);
    const candy = h.loot.find(l => l.candy && l.x === h.heroX);
    if (candy) {
      h.loot.splice(h.loot.indexOf(candy), 1);
      const before = h.life;
      h.life = Math.min(maxLife(h), h.life + Math.round(maxLife(h) * CANDY_HEAL));
      h.healed = { step: h.step, amount: h.life - before };
      h.tally.candy++;
    }
    return false;
  }

  let dmg = basicHit(h) * (1 + RALLY * h.rally);
  let icon = c.hit;
  // The ready skill adding the most damage fires instead of a basic attack; an area skill counts
  // its damage once for every enemy it would hit.
  const inArea = h.enemies.filter(e => e.x >= foe.x && e.x <= foe.x + AREA);
  const worth = sk => (sk.mult - 1) * (sk.area ? inArea.length : 1);
  const ready = h.skills.filter(sk => sk.readyAt <= h.step).sort((a, b) => worth(b) - worth(a))[0];
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
  const hit = ready && ready.area ? inArea : [foe];
  const dealt = hit.map(e => strike(e, dmg));
  const onTarget = dealt[hit.indexOf(foe)];
  if (ready && ready.area) {
    h.tally.maxAreaHits = Math.max(h.tally.maxAreaHits, hit.length);
  }
  // A basic attack or a single-target skill travels across the gap one tile per step, so ranged
  // shots visibly fly; an area skill lands on every enemy it hits.
  const gap = foe.x - h.heroX - 1;
  h.fx = { icon, x: h.heroX + 1 + (h.step % Math.max(1, gap)), step: h.step, dmg: onTarget || 0, miss: onTarget === null, crit, count: dealt.filter(d => d !== null).length };
  if (ready && ready.area) {
    h.fx.hits = hit.map(e => e.x);
  }
  const dead = hit.filter(e => e.hp <= 0);
  if (dead.length > 0) {
    if (!h.fx.hits) {
      h.fx = { icon: '✨', x: foe.x, step: h.step };
    }
    if (h.life < maxLife(h) * 0.1) {
      h.tally.closeCalls++;
    }
    for (const e of dead) {
      defeat(h, e, now, allied);
    }
  }
  return true;
}

// The damage of a basic hit, before rally, skills and critical hits, with a camp's extra damage.
function basicHit(h) {
  const camp = h.camped > 0 ? 1 + CAMP_DAMAGE : 1;
  return attackOf(h) * (1 + (skillBonus(h, 'damage') + gearBonus(h, 'damage')) / 100) * camp;
}

// After the hero's attack, each ally strikes the hero's target (the next one in range if that one
// fell) for ALLY_DAMAGE of the hero's basic hit. Their shots fly like the hero's, a tile apart.
function allyTurn(h, allies, now) {
  const dmg = Math.max(1, Math.round(basicHit(h) * ALLY_DAMAGE));
  const shots = [];
  allies.forEach((a, i) => {
    const foe = targetOf(h);
    if (!foe) {
      return;
    }
    strike(foe, dmg);
    const gap = foe.x - h.heroX - 1;
    shots.push({ icon: a.hit, x: h.heroX + 1 + ((h.step + 1 + i) % Math.max(1, gap)) });
    if (foe.hp <= 0) {
      if (h.life < maxLife(h) * 0.1) {
        h.tally.closeCalls++;
      }
      defeat(h, foe, now, true);
    }
  });
  h.allyFx = { step: h.step, list: shots };
}

function defeat(h, foe, now, allied = false) {
  h.kills++;
  if (allied) {
    h.tally.allyKills++;
  }
  if (foe.night) {
    h.tally.nightKills++;
  }
  if (foe.snowman) {
    h.tally.snowmen++;
  }
  const s = season(now);
  if (s && s.candy && Math.random() < CANDY_DROP) {
    h.loot.push({ x: foe.x, icon: '🍬', candy: true });
  }
  h.enemies = h.enemies.filter(e => e !== foe);
  h.rally = 0;
  if (foe.group != null && !h.enemies.some(e => e.group === foe.group)) {
    h.tally.groups++;
  }
  if (foe.boss) {
    news(h, `🏆 Defeated ${foe.icon} ${foe.name}!`, now);
  }
  if (foe.drop) {
    h.tally[foe.drop % 10 === 0 ? 'elders' : 'minis']++;
    dropSkill(h, foe.drop, now);
  }
  if (foe.elite) {
    h.tally.elites++;
  }
  // An explosive elite's blast hurts but can't knock the hero out.
  const t = TRAITS[foe.trait];
  if (t && t.blast) {
    const blast = Math.round(maxLife(h) * t.blast);
    h.life = Math.max(1, h.life - blast);
    h.hurt = { step: h.step, dmg: blast };
    h.fx = { icon: '💥', x: foe.x, step: h.step };
  }
  if (foe.boss || Math.random() < (foe.elite ? ELITE.gear : GEAR_DROP)) {
    dropGear(h, foe.x, foe.boss || foe.elite, now);
  }
  if (h.potions < MAX_POTIONS && (foe.boss || Math.random() < POTION_DROP * (foe.elite ? ELITE.potion : 1))) {
    h.potions++;
  }
  gainXp(h, foe.xp, now);
  if (h.rested > 0) {
    h.tally.restedXp += gainXp(h, foe.xp * RESTED_XP, now);
  }
}

// The enemy's half of a step: the nearest enemy ahead, with the rest of its group, notices the
// hero within AGGRO tiles. Each one closes in a tile per step (never onto another enemy) until
// the hero is within its reach, then attacks every `every` steps. Returns whether the hero is
// in a fight.
function enemyTurn(h, now) {
  const front = frontOf(h);
  if (!front || front.x - h.heroX > AGGRO) {
    return false;
  }
  // Front to back, so each one moves into the tile the one ahead just left.
  const group = groupOf(h, front);
  let fighting = false;
  let taken = 0;
  const shots = [];
  for (const foe of group) {
    const d = foe.x - h.heroX;
    if (d > reachOf(foe)) {
      if (!h.enemies.some(e => e.x === foe.x - 1)) {
        foe.x--;
      }
      continue;
    }
    fighting = true;
    if (h.step % foe.every !== 0) {
      continue;
    }
    const dealt = Math.max(1, Math.round(foe.atk * (0.85 + Math.random() * 0.3)));
    taken += dealt;
    const t = TRAITS[foe.trait];
    if (t && t.drain) {
      foe.hp = Math.min(foe.max, foe.hp + Math.round(dealt * t.drain));
    }
    // A shot travels toward the hero one tile per step, like the hero's own.
    if (foe.shot) {
      shots.push({ icon: foe.shot, x: foe.x - 1 - (h.step % Math.max(1, d - 1)) });
    }
  }
  if (taken === 0) {
    return fighting;
  }
  h.life -= taken;
  h.hurt = { step: h.step, dmg: taken };
  h.shots = { step: h.step, list: shots };
  if (h.life <= 0) {
    knockOut(h, group, now);
  } else if (h.life < maxLife(h) * POTION_AT && h.potions > 0) {
    h.potions--;
    h.tally.potions++;
    h.life = Math.min(maxLife(h), h.life + Math.round(maxLife(h) * POTION_HEAL));
    setMsg(h, `🧪 Drank a potion`, now);
  }
  return true;
}

// The hero rests for KO_STEPS while the enemies it fought heal, then gets up stronger (see step).
function knockOut(h, group, now) {
  h.life = 0;
  h.down = KO_STEPS;
  h.rally++;
  h.tally.knockouts++;
  for (const foe of group) {
    foe.hp = foe.max;
  }
  const more = group.length > 1 ? ` and ${group.length - 1} more` : '';
  news(h, `😵 Knocked out by ${group[0].icon} ${group[0].name}${more}! Resting for ${KO_STEPS} s`, now);
}

// ---------- day and night ----------

// The hour of the day at `now`, local time, as a number: 20.5 is 20:30.
function hourOf(now) {
  const d = new Date(now);
  return d.getHours() + d.getMinutes() / 60;
}

function isNight(now) {
  const hour = hourOf(now);
  return hour >= NIGHT_FROM || hour < NIGHT_TO;
}

// How bright it is: 1 by day, NIGHT_LIGHT at night, and in between during the hour of dusk
// (before NIGHT_FROM) and of dawn (after NIGHT_TO).
function daylight(now) {
  const hour = hourOf(now);
  let dark = 0;
  if (isNight(now)) {
    dark = 1;
  } else if (hour >= NIGHT_FROM - 1) {
    dark = hour - (NIGHT_FROM - 1);
  } else if (hour < NIGHT_TO + 1) {
    dark = NIGHT_TO + 1 - hour;
  }
  return 1 - dark * (1 - NIGHT_LIGHT);
}

// A floor color ('48;2;R;G;B' or '38;2;R;G;B') at `light`: darker, and bluer as it gets dark.
function shade(code, light) {
  if (light >= 1) {
    return code;
  }
  const [kind, mode, r, g, b] = code.split(';').map(Number);
  const blue = 1 + (1 - light) * 0.5;
  return [kind, mode, Math.round(r * light), Math.round(g * light), Math.min(255, Math.round(b * light * blue))].join(';');
}

// Says so on the stats row when night falls or the day breaks (not on a save's first tick).
function noticeNightfall(root, now) {
  const night = isNight(now);
  const h = activeHero(root);
  if (h && root.night != null && root.night !== night) {
    const b = biomeOf(zoneOf(h.heroX));
    setMsg(h, night ? `🌙 Night falls, and creatures of the night come out: ${b.night[0]} ${b.night[1]}` : '🌅 The day breaks', now);
  }
  root.night = night;
}

// ---------- seasons ----------

// The seasonal event at `now` (local time), or null.
function season(now) {
  return SEASONS[new Date(now).getMonth()] || null;
}

// A season's first tick with a hero says so on the stats row and in the journal, once a year.
function noticeSeason(root, now) {
  const s = season(now);
  const key = s ? `${s.name} ${new Date(now).getFullYear()}` : null;
  const h = activeHero(root);
  if (key && !h) {
    return;
  }
  if (key && root.season !== key) {
    news(h, s.news, now);
  }
  root.season = key;
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
// The ones below U+1F000: ⚡ ✨ ⏳ ⭐ ✅ ⬜ ⛄ ⚪ ⛺.
const WIDE_BELOW_1F000 = new Set([0x26a1, 0x2728, 0x23f3, 0x2b50, 0x2705, 0x2b1c, 0x26c4, 0x26aa, 0x26fa]);

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

// Each loop through the biomes gets a Roman numeral: Meadow, Meadow II, ... Meadow XIV, ...
function cycleSuffix(zone) {
  const cycle = Math.floor(zone / BIOMES.length) + 1;
  return cycle === 1 ? '' : ` ${roman(cycle)}`;
}

function roman(n) {
  const numerals = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [value, letters] of numerals) {
    while (n >= value) {
      out += letters;
      n -= value;
    }
  }
  return out;
}

function scenery(x, now) {
  if (x < 0) {
    return '  ';
  }
  const h = hash(x);
  if (h % 7 === 0) {
    const b = biomeOf(zoneOf(x));
    const s = season(now);
    if (s && (h >>> 16) % 3 === 0) {
      return s.decor;
    }
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

// The enemy being fought (the one in the hero's range, or one shooting from beyond it) with "+N"
// for the rest of its group, its life, and while working the damage of the hit that just landed
// (with "!" on a critical hit and "x3" when an area skill hit three). Null while walking.
function targetText(h, active) {
  const front = frontOf(h);
  const foe = targetOf(h) || (front && groupOf(h, front).find(e => e.x - h.heroX <= reachOf(e)));
  if (!foe) {
    return null;
  }
  const others = groupOf(h, foe).length - 1;
  const filled = Math.max(1, Math.ceil((foe.hp / foe.max) * 10));
  const life = color(ENEMY_RED, '▰'.repeat(filled) + '▱'.repeat(10 - filled));
  // Padded so the row doesn't shift by a column as the number shrinks.
  const hp = String(foe.hp).padStart(String(foe.max).length);
  const fx = active && h.fx && h.fx.step === h.step && (h.fx.dmg || h.fx.miss) ? h.fx : null;
  const hit = !fx ? '' : fx.miss ? ` ${color('2', 'miss')}`
    : ` ${color(ENEMY_RED, `-${fx.dmg}${fx.crit ? '!' : ''}${fx.count > 1 ? ` x${fx.count}` : ''}`)}`;
  const name = foe.elite ? color(GOLD, foe.name) : foe.name;
  return `${foe.icon} ${name}${others > 0 ? ` +${others}` : ''} ${life} ${hp}/${foe.max}${hit}`;
}

function statsRow(root, h, now, active, cols) {
  const c = CLASSES[h.cls];
  const need = xpNeed(h.level);
  const filled = Math.min(10, Math.floor((h.xp / need) * 10));
  const bar = '▰'.repeat(filled) + '▱'.repeat(10 - filled);
  const w = weaponOf(h);
  const skills = h.skills.map(s => s.icon).join('');
  const b = biomeOf(zoneOf(h.heroX));

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
    [color(b.color, whereText(h)) + (isNight(now) ? ' 🌙' : '') + (season(now) ? ` ${season(now).icon}` : ''), 3],
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
// shows the damage of the hit just taken; then a knockout's rest, the potions held, the extra
// damage a knockout gave, what's left of a camp's extra damage, the rested XP left (filling up
// during a break) and the shards toward the next reforge, dropped from the end while the row is
// wider than `room`.
function lifeRow(h, active, room, now) {
  const max = maxLife(h);
  const life = Math.max(0, Math.min(h.life, max));
  const filled = life > 0 ? Math.max(1, Math.ceil((life / max) * 10)) : 0;
  const tint = life > max / 2 ? LIFE_GREEN : life > max / 4 ? GOLD : ENEMY_RED;
  // Padded so the row doesn't shift by a column as the number changes.
  let text = `💗 ${color(tint, '▰'.repeat(filled) + '▱'.repeat(10 - filled))} ${String(life).padStart(String(max).length)}/${max}`;
  if (active && h.hurt && h.hurt.step === h.step) {
    text += ` ${color(ENEMY_RED, `-${h.hurt.dmg}`)}`;
  }
  if (active && h.healed && h.healed.step === h.step && h.healed.amount > 0) {
    text += ` ${color(LIFE_GREEN, `+${h.healed.amount}`)}`;
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
  if (h.camped > 0) {
    parts.push(color(GOLD, `⛺ +${CAMP_DAMAGE * 100}% damage ${restedText(h.camped)}`));
  }
  const rested = active ? h.rested : restedPool(h, now);
  if (rested > 0) {
    parts.push(color(RESTED_PURPLE, `💤 +${RESTED_XP * 100}% XP ${restedText(rested)}`));
  }
  if (h.shards > 0) {
    parts.push(`🔩 ${h.shards}/${nextReforge(h).cost}`);
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

// Allies walk right behind the hero, the first to arrive closest.
function worldRow(h, active, cols, allies, now) {
  const tiles = worldTiles(cols);
  let row = '';
  for (let i = 0; i < tiles; i++) {
    const x = h.heroX - HERO_COL + i;
    const foe = h.enemies.find(e => e.x === x);
    const fx = active && h.fx && h.fx.step === h.step ? h.fx : null;
    const shot = active && h.shots && h.shots.step === h.step ? h.shots.list.find(s => s.x === x) : null;
    const allyShot = active && h.allyFx && h.allyFx.step === h.step ? h.allyFx.list.find(s => s.x === x) : null;
    const ally = allies[h.heroX - 1 - x];
    if (x === h.heroX) {
      row += h.down > 0 ? '😵' : CLASSES[h.cls].icon;
    } else if (fx && fx.hits && fx.hits.includes(x)) {
      row += fx.icon;
    } else if (foe) {
      row += foe.icon;
    } else if (!active && x === h.heroX + 1) {
      row += '💤';
    } else if (fx && !fx.hits && fx.x === x) {
      row += fx.icon;
    } else if (shot) {
      row += shot.icon;
    } else if (allyShot) {
      row += allyShot.icon;
    } else if (ally) {
      row += ally.icon;
    } else if (h.camp && x === h.camp.x - 1) {
      row += '⛺';
    } else if (h.camp && x === h.camp.x - 2) {
      row += '🔥';
    } else if (h.loot.some(l => l.x === x)) {
      row += h.loot.find(l => l.x === x).icon;
    } else {
      row += scenery(x, now);
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
// so the next biome's floor scrolls into view before the hero reaches it. It darkens at night.
function floorRow(heroX, cols, now) {
  const light = daylight(now);
  const s = season(now);
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
    const b = biomeOf(zoneOf(x));
    const f = s && s.snow && !b.hot ? { ...b.floor, ...s.snow } : b.floor;
    const code = `${shade(f.bg, light)};${shade(f.fg, light)}`;
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
function pickerRows(cols, now) {
  const keys = Object.keys(CLASSES);
  const title = color(GOLD, `🎭 Choose your hero: ${COMMAND_PREFIX}chooseclass ${keys.join(' | ')}`);
  let world = '';
  for (let i = 0; i < worldTiles(cols); i++) {
    const at = [HERO_COL, HERO_COL + 3, HERO_COL + 6].indexOf(i);
    world += at >= 0 ? CLASSES[keys[at]].icon : scenery(i, now);
  }
  return [title, world, floorRow(HERO_COL, cols, now)];
}

function render(root, now, cols) {
  const h = activeHero(root);
  const show = display(root);
  let text = [];
  let map;
  if (!h) {
    // The picker keeps its title even with /vwc:showprogress off: it says how to start.
    [text, ...map] = pickerRows(cols, now).map(row => alignRight(row, cols));
    text = [text];
  } else {
    const active = anyActive(root, now);
    // /vwc:showprogress off leaves only the map.
    if (show.progress) {
      const stats = statsRow(root, h, now, active, cols);
      // The life bar sits right under the XP bar, which follows "<icon> <class> Lv <level> " in the
      // right-aligned stats row; if the life row still doesn't fit there, it ends at the right edge.
      const c = CLASSES[h.cls];
      const xpCol = cols - displayWidth(stats) + displayWidth(`${c.icon} ${c.name} Lv ${h.level} `);
      const at = Math.max(0, xpCol - displayWidth('💗 '));
      const life = lifeRow(h, active, cols - at, now);
      const lifeCol = Math.min(at, Math.max(0, cols - displayWidth(life)));
      text = [alignRight(stats, cols), RESET + ' '.repeat(lifeCol) + life];
    }
    map = [worldRow(h, active, cols, fightingAllies(root, now), now), floorRow(h.heroX, cols, now)].map(row => alignRight(row, cols));
  }
  // /vwc:stats below moves the text rows (stats and life, or the picker's title) under the map.
  return show.stats === 'below' ? [...map, ...text] : [...text, ...map];
}

module.exports = {
  DIR, COMMAND_PREFIX, CLASSES, classKey, chooseClass, createCharacter, status,
  display, partKey, setVisible, placeKey, setStatsPlace, progressKey, setProgress, load, loadSaved,
  pluginVersion, skillsReport,
  gearReport, achievementsReport, statisticsReport, journalReport, cardReport, earnedCount, ACHIEVEMENTS,
  onHookEvent, onAgentEvent, onStatusLine, render, displayWidth,
  newRoot, newHero, migrate, step, xpNeed, attackOf, weaponOf, rollSkill, skillPower, learnSkill,
  rollGear, gearPower, gearBonus, gainXp, checkAchievements, achievementFacts, maxLife,
  makeEnemy, isNight, daylight, season, TRAITS,
};
