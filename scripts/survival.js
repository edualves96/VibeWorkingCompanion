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
// He is not alone for long: Claude's subagents send drifters who shoot from the walls, a compaction
// brings a supply drop, survivors he meets move in and take a role each, and a dog may follow him
// home. Once he flies the helicopter, a lab studies the virus for a cure. Nights are harder (and a
// blood moon harder still), a generator running on Claude's tokens lights them and electrifies the
// walls, and the days he has been out there are counted.
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
  generator: { icon: '⚡', name: 'Generator', chance: 0.02, after: sv => sv.turrets >= 2 && sv.shelter.level >= 4 },
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
  studying: { icon: '📖', name: 'Studying', counter: 'reads', unit: 'books read through', tiers: [3, 10, 25], text: 'books sink in more often' },
};

const JOB_STEPS = { turret: 8, walls: 10, weapon: 6, ammo: 3, clothes: 6, cook: 4, explore: 5, defense: 5, lab: 20, research: 12, generator: 10, room: 15 };
const JOB_NAMES = { turret: 'turret', walls: 'walls', weapon: 'crafting', ammo: 'bullets', clothes: 'sewing', cook: 'cooking', explore: 'searching', defense: 'defenses', lab: 'the lab', research: 'research', generator: 'generator', room: 'a room' };

// Places to explore. He goes when he is healthy and the shelter is quiet, and takes his chances:
// a building may hide an ambush, a lake may nearly drown him, a bunker is always guarded but holds
// the best finds, and a lost shelter is a safe stop. `loot` is [min, max] per material, the chance
// of a blueprint (`bp`) and of a piece of clothing (`gear`); `meet` the chance of meeting someone
// who would move in (see ROLES), and `book` of finding a book (see ROOMS).
const SITES = {
  building: { icon: '🏢', name: 'abandoned building', weight: 0.4, ambush: 0.35, meet: 0.1, book: 0.08, loot: { scrap: [10, 25], cloth: [3, 7], food: [2, 5], bp: 0.2, gear: 0.15 } },
  lake: { icon: '🌊', name: 'lake', weight: 0.2, meet: 0, book: 0, loot: { wood: [8, 18], scrap: [10, 30], bp: 0.15, gear: 0.25 } },
  shelter: { icon: '⛺', name: 'lost shelter', weight: 0.25, meet: 0.35, book: 0.06, loot: { wood: [8, 15], scrap: [10, 20], food: [3, 6], bp: 0.2, gear: 0 } },
  bunker: { icon: '🚪', name: 'bunker', weight: 0.15, ambush: 1, meet: 0.2, book: 0.15, loot: { scrap: [40, 80], cloth: [5, 10], food: [4, 8], bp: 0.7, gear: 0.4, tier: 1 } },
  // Further out, down the road, only on trips (`road` is their weight there, `wave` the first wave
  // they turn up in). Their finds grow with the waves.
  farm: { icon: '🌾', name: 'farm', weight: 0, road: 0.35, meet: 0.15, book: 0.03, loot: { food: [5, 12], wood: [10, 25], cloth: [2, 5], bp: 0.1, gear: 0.1 } },
  station: { icon: '🏪', name: 'gas station', weight: 0, road: 0.3, ambush: 0.25, meet: 0.05, book: 0.05, loot: { scrap: [20, 40], food: [4, 10], cloth: [2, 6], bp: 0.15, gear: 0.15 } },
  town: { icon: '🏬', name: 'town', weight: 0, road: 0.25, ambush: 0.45, meet: 0.25, book: 0.2, loot: { scrap: [30, 60], wood: [15, 30], cloth: [5, 10], food: [3, 8], bp: 0.3, gear: 0.3 } },
  base: { icon: '🪖', name: 'army base', weight: 0, road: 0.1, wave: 6, ambush: 1, meet: 0.1, book: 0.1, loot: { scrap: [80, 150], cloth: [6, 12], food: [5, 10], bp: 0.8, gear: 0.6, tier: 1 } },
};

// Trips off the map: by day, when the shelter can look after itself, he follows the road out of
// one end of the strip to a few places further out (`stops`, each `gap` tiles past the last),
// searches them and comes home, at most every `every` steps and once he has explored `after`
// places near the shelter. Zombies idle along the road until he comes near: a group on each stretch
// of it at the chance `groups`, and more turning up ahead of him as he walks (`zombie` a step, `road`
// the most out there at once). Meanwhile more of them come for the shelter (`lure` times as many),
// and once a trip a horde may (`raid`).
const TRIP = { every: 240, after: 3, stops: [2, 4], gap: [5, 9], groups: 0.7, zombie: 0.06, road: 10, lure: 1.5, raid: 0.5 };

// Every subagent Claude runs sends a drifter to the shelter (the adventure's allies, from the same
// hook events, two at a time at most). It stands on the walls and shoots the nearest zombie within
// DRIFTER_RANGE every step, until its subagent finishes.
const DRIFTER_TILES = [2, -2];
const DRIFTER_RANGE = 6;
// When Claude compacts the conversation, a supply drop lands by parachute somewhere on the strip.
// It holds more than a crate (`more` per wave), bullets once he makes them, and good odds of a
// blueprint and a piece of clothing.
const SUPPLY = { scrap: [25, 45], wood: [15, 30], cloth: [4, 8], food: [4, 8], more: 0.1, ammo: 30, bp: 0.5, gear: 0.3, book: 0.3 };

// Survivors he meets on his searches move in while there is a bed for them (one every BED_EVERY
// shelter levels), and each takes the role nobody has yet. They stay inside, so nothing can hurt
// them, and a fallen shelter is rebuilt around them.
const BED_EVERY = 3;
const ROLES = {
  mechanic: { icon: '🔧', name: 'mechanic', text: 'mends the walls twice as fast' },
  medic: { icon: '🩹', name: 'medic', text: 'rests heal twice as fast, and knockouts end sooner' },
  cook: { icon: '🍳', name: 'cook', text: 'cooks meals from the food in the pantry' },
  lookout: { icon: '🔭', name: 'lookout', text: 'shoots from the roof like another turret, a little farther' },
  scavenger: { icon: '🎒', name: 'scavenger', text: 'goes on runs and comes back with materials' },
};
const NAMES = ['Maria', 'Joe', 'Ana', 'Sam', 'Rosa', 'Ken', 'Lucia', 'Tom', 'Nadia', 'Ivan', 'Mei', 'Omar'];
const LOOKOUT_RANGE = 8;
const COOK_EVERY = 40;       // steps between the cook's meals, while there is food
const RUN_EVERY = 150;       // steps between the scavenger's runs
const RUN_BLUEPRINT = 0.05;
const RUN_BOOK = 0.05;
// A dog he finds on a search (once he has explored DOG.after places) follows him from then on. It
// fetches a crate within DOG.fetch tiles of him (then rests DOG.rest steps) and barks before an
// ambush, so fewer catch him.
const DOG = { chance: 0.12, after: 4, fetch: 3, rest: 30, bark: 0.15 };
const DOG_NAMES = ['Biscuit', 'Rex', 'Scout', 'Pepper', 'Ranger', 'Lucky'];

// The endgame, once he flies the helicopter: zombies carry samples of the virus (SAMPLES: under 1
// the chance of one, from 1 how many; a bunker may hold one too), and a lab at the shelter
// studies them, one stage of CURE at a time. Each stage helps for good, and the last cures the
// outbreak: a ✨ on the shelter, worth CURE_BONUS more damage and walls. A new strain follows, and
// curing it takes CURE_AGAIN more samples each time.
const LAB = { scrap: 4000, wood: 1500 };
const SAMPLES = { brute: 0.01, spitter: 0.015, boss: 5, bunker: 0.3 };
const CURE = [
  { icon: '🧫', name: 'Antibodies', samples: 10, scrap: 500, text: 'bites hurt him 15% less' },
  { icon: '🔬', name: 'Weak spot', samples: 20, scrap: 1000, text: 'he, the turrets and the drifters hit 15% harder' },
  { icon: '🩸', name: 'Serum', samples: 30, scrap: 1500, text: 'zombies come with 10% less life' },
  { icon: '🧴', name: 'Repellent', samples: 40, scrap: 2000, text: 'hordes and ambushes are a third smaller' },
  { icon: '💉', name: 'The cure', samples: 60, scrap: 3000, text: 'ends the outbreak' },
];
const CURE_BONUS = 0.1;
const CURE_AGAIN = 0.5;

// Night follows the adventure's clock (companion.js passes it in). In the dark NIGHT_SPAWN as many
// zombies come and NIGHT_CROWD more can be about at once, more of them runners, and the shelter's
// guns only see NIGHT_RANGE tiles unless the generator powers the lights. On the night of the full
// moon a blood moon rises: more zombies still (BLOOD), and twice what they drop. The moon's age
// comes from the date (MOON: its mean month and a known new moon), at 1 a.m. that night, so each
// full moon has one blood moon night.
const NIGHT_RANGE = 5;
const NIGHT_SPAWN = 1.2;
const NIGHT_CROWD = 1;
const BLOOD = { spawn: 1.5, crowd: 2, drops: 2 };
const MOON = { month: 29.530588853, newAt: Date.UTC(2000, 0, 6, 18, 14) };
// The generator, built once he has its blueprint, runs on the tokens Claude uses while this game
// is on display: TOKENS_PER_FUEL of them make a second of power, it holds FUEL_MAX, and it burns a
// second's worth every step. While it runs it lights the strip around the shelter at night and
// powers an electric fence that shocks the zombies at the walls.
const GENERATOR = { scrap: 150, wood: 60 };
const TOKENS_PER_FUEL = 500;
const FUEL_MAX = 900;

// Inside the shelter. He builds there, and while he rests or is holed up he keeps busy: he builds
// what he can, or reads the books he has found, or puts the storage in order, which turns up a few
// forgotten materials (ORGANIZE.find) every ORGANIZE.every steps. Books are hard going: a read takes
// READ_STEPS, and sinks in only with a chance of UNDERSTAND (more with each tier of Studying); if it
// doesn't, he reads it again. The books he understands teach him the ROOMS, one at a time and in
// that order, which he builds in a cellar the shelter digs at CELLAR_LEVEL.
const READ_STEPS = 90;
const UNDERSTAND = [0.4, 0.15];
const ORGANIZE = { every: 40, find: [2, 5] };
// With a book to read, he also takes a break for it: BREAK.steps of reading every BREAK.every
// steps, when nothing is at the walls.
const BREAK = { every: 600, steps: 45 };
const CELLAR_LEVEL = 5;
const ROOMS = {
  greenhouse: { icon: '🌱', name: 'Greenhouse', books: 1, scrap: 200, wood: 150, cloth: 0, text: 'grows 2 food every 90 seconds' },
  infirmary: { icon: '🩺', name: 'Infirmary', books: 2, scrap: 250, wood: 100, cloth: 20, text: 'rests heal faster, and knockouts end sooner' },
  armory: { icon: '💣', name: 'Armory', books: 3, scrap: 400, wood: 100, cloth: 0, text: 'half again as many bullets a batch' },
  radio: { icon: '📻', name: 'Radio room', books: 3, scrap: 500, wood: 50, cloth: 30, text: 'calls in a supply drop every 2 hours' },
  training: { icon: '💪', name: 'Training room', books: 4, scrap: 300, wood: 200, cloth: 20, text: 'he hits 10% harder' },
};
const GREENHOUSE = { every: 90, food: 2 };
const RADIO_EVERY = 7200;
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
    // `drifters` are the subagents at the shelter, each known by when it arrived; `residents` the
    // survivors who moved in ({ name, role }); `facing` the way he last moved, for the dog.
    drifters: [], residents: [], dog: null, facing: 1, samples: 0, lab: false, stage: 0, cures: 0,
    // Whether it was night (and a blood moon) at the last tick; the generator's fuel and the token
    // total last counted toward it ({ total, at }); the days played (`day` is the last one, in days
    // since 1970) and how many of them in a row the shelter has stood (`safeDays`, best `bestSafe`).
    night: null, blood: false, generator: false, fuel: 0, tokens: null, day: null, days: 0, safeDays: 0, bestSafe: 0,
    // Whether Claude was working at the last tick, and the last zombie's id (the window tells them
    // apart by it).
    active: false, seq: 0,
    // Inside: the books not understood yet, the steps into the one he is reading, the books
    // understood toward each room, the rooms built, what he did inside on the last step (for the
    // window and the stats row), and the steps of tidying toward the next find.
    books: 0, reading: 0, understood: {}, rooms: [], doing: null, sorted: 0, breakAt: 0, breakLeft: BREAK.steps,
    // The trip he is on ({ side, stops, home }, see plan()), and the step he may set out on the next.
    trip: null, tripAt: 0,
    totals: {
      scrapFound: 0, woodFound: 0, falls: 0, brutes: 0, bosses: 0, turretKills: 0, crates: 0, handKills: 0, builds: 0, waves: 0,
      knockouts: 0, rests: 0, retreats: 0, lessons: 0, defenses: 0, trapKills: 0, game: 0, sites: 0, dives: 0, hordes: 0, clothes: 0, meals: 0, bulletsMade: 0, gearFound: 0,
      drifters: 0, allyKills: 0, drops: 0, fetched: 0, runs: 0, samples: 0, fenceKills: 0, bloodMoons: 0,
      booksFound: 0, reads: 0, roomsBuilt: 0, organized: 0, trips: 0,
    },
  };
}

// Whether the night that `now` falls in (local time) is the full moon's: the moon's age at 1 a.m.
// that night is within half a day of full.
function bloodMoon(now) {
  const mid = new Date(now);
  if (mid.getHours() >= 12) {
    mid.setDate(mid.getDate() + 1);
  }
  mid.setHours(1, 0, 0, 0);
  const age = (((mid.getTime() - MOON.newAt) / 86400000) % MOON.month + MOON.month) % MOON.month;
  return Math.abs(age - MOON.month / 2) <= 0.5;
}

// The generator has fuel to run on.
function powered(sv) {
  return sv.generator && sv.fuel >= 1;
}

// How far the shelter's guns see: in the dark, only NIGHT_RANGE, unless the lights are on.
function sees(sv, range) {
  return sv.night && !powered(sv) ? Math.min(range, NIGHT_RANGE) : range;
}

function fenceDamage(sv) {
  return Math.round((4 + sv.shelter.level) * strength(sv));
}

// More damage and walls for every cure (see CURE_BONUS), and the Weak spot stage's on top.
function cureBonus(sv) {
  return 1 + CURE_BONUS * sv.cures;
}

// Whether the lab has finished CURE stage `n` (1 is the first). After the first cure, all of them.
function researched(sv, n) {
  return sv.cures > 0 || sv.stage >= n;
}

function strength(sv) {
  return cureBonus(sv) * (researched(sv, 2) ? 1.15 : 1);
}

// Samples only turn up once he flies the helicopter.
function flying(sv) {
  return sv.weapon >= WEAPONS.length - 1;
}

// What the lab studies next: the next stage of the first cure, then each new strain's cure, which
// takes CURE_AGAIN more samples every time.
function nextStage(sv) {
  if (sv.cures === 0) {
    return CURE[sv.stage];
  }
  const cure = CURE[CURE.length - 1];
  return { ...cure, samples: Math.round(cure.samples * (1 + CURE_AGAIN * sv.cures)) };
}

function hasRole(sv, role) {
  return sv.residents.some(r => r.role === role);
}

function beds(sv) {
  return Math.min(Object.keys(ROLES).length, Math.floor(sv.shelter.level / BED_EVERY));
}

function hasRoom(sv, key) {
  return sv.rooms.includes(key);
}

// The room he studies for now: the first in ROOMS he hasn't understood all the books for, or null.
function topic(sv) {
  return Object.keys(ROOMS).find(k => (sv.understood[k] || 0) < ROOMS[k].books) || null;
}

// A room to build: one he has learned and not built, once the cellar is dug, and only when he can
// pay for it at once (he never saves up for one).
function nextRoom(sv) {
  if (sv.shelter.level < CELLAR_LEVEL) {
    return null;
  }
  const key = Object.keys(ROOMS).find(k => (sv.understood[k] || 0) >= ROOMS[k].books && !hasRoom(sv, k));
  const r = ROOMS[key];
  return r && sv.scrap >= r.scrap && sv.wood >= r.wood && sv.cloth >= r.cloth
    ? { kind: 'room', scrap: r.scrap, wood: r.wood, cloth: r.cloth, food: 0, data: { key } } : null;
}

function drifterDamage(sv) {
  return Math.round((3 + sv.shelter.level) * strength(sv));
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
  return Math.round(wallsMax(sv.shelter.level, skillTier(sv, 'fortifying')) * cureBonus(sv));
}

function slotsAt(level) {
  return Math.min(TURRET_SLOTS.length, 1 + Math.floor(level / 2));
}

function turretDamage(sv) {
  const heavy = knows(sv, 'heavy') ? 1.5 : 1;
  return Math.round((2 + Math.floor(sv.shelter.level * 0.4)) * (1 + 0.2 * skillTier(sv, 'engineering')) * heavy * strength(sv));
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
  const trained = hasRoom(sv, 'training') ? 1.1 : 1;
  return Math.round((w.damage + Math.floor(sv.shelter.level * 0.8)) * (1 + 0.2 * skillTier(sv, 'combat')) * gun * fed * trained * strength(sv));
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

// The waves hold at the shelter's pace (its walls and turrets), so a strong shelter stays ahead:
// this is the last wave the shelter is ready for.
function waveCap(sv) {
  const defense = sv.shelter.level + sv.turrets;
  return defense + 1 + Math.floor(defense / 5);
}

// The wave's kills are done, but the shelter isn't ready for the next one.
function waveHeld(sv) {
  return sv.waveKills >= waveNeed(sv.wave) && sv.wave >= waveCap(sv);
}

function waveText(sv) {
  return waveHeld(sv) ? `🧟 Wave ${sv.wave}: held` : `🧟 Wave ${sv.wave}: ${Math.max(0, waveNeed(sv.wave) - sv.waveKills)} left`;
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

// The share of each bite that still hurts him: what his clothes let through, less the lab's
// Antibodies.
function biteShare(sv) {
  return (1 - armor(sv)) * (researched(sv, 1) ? 0.85 : 1);
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
// (they are cheap and wanted at once), then turrets and the generator (he saves up for them), a
// better weapon, the lab and its research once he flies (he saves up for those too, but doesn't
// wait on samples), and stronger walls (which also open more turret slots).
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
  if (knows(sv, 'generator') && !sv.generator) {
    return sv.scrap >= GENERATOR.scrap && sv.wood >= GENERATOR.wood ? { ...none, kind: 'generator', scrap: GENERATOR.scrap, wood: GENERATOR.wood } : null;
  }
  const w = WEAPONS[sv.weapon + 1];
  if (w && sv.shelter.level >= w.level && knows(sv, w.blueprint) && sv.scrap >= w.cost) {
    return { ...none, kind: 'weapon', scrap: w.cost };
  }
  const room = nextRoom(sv);
  if (room) {
    return room;
  }
  if (flying(sv) && !sv.lab) {
    return sv.scrap >= LAB.scrap && sv.wood >= LAB.wood ? { ...none, kind: 'lab', scrap: LAB.scrap, wood: LAB.wood } : null;
  }
  const stage = flying(sv) ? nextStage(sv) : null;
  if (stage && sv.samples >= stage.samples) {
    return sv.scrap >= stage.scrap ? { ...none, kind: 'research', scrap: stage.scrap } : null;
  }
  const walls = wallCost(sv.shelter.level);
  return sv.wood >= walls && sv.scrap >= walls / 2 ? { ...none, kind: 'walls', scrap: walls / 2, wood: walls } : null;
}

// What he is saving up for, for the stats and the shelter report.
function goalText(sv) {
  if (sv.turrets < slotsAt(sv.shelter.level)) {
    return knows(sv, 'turret') ? `🗼 turret ${turretCost(sv.turrets)} 🔩` : '📜 a blueprint for turrets';
  }
  if (knows(sv, 'generator') && !sv.generator) {
    return `⚡ generator ${GENERATOR.scrap} 🔩 + ${GENERATOR.wood} 🪵`;
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
  if (flying(sv) && !sv.lab) {
    return `🧪 lab ${LAB.scrap} 🔩 + ${LAB.wood} 🪵`;
  }
  if (flying(sv) && sv.samples >= nextStage(sv).samples) {
    return `${nextStage(sv).icon} ${nextStage(sv).name} ${nextStage(sv).scrap} 🔩`;
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
  sv.understood = { ...sv.understood };
  sv.learned = { ...sv.learned };
  for (const key of Object.keys(SKILLS)) {
    // A skill already earned in an older save is not announced again.
    sv.learned[key] = sv.learned[key] ?? skillTier(sv, key);
  }
  return sv;
}

// On Windows the rename fails now and then while another process is reading the save (the status
// line renders from it). It is tried a few more times; if it still fails, the temporary file goes
// and so does this save, which costs nothing: lastTick wasn't saved either, so the next tick
// plays the same time again.
function save(sv) {
  const tmp = `${SAVE_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(sv));
  for (let tries = 1; ; tries++) {
    try {
      fs.renameSync(tmp, SAVE_FILE);
      return;
    } catch (e) {
      if (tries >= 5 || !['EPERM', 'EACCES', 'EBUSY'].includes(e.code)) {
        try { fs.unlinkSync(tmp); } catch {}
        if (tries >= 5) {
          return;
        }
        throw e;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  }
}

// ---------- simulation ----------

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

// A message stays MSG_MS on the stats row. One with its own `ms` (the update notice, see announce)
// isn't replaced until that is up.
function say(sv, text, now) {
  if (sv.msg && sv.msg.ms && now - sv.msg.at < sv.msg.ms) {
    return;
  }
  sv.msg = { text, at: now };
}

// News from companion.js (the update notice), kept on the stats row for `ms`.
function announce(text, now, ms) {
  const sv = load(now);
  sv.msg = { text, at: now, ms };
  save(sv);
}

function makeZombie(sv) {
  // More kinds turn up as the waves go on: brutes, then runners, then spitters. Runners come out
  // early at night, and twice as often.
  const runner = sv.night ? (sv.wave >= 2 ? Math.min(0.4, 0.08 * (sv.wave - 1)) : 0) : sv.wave >= 4 ? Math.min(0.25, 0.04 * (sv.wave - 3)) : 0;
  const chances = [
    ['brute', sv.wave >= 2 ? Math.min(0.5, 0.08 * (sv.wave - 1)) : 0],
    ['runner', runner],
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
  const serum = researched(sv, 3) ? 0.9 : 1;
  const hp = Math.round(z.hp * (1 + 0.15 * (sv.wave - 1)) * (0.85 + Math.random() * 0.3) * serum);
  sv.seq++;
  return { id: sv.seq, kind, x: Math.random() < 0.5 ? -RADIUS : RADIUS, hp, max: hp };
}

function dropGear(sv, now, bonus = 0) {
  const slot = GEAR_SLOTS[randInt(0, GEAR_SLOTS.length - 1)];
  // Better tiers turn up further into the waves.
  const tier = Math.min(GEAR_TIERS.length - 1, Math.floor(Math.random() * (1 + sv.wave / 6)) + bonus);
  sv.totals.gearFound++;
  wear(sv, { slot: slot.key, tier, quality: randInt(0, 9) }, now, true);
}

// `source` is who did it: 'hand', 'turret', 'trap' (a trap or spikes), 'ally' (a drifter or the
// lookout) or 'fence'. Under a blood moon a zombie drops BLOOD.drops times as much.
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
  } else if (source === 'ally') {
    sv.totals.allyKills++;
  } else if (source === 'fence') {
    sv.totals.fenceKills++;
  } else {
    sv.totals.handKills++;
  }
  if (flying(sv)) {
    const chance = SAMPLES[z.kind] || 0;
    addSamples(sv, chance >= 1 ? chance : Math.random() < chance ? 1 : 0);
  }
  const more = sv.blood ? BLOOD.drops : 1;
  const scrap = (def.scrap + (Math.random() < 0.5 ? 1 : 0)) * more;
  sv.scrap += scrap;
  sv.totals.scrapFound += scrap;
  if (Math.random() < DROPS.wood * more) {
    sv.wood++;
    sv.totals.woodFound++;
  }
  if (Math.random() < DROPS.cloth * more) {
    sv.cloth++;
  }
  if (Math.random() < DROPS.food * more) {
    sv.food++;
  }
  if (z.kind !== 'boss' && Math.random() < DROPS.gear * more) {
    dropGear(sv, now);
  }
}

function addSamples(sv, n) {
  sv.samples += n;
  sv.totals.samples += n;
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
  if (kind === 'turret' || kind === 'walls' || kind === 'weapon' || kind === 'lab' || kind === 'generator' || kind === 'room') {
    sv.totals.builds++;
  }
  if (kind === 'room') {
    const r = ROOMS[data.key];
    sv.rooms.push(data.key);
    sv.totals.roomsBuilt++;
    say(sv, `${r.icon} ${r.name} built in the cellar: ${r.text}`, now);
  } else if (kind === 'generator') {
    sv.generator = true;
    say(sv, '⚡ Generator built: it runs on the tokens Claude uses', now);
  } else if (kind === 'lab') {
    sv.lab = true;
    say(sv, '🧪 The lab is built: the samples can be studied', now);
  } else if (kind === 'research') {
    const stage = nextStage(sv);
    sv.samples -= stage.samples;
    if (sv.cures === 0 && sv.stage < CURE.length - 1) {
      sv.stage++;
      say(sv, `${stage.icon} ${stage.name}: ${stage.text}`, now);
    } else {
      sv.stage = CURE.length;
      sv.cures++;
      say(sv, sv.cures === 1 ? '💉 The cure works ✨ but a new strain is spreading' : `💉 Another strain cured ✨${sv.cures}`, now);
    }
  } else if (kind === 'defense') {
    sv.totals.defenses++;
    sv.defReady = sv.step + DEFENSE_COOLDOWN;
    const type = data.type;
    sv.defenses.push({ type, x: data.x, hp: type === 'barricade' ? barricadeHp(sv) : 0, uses: type === 'spikes' ? SPIKE_USES : 1 });
    say(sv, `${DEFENSES[type].icon} ${DEFENSES[type].name[0].toUpperCase()}${DEFENSES[type].name.slice(1)} set up`, now);
  } else if (kind === 'turret') {
    sv.turrets++;
    say(sv, `🗼 Turret ${sv.turrets} built`, now);
  } else if (kind === 'ammo') {
    const made = Math.round(BULLETS.made * (1 + 0.25 * skillTier(sv, 'gunsmithing')) * (hasRoom(sv, 'armory') ? 1.5 : 1));
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
  sv.safeDays = 0;
  for (const key of ['scrap', 'wood', 'cloth', 'food']) {
    sv[key] = Math.floor(sv[key] * 0.75);
  }
  sv.zombies = [];
  // A supply drop still waiting out there stays: it came from Claude, not from the strip.
  sv.crates = sv.crates.filter(c => c.kind === 'drop');
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
  sv.trip = null;
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
  if (crate.kind === 'drop') {
    openDrop(sv, now);
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

// What a supply drop holds (see SUPPLY).
function openDrop(sv, now) {
  sv.totals.drops++;
  const more = 1 + SUPPLY.more * sv.wave;
  const found = [];
  for (const key of ['scrap', 'wood', 'cloth', 'food']) {
    const n = Math.round(randInt(...SUPPLY[key]) * more);
    sv[key] += n;
    if (key === 'scrap' || key === 'wood') {
      sv.totals[`${key}Found`] += n;
    }
    found.push(`${n} ${key}`);
  }
  if (knows(sv, 'ammo')) {
    sv.ammo += SUPPLY.ammo;
    found.push(`${SUPPLY.ammo} bullets`);
  }
  say(sv, `🪂 Supply drop: +${found.join(', +')}`, now);
  if (Math.random() < SUPPLY.bp) {
    findBlueprint(sv, now);
  }
  if (Math.random() < SUPPLY.gear) {
    dropGear(sv, now);
  }
  if (Math.random() < SUPPLY.book) {
    findBook(sv, now);
  }
}

// A supply drop comes down somewhere on the strip, and he fetches it like a crate.
function landDrop(sv) {
  const side = Math.random() < 0.5 ? -1 : 1;
  sv.crates.push({ x: side * randInt(3, RADIUS - 1), kind: 'drop' });
}

// Claude is compacting the conversation: a supply drop. Only that it happens counts. Called from
// the hook, under the lock.
function supplyDrop(now) {
  const sv = load(now);
  landDrop(sv);
  say(sv, '🪂 A supply drop is coming down', now);
  save(sv);
}

// ---------- inside ----------

// A book, as long as he still needs more than he has to learn every room.
function findBook(sv, now) {
  const needed = Object.keys(ROOMS).reduce((sum, k) => sum + Math.max(0, ROOMS[k].books - (sv.understood[k] || 0)), 0);
  if (sv.books >= needed) {
    return;
  }
  sv.books++;
  sv.totals.booksFound++;
  say(sv, `📚 Found a book on the ${ROOMS[topic(sv)].name.toLowerCase()}`, now);
}

// A step of reading. At the end of a read the book sinks in, or he will have to read it again.
function read(sv, now) {
  sv.doing = 'study';
  sv.reading++;
  if (sv.reading < READ_STEPS) {
    return;
  }
  sv.reading = 0;
  sv.totals.reads++;
  const key = topic(sv);
  const r = ROOMS[key];
  if (Math.random() >= UNDERSTAND[0] + UNDERSTAND[1] * skillTier(sv, 'studying')) {
    say(sv, `📖 Read a book on the ${r.name.toLowerCase()}, but it didn't sink in`, now);
    return;
  }
  sv.books--;
  sv.understood[key] = (sv.understood[key] || 0) + 1;
  const n = sv.understood[key];
  say(sv, n < r.books ? `📖 A book on the ${r.name.toLowerCase()} sank in (${n}/${r.books})`
    : `📖 He knows how to build the ${r.name.toLowerCase()}${sv.shelter.level < CELLAR_LEVEL ? `, once the shelter has a cellar (Lv ${CELLAR_LEVEL})` : ''}`, now);
}

// Whether he takes his reading break now: one is due, he has a book, and nothing is at the walls.
function readingBreak(sv) {
  return sv.books > 0 && !!topic(sv) && sv.step >= sv.breakAt && !sv.zombies.some(z => Math.abs(z.x) <= WALL + 3);
}

// A step of tidying the storage, which now and then turns up something forgotten.
function organize(sv, now) {
  sv.doing = 'organize';
  sv.sorted++;
  if (sv.sorted < ORGANIZE.every) {
    return;
  }
  sv.sorted = 0;
  const kind = ['scrap', 'wood', 'cloth'][randInt(0, 2)];
  const n = randInt(...ORGANIZE.find);
  sv[kind] += n;
  if (kind === 'scrap' || kind === 'wood') {
    sv.totals[`${kind}Found`] += n;
  }
  sv.totals.organized++;
  say(sv, `📦 Tidied up the storage and found ${n} ${kind}`, now);
}

// A step of the job he is on, inside the shelter (or out at a place he searches).
function work(sv, now) {
  sv.doing = sv.job.kind;
  sv.job.left--;
  if (sv.job.left <= 0) {
    finishJob(sv, now);
  }
}

// Inside while resting or holed up, he keeps busy: the job he is on, or something new to build,
// or a book, or the storage.
function indoor(sv, now) {
  if (sv.job && sv.job.kind !== 'explore') {
    work(sv, now);
    return;
  }
  const build = nextBuild(sv);
  if (build) {
    startJob(sv, build);
    sv.doing = build.kind;
  } else if (sv.books > 0 && topic(sv)) {
    read(sv, now);
  } else {
    organize(sv, now);
  }
}

// The subagents at work now (`drifters`, each known by when it arrived), from companion.js. A
// new one is a drifter who just came to the walls.
function meetDrifters(sv, drifters, now) {
  const fresh = drifters.filter(d => !sv.drifters.includes(d));
  if (fresh.length) {
    sv.totals.drifters += fresh.length;
    say(sv, `🤠 ${fresh.length > 1 ? `${fresh.length} drifters come` : 'A drifter comes'} to help on the walls`, now);
  }
  sv.drifters = drifters.slice(0, DRIFTER_TILES.length);
}

// Someone he met on a search moves in, if a bed is free, and takes a role nobody has yet.
function moveIn(sv, now) {
  const roles = Object.keys(ROLES).filter(r => !hasRole(sv, r));
  if (sv.residents.length >= beds(sv) || !roles.length) {
    return;
  }
  const names = NAMES.filter(n => !sv.residents.some(r => r.name === n));
  const resident = { name: names[randInt(0, names.length - 1)], role: roles[randInt(0, roles.length - 1)] };
  sv.residents.push(resident);
  const role = ROLES[resident.role];
  say(sv, `👷 ${resident.name} moves in: ${role.icon} the ${role.name}`, now);
}

// The scavenger is back from a run, with a crate's worth (twice over) and maybe a blueprint.
function scavengerRun(sv, now) {
  const who = sv.residents.find(r => r.role === 'scavenger');
  const kind = ['scrap', 'wood', 'cloth', 'food'][randInt(0, 3)];
  const n = 2 * (3 + Math.floor(sv.wave / 3) + randInt(0, 2));
  sv[kind] += n;
  if (kind === 'scrap' || kind === 'wood') {
    sv.totals[`${kind}Found`] += n;
  }
  sv.totals.runs++;
  say(sv, `🎒 ${who.name} is back from a run: +${n} ${kind}`, now);
  if (Math.random() < RUN_BLUEPRINT) {
    findBlueprint(sv, now);
  }
  if (Math.random() < RUN_BOOK) {
    findBook(sv, now);
  }
}

// Eating on the move, or at the kitchen table: under half life, he eats a meal he has cooked.
function eat(sv, now) {
  if (sv.meals > 0 && sv.fed <= 0 && sv.hp < heroMax(sv) * MEAL.below) {
    if (sv.x === 0) {
      sv.doing = 'eat';
    }
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
  const fire = shelterFire(sv);
  const turrets = Math.abs(from) <= sees(sv, TURRET_RANGE) ? fire : 0;
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
  const guard = biteShare(sv);
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
  // Holing up only helps if the shelter's guns can clear them before they wear the walls down.
  const wallDps = 0.5 * group.reduce((sum, z) => sum + Math.round(ZOMBIES[z.kind].dmg * (1 + 0.07 * (sv.wave - 1))), 0);
  const clear = fire > 0 ? total / fire : Infinity;
  const barricades = sv.defenses.filter(d => d.type === 'barricade').length;
  const hold = wallDps * 0.6 * clear * (1 - Math.min(0.5, 0.15 * barricades)) < sv.shelter.hp * 0.6;
  return { ok: taken * bias < sv.hp * RISK, hold, taken: Math.round(taken), weapon: first, steps };
}

// What the shelter shoots every step: the turrets, the drifters on the walls and the lookout.
function shelterFire(sv) {
  return sv.turrets * turretDamage(sv) + sv.drifters.length * drifterDamage(sv) + (hasRole(sv, 'lookout') ? turretDamage(sv) : 0);
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

// He sets out on a trip only by day, rested, with the walls nearly whole, a turret to guard them
// and nothing near them (no tyrant anywhere).
function canTrip(sv) {
  return !sv.night && sv.step >= sv.tripAt && sv.turrets > 0 && sv.totals.sites >= TRIP.after && !sv.boss
    && sv.hp >= heroMax(sv) * 0.9 && sv.shelter.hp >= shelterMax(sv) * 0.8
    && !sv.zombies.some(z => z.kind === 'boss' || Math.abs(z.x) <= WALL + 3);
}

// A trip down the road out of the end of the strip with fewer zombies: a few places, each further
// out than the last. Scouting adds a stop.
function plan(sv) {
  const left = sv.zombies.filter(z => z.x < 0).length;
  const right = sv.zombies.length - left;
  const side = left === right ? (Math.random() < 0.5 ? -1 : 1) : left < right ? -1 : 1;
  const kinds = Object.entries(SITES).filter(([, s]) => s.road && sv.wave >= (s.wave || 0));
  const total = kinds.reduce((sum, [, s]) => sum + s.road, 0);
  const count = Math.min(TRIP.stops[1], randInt(...TRIP.stops) + (skillTier(sv, 'scouting') >= 2 ? 1 : 0));
  const stops = [];
  let d = RADIUS;
  for (let i = 0; i < count; i++) {
    d += randInt(...TRIP.gap);
    let roll = Math.random() * total;
    let kind = kinds[0][0];
    for (const [k, s] of kinds) {
      roll -= s.road;
      if (roll < 0) {
        kind = k;
        break;
      }
    }
    stops.push({ kind, x: side * d });
  }
  // Groups idling on the stretches of road between them.
  let from = RADIUS + 2;
  for (const stop of stops) {
    if (Math.random() < TRIP.groups) {
      const spot = randInt(from, Math.abs(stop.x) - 1);
      for (let i = 0; i < randInt(1, 2 + Math.floor(sv.wave / 8)); i++) {
        stray(sv, side * (spot + (i % 2)));
      }
    }
    from = Math.abs(stop.x) + 2;
  }
  return { side, stops, home: false, raided: false };
}

// A zombie idling out on the road at `x`, until he comes near.
function stray(sv, x) {
  const z = makeZombie(sv);
  z.x = x;
  z.idle = true;
  sv.zombies.push(z);
}

// The trip is over (or cut short): the zombies still idling down the road stay out there.
function endTrip(sv) {
  sv.trip = null;
  sv.tripAt = sv.step + TRIP.every;
  sv.zombies = sv.zombies.filter(z => !z.idle);
}

// A step of a trip: on to the next place and its search, or home once they are all searched, or
// sooner when he is hurt, night falls or the shelter is in trouble.
function roam(sv, now) {
  const trip = sv.trip;
  if (!trip.home) {
    const why = sv.shelter.hp < shelterMax(sv) / 2 ? '🏃 The shelter is under attack: heading home'
      : sv.hp < heroMax(sv) / 2 ? '🩹 Hurt: heading home'
        : sv.night ? '🌙 Night is falling: heading home' : null;
    if (why) {
      say(sv, why, now);
    }
    trip.home = !!why || !trip.stops.length;
  }
  if (trip.home) {
    sv.x += sign(-sv.x);
    if (Math.abs(sv.x) <= RADIUS) {
      endTrip(sv);
      sv.totals.trips++;
      say(sv, '🧭 Back from the trip', now);
    }
    return;
  }
  const stop = trip.stops[0];
  if (sv.x !== stop.x) {
    sv.x += sign(stop.x - sv.x);
    return;
  }
  trip.stops.shift();
  sv.job = { kind: 'explore', left: JOB_STEPS.explore, data: stop };
  say(sv, `🔍 Searching the ${SITES[stop.kind].name}`, now);
}

// The lab's Repellent keeps a third of a group away.
function repelled(sv, count) {
  return researched(sv, 4) ? Math.ceil(count * 2 / 3) : count;
}

function ambush(sv, x, count, now) {
  for (let i = 0; i < Math.min(6, repelled(sv, count)); i++) {
    const z = makeZombie(sv);
    // Out on the road there is no end of the strip to keep them in.
    z.x = Math.abs(x) > RADIUS ? x + (i % 3) - 1 : Math.max(-RADIUS, Math.min(RADIUS, x + (i % 3) - 1));
    sv.zombies.push(z);
  }
  say(sv, '💥 Ambush!', now);
}

function horde(sv, now, away) {
  const side = Math.random() < 0.5 ? -1 : 1;
  const count = repelled(sv, Math.min(8, 3 + Math.floor(sv.wave / 4)));
  for (let i = 0; i < count; i++) {
    const z = makeZombie(sv);
    z.x = side * (RADIUS - Math.min(i, 5));
    sv.zombies.push(z);
  }
  sv.totals.hordes++;
  say(sv, `🧟 A horde of ${count} comes ${away ? 'for the shelter while he is away' : `from the ${side < 0 ? 'left' : 'right'}`}`, now);
}

// What he finds in a place, after the search. Scouting makes the finds bigger.
function explore(sv, site, now) {
  const def = SITES[site.kind];
  const scout = skillTier(sv, 'scouting');
  const dive = skillTier(sv, 'diving');
  sv.totals.sites++;
  let bonus = (1 + 0.25 * scout) * (def.road ? 1 + 0.1 * sv.wave : 1);
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
  const guarded = site.kind === 'bunker' || site.kind === 'base';
  if (def.ambush && Math.random() < def.ambush - 0.08 * scout - (sv.dog ? DOG.bark : 0)) {
    ambush(sv, site.x, guarded ? 3 + Math.floor(sv.wave / 5) : 2 + Math.floor(sv.wave / 6), now);
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
  if (guarded && flying(sv) && Math.random() < SAMPLES.bunker) {
    addSamples(sv, 1);
    say(sv, `🧪 A sample of the virus, left in the ${def.name}'s fridge`, now);
  }
  // Last, so the news isn't lost under the finds: a book, someone to move in, or a dog.
  if (Math.random() < def.book) {
    findBook(sv, now);
  }
  if (Math.random() < def.meet) {
    moveIn(sv, now);
  }
  if (!sv.dog && sv.totals.sites >= DOG.after && Math.random() < DOG.chance) {
    sv.dog = { name: DOG_NAMES[randInt(0, DOG_NAMES.length - 1)] };
    say(sv, `🐕 A dog named ${sv.dog.name} follows him home`, now);
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
  sv.doing = null;
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
  // The generator burns a second of fuel; what it powers this step checks powered() after.
  if (sv.generator && sv.fuel > 0) {
    sv.fuel = Math.max(0, sv.fuel - 1);
  }

  // Zombies arrive from both edges, more of them as the waves go up, and more still at night.
  const dark = sv.night ? (sv.blood ? BLOOD.spawn : NIGHT_SPAWN) : 1;
  // Only those on the strip count toward the crowd, and while he is away down the road, the shelter
  // draws more of them.
  const crowd = 3 + Math.floor(sv.wave / 2) + (sv.night ? (sv.blood ? BLOOD.crowd : NIGHT_CROWD) : 0);
  const away = sv.trip && Math.abs(sv.x) > RADIUS;
  const strip = sv.zombies.filter(z => Math.abs(z.x) <= RADIUS).length;
  if (strip < crowd && Math.random() < Math.min(0.55, 0.18 + 0.03 * sv.wave) * dark * (sv.grace > 0 ? 0.5 : 1) * (away ? TRIP.lure : 1)) {
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
  // Out on the road, zombies turn up ahead of him now and then, a little past where he can see.
  // Once he is well away, a horde may come for the shelter.
  if (away && !sv.trip.home && sv.zombies.length - strip < TRIP.road && Math.random() < TRIP.zombie * dark) {
    stray(sv, sv.x + sign(sv.x) * randInt(SIGHT + 1, SIGHT + 4));
  }
  if (away && !sv.trip.raided && Math.abs(sv.x) > RADIUS + 8) {
    sv.trip.raided = true;
    if (Math.random() < TRIP.raid) {
      horde(sv, now, true);
    }
  }

  // Traps standing out there catch game now and then, as they were made to.
  for (const d of sv.defenses) {
    if (d.type === 'trap' && Math.random() < GAME_CHANCE) {
      sv.food += 2;
      sv.totals.game++;
      say(sv, '🪤 A trap caught game: +2 food', now);
    }
  }

  // The people living in the shelter do their part.
  const cook = sv.residents.find(r => r.role === 'cook');
  if (cook && sv.step % COOK_EVERY === 0 && sv.food >= MEAL.food && sv.meals < MAX_MEALS) {
    sv.food -= MEAL.food;
    sv.meals++;
    say(sv, `🍳 ${cook.name} cooked a meal`, now);
  }
  if (hasRole(sv, 'scavenger') && sv.step % RUN_EVERY === 0) {
    scavengerRun(sv, now);
  }
  // And so do the rooms in the cellar.
  if (hasRoom(sv, 'greenhouse') && sv.step % GREENHOUSE.every === 0) {
    sv.food += GREENHOUSE.food;
  }
  if (hasRoom(sv, 'radio') && sv.step % RADIO_EVERY === 0) {
    landDrop(sv);
    say(sv, '📻 The radio calls in a supply drop', now);
  }

  // The turrets he has built guard the shelter on their own, and so do the drifters on the walls
  // and the lookout on the roof (in the dark, only as far as the lights let them see).
  for (let t = 0; t < sv.turrets; t++) {
    const z = nearest(sv.zombies, 0, sees(sv, TURRET_RANGE));
    if (z) {
      hitZombie(sv, z, turretDamage(sv), 'turret', hits, now);
    }
  }
  for (let d = 0; d < sv.drifters.length; d++) {
    const z = nearest(sv.zombies, 0, sees(sv, DRIFTER_RANGE));
    if (z) {
      hitZombie(sv, z, drifterDamage(sv), 'ally', hits, now);
    }
  }
  const spotted = hasRole(sv, 'lookout') ? nearest(sv.zombies, 0, sees(sv, LOOKOUT_RANGE)) : null;
  if (spotted) {
    hitZombie(sv, spotted, turretDamage(sv), 'ally', hits, now);
  }
  sv.zombies = sv.zombies.filter(z => z.hp > 0);

  // He fights what is in reach; otherwise he builds at the shelter when he can pay for something,
  // chases what is close, or keeps patrolling and gathering.
  const weapon = weaponInHand(sv);
  const from = sv.x;
  if (sv.down > 0) {
    sv.down--;
    sv.doing = 'down';
  } else if (sv.resting) {
    // Hurt, he goes home and rests inside, where nothing can reach him (twice as fast with a medic,
    // faster still with the infirmary), and keeps busy while he heals.
    if (sv.x !== 0) {
      sv.x += sign(-sv.x);
    } else {
      sv.hp = Math.min(heroMax(sv), sv.hp + (hasRole(sv, 'medic') ? 6 : 3) + (hasRoom(sv, 'infirmary') ? 2 : 0));
      sv.doing = 'rest';
      indoor(sv, now);
    }
    if (sv.hp >= heroMax(sv) * RETREAT[1]) {
      sv.resting = false;
    }
  } else if (sv.job) {
    // Building happens inside the shelter; searching, out where the place is.
    sv.x = sv.job.kind === 'explore' ? sv.job.data.x : 0;
    work(sv, now);
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
      if (sv.trip) {
        sv.trip.home = true;
      }
      if (sv.x !== 0) {
        sv.x += sign(-sv.x);
      } else {
        // Inside, he is safe, so he puts the time to use.
        sv.hole++;
        indoor(sv, now);
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
    } else if (sv.trip) {
      roam(sv, now);
    } else if (build) {
      if (sv.x === 0) {
        startJob(sv, build);
      } else {
        sv.x += sign(-sv.x);
      }
    } else if (readingBreak(sv)) {
      // Time for a break with a book, while the turrets keep watch.
      if (sv.x !== 0) {
        sv.x += sign(-sv.x);
      } else {
        read(sv, now);
        sv.breakLeft--;
        if (sv.breakLeft <= 0) {
          sv.breakAt = sv.step + BREAK.every;
          sv.breakLeft = BREAK.steps;
        }
      }
    } else {
      // With the walls under half, he goes for whatever is closest to the shelter.
      const threat = sv.shelter.hp < shelterMax(sv) / 2 ? nearest(sv.zombies, 0, RADIUS) : nearest(sv.zombies, sv.x, SIGHT);
      const chase = threat || nearest(sv.crates, sv.x, SIGHT) || (canExplore(sv) ? nearest(sv.sites, sv.x, SIGHT) : null);
      if (chase) {
        sv.x += sign(chase.x - sv.x);
        sv.dir = sign(chase.x - sv.x) || sv.dir;
      } else if (canTrip(sv)) {
        sv.trip = plan(sv);
        say(sv, `🧭 Off on a trip down the road: ${sv.trip.stops.map(s => SITES[s.kind].icon).join(' ')}`, now);
        roam(sv, now);
      } else if (sv.books > 0 && topic(sv)) {
        // Nothing to fight, gather or search: he goes in to read until something turns up.
        if (sv.x !== 0) {
          sv.x += sign(-sv.x);
        } else {
          read(sv, now);
        }
      } else {
        if (Math.abs(sv.x + sv.dir) > RADIUS - 1) {
          sv.dir = -sv.dir;
        }
        sv.x += sv.dir;
      }
    }
    // His dog fetches a crate lying close by, while he is out.
    const fetched = sv.dog && sv.x !== 0 && sv.step >= (sv.dog.ready || 0)
      ? sv.crates.findIndex(c => c.x !== sv.x && Math.abs(c.x - sv.x) <= DOG.fetch) : -1;
    if (fetched >= 0) {
      sv.totals.fetched++;
      sv.dog.ready = sv.step + DOG.rest;
      gather(sv, sv.crates.splice(fetched, 1)[0], now);
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
  if (sv.x !== from) {
    sv.facing = sign(sv.x - from);
  }

  // The zombies shamble in, and bite whoever they reach (he is safe inside the shelter).
  const guard = biteShare(sv);
  for (const z of sv.zombies) {
    if (z.hp <= 0) {
      continue;
    }
    // A zombie in a trap can't move, or bite. One idling down the road stays put until it sees him.
    if (z.held > 0) {
      z.held--;
      continue;
    }
    if (z.idle) {
      if (Math.abs(z.x - sv.x) > SIGHT) {
        continue;
      }
      delete z.idle;
    }
    const def = ZOMBIES[z.kind];
    const dmg = Math.round(def.dmg * (1 + 0.07 * (sv.wave - 1)));
    if (sv.down === 0 && !(sv.job && sv.job.kind !== 'explore') && !sv.resting && Math.abs(z.x - sv.x) <= 1 && sv.x !== 0) {
      // Like the walls, he takes a bite every other step.
      if (sv.step % 2 === 1) {
        sv.hp -= Math.max(1, Math.round(dmg * guard));
      }
    } else if (Math.abs(z.x) <= WALL + (def.reach || 0)) {
      // The walls take a bite every other step (a spitter's reaches over a distance), and with the
      // generator running, the fence shocks whoever is right at them.
      if (sv.step % 2 === 0) {
        sv.shelter.hp -= dmg;
        if (Math.abs(z.x) <= WALL && powered(sv)) {
          hitZombie(sv, z, fenceDamage(sv), 'fence', hits, now);
        }
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
    sv.down = Math.ceil(DOWN_STEPS * (1 - 0.25 * Math.min(aid, 3)) * (hasRole(sv, 'medic') ? 0.5 : 1) * (hasRoom(sv, 'infirmary') ? 0.75 : 1));
    sv.hp = heroMax(sv);
    sv.x = 0;
    sv.job = null;
    sv.resting = false;
    if (sv.trip) {
      endTrip(sv);
    }
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
    const mend = (REPAIR_EACH + Math.floor(skillTier(sv, 'fortifying') / 2)) * (hasRole(sv, 'mechanic') ? 2 : 1);
    sv.shelter.hp = Math.min(shelterMax(sv), sv.shelter.hp + mend);
  }

  if (sv.waveKills >= waveNeed(sv.wave) && sv.wave < waveCap(sv)) {
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

// Says so when night falls or the day breaks (not on a save's first tick), and when a blood moon
// rises, which is counted once a night.
function noticeNight(sv, night, now) {
  const blood = night && bloodMoon(now);
  if (blood && !sv.blood) {
    sv.totals.bloodMoons++;
    say(sv, '🌕 A blood moon rises: more zombies, and twice the drops', now);
  } else if (sv.night !== null && night !== sv.night) {
    say(sv, night ? `🌙 Night falls: more zombies${powered(sv) ? ', and the lights come on' : ', and less to see them by'}` : '🌅 The day breaks', now);
  }
  sv.night = night;
  sv.blood = blood;
}

// The tokens Claude used since the last tick go into the generator. Those used while this game
// wasn't ticking (the adventure on display, or a long break) don't count.
function refuel(sv, tokens, now) {
  if (typeof tokens !== 'number') {
    return;
  }
  const last = sv.tokens;
  sv.tokens = { total: tokens, at: now };
  if (!last || now - last.at > MAX_GAP_MS || !sv.generator) {
    return;
  }
  sv.fuel = Math.min(FUEL_MAX, sv.fuel + Math.max(0, tokens - last.total) / TOKENS_PER_FUEL);
}

// The first step on a new day (local time): the day count goes up, and so does the sign by the
// shelter, the days in a row it has stood, which a fall puts back to 0.
function noteDay(sv, now) {
  const d = new Date(now);
  const day = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
  if (sv.day === day) {
    return;
  }
  sv.day = day;
  sv.days++;
  sv.safeDays++;
  sv.bestSafe = Math.max(sv.bestSafe, sv.safeDays);
  say(sv, `📅 Day ${sv.days}${sv.safeDays < sv.days ? ` · 🪧 ${sv.safeDays} day${sv.safeDays === 1 ? '' : 's'} without a breach` : ''}`, now);
}

// Advances the game by the working time since the last tick. Only called while this game is on
// display, so the adventure and the survival never both run. `world` is what companion.js knows:
// the subagents at work (`drifters`, see meetDrifters), whether it is `night`, and the `tokens`
// Claude has used so far, for the generator.
function tick(active, now, world = {}) {
  const sv = load(now);
  meetDrifters(sv, world.drifters || [], now);
  noticeNight(sv, !!world.night, now);
  refuel(sv, world.tokens, now);
  const gap = now - sv.lastTick;
  sv.lastTick = now;
  sv.active = active;
  if (gap > 0 && gap <= MAX_GAP_MS && active) {
    sv.carryMs += gap;
    while (sv.carryMs >= STEP_MS) {
      sv.carryMs -= STEP_MS;
      noteDay(sv, now);
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

// Where his trip takes him next, and how far out he is.
function tripText(sv) {
  const trip = sv.trip;
  const out = Math.abs(sv.x) - RADIUS;
  const where = trip.home || !trip.stops.length ? 'heading home' : `to the ${SITES[trip.stops[0].kind].name}`;
  return `🧭 ${where}${out > 0 ? `, ${out} tile${out === 1 ? '' : 's'} out` : ''}`;
}

// What he does while he rests inside, for the stats row.
function restText(sv) {
  return sv.doing === 'study' ? `📖 reading ${Math.round((sv.reading / READ_STEPS) * 100)}%`
    : sv.doing === 'organize' ? '📦 tidying up' : '🩹 resting';
}

// The stats row's parts, as [text, priority] (the lowest go first when the row is too wide), and
// its status, the news or that it is waiting, as [color, text] or null.
function statParts(sv, ctx) {
  const lvl = sv.shelter.level;
  const max = shelterMax(sv);
  const filled = Math.max(0, Math.min(10, Math.ceil((sv.shelter.hp / max) * 10)));
  const bar = '▰'.repeat(filled) + '▱'.repeat(10 - filled);
  const barColor = sv.shelter.hp / max < 0.25 ? RED : sv.shelter.hp / max < 0.5 ? GOLD : GREEN;
  const w = weaponInHand(sv);
  const guard = Math.round(armor(sv) * 100);
  const atWalls = sv.zombies.filter(z => Math.abs(z.x) <= WALL + (ZOMBIES[z.kind].reach || 0)).length;

  let status = null;
  if (sv.msg && ctx.now - sv.msg.at < (sv.msg.ms || MSG_MS)) {
    status = [GOLD, sv.msg.text];
  } else if (!ctx.active) {
    status = ['2', '💤 waiting for you'];
  }

  // Cloth and food only show once he has some.
  const stock = `🔩 ${sv.scrap} 🪵 ${sv.wood}${sv.cloth ? ` 🧵 ${sv.cloth}` : ''}${sv.food ? ` 🥩 ${sv.food}` : ''}`;
  // The sign's count only shows once it differs from the day count, after a fall.
  const days = sv.days ? `📅 Day ${sv.days}${sv.safeDays < sv.days ? ` 🪧 ${sv.safeDays}` : ''}` : null;
  const fuel = Math.round((sv.fuel / FUEL_MAX) * 100);
  const parts = [
    [`${shelterIcon(lvl)} Shelter ${color(GOLD, `Lv ${lvl}`)}${sv.cures ? color(GOLD, ` ✨${sv.cures}`) : ''} ${color(barColor, bar)} ${sv.shelter.hp}/${max}`, 6],
    [days, 4.4],
    [ctx.night ? (bloodMoon(ctx.now) ? color(RED, '🌕 blood moon') : '🌙 night') : null, 3.9],
    [`🧑 ${w.icon} ${w.name}${w.ammo ? ` ${sv.ammo}` : ''}`, 4],
    [stock, 5],
    [sv.job ? `${sv.job.kind === 'explore' ? '🔍' : '🔨'} ${JOB_NAMES[sv.job.kind]} ${sv.job.left}` : sv.mode ? (sv.x === 0 ? '🧱 holed up' : '🏃 falling back')
      : sv.trip && sv.x !== 0 ? tripText(sv)
        : sv.x === 0 && (sv.resting || sv.doing === 'study') ? restText(sv) : `🎯 ${goalText(sv)}`, 3],
    [`🗼 ${sv.turrets}/${slotsAt(lvl)}`, 4.2],
    [sv.generator ? (fuel > 0 ? `⚡ ${fuel}%` : color('2', '⚡ 0%')) : null, 3.7],
    // While he is away, the map follows him, so this tells of the zombies at the walls.
    [sv.trip && atWalls ? color(RED, `🧟 ${atWalls} at the walls`) : null, 5.2],
    [sv.drifters.length ? `🤠 ${sv.drifters.length}` : null, 3.8],
    [sv.residents.length ? `👷 ${sv.residents.length}${sv.dog ? ' 🐕' : ''}` : sv.dog ? '🐕' : null, 3.2],
    [flying(sv) ? `🧪 ${sv.samples}` : null, 3.4],
    [sv.defenses.length ? `🚧 ${sv.defenses.length}` : null, 3.6],
    [guard ? `🧥 ${guard}%` : null, 3.5],
    [sv.meals || sv.fed ? `🍲 ${sv.meals}${sv.fed ? ' 😋' : ''}` : null, 2.8],
    [waveText(sv), 4.5],
    [`💀 ${sv.kills}`, 2],
  ].filter(p => p[0]);
  return { parts, status };
}

function statsRow(sv, ctx) {
  const { parts: shown, status } = statParts(sv, ctx);
  const parts = status ? [...shown, [color(...status), 5.5]] : shown;
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
const CRATE_ICONS = { scrap: '📦', wood: '🪵', cloth: '🧵', food: '🥩', blueprint: '📜', drop: '🪂' };

// The tiles the map shows: around the shelter, or, on a trip, around him once he walks away from it.
function mapSpan(sv, ctx) {
  const tiles = Math.min(2 * RADIUS + 1, Math.max(10, Math.min(24, Math.floor(ctx.cols / 2))));
  const half = Math.floor(tiles / 2);
  const left = !sv.trip ? -half : sv.x > 0 ? Math.max(-half, sv.x - half) : Math.min(-half, sv.x - half);
  return { tiles, left };
}

// An abandoned car by the road, every so often past the end of the strip (the window draws them too).
function wreck(x) {
  return Math.abs(x) > RADIUS + 2 && hash(x + 1777) % 10 === 0;
}

function worldRow(sv, ctx) {
  const { tiles, left } = mapSpan(sv, ctx);
  const stops = sv.trip ? sv.trip.stops : [];
  const fx = ctx.active && sv.fx && sv.fx.step === sv.step ? sv.fx.hits : [];
  // Only the turrets he has built stand on their slots; the one in progress shows a hammer.
  const built = TURRET_SLOTS.slice(0, sv.turrets);
  const building = !sv.job || sv.job.kind === 'explore' ? null
    : sv.job.kind === 'turret' ? TURRET_SLOTS[sv.turrets] : sv.job.kind === 'defense' ? sv.job.data.x : WALL;
  // The dog trots behind him while he is out; inside, it is inside too.
  const out = sv.x !== 0 && sv.down === 0 && sv.rebuild === 0 && !(sv.job && sv.job.kind !== 'explore');
  const dog = sv.dog && out ? sv.x - sv.facing : null;
  const drifters = DRIFTER_TILES.slice(0, sv.drifters.length);
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
    } else if (x === dog) {
      row += '🐕';
    } else if (sv.rebuild === 0 && drifters.includes(x)) {
      row += '🤠';
    } else if (x === building && sv.rebuild === 0) {
      row += '🔨';
    } else if (sv.crates.some(c => c.x === x)) {
      row += CRATE_ICONS[sv.crates.find(c => c.x === x).kind];
    } else if (sv.sites.some(c => c.x === x)) {
      row += SITE_ICONS[sv.sites.find(c => c.x === x).kind];
    } else if (stops.some(s => s.x === x)) {
      row += SITE_ICONS[stops.find(s => s.x === x).kind];
    } else if (Math.abs(x) === RADIUS + 1) {
      row += '🪧';
    } else if (wreck(x)) {
      row += '🚗';
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
    } else if (sv.rebuild === 0 && x === 8 && sv.lab) {
      row += '🧪';
    } else if (sv.rebuild === 0 && x === -8 && sv.generator) {
      row += '⚡';
    } else if (Math.abs(x) > 4 && hash(x + 4099) % 7 === 0) {
      row += '🌲';
    } else {
      row += '  ';
    }
  }
  return row;
}

const FLOOR = { bg: '48;2;58;52;44', fg: '38;2;120;108;90' };
const BLOOD_FLOOR = { bg: '48;2;68;26;26', fg: '38;2;150;72;72' };
const LIT = 3;   // with the generator running, its lights reach this many tiles either side of the shelter

// The ground darkens with the adventure's daylight (ctx.light, shaded by ctx.shade), except where
// the lights reach, and turns red under a blood moon.
function floorRow(sv, ctx) {
  const { tiles, left } = mapSpan(sv, ctx);
  const light = ctx.light ?? 1;
  const blood = ctx.night && bloodMoon(ctx.now);
  const lamps = light < 1 && powered(sv) && sv.rebuild === 0;
  let row = '';
  let style = null;
  for (let i = 0; i < tiles; i++) {
    const x = left + i;
    const glow = lamps && Math.abs(x) <= LIT ? 1 : light;
    const code = blood ? `${BLOOD_FLOOR.bg};${BLOOD_FLOOR.fg}`
      : glow < 1 && ctx.shade ? `${ctx.shade(FLOOR.bg, glow)};${ctx.shade(FLOOR.fg, glow)}` : `${FLOOR.bg};${FLOOR.fg}`;
    if (code !== style) {
      row += `${ESC}${code}m`;
      style = code;
    }
    row += (hash(x + 7919) % 3 === 0 ? '· ' : '  ');
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

// The status line's single line while the game is in its window (see window.js).
function windowLine(sv, ctx) {
  const parts = ['🪟 Survival is in its window', sv.days ? `📅 Day ${sv.days}` : null, `🧟 Wave ${sv.wave}`, ctx.active ? null : '💤 waiting for you'];
  return cutTo(ctx, parts.filter(Boolean).join(`${ESC}2m · ${RESET}`), ctx.cols);
}

// What the window draws: the save, what the rules make of it, and the stats row's parts as plain
// text. The window only looks; the game goes on here, in the status line's ticks.
function windowView(sv, ctx) {
  const plain = text => text.replace(/\x1b\[[0-9;]*m/g, '');
  const w = weaponInHand(sv);
  return {
    sv,
    hud: statParts(sv, ctx).parts.map(p => plain(p[0])),
    news: sv.msg && ctx.now - sv.msg.at < (sv.msg.ms || MSG_MS) ? sv.msg.text : null,
    waiting: !ctx.active,
    max: shelterMax(sv),
    heroMax: heroMax(sv),
    weapon: { key: WEAPONS.indexOf(w), name: w.name, vehicle: !!w.vehicle },
    cooking: knows(sv, 'cooking'),
    powered: powered(sv),
    blood: !!ctx.night && bloodMoon(ctx.now),
    night: !!ctx.night,
    light: ctx.light ?? 1,
    layout: { radius: RADIUS, wall: WALL, lit: LIT, turrets: TURRET_SLOTS.slice(0, sv.turrets), drifters: DRIFTER_TILES.slice(0, sv.drifters.length) },
    // The rooms under the shelter: the first floor's as he gets to them, and the cellar's built
    // (or being built) once it is dug.
    inside: {
      rooms: ['workshop', 'storage', 'bunks', (knows(sv, 'cooking') || hasRole(sv, 'cook')) && 'kitchen', sv.totals.booksFound > 0 && 'study', sv.lab && 'lab'].filter(Boolean),
      cellar: sv.shelter.level >= CELLAR_LEVEL,
      built: sv.rooms,
      building: sv.job && sv.job.kind === 'room' ? sv.job.data.key : null,
      inside: sv.x === 0 && sv.rebuild === 0,
      beds: 1 + beds(sv),
      reading: sv.reading / READ_STEPS,
      books: sv.books,
    },
  };
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

function peopleLines(sv) {
  const open = beds(sv);
  const more = open < Object.keys(ROLES).length ? ` · the next bed at shelter Lv ${BED_EVERY * (open + 1)}` : '';
  const head = open === 0 ? `nobody yet: the first bed comes at shelter Lv ${BED_EVERY}`
    : `${sv.residents.length}/${open} beds taken${more}${sv.residents.length < open ? ' · he meets people on his searches' : ''}`;
  return [
    `  People        ${head}${sv.dog ? ` · 🐕 ${sv.dog.name} follows him` : ''}`,
    ...sv.residents.map(r => `    ${ROLES[r.role].icon} ${r.name}, the ${ROLES[r.role].name}: ${ROLES[r.role].text}`),
    `  Drifters      ${sv.drifters.length ? `🤠 ${sv.drifters.length} on the walls now` : 'none on the walls now'} · each subagent Claude runs sends one (${drifterDamage(sv)} damage a shot)`,
  ];
}

function insideLines(sv) {
  const first = ['🔧 workshop', '📦 storage', 'bunks', (knows(sv, 'cooking') || hasRole(sv, 'cook')) && '🍳 kitchen', sv.totals.booksFound > 0 && '📚 study', sv.lab && '🧪 lab'].filter(Boolean);
  const key = topic(sv);
  const reading = !key ? 'he has learned all the rooms'
    : `${sv.books ? `📚 ${sv.books} to read` : 'no book to read (they turn up in buildings, bunkers, lost shelters and supply drops)'} · studying the ${ROOMS[key].name.toLowerCase()}: ${sv.understood[key] || 0}/${ROOMS[key].books} books understood${sv.reading ? `, ${Math.round((sv.reading / READ_STEPS) * 100)}% through a read` : ''}`;
  const room = k => {
    const r = ROOMS[k];
    const n = sv.understood[k] || 0;
    const state = hasRoom(sv, k) ? 'built' : n >= r.books ? `learned, to build for ${r.scrap} scrap, ${r.wood} wood${r.cloth ? `, ${r.cloth} cloth` : ''}` : `${n}/${r.books} books`;
    return `    ${r.icon} ${r.name}: ${r.text} (${state})`;
  };
  return [
    `  Inside        ${first.join(' · ')}`,
    `  Books         ${reading} · ${sv.totals.reads} read through`,
    `  Cellar        ${sv.shelter.level >= CELLAR_LEVEL ? `${sv.rooms.length}/${Object.keys(ROOMS).length} rooms built` : `dug at shelter Lv ${CELLAR_LEVEL}`}; its rooms come from books:`,
    ...Object.keys(ROOMS).map(room),
  ];
}

function labLines(sv) {
  if (!flying(sv)) {
    return ['  Lab           after the 🚁 helicopter: zombies carry samples of the virus, and a lab studies them for a cure'];
  }
  if (!sv.lab) {
    return [`  Lab           not built yet (${LAB.scrap} scrap, ${LAB.wood} wood) · 🧪 ${sv.samples} samples kept`];
  }
  const next = nextStage(sv);
  const done = sv.cures ? CURE.length - 1 : sv.stage;
  return [
    sv.cures
      ? `  Lab           🧪 ${sv.samples} samples · next: 💉 a cure for the new strain (${next.samples} samples, ${next.scrap} scrap)`
      : `  Lab           🧪 ${sv.samples} samples · next: ${next.icon} ${next.name} (${next.samples} samples, ${next.scrap} scrap): ${next.text}`,
    ...CURE.slice(0, done).map(c => `    ${c.icon} ${c.name}: ${c.text}`),
    ...(sv.cures ? [`    💉 Cured ${sv.cures} time${sv.cures === 1 ? '' : 's'} ✨: ${Math.round(CURE_BONUS * 100 * sv.cures)}% more damage and walls`] : []),
  ];
}

// When the next blood moon rises: 'now', 'tonight', 'tomorrow night' or a date.
function nextBloodMoon(sv, now) {
  if (sv.night && sv.blood) {
    return 'now';
  }
  for (let i = 0; i <= 31; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    d.setHours(22, 0, 0, 0);
    if (bloodMoon(d.getTime())) {
      return i === 0 ? 'tonight' : i === 1 ? 'tomorrow night' : `the night of ${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`;
    }
  }
  return 'next month';
}

function nightLines(sv, now) {
  const power = !knows(sv, 'generator') ? 'not built: he needs its ⚡ blueprint first'
    : !sv.generator ? `not built yet (${GENERATOR.scrap} scrap, ${GENERATOR.wood} wood)`
      : `⚡ ${Math.floor(sv.fuel)}/${FUEL_MAX} seconds of power (${TOKENS_PER_FUEL} of Claude's tokens make a second) · the fence hits ${fenceDamage(sv)}, the lights reach ${LIT} tiles`;
  const sky = sv.night ? (sv.blood ? '🌕 a blood moon: more zombies, and twice the drops'
    : `🌙 night: more zombies and runners${powered(sv) ? ', the lights are on' : `, the guns see only ${NIGHT_RANGE} tiles without lights`}`) : 'day';
  return [
    `  Days          ${sv.days ? `📅 Day ${sv.days} · 🪧 ${sv.safeDays} day${sv.safeDays === 1 ? '' : 's'} without a breach (best ${sv.bestSafe})` : 'his first day starts with the first step'}`,
    `  Now           ${sky} · next blood moon: ${nextBloodMoon(sv, now)}`,
    `  Generator     ${power}`,
  ];
}

// What would let a held wave go on: stronger walls, or another turret while a slot is free.
function heldBy(sv) {
  const walls = wallCost(sv.shelter.level);
  const turret = sv.turrets < slotsAt(sv.shelter.level) && knows(sv, 'turret') ? 'another turret, or ' : '';
  return `${turret}walls Lv ${sv.shelter.level + 1} (${walls} wood, ${walls / 2} scrap; he has ${sv.wood} wood)`;
}

// The trip he is on, or what the next one waits for.
function tripLine(sv) {
  const made = `${sv.totals.trips} made`;
  if (sv.trip) {
    const left = sv.trip.stops.length;
    return `  Trips         ${tripText(sv)} · ${left} place${left === 1 ? '' : 's'} left to search · ${made}`;
  }
  const wait = sv.turrets === 0 ? 'once a turret guards the shelter'
    : sv.totals.sites < TRIP.after ? `once he has explored ${TRIP.after} places near the shelter`
      : sv.step < sv.tripAt ? `the next in about ${Math.ceil((sv.tripAt - sv.step) / 60)} min of work`
        : 'the next by day, once he is rested and the walls are whole';
  return `  Trips         ${wait} · ${made}`;
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
    ...nightLines(sv, now),
    `  Walls         ${sv.shelter.hp}/${shelterMax(sv)}${sv.rebuild > 0 ? ' · rebuilding' : ''}`,
    `  Turrets       ${sv.turrets}/${slotsAt(lvl)} built 🗼 · ${turretDamage(sv)} damage each, range ${TURRET_RANGE} tiles${sv.turrets < TURRET_SLOTS.length && sv.turrets >= slotsAt(lvl) ? ' · stronger walls open another slot' : ''}`,
    `  Defenses      ${DEFENSE_SLOTS.slice(0, defenseSlots(lvl)).filter(d => sv.defenses.some(e => e.x === d.x)).length}/${defenseSlots(lvl)} standing ${['barricade', 'trap', 'spikes'].map(t => `${DEFENSES[t].icon} ${sv.defenses.filter(d => d.type === t).length}${knows(sv, t) ? '' : '?'}`).join('  ')}${defenseSlots(lvl) === 0 ? ' (the shelter opens its first slot at level 2)' : ''}`,
    `  Materials     🔩 ${sv.scrap} scrap · 🪵 ${sv.wood} wood · 🧵 ${sv.cloth} cloth · 🥩 ${sv.food} food`,
    `  Pantry        🍲 ${sv.meals} meals${sv.fed ? ` · well fed for ${sv.fed} more steps` : ''}${knows(sv, 'cooking') ? '' : ' (he can\'t cook yet)'}`,
    `  Next          ${building}`,
    `  Last call     ${sv.call ? `${sv.call.n} zombies against his ${sv.call.weapon.toLowerCase()}: ${sv.call.ok ? 'he faced them' : `too risky (it would cost about ${sv.call.taken} life), he fell back`}` : 'nothing big yet'}`,
    tripLine(sv),
    ...peopleLines(sv),
    ...insideLines(sv),
    ...labLines(sv),
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
    `🧟 Wave ${sv.wave}: ${waveHeld(sv) ? `held until the shelter is stronger: ${heldBy(sv)}` : `${Math.max(0, waveNeed(sv.wave) - sv.waveKills)} of ${waveNeed(sv.wave)} zombies left`} · best wave ${sv.bestWave}`,
    `  Zombies       ${sv.kills} killed · ${sv.totals.brutes} brutes · ${sv.totals.bosses} tyrants · ${sv.totals.turretKills} by the turrets`,
    `  Gathered      ${sv.totals.scrapFound} scrap · ${sv.totals.woodFound} wood · ${sv.totals.gearFound} pieces of clothing found`,
    `  Made          ${sv.totals.builds} built · ${sv.totals.clothes} clothes · ${sv.totals.meals} meals · ${sv.totals.bulletsMade} bullets`,
    `  Traps        ${sv.totals.trapKills} killed by traps and spikes · ${sv.totals.game} game caught · ${sv.totals.defenses} set up\n  Retreats      ${sv.totals.retreats} times he fell back from a fight he couldn't win\n  Explored      ${sv.totals.sites} places · ${sv.totals.dives} lake dives · ${sv.totals.hordes} hordes met`,
    `  Helpers       ${sv.totals.drifters} drifters came · ${sv.totals.allyKills} zombies shot by drifters and the lookout · ${sv.totals.drops} supply drops${sv.totals.runs ? ` · ${sv.totals.runs} scavenging runs` : ''}${sv.dog ? ` · ${sv.totals.fetched} crates fetched by ${sv.dog.name}` : ''}`,
    `  Nights        ${sv.totals.bloodMoons} blood moon${sv.totals.bloodMoons === 1 ? '' : 's'} · ${sv.totals.fenceKills} zombies killed by the fence`,
    `  The shelter fell ${sv.totals.falls} time${sv.totals.falls === 1 ? '' : 's'}`,
  ];
  return lines.join('\n');
}

module.exports = {
  isShown, setShown, setGame, load, save, tick, render, shelterReport, step, newSave, supplyDrop, announce, moveIn, bloodMoon,
  windowLine, windowView,
  BLUEPRINTS, shelterMax, slotsAt, turretDamage, turretCost, wallCost, heroMax, waveNeed, skillTier, armor,
  WEAPONS, ZOMBIES, SKILLS, GEAR_SLOTS, RADIUS, fightEstimate, ROLES, CURE, ROOMS,
};
