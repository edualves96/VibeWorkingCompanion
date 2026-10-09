'use strict';
// The second game: a survivor patrols a strip around a shelter, fighting zombies, while the
// shelter's turrets guard it. Switch with /vwc:game; /vwc:shelter shows the inside.
//
// The survivor is an ordinary man. He has to find blueprints to build, craft and cook anything
// beyond nailing boards together, and he learns skills by doing. Between the waves he explores
// what he finds: abandoned buildings, lakes, lost shelters and bunkers, at his own risk. From inside the shelter he sets up
// defenses along the approach (barricades, traps, spikes), each from a blueprint he has found. He
// also sizes up every fight: what the zombies in sight can do to him against what his weapon, his
// bullets, his clothes and the turrets can do to them, and falls back to the shelter when he
// would lose. Like the adventure it needs no
// input: it moves one step per second of work, and only while it is the game on display.
//
// It has its own save (survival.json) and is chosen by a small `game` file, so it never touches
// the heroes' save. Companion.js passes in the helpers it needs.

const fs = require('fs');
const path = require('path');

const DIR = process.env.COMPANION_DIR || process.env.CLAUDE_PLUGIN_DATA || __dirname;
const SAVE_FILE = path.join(DIR, 'survival.json');
const GAME_FILE = path.join(DIR, 'game');

const STEP_MS = 1000;
const MAX_GAP_MS = 30000;    // longer gaps mean sleep or a closed CLI, not work
const MSG_MS = 10000;

const RADIUS = 10;           // the strip runs from -10 to +10 tiles around the shelter at 0
const WALL = 2;              // zombies stop this far from the shelter and attack its walls
const SIGHT = 8;
const TURRET_RANGE = 6;
const TURRET_SLOTS = [1, -1, 3, -3, 5, -5];   // where the turrets stand, in the order they are built
const HERO_LIFE = [60, 8];   // 60 + 8 x shelter level
const HERO_REGEN_EVERY = 3;
const DOWN_STEPS = 10;
const REBUILD_STEPS = 12;
const GRACE_STEPS = 300;
const REPAIR_EACH = 2;      // wall life mended every step, while nothing is at the wall
const CRATE_EVERY = 16;
const MAX_CRATES = 3;
const DROPS = { wood: 0.2, cloth: 0.12, food: 0.1, gear: 0.012 };   // what a dead zombie may drop
const CRATE_KINDS = [['scrap', 0.35], ['wood', 0.3], ['cloth', 0.17], ['food', 0.18]];
const MAX_MEALS = 5;
const RISK = 0.7;            // he takes a fight only if it should cost him less than 70% of his life
const HOLE_MAX = 40;         // after this long holed up with the zombies still there, he goes out anyway
const SITE_EVERY = 80;       // a place worth exploring turns up every so often, two at a time at most
const HORDE_EVERY = 150;     // and from wave 3 a group of zombies may come all at once
const RETREAT = [0.2, 0.45];   // under 20% life he goes home to rest, until he is back over 45%

// The survivor can nail boards together for the walls, but he has to find a blueprint before he
// can build, craft or cook anything else. They turn up in crates, once their `after` is true,
// with a `chance` for each crate that appears (see pickBlueprint).
const BLUEPRINTS = {
  turret: { icon: '🗼', name: 'Turrets', chance: 0.04, after: () => true },
  sewing: { icon: '🧵', name: 'Sewing', chance: 0.03, after: sv => sv.turrets >= 1 },
  cooking: { icon: '🍳', name: 'Cooking', chance: 0.03, after: sv => sv.shelter.level >= 2 },
  axe: { icon: '🪓', name: 'Axe', chance: 0.02, after: sv => sv.turrets >= 1 && sv.shelter.level >= 2 },
  pistol: { icon: '🔫', name: 'Pistol', chance: 0.015, after: sv => sv.weapon >= 1 },
  ammo: { icon: '🧨', name: 'Bullets', chance: 0.02, after: sv => sv.blueprints.includes('pistol') },
  leather: { icon: '🧥', name: 'Leather', chance: 0.02, after: sv => sv.blueprints.includes('sewing') && sv.shelter.level >= 4 },
  heavy: { icon: '🧰', name: 'Heavy turrets', chance: 0.015, after: sv => sv.turrets >= 3 && sv.shelter.level >= 6 },
  barricade: { icon: '🚧', name: 'Barricades', chance: 0.03, after: sv => sv.turrets >= 1 && sv.shelter.level >= 2 },
  trap: { icon: '🪤', name: 'Traps', chance: 0.025, after: sv => sv.shelter.level >= 3 },
  spikes: { icon: '📌', name: 'Spikes', chance: 0.02, after: sv => sv.blueprints.includes('barricade') && sv.shelter.level >= 4 },
  rifle: { icon: '🔭', name: 'Rifle', chance: 0.012, after: sv => sv.weapon >= 2 },
  kevlar: { icon: '🦺', name: 'Kevlar', chance: 0.012, after: sv => sv.blueprints.includes('leather') && sv.shelter.level >= 8 },
  // The endgame: vehicles, found only once the shelter is well established and the rifle is in hand.
  tank: { icon: '🚜', name: 'Tank', chance: 0.006, after: sv => sv.weapon >= 3 && sv.shelter.level >= 12 },
  helicopter: { icon: '🚁', name: 'Helicopter', chance: 0.004, after: sv => sv.weapon >= 4 && sv.shelter.level >= 18 },
};

// The ladder grows one rung at a time. Each weapon needs its own blueprint, and a gun also needs
// bullets (`rounds` of them a shot). A vehicle is the endgame: it hits the zombies around its
// target too (`splash` tiles, for half damage), and he rides it on the map. The survivor crafts the next one at the
// shelter once he has the level and the scrap.
const WEAPONS = [
  { name: 'Fists', icon: '👊', damage: 4, range: 1, level: 1, cost: 0, blueprint: null },
  { name: 'Axe', icon: '🪓', damage: 10, range: 1, level: 3, cost: 80, blueprint: 'axe' },
  { name: 'Pistol', icon: '🔫', damage: 13, range: 4, level: 5, cost: 160, blueprint: 'pistol', ammo: true },
  { name: 'Rifle', icon: '🔭', damage: 26, range: 6, level: 9, cost: 400, blueprint: 'rifle', ammo: true },
  { name: 'Tank', icon: '🚜', damage: 70, range: 8, level: 14, cost: 2500, blueprint: 'tank', ammo: true, rounds: 3, splash: 1, vehicle: true },
  { name: 'Helicopter', icon: '🚁', damage: 130, range: 10, level: 20, cost: 8000, blueprint: 'helicopter', ammo: true, rounds: 5, splash: 2, vehicle: true },
];

// What he wears. Each slot keeps the best piece he has found or crafted, and anything better
// replaces it on its own. The tiers are the kinds of cloth; the blueprint decides which he can craft
// (Tactical gear can only be found).
const GEAR_SLOTS = [
  { key: 'head', icon: '🪖', name: 'Helmet' },
  { key: 'body', icon: '🦺', name: 'Vest' },
  { key: 'hands', icon: '🧤', name: 'Gloves' },
  { key: 'feet', icon: '🥾', name: 'Boots' },
];
const GEAR_TIERS = ['Rags', 'Cloth', 'Leather', 'Kevlar', 'Tactical'];
const CRAFTABLE = [['kevlar', 3], ['leather', 2], ['sewing', 1]];   // blueprint, tier it unlocks
const ARMOR_SCALE = 240;     // protection = power / (power + 240), at most half
const ARMOR_MAX = 0.5;

// Defenses along the approach, set up from inside the shelter once he knows how. Each slot has one
// kind: barricades close in (zombies stop to chew through them, under the turrets' fire), traps
// further out (a zombie is caught and held, the trap used up; set for hunting, they also catch
// game now and then) and spikes beyond (every zombie that walks over them is hurt). The slots
// open with the shelter's level.
const DEFENSE_SLOTS = [
  { x: 4, type: 'barricade' }, { x: -4, type: 'barricade' }, { x: 6, type: 'trap' }, { x: -6, type: 'trap' },
  { x: 7, type: 'spikes' }, { x: -7, type: 'spikes' },
];
const DEFENSES = {
  barricade: { icon: '🚧', name: 'barricade', scrap: 5, wood: 15, cloth: 0 },
  trap: { icon: '🪤', name: 'trap', scrap: 12, wood: 0, cloth: 2 },
  spikes: { icon: '📌', name: 'spikes', scrap: 10, wood: 8, cloth: 0 },
};
const SPIKE_USES = 40;
const DEFENSE_COOLDOWN = 90;   // steps he waits after setting one up before the next, so he is not forever at it
const GAME_CHANCE = 0.004;   // a standing trap catches game now and then, for food

const ZOMBIES = {
  walker: { icon: '🧟', hp: 10, dmg: 2, every: 2, scrap: 1 },
  brute: { icon: '👹', hp: 32, dmg: 5, every: 3, scrap: 4 },
  runner: { icon: '🐺', hp: 6, dmg: 2, every: 1, scrap: 1 },
  spitter: { icon: '🦠', hp: 14, dmg: 3, every: 2, scrap: 3, reach: 3 },   // spits at the walls from a distance
  boss: { icon: '👺', hp: 150, dmg: 12, every: 4, scrap: 40 },   // a tyrant comes every 10th wave
};

// What the survivor learns by doing. A skill's tier is how many of its thresholds the counter
// (kept in totals) has passed, so nothing needs saving but the counter.
const SKILLS = {
  scavenging: { icon: '🎒', name: 'Scavenging', counter: 'crates', unit: 'crates gathered', tiers: [30, 150, 600], text: 'crates give 35% more' },
  combat: { icon: '🥊', name: 'Combat', counter: 'handKills', unit: 'zombies killed by hand', tiers: [150, 1000, 6000], text: '20% more damage' },
  engineering: { icon: '🔧', name: 'Engineering', counter: 'builds', unit: 'things built', tiers: [4, 10, 20], text: 'builds 25% faster, turrets hit 20% harder' },
  fortifying: { icon: '🧱', name: 'Fortifying', counter: 'waves', unit: 'waves survived', tiers: [5, 15, 35], text: 'walls hold 12% more' },
  firstAid: { icon: '🩹', name: 'First aid', counter: 'rests', unit: 'times he had to rest', tiers: [5, 20, 60], text: 'heals faster, rests 25% less' },
  tailoring: { icon: '🧵', name: 'Tailoring', counter: 'clothes', unit: 'clothes made', tiers: [3, 10, 25], text: 'clothes come out better' },
  cooking: { icon: '🍳', name: 'Cooking', counter: 'meals', unit: 'meals cooked', tiers: [4, 15, 50], text: 'meals heal and last longer' },
  scouting: { icon: '🔍', name: 'Scouting', counter: 'sites', unit: 'places explored', tiers: [5, 20, 60], text: 'fewer ambushes, bigger finds' },
  diving: { icon: '🏊', name: 'Diving', counter: 'dives', unit: 'lake dives', tiers: [3, 10, 30], text: 'lakes hurt less and give more' },
  trapping: { icon: '🪤', name: 'Trapping', counter: 'defenses', unit: 'defenses set up', tiers: [4, 15, 40], text: 'barricades hold longer, traps and spikes hurt more' },
  tactics: { icon: '🧠', name: 'Tactics', counter: 'lessons', unit: 'hard lessons', tiers: [5, 20, 60], text: 'sizes up a fight more carefully' },
  gunsmithing: { icon: '🧨', name: 'Gunsmithing', counter: 'bulletsMade', unit: 'bullets made', tiers: [200, 1000, 4000], text: 'more bullets a batch, guns hit 10% harder' },
};

const JOB_STEPS = { turret: 8, walls: 10, weapon: 6, ammo: 3, clothes: 6, cook: 4, explore: 5, defense: 5 };
const JOB_NAMES = { turret: 'turret', walls: 'walls', weapon: 'crafting', ammo: 'bullets', clothes: 'sewing', cook: 'cooking', explore: 'searching', defense: 'defenses' };

// Places to explore. He goes when he is healthy and the shelter is quiet, and takes his chances:
// a building may hide an ambush, a lake may nearly drown him, a bunker is always guarded but holds
// the best finds, and a lost shelter is a safe stop. `loot` is [min, max] per material, the chance
// of a blueprint (`bp`) and of a piece of clothing (`gear`).
const SITES = {
  building: { icon: '🏢', name: 'abandoned building', weight: 0.4, ambush: 0.35, loot: { scrap: [10, 25], cloth: [3, 7], food: [2, 5], bp: 0.2, gear: 0.15 } },
  lake: { icon: '🌊', name: 'lake', weight: 0.2, loot: { wood: [8, 18], scrap: [10, 30], bp: 0.15, gear: 0.25 } },
  shelter: { icon: '⛺', name: 'lost shelter', weight: 0.25, loot: { wood: [8, 15], scrap: [10, 20], food: [3, 6], bp: 0.2, gear: 0 } },
  bunker: { icon: '🚪', name: 'bunker', weight: 0.15, ambush: 1, loot: { scrap: [40, 80], cloth: [5, 10], food: [4, 8], bp: 0.7, gear: 0.4, tier: 1 } },
};
const BULLETS = { scrap: 10, made: 40, low: 10 };   // 10 scrap make 40 bullets, made when under 10 are left
const MEAL = { food: 3, heal: 0.4, fed: 60, bonus: 0.15, below: 0.5 };   // 3 food make a meal

const ESC = '\x1b[';
const RESET = `${ESC}0m`;
const GOLD = '38;2;250;204;21';
const GREEN = '38;2;34;197;94';
const RED = '38;2;248;113;113';

function newSave(now) {
  return {
    v: 3, lastTick: now, carryMs: 0, step: 0, x: 0, dir: 1, hp: HERO_LIFE[0] + HERO_LIFE[1], down: 0,
    scrap: 0, wood: 0, cloth: 0, food: 0, meals: 0, fed: 0, ammo: 0,
    kills: 0, wave: 1, waveKills: 0, bestWave: 1, weapon: 0, turrets: 0, job: null,
    learned: {}, blueprints: [], misses: 0, sites: [], gear: {}, resting: false, grace: 0, boss: false, mode: null, hole: 0, call: null, defenses: [], defReady: 0,
    shelter: { level: 1, hp: wallsMax(1, 0) }, rebuild: 0, zombies: [], crates: [], fx: null, msg: null,
    totals: {
      scrapFound: 0, woodFound: 0, falls: 0, brutes: 0, bosses: 0, turretKills: 0, crates: 0, handKills: 0, builds: 0, waves: 0,
      knockouts: 0, rests: 0, retreats: 0, lessons: 0, defenses: 0, trapKills: 0, game: 0, sites: 0, dives: 0, hordes: 0, clothes: 0, meals: 0, bulletsMade: 0, gearFound: 0,
    },
  };
}

function wallsMax(level, fortifying) {
  return Math.round((90 + 16 * level) * (1 + 0.12 * fortifying));
}

function skillTier(sv, key) {
  const s = SKILLS[key];
  const n = sv.totals[s.counter] || 0;
  return s.tiers.filter(t => n >= t).length;
}

function knows(sv, key) {
  return !key || sv.blueprints.includes(key);
}

function shelterMax(sv) {
  return wallsMax(sv.shelter.level, skillTier(sv, 'fortifying'));
}

function slotsAt(level) {
  return Math.min(TURRET_SLOTS.length, 1 + Math.floor(level / 2));
}

function turretDamage(sv) {
  const heavy = knows(sv, 'heavy') ? 1.5 : 1;
  return Math.round((2 + Math.floor(sv.shelter.level * 0.4)) * (1 + 0.2 * skillTier(sv, 'engineering')) * heavy);
}

// The weapon in hand: a gun with no bullets left is swapped for the best melee weapon he has.
function weaponInHand(sv) {
  let i = sv.weapon;
  while (i > 0 && WEAPONS[i].ammo && sv.ammo < (WEAPONS[i].rounds || 1)) {
    i--;
  }
  return WEAPONS[i];
}

function heroDamage(sv, w = weaponInHand(sv)) {
  const gun = w.ammo ? 1 + 0.1 * skillTier(sv, 'gunsmithing') : 1;
  const fed = sv.fed > 0 ? 1 + MEAL.bonus : 1;
  return Math.round((w.damage + Math.floor(sv.shelter.level * 0.8)) * (1 + 0.2 * skillTier(sv, 'combat')) * gun * fed);
}

function turretCost(built) {
  return 20 + 25 * built;
}

function defenseSlots(level) {
  return Math.min(DEFENSE_SLOTS.length, Math.floor(level / 2));
}

function barricadeHp(sv) {
  return Math.round((100 + 12 * sv.shelter.level) * (1 + 0.25 * skillTier(sv, 'trapping')));
}

function spikeDamage(sv) {
  return Math.round((5 + sv.shelter.level) * (1 + 0.2 * skillTier(sv, 'trapping')));
}

function trapDamage(sv) {
  return Math.round((15 + 2 * sv.shelter.level) * (1 + 0.2 * skillTier(sv, 'trapping')));
}

// The next defense he can set up: a free slot among those the shelter has opened, whose kind he
// knows how to make and has the materials for.
function nextDefense(sv) {
  if (sv.step < sv.defReady) {
    return null;
  }
  const open = DEFENSE_SLOTS.slice(0, defenseSlots(sv.shelter.level)).filter(d => !sv.defenses.some(e => e.x === d.x));
  for (const slot of open) {
    const cost = DEFENSES[slot.type];
    if (knows(sv, slot.type) && sv.scrap >= cost.scrap && sv.wood >= cost.wood && sv.cloth >= cost.cloth) {
      return { kind: 'defense', scrap: cost.scrap, wood: cost.wood, cloth: cost.cloth, food: 0, data: slot };
    }
  }
  return null;
}

function wallCost(level) {
  return Math.round(20 * level ** 2);   // wood, and half as much scrap
}

function heroMax(sv) {
  return HERO_LIFE[0] + HERO_LIFE[1] * sv.shelter.level;
}

function waveNeed(wave) {
  return 10 + 5 * wave;
}

// ---------- clothes ----------

function gearPower(item) {
  return item ? 8 * (item.tier + 1) + item.quality : 0;
}

function gearName(item) {
  const slot = GEAR_SLOTS.find(s => s.key === item.slot);
  return `${GEAR_TIERS[item.tier]} ${slot.name}`;
}

// The share of each bite his clothes stop.
function armor(sv) {
  const power = GEAR_SLOTS.reduce((sum, s) => sum + gearPower(sv.gear[s.key]), 0);
  return Math.min(ARMOR_MAX, power / (power + ARMOR_SCALE));
}

// The best tier he knows how to craft, or -1.
function craftTier(sv) {
  const found = CRAFTABLE.find(([key]) => knows(sv, key));
  return found ? found[1] : -1;
}

// What he would sew next: a piece for the slot with the weakest one, if it beats what is there.
function nextClothes(sv) {
  const tier = craftTier(sv);
  if (tier < 0) {
    return null;
  }
  const slot = GEAR_SLOTS.reduce((a, b) => (gearPower(sv.gear[b.key]) < gearPower(sv.gear[a.key]) ? b : a));
  const quality = 4 + 2 * skillTier(sv, 'tailoring');
  if (8 * (tier + 1) + quality <= gearPower(sv.gear[slot.key])) {
    return null;
  }
  return { slot: slot.key, tier, quality, cloth: 4 * (tier + 1), scrap: 6 * (tier + 1) };
}

// A piece goes on if it beats what is worn there; otherwise it is torn up for cloth.
function wear(sv, item, now, found) {
  const old = sv.gear[item.slot];
  if (gearPower(item) <= gearPower(old)) {
    sv.cloth += 2;
    return;
  }
  sv.gear[item.slot] = item;
  say(sv, `${found ? '🎁 Found' : '🧥 Made'} ${gearName(item)}${old ? ` (replaces ${GEAR_TIERS[old.tier]})` : ''}`, now);
}

// ---------- what he builds ----------

// A blueprint that may be in the next crate: one he doesn't know, whose time has come and which
// isn't already lying somewhere.
function pickBlueprint(sv) {
  const open = Object.keys(BLUEPRINTS).filter(k => !sv.blueprints.includes(k) && BLUEPRINTS[k].after(sv)
    && !sv.crates.some(c => c.key === k));
  return open.length ? open[Math.floor(Math.random() * open.length)] : null;
}

function blueprintsLeft(sv) {
  return Object.keys(BLUEPRINTS).filter(k => !sv.blueprints.includes(k)).length;
}

// What the survivor builds next, if he can pay for it. Bullets, meals and clothes come first
// (they are cheap and wanted at once), then turrets (he saves up for them), a better weapon, and
// stronger walls (which also open more turret slots).
function nextBuild(sv) {
  const none = { scrap: 0, wood: 0, cloth: 0, food: 0 };
  if (WEAPONS[sv.weapon].ammo && knows(sv, 'ammo') && sv.ammo < Math.max(BULLETS.low, 4 * (WEAPONS[sv.weapon].rounds || 1)) && sv.scrap >= BULLETS.scrap) {
    return { ...none, kind: 'ammo', scrap: BULLETS.scrap };
  }
  if (knows(sv, 'cooking') && sv.meals < MAX_MEALS - 2 && sv.food >= MEAL.food) {
    return { ...none, kind: 'cook', food: MEAL.food };
  }
  const clothes = nextClothes(sv);
  if (clothes && sv.cloth >= clothes.cloth && sv.scrap >= clothes.scrap) {
    return { ...none, kind: 'clothes', cloth: clothes.cloth, scrap: clothes.scrap, data: clothes };
  }
  if (sv.turrets < slotsAt(sv.shelter.level) && knows(sv, 'turret')) {
    return sv.scrap >= turretCost(sv.turrets) ? { ...none, kind: 'turret', scrap: turretCost(sv.turrets) } : null;
  }
  const defense = nextDefense(sv);
  if (defense) {
    return defense;
  }
  const w = WEAPONS[sv.weapon + 1];
  if (w && sv.shelter.level >= w.level && knows(sv, w.blueprint) && sv.scrap >= w.cost) {
    return { ...none, kind: 'weapon', scrap: w.cost };
  }
  const walls = wallCost(sv.shelter.level);
  return sv.wood >= walls && sv.scrap >= walls / 2 ? { ...none, kind: 'walls', scrap: walls / 2, wood: walls } : null;
}

// What he is saving up for, for the stats and the shelter report.
function goalText(sv) {
  if (sv.turrets < slotsAt(sv.shelter.level)) {
    return knows(sv, 'turret') ? `🗼 turret ${turretCost(sv.turrets)} 🔩` : '📜 a blueprint for turrets';
  }
  const w = WEAPONS[sv.weapon + 1];
  if (w && sv.shelter.level >= w.level && !knows(sv, w.blueprint)) {
    return `📜 a blueprint for the ${w.name.toLowerCase()}`;
  }
  if (WEAPONS[sv.weapon].ammo && !knows(sv, 'ammo')) {
    return '📜 a blueprint for bullets';
  }
  if (w && sv.shelter.level >= w.level && sv.scrap < w.cost) {
    return `${w.icon} ${w.name} ${w.cost} 🔩`;
  }
  return `🧱 walls ${wallCost(sv.shelter.level)} 🪵 + ${wallCost(sv.shelter.level) / 2} 🔩`;
}

// ---------- which game is on display, and the save ----------

function isShown() {
  return fs.existsSync(GAME_FILE);
}

function setShown(shown) {
  if (shown) {
    fs.writeFileSync(GAME_FILE, 'survival');
  } else {
    try { fs.unlinkSync(GAME_FILE); } catch {}
  }
}

function load(now) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') {
      try { fs.copyFileSync(SAVE_FILE, path.join(DIR, `survival.bad-${now}.json`)); } catch {}
    }
    return newSave(now);
  }
  // Fill in anything an older save lacks, so adding a field never breaks a running game.
  const fresh = newSave(now);
  const sv = { ...fresh, ...parsed, v: fresh.v };
  sv.shelter = { ...fresh.shelter, ...sv.shelter };
  sv.totals = { ...fresh.totals, ...sv.totals };
  // The axe's blueprint was once called forging.
  sv.blueprints = sv.blueprints.map(k => (k === 'forge' ? 'axe' : k));
  // A save made before blueprints keeps what it had already built.
  if (parsed.blueprints === undefined) {
    if (sv.turrets > 0) {
      sv.blueprints.push('turret');
    }
    if (sv.weapon > 0) {
      sv.blueprints.push('axe');
    }
  }
  sv.gear = { ...sv.gear };
  sv.learned = { ...sv.learned };
  for (const key of Object.keys(SKILLS)) {
    // A skill already earned in an older save is not announced again.
    sv.learned[key] = sv.learned[key] ?? skillTier(sv, key);
  }
  return sv;
}

function save(sv) {
  const tmp = `${SAVE_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(sv));
  fs.renameSync(tmp, SAVE_FILE);
}

// ---------- simulation ----------

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function say(sv, text, now) {
  sv.msg = { text, at: now };
}

function makeZombie(sv) {
  // More kinds turn up as the waves go on: brutes, then runners, then spitters.
  const chances = [
    ['brute', sv.wave >= 2 ? Math.min(0.5, 0.08 * (sv.wave - 1)) : 0],
    ['runner', sv.wave >= 4 ? Math.min(0.25, 0.04 * (sv.wave - 3)) : 0],
    ['spitter', sv.wave >= 8 ? Math.min(0.25, 0.03 * (sv.wave - 7)) : 0],
  ];
  let roll = Math.random();
  let kind = 'walker';
  for (const [k, chance] of chances) {
    roll -= chance;
    if (roll < 0) {
      kind = k;
      break;
    }
  }
  return spawn(sv, kind);
}

function spawn(sv, kind) {
  const z = ZOMBIES[kind];
  const hp = Math.round(z.hp * (1 + 0.15 * (sv.wave - 1)) * (0.85 + Math.random() * 0.3));
  return { kind, x: Math.random() < 0.5 ? -RADIUS : RADIUS, hp, max: hp };
}

function dropGear(sv, now, bonus = 0) {
  const slot = GEAR_SLOTS[randInt(0, GEAR_SLOTS.length - 1)];
  // Better tiers turn up further into the waves.
  const tier = Math.min(GEAR_TIERS.length - 1, Math.floor(Math.random() * (1 + sv.wave / 6)) + bonus);
  sv.totals.gearFound++;
  wear(sv, { slot: slot.key, tier, quality: randInt(0, 9) }, now, true);
}

// `source` is who did it: 'hand', 'turret' or 'trap' (a trap or spikes).
function hitZombie(sv, z, dmg, source, hits, now) {
  z.hp -= dmg;
  hits.push(z.x);
  if (z.hp > 0) {
    return;
  }
  const def = ZOMBIES[z.kind];
  sv.kills++;
  sv.waveKills++;
  if (z.kind === 'brute') {
    sv.totals.brutes++;
  }
  if (z.kind === 'boss') {
    sv.totals.bosses++;
    say(sv, '👺 The tyrant is dead', now);
    dropGear(sv, now, 1);
  }
  if (source === 'turret') {
    sv.totals.turretKills++;
  } else if (source === 'trap') {
    sv.totals.trapKills++;
  } else {
    sv.totals.handKills++;
  }
  const scrap = def.scrap + (Math.random() < 0.5 ? 1 : 0);
  sv.scrap += scrap;
  sv.totals.scrapFound += scrap;
  if (Math.random() < DROPS.wood) {
    sv.wood++;
    sv.totals.woodFound++;
  }
  if (Math.random() < DROPS.cloth) {
    sv.cloth++;
  }
  if (Math.random() < DROPS.food) {
    sv.food++;
  }
  if (z.kind !== 'boss' && Math.random() < DROPS.gear) {
    dropGear(sv, now);
  }
}

function nearest(list, x, within) {
  let best = null;
  for (const e of list) {
    const d = Math.abs(e.x - x);
    // A zombie already killed this step (a crate has no life) can't be picked again.
    if (e.hp !== undefined && e.hp <= 0) {
      continue;
    }
    if (d <= within && (!best || d < Math.abs(best.x - x))) {
      best = e;
    }
  }
  return best;
}

function sign(n) {
  return n > 0 ? 1 : n < 0 ? -1 : 0;
}

function finishJob(sv, now) {
  const { kind, data } = sv.job;
  sv.job = null;
  if (kind === 'explore') {
    explore(sv, data, now);
    return;
  }
  if (kind === 'turret' || kind === 'walls' || kind === 'weapon') {
    sv.totals.builds++;
  }
  if (kind === 'defense') {
    sv.totals.defenses++;
    sv.defReady = sv.step + DEFENSE_COOLDOWN;
    const type = data.type;
    sv.defenses.push({ type, x: data.x, hp: type === 'barricade' ? barricadeHp(sv) : 0, uses: type === 'spikes' ? SPIKE_USES : 1 });
    say(sv, `${DEFENSES[type].icon} ${DEFENSES[type].name[0].toUpperCase()}${DEFENSES[type].name.slice(1)} set up`, now);
  } else if (kind === 'turret') {
    sv.turrets++;
    say(sv, `🗼 Turret ${sv.turrets} built`, now);
  } else if (kind === 'ammo') {
    const made = Math.round(BULLETS.made * (1 + 0.25 * skillTier(sv, 'gunsmithing')));
    sv.ammo += made;
    sv.totals.bulletsMade += made;
    say(sv, `🧨 ${made} bullets made`, now);
  } else if (kind === 'cook') {
    sv.meals++;
    sv.totals.meals++;
    say(sv, '🍲 A meal is ready', now);
  } else if (kind === 'clothes') {
    sv.totals.clothes++;
    wear(sv, { slot: data.slot, tier: data.tier, quality: data.quality }, now, false);
  } else if (kind === 'weapon') {
    sv.weapon++;
    say(sv, `${WEAPONS[sv.weapon].icon} ${WEAPONS[sv.weapon].name} crafted`, now);
  } else {
    sv.shelter.level++;
    sv.shelter.hp = shelterMax(sv);
    say(sv, `🧱 Walls Lv ${sv.shelter.level}`, now);
  }
}

// Tells when a skill reaches a new tier.
function learn(sv, now) {
  for (const [key, s] of Object.entries(SKILLS)) {
    const tier = skillTier(sv, key);
    if (tier > (sv.learned[key] || 0)) {
      sv.learned[key] = tier;
      say(sv, `🧠 ${s.icon} ${s.name} ${'I'.repeat(tier)}: ${s.text}`, now);
    }
  }
}

function fall(sv, now) {
  sv.totals.falls++;
  for (const key of ['scrap', 'wood', 'cloth', 'food']) {
    sv[key] = Math.floor(sv[key] * 0.75);
  }
  sv.zombies = [];
  sv.crates = [];
  sv.sites = [];
  sv.defenses = [];
  sv.job = null;
  sv.wave = Math.max(1, sv.wave - 1);
  sv.waveKills = 0;
  sv.rebuild = REBUILD_STEPS;
  // The zombies thin out for a few minutes after a fall.
  sv.grace = GRACE_STEPS;
  sv.resting = false;
  sv.mode = null;
  sv.hole = 0;
  sv.x = 0;
  sv.fx = null;
  say(sv, '🔥 The shelter fell, rebuilding', now);
}

// A crate appears, sometimes holding a blueprint. Every crate without one makes the next a
// little likelier to, so a long wait gets shorter.
function newCrate(sv) {
  const key = pickBlueprint(sv);
  const x = randInt(-RADIUS + 1, RADIUS - 1);
  if (key && Math.random() < BLUEPRINTS[key].chance + 0.005 * sv.misses) {
    return { x, kind: 'blueprint', key };
  }
  if (key) {
    sv.misses++;
  }
  let roll = Math.random();
  for (const [kind, share] of CRATE_KINDS) {
    roll -= share;
    if (roll < 0) {
      return { x, kind };
    }
  }
  return { x, kind: 'scrap' };
}

function gather(sv, crate, now) {
  if (crate.kind === 'blueprint') {
    sv.blueprints.push(crate.key);
    sv.misses = 0;
    say(sv, `📜 Found the ${BLUEPRINTS[crate.key].name} blueprint`, now);
    return;
  }
  sv.totals.crates++;
  const found = Math.round((3 + Math.floor(sv.wave / 3) + randInt(0, 2)) * (1 + 0.35 * skillTier(sv, 'scavenging')));
  sv[crate.kind] += found;
  if (crate.kind === 'scrap' || crate.kind === 'wood') {
    sv.totals[`${crate.kind}Found`] += found;
  }
  say(sv, `${CRATE_ICONS[crate.kind]} +${found} ${crate.kind}`, now);
}

// Eating on the move: under half life, he eats a meal he has cooked.
function eat(sv, now) {
  if (sv.meals > 0 && sv.fed <= 0 && sv.hp < heroMax(sv) * MEAL.below) {
    const cook = skillTier(sv, 'cooking');
    sv.meals--;
    sv.hp = Math.min(heroMax(sv), sv.hp + Math.round(heroMax(sv) * MEAL.heal * (1 + 0.15 * cook)));
    sv.fed = Math.round(MEAL.fed * (1 + 0.25 * cook));
    say(sv, '🍲 Ate a meal: healed and stronger', now);
  }
}

// How a fight against `group`, started from tile `from`, would go: how many steps it would take
// and how much life it would cost him. He counts the bullets he has (a gun that runs dry means
// finishing with the melee weapon), the turrets that reach the fight, the splash of a vehicle, how
// long the zombies take to arrive for a weapon with reach, and his clothes. He is only as good a
// judge as he has learned to be: a fresh survivor thinks fights are easier than they are.
function fightEstimate(sv, group, from) {
  const gun = WEAPONS[sv.weapon].ammo ? WEAPONS[sv.weapon] : null;
  const melee = WEAPONS.slice(0, sv.weapon + 1).reverse().find(w => !w.ammo);
  const first = gun && sv.ammo >= (gun.rounds || 1) ? gun : melee;
  const turrets = Math.abs(from) <= TURRET_RANGE ? sv.turrets * turretDamage(sv) : 0;
  const total = group.reduce((sum, z) => sum + z.hp, 0);
  let pool = total;
  let ammo = sv.ammo;
  let steps = 0;
  while (pool > 0 && steps < 150) {
    const w = gun && ammo >= (gun.rounds || 1) ? gun : melee;
    if (w.ammo) {
      ammo -= w.rounds || 1;
    }
    const spread = w.splash ? 1 + 0.5 * Math.min(group.length - 1, 2 * w.splash) : 1;
    pool -= heroDamage(sv, w) * spread + turrets;
    steps++;
  }
  steps += group.length * 0.5;   // walking from one to the next
  const guard = 1 - armor(sv);
  const bites = group.map(z => Math.max(1, Math.round(ZOMBIES[z.kind].dmg * (1 + 0.07 * (sv.wave - 1)) * guard)));
  bites.sort((a, b) => b - a);
  // Each bites every other step. Up close a crowd can surround him; with reach, he thins them
  // out as they come, so fewer ever bite at once.
  const dps = 0.5 * 0.7 * bites.slice(0, first.range > 1 ? 3 : 5).reduce((sum, b) => sum + b, 0);
  const near = Math.min(...group.map(z => Math.abs(z.x - from)));
  const every = Math.min(...group.map(z => ZOMBIES[z.kind].every));
  const approach = Math.max(0, near - first.range) * every;
  const taken = dps * Math.max(0, steps - approach);
  const bias = Math.min(1, 0.7 + 0.1 * skillTier(sv, 'tactics'));
  // Holing up only helps if the turrets can clear them before they wear the walls down.
  const wallDps = 0.5 * group.reduce((sum, z) => sum + Math.round(ZOMBIES[z.kind].dmg * (1 + 0.07 * (sv.wave - 1))), 0);
  const clear = sv.turrets > 0 ? total / (sv.turrets * turretDamage(sv)) : Infinity;
  const barricades = sv.defenses.filter(d => d.type === 'barricade').length;
  const hold = wallDps * 0.6 * clear * (1 - Math.min(0.5, 0.15 * barricades)) < sv.shelter.hp * 0.6;
  return { ok: taken * bias < sv.hp * RISK, hold, taken: Math.round(taken), weapon: first, steps };
}

function startJob(sv, build) {
  for (const key of ['scrap', 'wood', 'cloth', 'food']) {
    sv[key] -= build[key];
  }
  const time = Math.ceil(JOB_STEPS[build.kind] * (1 - 0.25 * skillTier(sv, 'engineering')));
  sv.job = { kind: build.kind, left: time, data: build.data };
}

// A blueprint he finds on a search, if any he could use is still missing.
function findBlueprint(sv, now) {
  const key = pickBlueprint(sv);
  if (key) {
    sv.blueprints.push(key);
    sv.misses = 0;
    say(sv, `📜 Found the ${BLUEPRINTS[key].name} blueprint`, now);
  }
}

function newSite(sv) {
  let roll = Math.random();
  let kind = 'building';
  for (const [k, site] of Object.entries(SITES)) {
    roll -= site.weight;
    if (roll < 0) {
      kind = k;
      break;
    }
  }
  // A bunker needs a few waves behind him.
  if (kind === 'bunker' && sv.wave < 3) {
    kind = 'building';
  }
  let x = randInt(-RADIUS + 1, RADIUS - 1);
  if (Math.abs(x) < 4) {
    x = x < 0 ? -4 : 4;
  }
  return { kind, x };
}

// He only wanders off to explore when it is safe: healthy, the walls holding, and nothing near.
function canExplore(sv) {
  return !sv.resting && sv.hp >= heroMax(sv) * 0.7 && sv.shelter.hp >= shelterMax(sv) / 2
    && !sv.zombies.some(z => Math.abs(z.x) <= WALL + 3 || Math.abs(z.x - sv.x) <= 3);
}

function ambush(sv, x, count, now) {
  for (let i = 0; i < Math.min(6, count); i++) {
    const z = makeZombie(sv);
    z.x = Math.max(-RADIUS, Math.min(RADIUS, x + (i % 3) - 1));
    sv.zombies.push(z);
  }
  say(sv, '💥 Ambush!', now);
}

function horde(sv, now) {
  const side = Math.random() < 0.5 ? -1 : 1;
  const count = Math.min(8, 3 + Math.floor(sv.wave / 4));
  for (let i = 0; i < count; i++) {
    const z = makeZombie(sv);
    z.x = side * (RADIUS - Math.min(i, 5));
    sv.zombies.push(z);
  }
  sv.totals.hordes++;
  say(sv, `🧟 A horde of ${count} comes from the ${side < 0 ? 'left' : 'right'}`, now);
}

// What he finds in a place, after the search. Scouting makes the finds bigger.
function explore(sv, site, now) {
  const def = SITES[site.kind];
  const scout = skillTier(sv, 'scouting');
  const dive = skillTier(sv, 'diving');
  sv.totals.sites++;
  let bonus = 1 + 0.25 * scout;
  if (site.kind === 'lake') {
    sv.totals.dives++;
    // The water hurts, and sometimes it is worse than that.
    sv.hp -= Math.max(1, Math.round(heroMax(sv) * 0.2 * (1 - 0.25 * dive)));
    if (Math.random() < 0.1 * (1 - 0.25 * dive) || sv.hp < 1) {
      sv.hp = 1;
      say(sv, '🌊 Nearly drowned, nothing found', now);
      return;
    }
    if (Math.random() > 0.55 + 0.1 * dive) {
      say(sv, '🌊 Nothing in the water but weeds', now);
      return;
    }
    bonus += 0.25 * dive;
  }
  if (def.ambush && Math.random() < def.ambush - 0.08 * scout) {
    ambush(sv, site.x, site.kind === 'bunker' ? 3 + Math.floor(sv.wave / 5) : 2 + Math.floor(sv.wave / 6), now);
  }
  if (site.kind === 'shelter') {
    sv.hp = heroMax(sv);
  }
  const found = [];
  for (const [key, range] of Object.entries(def.loot)) {
    if (Array.isArray(range)) {
      const n = Math.round(randInt(range[0], range[1]) * bonus);
      sv[key] += n;
      if (key === 'scrap' || key === 'wood') {
        sv.totals[`${key}Found`] += n;
      }
      found.push(`${n} ${key}`);
    }
  }
  say(sv, `${def.icon} ${def.name[0].toUpperCase()}${def.name.slice(1)}: +${found.join(', +')}`, now);
  if (Math.random() < def.loot.bp) {
    findBlueprint(sv, now);
  }
  if (Math.random() < def.loot.gear) {
    dropGear(sv, now, def.loot.tier || 0);
  }
}

// A zombie takes a step toward the shelter. A barricade in the way stops it: it chews through
// instead. Spikes hurt every zombie that crosses them, and a trap catches the first one.
function advance(sv, z, dmg, hits, now) {
  const next = z.x - sign(z.x);
  const d = sv.defenses.find(e => e.x === next);
  if (d && d.type === 'barricade') {
    d.hp -= dmg;
    if (d.hp <= 0) {
      sv.defenses.splice(sv.defenses.indexOf(d), 1);
    }
    return;
  }
  z.x = next;
  if (d && d.type === 'spikes') {
    hitZombie(sv, z, spikeDamage(sv), 'trap', hits, now);
    if (--d.uses <= 0) {
      sv.defenses.splice(sv.defenses.indexOf(d), 1);
    }
  } else if (d && d.type === 'trap') {
    hitZombie(sv, z, trapDamage(sv), 'trap', hits, now);
    z.held = 6 + 2 * skillTier(sv, 'trapping');
    sv.defenses.splice(sv.defenses.indexOf(d), 1);
  }
}

function step(sv, now) {
  sv.step++;
  const hits = [];

  if (sv.rebuild > 0) {
    sv.rebuild--;
    if (sv.rebuild === 0) {
      sv.shelter.hp = shelterMax(sv);
      sv.hp = heroMax(sv);
      say(sv, '🏠 Shelter rebuilt', now);
    }
    sv.fx = { step: sv.step, hits };
    return;
  }
  if (sv.fed > 0) {
    sv.fed--;
  }
  if (sv.grace > 0) {
    sv.grace--;
  }

  // Zombies arrive from both edges, more of them as the waves go up.
  if (sv.zombies.length < 3 + Math.floor(sv.wave / 2) && Math.random() < Math.min(0.55, 0.18 + 0.03 * sv.wave) * (sv.grace > 0 ? 0.5 : 1)) {
    sv.zombies.push(makeZombie(sv));
  }
  if (sv.boss && !sv.zombies.some(z => z.kind === 'boss')) {
    sv.boss = false;
    sv.zombies.push(spawn(sv, 'boss'));
    say(sv, '👺 A tyrant comes for the shelter', now);
  }
  if (sv.sites.length < 2 && sv.step % SITE_EVERY === 0) {
    sv.sites.push(newSite(sv));
  }
  if (sv.wave >= 3 && sv.step % HORDE_EVERY === 0 && Math.random() < 0.5) {
    horde(sv, now);
  }
  if (sv.crates.length < MAX_CRATES && sv.step % CRATE_EVERY === 0) {
    sv.crates.push(newCrate(sv));
  }

  // Traps standing out there catch game now and then, as they were made to.
  for (const d of sv.defenses) {
    if (d.type === 'trap' && Math.random() < GAME_CHANCE) {
      sv.food += 2;
      sv.totals.game++;
      say(sv, '🪤 A trap caught game: +2 food', now);
    }
  }

  // The turrets he has built guard the shelter on their own.
  for (let t = 0; t < sv.turrets; t++) {
    const z = nearest(sv.zombies, 0, TURRET_RANGE);
    if (z) {
      hitZombie(sv, z, turretDamage(sv), 'turret', hits, now);
    }
  }
  sv.zombies = sv.zombies.filter(z => z.hp > 0);

  // He fights what is in reach; otherwise he builds at the shelter when he can pay for something,
  // chases what is close, or keeps patrolling and gathering.
  const weapon = weaponInHand(sv);
  if (sv.down > 0) {
    sv.down--;
  } else if (sv.resting) {
    // Hurt, he goes home and rests inside, where nothing can reach him.
    if (sv.x !== 0) {
      sv.x += sign(-sv.x);
    } else {
      sv.hp = Math.min(heroMax(sv), sv.hp + 3);
    }
    if (sv.hp >= heroMax(sv) * RETREAT[1]) {
      sv.resting = false;
    }
  } else if (sv.job) {
    // Building happens inside the shelter; searching, out where the place is.
    sv.x = sv.job.kind === 'explore' ? sv.job.data.x : 0;
    sv.job.left--;
    if (sv.job.left <= 0) {
      finishJob(sv, now);
    }
  } else {
    const foe = nearest(sv.zombies, sv.x, weapon.range);
    // He only heads home to build once the zombies are off the shelter's doorstep.
    const build = sv.zombies.some(z => Math.abs(z.x) <= WALL + 3) ? null : nextBuild(sv);
    // He sizes up the zombies in sight, and falls back to the shelter if he would lose. With the
    // walls nearly gone, or after too long holed up, he goes out anyway.
    const group = sv.zombies.filter(z => Math.abs(z.x - sv.x) <= SIGHT);
    const call = group.length ? fightEstimate(sv, group, sv.x) : null;
    if (!call) {
      sv.hole = 0;
    }
    const desperate = sv.shelter.hp < shelterMax(sv) * 0.7 || sv.hole > HOLE_MAX;
    const fallBack = call && group.length >= 3 && !call.ok && call.hold && !desperate;
    if (call && group.length >= 3 && (!sv.call || sv.call.ok !== call.ok || Math.abs(sv.call.n - group.length) >= 2)) {
      sv.call = { n: group.length, ok: call.ok, weapon: call.weapon.name, taken: call.taken };
    }
    if (fallBack && !sv.mode) {
      sv.totals.retreats++;
      sv.totals.lessons++;
      const name = call.weapon.name.toLowerCase();
      say(sv, `🏃 ${group.length} zombies are too many for ${/^[aeiou]/.test(name) ? 'an' : 'a'} ${name}`, now);
    }
    sv.mode = fallBack ? 'fallback' : null;
    if (fallBack) {
      if (sv.x !== 0) {
        sv.x += sign(-sv.x);
      } else {
        // Inside, he is safe, so he puts the time to use.
        sv.hole++;
        const work = nextBuild(sv);
        if (work) {
          startJob(sv, work);
        }
      }
    } else if (foe) {
      if (weapon.ammo) {
        sv.ammo -= weapon.rounds || 1;
      }
      const dmg = heroDamage(sv);
      hitZombie(sv, foe, dmg, 'hand', hits, now);
      // A vehicle's shot lands on the zombies around the target too.
      for (const z of sv.zombies) {
        if (weapon.splash && z !== foe && z.hp > 0 && Math.abs(z.x - foe.x) <= weapon.splash) {
          hitZombie(sv, z, Math.round(dmg / 2), 'hand', hits, now);
        }
      }
      sv.zombies = sv.zombies.filter(z => z.hp > 0);
    } else if (build) {
      if (sv.x === 0) {
        startJob(sv, build);
      } else {
        sv.x += sign(-sv.x);
      }
    } else {
      // With the walls under half, he goes for whatever is closest to the shelter.
      const threat = sv.shelter.hp < shelterMax(sv) / 2 ? nearest(sv.zombies, 0, RADIUS) : nearest(sv.zombies, sv.x, SIGHT);
      const chase = threat || nearest(sv.crates, sv.x, SIGHT) || (canExplore(sv) ? nearest(sv.sites, sv.x, SIGHT) : null);
      if (chase) {
        sv.x += sign(chase.x - sv.x);
        sv.dir = sign(chase.x - sv.x) || sv.dir;
      } else {
        if (Math.abs(sv.x + sv.dir) > RADIUS - 1) {
          sv.dir = -sv.dir;
        }
        sv.x += sv.dir;
      }
    }
    const crate = sv.crates.findIndex(c => c.x === sv.x);
    if (crate >= 0) {
      gather(sv, sv.crates.splice(crate, 1)[0], now);
    }
    const site = sv.sites.findIndex(c => c.x === sv.x);
    if (site >= 0 && !sv.job && canExplore(sv)) {
      const found = sv.sites.splice(site, 1)[0];
      sv.job = { kind: 'explore', left: JOB_STEPS.explore, data: found };
      say(sv, `🔍 Searching the ${SITES[found.kind].name}`, now);
    }
  }

  // The zombies shamble in, and bite whoever they reach (he is safe inside the shelter).
  const guard = 1 - armor(sv);
  for (const z of sv.zombies) {
    if (z.hp <= 0) {
      continue;
    }
    // A zombie in a trap can't move, or bite.
    if (z.held > 0) {
      z.held--;
      continue;
    }
    const def = ZOMBIES[z.kind];
    const dmg = Math.round(def.dmg * (1 + 0.07 * (sv.wave - 1)));
    if (sv.down === 0 && !(sv.job && sv.job.kind !== 'explore') && !sv.resting && Math.abs(z.x - sv.x) <= 1 && sv.x !== 0) {
      // Like the walls, he takes a bite every other step.
      if (sv.step % 2 === 1) {
        sv.hp -= Math.max(1, Math.round(dmg * guard));
      }
    } else if (Math.abs(z.x) <= WALL + (def.reach || 0)) {
      // The walls take a bite every other step (a spitter's reaches over a distance).
      if (sv.step % 2 === 0) {
        sv.shelter.hp -= dmg;
      }
    } else if (sv.step % def.every === 0) {
      advance(sv, z, dmg, hits, now);
    }
  }
  sv.zombies = sv.zombies.filter(z => z.hp > 0);

  const aid = skillTier(sv, 'firstAid');
  if (sv.hp > 0 && sv.hp < heroMax(sv) * RETREAT[0] && (!sv.job || sv.job.kind === 'explore') && sv.down === 0) {
    sv.job = null;
    sv.resting = true;
    sv.totals.rests++;
    sv.totals.lessons++;
  }
  if (sv.hp <= 0) {
    // A knockout costs time only: he is carried back to the shelter to rest.
    sv.totals.knockouts++;
    sv.down = Math.ceil(DOWN_STEPS * (1 - 0.25 * Math.min(aid, 3)));
    sv.hp = heroMax(sv);
    sv.x = 0;
    sv.job = null;
    sv.resting = false;
    say(sv, '😵 Knocked out, resting at the shelter', now);
  } else {
    eat(sv, now);
    if (sv.step % Math.max(1, HERO_REGEN_EVERY - (aid >= 2 ? 1 : 0)) === 0) {
      sv.hp = Math.min(heroMax(sv), sv.hp + 1 + (aid >= 1 ? 1 : 0) + (aid >= 3 ? 1 : 0));
    }
  }
  if (sv.shelter.hp <= 0) {
    fall(sv, now);
    return;
  }
  const anyAtWall = sv.zombies.some(z => Math.abs(z.x) <= WALL + (ZOMBIES[z.kind].reach || 0));
  if (!anyAtWall) {
    sv.shelter.hp = Math.min(shelterMax(sv), sv.shelter.hp + REPAIR_EACH + Math.floor(skillTier(sv, 'fortifying') / 2));
  }

  // The waves hold at the shelter's pace (its walls and turrets), so a strong shelter stays ahead.
  const defense = sv.shelter.level + sv.turrets;
  if (sv.waveKills >= waveNeed(sv.wave) && sv.wave < defense + 1 + Math.floor(defense / 5)) {
    sv.wave++;
    sv.totals.waves++;
    sv.waveKills = 0;
    sv.bestWave = Math.max(sv.bestWave, sv.wave);
    sv.boss = sv.wave % 10 === 0;
    say(sv, `🧟 Wave ${sv.wave}`, now);
  }
  learn(sv, now);
  sv.fx = { step: sv.step, hits };
}

// Advances the game by the working time since the last tick. Only called while this game is on
// display, so the adventure and the survival never both run.
function tick(active, now) {
  const sv = load(now);
  const gap = now - sv.lastTick;
  sv.lastTick = now;
  if (gap > 0 && gap <= MAX_GAP_MS && active) {
    sv.carryMs += gap;
    while (sv.carryMs >= STEP_MS) {
      sv.carryMs -= STEP_MS;
      step(sv, now);
    }
  }
  save(sv);
  return sv;
}

// ---------- rendering ----------

function color(code, text) {
  return `${ESC}${code}m${text}${RESET}`;
}

function hash(x) {
  let h = Math.imul(x, 2654435761);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  return h >>> 0;
}

function shelterIcon(level) {
  return level >= 12 ? '🏯' : level >= 7 ? '🏰' : level >= 4 ? '🏡' : '🏠';
}

function cutTo(ctx, text, width) {
  if (ctx.displayWidth(text) <= width) {
    return text;
  }
  let out = '';
  for (const ch of text) {
    if (ctx.displayWidth(out + ch) > width - 1) {
      break;
    }
    out += ch;
  }
  return `${out}…`;
}

function statsRow(sv, ctx) {
  const lvl = sv.shelter.level;
  const max = shelterMax(sv);
  const filled = Math.max(0, Math.min(10, Math.ceil((sv.shelter.hp / max) * 10)));
  const bar = '▰'.repeat(filled) + '▱'.repeat(10 - filled);
  const barColor = sv.shelter.hp / max < 0.25 ? RED : sv.shelter.hp / max < 0.5 ? GOLD : GREEN;
  const w = weaponInHand(sv);
  const guard = Math.round(armor(sv) * 100);

  let status = null;
  if (sv.msg && ctx.now - sv.msg.at < MSG_MS) {
    status = [GOLD, sv.msg.text];
  } else if (!ctx.active) {
    status = ['2', '💤 waiting for you'];
  }

  // Cloth and food only show once he has some.
  const stock = `🔩 ${sv.scrap} 🪵 ${sv.wood}${sv.cloth ? ` 🧵 ${sv.cloth}` : ''}${sv.food ? ` 🥩 ${sv.food}` : ''}`;
  const parts = [
    [`${shelterIcon(lvl)} Shelter ${color(GOLD, `Lv ${lvl}`)} ${color(barColor, bar)} ${sv.shelter.hp}/${max}`, 6],
    [`🧑 ${w.icon} ${w.name}${w.ammo ? ` ${sv.ammo}` : ''}`, 4],
    [stock, 5],
    [sv.job ? `${sv.job.kind === 'explore' ? '🔍' : '🔨'} ${JOB_NAMES[sv.job.kind]} ${sv.job.left}` : sv.mode ? (sv.x === 0 ? '🧱 holed up' : '🏃 falling back') : `🎯 ${goalText(sv)}`, 3],
    [`🗼 ${sv.turrets}/${slotsAt(lvl)}`, 4.2],
    [sv.defenses.length ? `🚧 ${sv.defenses.length}` : null, 3.6],
    [guard ? `🧥 ${guard}%` : null, 3.5],
    [sv.meals || sv.fed ? `🍲 ${sv.meals}${sv.fed ? ' 😋' : ''}` : null, 2.8],
    [`🧟 Wave ${sv.wave} ${Math.min(sv.waveKills, waveNeed(sv.wave))}/${waveNeed(sv.wave)}`, 4.5],
    [`💀 ${sv.kills}`, 2],
    [status && color(...status), 5.5],
  ].filter(p => p[0]);

  const sep = `${ESC}2m · ${RESET}`;
  let row = parts.map(p => p[0]).join(sep);
  while (ctx.displayWidth(row) > ctx.cols && parts.length > 1) {
    const lowest = parts.reduce((a, b) => (b[1] < a[1] ? b : a));
    const room = ctx.cols - (ctx.displayWidth(row) - ctx.displayWidth(lowest[0]));
    if (status && lowest[1] === 5.5 && room >= 20) {
      lowest[0] = color(status[0], cutTo(ctx, status[1], room));
    } else {
      parts.splice(parts.indexOf(lowest), 1);
    }
    row = parts.map(p => p[0]).join(sep);
  }
  return row;
}

const SITE_ICONS = Object.fromEntries(Object.entries(SITES).map(([k, v]) => [k, v.icon]));
const CRATE_ICONS = { scrap: '📦', wood: '🪵', cloth: '🧵', food: '🥩', blueprint: '📜' };

function worldRow(sv, ctx) {
  const tiles = Math.min(2 * RADIUS + 1, Math.max(10, Math.min(24, Math.floor(ctx.cols / 2))));
  const left = -Math.floor(tiles / 2);
  const fx = ctx.active && sv.fx && sv.fx.step === sv.step ? sv.fx.hits : [];
  // Only the turrets he has built stand on their slots; the one in progress shows a hammer.
  const built = TURRET_SLOTS.slice(0, sv.turrets);
  const building = !sv.job || sv.job.kind === 'explore' ? null
    : sv.job.kind === 'turret' ? TURRET_SLOTS[sv.turrets] : sv.job.kind === 'defense' ? sv.job.data.x : WALL;
  let row = '';
  for (let i = 0; i < tiles; i++) {
    const x = left + i;
    const zombie = sv.zombies.find(z => z.x === x);
    if (x === 0) {
      row += sv.rebuild > 0 ? '🔥' : shelterIcon(sv.shelter.level);
    } else if (x === sv.x && sv.rebuild === 0) {
      row += sv.down > 0 ? '😵' : sv.job && sv.job.kind === 'explore' ? '🔍' : weaponInHand(sv).vehicle ? weaponInHand(sv).icon : '🧑';
    } else if (fx.includes(x)) {
      row += '💥';
    } else if (zombie) {
      row += ZOMBIES[zombie.kind].icon;
    } else if (!ctx.active && x === sv.x + 1) {
      row += '💤';
    } else if (x === building && sv.rebuild === 0) {
      row += '🔨';
    } else if (sv.crates.some(c => c.x === x)) {
      row += CRATE_ICONS[sv.crates.find(c => c.x === x).kind];
    } else if (sv.sites.some(c => c.x === x)) {
      row += SITE_ICONS[sv.sites.find(c => c.x === x).kind];
    } else if (sv.rebuild === 0 && sv.defenses.some(d => d.x === x)) {
      row += DEFENSES[sv.defenses.find(d => d.x === x).type].icon;
    } else if (sv.rebuild === 0 && built.includes(x)) {
      row += '🗼';
    } else if (sv.rebuild === 0 && Math.abs(x) === WALL && sv.shelter.level >= 3) {
      row += '🧱';
    } else if (sv.rebuild === 0 && x === -9 && knows(sv, 'cooking')) {
      row += '🔥';
    } else if (sv.rebuild === 0 && x === 9 && sv.shelter.level >= 8) {
      row += '🚩';
    } else if (Math.abs(x) > 4 && hash(x + 4099) % 7 === 0) {
      row += '🌲';
    } else {
      row += '  ';
    }
  }
  return row;
}

function floorRow(sv, ctx) {
  const tiles = Math.min(2 * RADIUS + 1, Math.max(10, Math.min(24, Math.floor(ctx.cols / 2))));
  const left = -Math.floor(tiles / 2);
  let row = `${ESC}48;2;58;52;44;38;2;120;108;90m`;
  for (let i = 0; i < tiles; i++) {
    const h = hash(left + i + 7919);
    row += (h % 3 === 0 ? '· ' : '  ');
  }
  return row + RESET;
}

// Rows in the same layout as the adventure: a stats row and the map, in the bottom-right corner.
function render(sv, ctx) {
  const map = [worldRow(sv, ctx), floorRow(sv, ctx)].map(ctx.alignRight);
  if (!ctx.show.progress) {
    return map;
  }
  const text = ctx.alignRight(statsRow(sv, ctx));
  return ctx.show.stats === 'below' ? [...map, text] : [text, ...map];
}

// ---------- commands ----------

function setGame(name, now) {
  const key = String(name || '').trim().toLowerCase();
  const toSurvival = ['survival', 'survive', 'zombies', 'shelter'].includes(key);
  const toAdventure = ['adventure', 'rpg', 'hero', 'heroes', 'main'].includes(key);
  if (key && !toSurvival && !toAdventure) {
    return `"${name}" is not a game. Usage: /vwc:game <adventure | survival>, or /vwc:game alone to switch.`;
  }
  const survival = toSurvival || (!toAdventure && !isShown());
  setShown(survival);
  if (survival) {
    // Starts the clock now, so the time spent on the other game never counts here.
    const sv = load(now);
    sv.lastTick = now;
    save(sv);
    return '🏠 Now playing Survival. The survivor patrols and the shelter defends itself while Claude works. The adventure waits until you switch back with /vwc:game adventure.';
  }
  return '⚔️ Back to the Adventure. Survival waits where it was; /vwc:game survival returns to it.';
}

function tierText(sv, key) {
  const sk = SKILLS[key];
  const tier = skillTier(sv, key);
  const n = sv.totals[sk.counter] || 0;
  const next = sk.tiers[tier];
  const level = tier ? 'I'.repeat(tier) : '-';
  return `  ${(`${sk.icon} ${sk.name}`).padEnd(16)}${level.padEnd(4)}${tier ? sk.text : `(${sk.text})`} · ${next ? `${n}/${next} ${sk.unit}` : 'mastered'}`;
}

function gearLine(sv, slot) {
  const item = sv.gear[slot.key];
  return `  ${(`${slot.icon} ${slot.name}`).padEnd(12)}${item ? `${gearName(item)} (power ${gearPower(item)})` : 'nothing yet'}`;
}

function shelterReport(now) {
  const sv = load(now);
  const lvl = sv.shelter.level;
  const w = weaponInHand(sv);
  const next = WEAPONS[sv.weapon + 1];
  const building = sv.job ? `${sv.job.kind === 'explore' ? '' : 'building: '}${JOB_NAMES[sv.job.kind]} (${sv.job.left} steps left)` : `saving for ${goalText(sv)}`;
  const known = Object.keys(BLUEPRINTS).filter(k => sv.blueprints.includes(k)).map(k => `${BLUEPRINTS[k].icon} ${BLUEPRINTS[k].name}`);
  const left = blueprintsLeft(sv);
  const lines = [
    `${shelterIcon(lvl)} Shelter Lv ${lvl}${isShown() ? '' : ' (survival is not on display: /vwc:game survival)'}`,
    `  Walls         ${sv.shelter.hp}/${shelterMax(sv)}${sv.rebuild > 0 ? ' · rebuilding' : ''}`,
    `  Turrets       ${sv.turrets}/${slotsAt(lvl)} built 🗼 · ${turretDamage(sv)} damage each, range ${TURRET_RANGE} tiles${sv.turrets < TURRET_SLOTS.length && sv.turrets >= slotsAt(lvl) ? ' · stronger walls open another slot' : ''}`,
    `  Defenses      ${DEFENSE_SLOTS.slice(0, defenseSlots(lvl)).filter(d => sv.defenses.some(e => e.x === d.x)).length}/${defenseSlots(lvl)} standing ${['barricade', 'trap', 'spikes'].map(t => `${DEFENSES[t].icon} ${sv.defenses.filter(d => d.type === t).length}${knows(sv, t) ? '' : '?'}`).join('  ')}${defenseSlots(lvl) === 0 ? ' (the shelter opens its first slot at level 2)' : ''}`,
    `  Materials     🔩 ${sv.scrap} scrap · 🪵 ${sv.wood} wood · 🧵 ${sv.cloth} cloth · 🥩 ${sv.food} food`,
    `  Pantry        🍲 ${sv.meals} meals${sv.fed ? ` · well fed for ${sv.fed} more steps` : ''}${knows(sv, 'cooking') ? '' : ' (he can\'t cook yet)'}`,
    `  Next          ${building}`,
    `  Last call     ${sv.call ? `${sv.call.n} zombies against his ${sv.call.weapon.toLowerCase()}: ${sv.call.ok ? 'he faced them' : `too risky (it would cost about ${sv.call.taken} life), he fell back`}` : 'nothing big yet'}`,
    '',
    `  Survivor      🧑 ${w.icon} ${w.name}${w.ammo ? ` (${sv.ammo} bullets)` : ''} · ${heroDamage(sv)} damage · reach ${w.range} · life ${sv.hp}/${heroMax(sv)}`,
    `  Next weapon   ${next ? `${next.icon} ${next.name}: shelter Lv ${next.level}, ${next.cost} scrap` : 'that is the best there is'}`,
    `  Wearing       protects ${Math.round(armor(sv) * 100)}% of every bite`,
    ...GEAR_SLOTS.map(s => gearLine(sv, s)),
    '',
    `Blueprints: ${known.join(', ') || 'none yet'}${left ? ` · ${left} still to find` : ' · he has them all'}`,
    '',
    'What the survivor has learned:',
    ...Object.keys(SKILLS).map(k => tierText(sv, k)),
    '',
    `🧟 Wave ${sv.wave} (${Math.min(sv.waveKills, waveNeed(sv.wave))}/${waveNeed(sv.wave)}) · best wave ${sv.bestWave}`,
    `  Zombies       ${sv.kills} killed · ${sv.totals.brutes} brutes · ${sv.totals.bosses} tyrants · ${sv.totals.turretKills} by the turrets`,
    `  Gathered      ${sv.totals.scrapFound} scrap · ${sv.totals.woodFound} wood · ${sv.totals.gearFound} pieces of clothing found`,
    `  Made          ${sv.totals.builds} built · ${sv.totals.clothes} clothes · ${sv.totals.meals} meals · ${sv.totals.bulletsMade} bullets`,
    `  Traps        ${sv.totals.trapKills} killed by traps and spikes · ${sv.totals.game} game caught · ${sv.totals.defenses} set up\n  Retreats      ${sv.totals.retreats} times he fell back from a fight he couldn't win\n  Explored      ${sv.totals.sites} places · ${sv.totals.dives} lake dives · ${sv.totals.hordes} hordes met`,
    `  The shelter fell ${sv.totals.falls} time${sv.totals.falls === 1 ? '' : 's'}`,
  ];
  return lines.join('\n');
}

module.exports = {
  isShown, setShown, setGame, load, tick, render, shelterReport, step, newSave,
  BLUEPRINTS, shelterMax, slotsAt, turretDamage, turretCost, wallCost, heroMax, waveNeed, skillTier, armor,
  WEAPONS, ZOMBIES, SKILLS, GEAR_SLOTS, RADIUS, fightEstimate,
};
