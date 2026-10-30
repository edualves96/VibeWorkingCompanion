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
// Now and then raiders come instead of zombies, and a trader passes by to swap what he has too
// much of for what he lacks. The adventure's seasons reach the strip, every tyrant has its own
// trick, and the shelter keeps a journal (/vwc:journal survival) and a card (/vwc:card survival).
//
// Once the shelter is well established he puts what piles up to use: woodcutters cut wood for
// food, steel plates let scrap stand in for wood in the walls, a trading post brings bigger
// traders, and whatever is spare beyond the next walls goes to a workbench, patches for his
// clothes, hired guards, feasts and, one building at a time, a town around the shelter.
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
  // Each weapon's blueprint turns up once he holds the rung below it.
  bat: { icon: '🏏', name: 'Bat', chance: 0.03, after: sv => sv.turrets >= 1 },
  axe: { icon: '🪓', name: 'Axe', chance: 0.02, after: sv => sv.weapon >= 1 && sv.shelter.level >= 2 },
  machete: { icon: '🔪', name: 'Machete', chance: 0.02, after: sv => sv.weapon >= 2 },
  bow: { icon: '🏹', name: 'Bow', chance: 0.02, after: sv => sv.weapon >= 3 },
  pistol: { icon: '🔫', name: 'Pistol', chance: 0.015, after: sv => sv.weapon >= 4 },
  ammo: { icon: '🧨', name: 'Bullets', chance: 0.02, after: sv => sv.blueprints.includes('pistol') },
  molotov: { icon: '🍾', name: 'Molotovs', chance: 0.015, after: sv => sv.weapon >= 3 && sv.shelter.level >= 5 },
  grenade: { icon: '💣', name: 'Grenades', chance: 0.012, after: sv => sv.blueprints.includes('ammo') && sv.shelter.level >= 8 },
  leather: { icon: '🧥', name: 'Leather', chance: 0.02, after: sv => sv.blueprints.includes('sewing') && sv.shelter.level >= 4 },
  heavy: { icon: '🧰', name: 'Heavy turrets', chance: 0.015, after: sv => sv.turrets >= 3 && sv.shelter.level >= 6 },
  barricade: { icon: '🚧', name: 'Barricades', chance: 0.03, after: sv => sv.turrets >= 1 && sv.shelter.level >= 2 },
  trap: { icon: '🪤', name: 'Traps', chance: 0.025, after: sv => sv.shelter.level >= 3 },
  spikes: { icon: '📌', name: 'Spikes', chance: 0.02, after: sv => sv.blueprints.includes('barricade') && sv.shelter.level >= 4 },
  rifle: { icon: '🔭', name: 'Rifle', chance: 0.012, after: sv => sv.weapon >= 5 },
  kevlar: { icon: '🦺', name: 'Kevlar', chance: 0.012, after: sv => sv.blueprints.includes('leather') && sv.shelter.level >= 8 },
  generator: { icon: '⚡', name: 'Generator', chance: 0.02, after: sv => sv.turrets >= 2 && sv.shelter.level >= 4 },
  steel: { icon: '🔩', name: 'Steel plates', chance: 0.015, after: sv => sv.shelter.level >= SURPLUS_LEVEL },
  chainsaw: { icon: '🪚', name: 'Chainsaw', chance: 0.012, after: sv => sv.weapon >= 6 && sv.shelter.level >= 11 },
  // The endgame: vehicles, found only once the shelter is well established and the rifle is in hand.
  pickup: { icon: '🛻', name: 'Pickup', chance: 0.008, after: sv => sv.weapon >= 7 && sv.shelter.level >= 14 },
  tank: { icon: '🚜', name: 'Tank', chance: 0.006, after: sv => sv.weapon >= 8 && sv.shelter.level >= 18 },
  helicopter: { icon: '🚁', name: 'Helicopter', chance: 0.004, after: sv => sv.weapon >= 9 && sv.shelter.level >= 25 },
};

// The ladder grows one rung at a time. Each weapon needs its own blueprint, a gun also needs
// bullets (`rounds` of them a shot) and the bow arrows. A vehicle is the endgame: it burns `gas`
// a shot, hits the zombies around its target too (`splash` tiles, for half damage), and he rides
// it on the map; the pickup rams them, knocking them back a tile. The survivor crafts the next
// one at the shelter once he has the level and the scrap.
const WEAPONS = [
  { name: 'Fists', icon: '👊', damage: 4, range: 1, level: 1, cost: 0, blueprint: null },
  { name: 'Bat', icon: '🏏', damage: 7, range: 1, level: 2, cost: 40, blueprint: 'bat' },
  { name: 'Axe', icon: '🪓', damage: 10, range: 1, level: 3, cost: 80, blueprint: 'axe' },
  { name: 'Machete', icon: '🔪', damage: 14, range: 1, level: 4, cost: 120, blueprint: 'machete' },
  { name: 'Bow', icon: '🏹', damage: 11, range: 3, level: 5, cost: 120, blueprint: 'bow', arrows: true },
  { name: 'Pistol', icon: '🔫', damage: 13, range: 4, level: 6, cost: 160, blueprint: 'pistol', ammo: true },
  { name: 'Rifle', icon: '🔭', damage: 26, range: 6, level: 9, cost: 400, blueprint: 'rifle', ammo: true },
  { name: 'Chainsaw', icon: '🪚', damage: 36, range: 1, level: 12, cost: 900, blueprint: 'chainsaw' },
  { name: 'Pickup', icon: '🛻', damage: 45, range: 2, level: 15, cost: 1500, blueprint: 'pickup', gas: 0.06, splash: 1, vehicle: true, ram: true },
  { name: 'Tank', icon: '🚜', damage: 70, range: 8, level: 19, cost: 2500, blueprint: 'tank', ammo: true, rounds: 3, gas: 0.1, splash: 1, vehicle: true },
  { name: 'Helicopter', icon: '🚁', damage: 130, range: 10, level: 26, cost: 8000, blueprint: 'helicopter', ammo: true, rounds: 5, gas: 0.15, splash: 2, vehicle: true },
];
// Saves from before 1.31.0 counted the rungs of a shorter ladder: Fists, Axe, Pistol, Rifle, Tank
// and Helicopter.
const OLD_RUNGS = [0, 2, 5, 6, 9, 10];
// Molotovs and grenades, thrown on their own at a group of THROW.group or more within THROW.range
// tiles, one every THROW.every steps. A molotov (a bottle, some gas and a rag) sets the tiles
// around where it lands on fire for FIRE.steps; a grenade (scrap) blasts everything within 2 tiles.
const THROW = { range: 5, group: 3, every: 6, max: 3 };
const MOLOTOV = { bottles: 1, gas: 1, cloth: 1 };
const GRENADE = { scrap: 20, reach: 2 };
const FIRE = { steps: 5, reach: 1 };
// Arrows for the bow, cut from wood like bullets are cast from scrap.
const ARROWS = { wood: 4, made: 20, low: 6 };
// A medkit, from a hospital, cuts a rest short: it heals MEDKIT of his life at once.
const MEDKIT = 0.4;

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

// `drops` scales what one may drop (DROPS), `reach` lets it hurt the walls from that far, and
// `shoots` him from that far. A screamer calls runners the first time it sees him, a bloater
// bursts when it dies (`burst`), a juggernaut breaks a barricade in one blow (`smash`). Raiders
// step around traps and spikes and drop bullets, a gun now and then and, rarely, Tactical gear.
// Pumpkin heads and clowns only come in October (`season`).
const ZOMBIES = {
  walker: { icon: '🧟', hp: 10, dmg: 2, every: 2, scrap: 1 },
  brute: { icon: '👹', hp: 32, dmg: 5, every: 3, scrap: 4 },
  runner: { icon: '🐺', hp: 6, dmg: 2, every: 1, scrap: 1 },
  spitter: { icon: '🦠', hp: 14, dmg: 3, every: 2, scrap: 3, reach: 3 },   // spits at the walls from a distance
  screamer: { icon: '😱', hp: 12, dmg: 1, every: 2, scrap: 2, scream: true },
  bloater: { icon: '🤮', hp: 28, dmg: 3, every: 3, scrap: 3, burst: true },
  juggernaut: { icon: '🦏', hp: 70, dmg: 7, every: 3, scrap: 6, smash: true },
  rat: { icon: '🐀', hp: 3, dmg: 1, every: 1, scrap: 0, drops: 0.25 },
  bat: { icon: '🦇', hp: 4, dmg: 1, every: 1, scrap: 0, drops: 0 },
  raider: { icon: '🦹', hp: 22, dmg: 4, every: 2, scrap: 3, reach: 3, shoots: 3, raider: true },
  pumpkin: { icon: '🎃', hp: 18, dmg: 3, every: 2, scrap: 2, season: 'Halloween' },
  clown: { icon: '🤡', hp: 10, dmg: 2, every: 1, scrap: 2, season: 'Halloween' },
  // A tyrant comes every 10th wave, each with its own trick, in turn (see TYRANTS).
  boss: { icon: '👺', name: 'tyrant', hp: 150, dmg: 12, every: 4, scrap: 40, boss: true },
  queen: { icon: '👸', name: 'screamer queen', hp: 130, dmg: 9, every: 4, scrap: 40, boss: true, scream: true },
  behemoth: { icon: '🦣', name: 'behemoth', hp: 220, dmg: 14, every: 5, scrap: 50, boss: true, smash: true, through: true },
  brood: { icon: '🐛', name: 'brood', hp: 140, dmg: 10, every: 4, scrap: 40, boss: true, split: true },
};
const TYRANTS = ['boss', 'queen', 'behemoth', 'brood'];

// The tyrants take turns: the next is the kind he has killed the fewest of, the first in TYRANTS on a tie.
function nextTyrant(sv) {
  return TYRANTS.reduce((a, b) => (sv.totals[TYRANT_TOTALS[b]] < sv.totals[TYRANT_TOTALS[a]] ? b : a));
}
// The queen calls QUEEN.runners runners every QUEEN.every steps; a screamer calls SCREAM runners
// (and one more every 15 waves, up to SCREAM_MAX); a bloater's burst does BURST times a walker's bite (as the waves
// grow) to everything within a tile; a brood splits into BROOD walkers.
const QUEEN = { every: 10, runners: 2 };
const SCREAM = 2;
const SCREAM_MAX = 4;
const BURST = 6;
const BROOD = 4;
// Hordes from wave 3: now and then a band of RAIDERS instead (from wave 5), or a swarm of rats.
const RAIDERS = { wave: 5, share: 0.2, size: [3, 5], ammo: [3, 8], gun: 0.1, tactical: 0.06 };
const SWARM = { share: 0.2, size: [5, 8] };
// A trader passes by every so often, by day: he stands on the strip for TRADER.stays steps, and
// when the survivor reaches him swaps a share of what he has most of for what he lacks most, at
// the VALUE of each (fair rates), up to TRADER.cap worth (more as the waves go on, and more with a
// trading post, see POST).
const TRADER = { every: 900, chance: 0.6, stays: 240, share: 0.25, cap: [60, 20] };
const VALUE = { scrap: 1, wood: 1.5, cloth: 4, food: 3, gas: 6 };

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

const JOB_STEPS = { turret: 8, walls: 10, weapon: 6, ammo: 3, arrows: 2, molotov: 3, grenade: 3, clothes: 6, cook: 4, explore: 5, defense: 5, lab: 20, research: 12, generator: 10, room: 15,
  lumber: 15, post: 15, town: 10, mod: 6, patch: 6, hire: 4, feast: 8 };
const JOB_NAMES = { turret: 'turret', walls: 'walls', weapon: 'crafting', ammo: 'bullets', arrows: 'arrows', molotov: 'a molotov', grenade: 'a grenade', clothes: 'sewing', cook: 'cooking', explore: 'searching', defense: 'defenses', lab: 'the lab', research: 'research', generator: 'generator', room: 'a room',
  lumber: 'the lumber camp', post: 'the trading post', town: 'the town', mod: 'the workbench', patch: 'patching', hire: 'hiring', feast: 'a feast' };

// Places to explore. He goes when he is healthy and the shelter is quiet, and takes his chances:
// a building may hide an ambush, a lake may nearly drown him, a bunker is always guarded but holds
// the best finds, and a lost shelter is a safe stop. `loot` is [min, max] per material, the chance
// of a blueprint (`bp`) and of a piece of clothing (`gear`); `meet` the chance of meeting someone
// who would move in (see ROLES), and `book` of finding a book (see ROOMS). `wave` is the first wave
// a place turns up in.
const SITES = {
  building: { icon: '🏢', name: 'abandoned building', weight: 0.27, ambush: 0.35, meet: 0.1, book: 0.08, loot: { scrap: [10, 25], cloth: [3, 7], food: [2, 5], bp: 0.2, gear: 0.15 } },
  lake: { icon: '🌊', name: 'lake', weight: 0.15, meet: 0, book: 0, loot: { wood: [8, 18], scrap: [10, 30], bp: 0.15, gear: 0.25 } },
  shelter: { icon: '⛺', name: 'lost shelter', weight: 0.18, meet: 0.35, book: 0.06, loot: { wood: [8, 15], scrap: [10, 20], food: [3, 6], bp: 0.2, gear: 0 } },
  bunker: { icon: '🚪', name: 'bunker', weight: 0.1, wave: 3, ambush: 1, meet: 0.2, book: 0.15, loot: { scrap: [40, 80], cloth: [5, 10], food: [4, 8], bp: 0.7, gear: 0.4, tier: 1 } },
  // Medkits cut his rests short (see MEDKIT).
  hospital: { icon: '🏥', name: 'hospital', weight: 0.08, wave: 2, ambush: 0.3, meet: 0.15, book: 0.1, loot: { medkits: [1, 3], cloth: [3, 8], scrap: [5, 15], bp: 0.1, gear: 0.1 } },
  // Rich in scrap, but bats nest there (`bats` is the chance they fly at him), and now and then a
  // passage leads to a hidden bunker (`hidden`).
  caves: { icon: '🗻', name: 'caves', weight: 0.1, wave: 2, bats: 0.4, hidden: 0.15, meet: 0, book: 0.03, loot: { scrap: [25, 55], bp: 0.1, gear: 0.05 } },
  supermarket: { icon: '🛒', name: 'supermarket', weight: 0.08, ambush: 0.3, meet: 0.1, book: 0.04, loot: { food: [6, 14], cloth: [4, 9], scrap: [5, 15], bp: 0.1, gear: 0.1 } },
  // Gas for the vehicles and the molotovs, and bottles for those; out on the road, and now and then
  // near the shelter too.
  station: { icon: '⛽', name: 'gas station', weight: 0.04, road: 0.25, ambush: 0.25, meet: 0.05, book: 0.05, loot: { scrap: [20, 40], food: [4, 10], gas: [8, 16], bottles: [1, 3], bp: 0.15, gear: 0.15 } },
  // Further out, down the road, only on trips (`road` is their weight there). Their finds grow with
  // the waves.
  farm: { icon: '🌾', name: 'farm', weight: 0, road: 0.3, meet: 0.15, book: 0.03, loot: { food: [5, 12], wood: [10, 25], cloth: [2, 5], bp: 0.1, gear: 0.1 } },
  town: { icon: '🏬', name: 'town', weight: 0, road: 0.2, ambush: 0.45, meet: 0.25, book: 0.2, loot: { scrap: [30, 60], wood: [15, 30], cloth: [5, 10], food: [3, 8], bp: 0.3, gear: 0.3 } },
  base: { icon: '🪖', name: 'army base', weight: 0, road: 0.1, wave: 6, ambush: 1, meet: 0.1, book: 0.1, loot: { scrap: [80, 150], cloth: [6, 12], food: [5, 10], bp: 0.8, gear: 0.6, tier: 1 } },
  // Fish, and the first time a boat, which takes every trip one stop further, to an island.
  harbor: { icon: '🚢', name: 'harbor', weight: 0, road: 0.15, meet: 0.1, book: 0.03, loot: { food: [8, 16], wood: [10, 20], scrap: [10, 25], bp: 0.1, gear: 0.05 } },
  island: { icon: '🌴', name: 'island', weight: 0, road: 0, boat: true, meet: 0.2, book: 0.15, loot: { scrap: [40, 90], wood: [20, 40], food: [5, 12], bp: 0.5, gear: 0.4, tier: 1 } },
};
// In December the lakes freeze, and he fishes through the ice instead of diving.
const FISHING = { food: [5, 12] };
const SUPPLIES = ['gas', 'bottles', 'medkits'];

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
// It holds more than a crate (`more` per wave), bullets once he makes them, gas once he drives,
// and good odds of a blueprint and a piece of clothing.
const SUPPLY = { scrap: [25, 45], wood: [15, 30], cloth: [4, 8], food: [4, 8], more: 0.1, ammo: 30, gas: 20, bp: 0.5, gear: 0.3, book: 0.3 };
// On a trip he siphons what is left in the tanks of the cars by the road (WRECK_GAS), and a save
// that already had a vehicle before gas starts with START_GAS.
const WRECK_GAS = [2, 5];
const START_GAS = 60;

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
  library: { icon: '📚', name: 'Library', books: 2, scrap: 300, wood: 250, cloth: 0, text: 'books sink in more often' },
  still: { icon: '💧', name: 'Water still', books: 2, scrap: 350, wood: 100, cloth: 10, text: 'meals heal half again as much' },
  garage: { icon: '🚘', name: 'Garage', books: 4, scrap: 800, wood: 200, cloth: 20, text: 'vehicles use a third fewer bullets and a quarter less gas' },
};
const LIBRARY = 0.15;   // more chance a book sinks in
const GREENHOUSE = { every: 90, food: 2 };
const RADIO_EVERY = 7200;
const BULLETS = { scrap: 10, made: 40, low: 10 };   // 10 scrap make 40 bullets, made when under 10 are left
const MEAL = { food: 3, heal: 0.4, fed: 60, bonus: 0.15, below: 0.5 };   // 3 food make a meal

// What piles up, put to use from SURPLUS_LEVEL. A lumber camp, built once, sends woodcutters out
// every LUMBER.every steps while the walls want wood, paid `pay` food for each level of the shelter
// (the crew grows with it), and they come back with `wood` for each food. Steel plates (a
// blueprint) let scrap stand in for up to STEEL.share of the walls' wood, STEEL.rate scrap for
// each, but only scrap he can spare once the town's next building is kept back. A trading post,
// built once he has traded, brings the traders POST.often times as often, for as much longer, with
// POST.cap times as much to swap.
const SURPLUS_LEVEL = 15;
const LUMBER = { scrap: 500, food: 100, every: 60, pay: 2, wood: 1.2 };
const STEEL = { share: 0.5, rate: 3 };
const POST = { scrap: 2000, cloth: 300, often: 2, cap: 2 };
// The rest he only spends out of what is spare: what is left once the next walls, the next weapon,
// the lab, the town's next building and KEEP are kept back (see reserve()). He spends it on the
// cheapest of: a mod at the workbench for his weapons or the turrets (each MODS.step harder, and
// MODS.grow times dearer than the last), a patch for his clothes once nothing better can be sewn
// (PATCH.power more protection, up to PATCH.max), and another hired guard (up to GUARDS.max), who
// shoots from the walls like a drifter as long as they are all paid GUARDS.pay food each every
// GUARDS.every steps. When he can cook, a feast now and then: FEAST.food (more as the waves go
// on) for FEAST.steps of everyone fighting FEAST.bonus harder.
const KEEP = { scrap: 200, cloth: 50, food: 100 };
const MODS = { scrap: 1000, grow: 1.5, step: 0.05 };
const PATCH = { cloth: 150, grow: 1.3, power: 4, max: 0.65 };
const GUARDS = { max: 2, fee: { food: 150, cloth: 40 }, pay: 4, every: 120 };
const FEAST = { food: [200, 10], steps: 1800, bonus: 0.1 };
// From TOWN_LEVEL he rebuilds the town around the shelter, one building at a time and in this
// order: paid up front out of what is spare (the next one is kept back from everything else), then
// raised by the settlers over `steps` while he goes on as before. Each helps for good, and the last
// makes the shelter a haven.
const TOWN_LEVEL = 20;
const TOWN = [
  { key: 'houses', icon: '🛖', name: 'Houses', scrap: 8000, cloth: 3000, food: 5000, steps: 1800, text: 'settlers join the woodcutters: half again as much wood' },
  { key: 'factory', icon: '🏭', name: 'Factory', scrap: 15000, cloth: 4000, food: 6000, steps: 2700, text: 'the turrets hit 20% harder' },
  { key: 'inn', icon: '🏨', name: 'Inn', scrap: 20000, cloth: 5000, food: 7000, steps: 3600, text: 'room for two more guards' },
  { key: 'mast', icon: '📡', name: 'Radio mast', scrap: 25000, cloth: 6000, food: 8000, steps: 4500, text: 'a supply drop every hour' },
  { key: 'fountain', icon: '⛲', name: 'Fountain', scrap: 40000, cloth: 8000, food: 10000, steps: 5400, text: 'clean water: he heals twice as fast' },
  { key: 'fair', icon: '🎪', name: 'Fairground', scrap: 60000, cloth: 12000, food: 15000, steps: 7200, text: 'the town is alive again: everyone fights 10% harder' },
];
const MAST_EVERY = 3600;

const ESC = '\x1b[';
const RESET = `${ESC}0m`;
const GOLD = '38;2;250;204;21';
const GREEN = '38;2;34;197;94';
const RED = '38;2;248;113;113';

function newSave(now) {
  return {
    v: 4, lastTick: now, carryMs: 0, step: 0, x: 0, dir: 1, hp: HERO_LIFE[0] + HERO_LIFE[1], down: 0,
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
    // Gas (for the vehicles and molotovs), bottles, medkits, arrows, and what he has to throw; the
    // fires burning on the strip ({ x, left }); the boat from a harbor; the step he last threw at,
    // and the next step a trader may come by.
    gas: 0, bottles: 0, medkits: 0, arrows: 0, molotovs: 0, grenades: 0, fires: [], boat: false, thrown: 0, traderAt: TRADER.every,
    // The season on the strip (the adventure's, see tick), and the shelter's journal of notable
    // moments ({ at, text }, the last JOURNAL_SIZE).
    season: null, journal: [],
    // What the surplus built: the lumber camp and the trading post, the workbench's mods and the
    // patches on his clothes, the guards hired (and whether they were paid last), the feast's steps
    // left, the town's buildings paid for and the steps left on the last of them.
    lumber: false, post: false, mods: { weapon: 0, turret: 0, patch: 0 }, guards: 0, paid: true, feast: 0, town: 0, townLeft: 0,
    totals: {
      scrapFound: 0, woodFound: 0, falls: 0, brutes: 0, bosses: 0, turretKills: 0, crates: 0, handKills: 0, builds: 0, waves: 0,
      knockouts: 0, rests: 0, retreats: 0, lessons: 0, defenses: 0, trapKills: 0, game: 0, sites: 0, dives: 0, hordes: 0, clothes: 0, meals: 0, bulletsMade: 0, gearFound: 0,
      drifters: 0, allyKills: 0, drops: 0, fetched: 0, runs: 0, samples: 0, fenceKills: 0, bloodMoons: 0,
      booksFound: 0, reads: 0, roomsBuilt: 0, organized: 0, trips: 0,
      // Each kind of tyrant killed (`bosses` counts them all), and the rest since 1.31.0.
      tyrants: 0, queens: 0, behemoths: 0, broods: 0, screams: 0, bursts: 0, juggernauts: 0, rats: 0, raids: 0, raiders: 0,
      trades: 0, thrown: 0, thrownKills: 0, medkits: 0, gasFound: 0, fish: 0, pumpkins: 0, clowns: 0, swarms: 0, islands: 0,
      woodCut: 0, feasts: 0,
    },
  };
}

const JOURNAL_SIZE = 100;
const JOURNAL_SHOWN = 50;

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

// What makes everyone hit harder (him, the turrets, the drifters, the guards and the fence): the
// cure and the Weak spot, a feast while it lasts, and the town's fairground.
function strength(sv) {
  return cureBonus(sv) * (researched(sv, 2) ? 1.15 : 1) * (sv.feast > 0 ? 1 + FEAST.bonus : 1) * (townHas(sv, 'fair') ? 1.1 : 1);
}

// Samples only turn up once he flies the helicopter.
function flying(sv) {
  return sv.weapon >= WEAPONS.length - 1 && !parked(sv);
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

// The town's buildings standing: those paid for, less the one the settlers are still raising.
function townBuilt(sv) {
  return sv.town - (sv.townLeft > 0 ? 1 : 0);
}

function townHas(sv, key) {
  return TOWN.findIndex(b => b.key === key) < townBuilt(sv);
}

// The town's next building to pay for, once the town is open, or null.
function nextTown(sv) {
  return sv.shelter.level >= TOWN_LEVEL && sv.town < TOWN.length ? TOWN[sv.town] : null;
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
  const modded = (1 + MODS.step * sv.mods.turret) * (townHas(sv, 'factory') ? 1.2 : 1);
  return Math.round((2 + Math.floor(sv.shelter.level * 0.4)) * (1 + 0.2 * skillTier(sv, 'engineering')) * heavy * modded * strength(sv));
}

// The bullets a shot of `w` takes: a vehicle's are fewer with the garage.
function rounds(sv, w) {
  return !w.ammo ? 0 : w.vehicle && hasRoom(sv, 'garage') ? Math.ceil((w.rounds || 1) * 2 / 3) : w.rounds || 1;
}

// The gas a shot (or a ram) of `w` burns.
function burns(sv, w) {
  return (w.gas || 0) * (hasRoom(sv, 'garage') ? 0.75 : 1);
}

// Whether he has what a shot of `w` takes: bullets, arrows, gas.
function loaded(sv, w) {
  return sv.ammo >= rounds(sv, w) && (!w.arrows || sv.arrows >= 1) && sv.gas >= burns(sv, w);
}

// The weapons he has: every rung up to the one he crafted last, except those whose shelter level
// is still ahead (a save from before 1.31.0 can hold a rung that has since moved up the ladder: it
// stays parked until the shelter catches up).
function owned(sv) {
  return WEAPONS.slice(0, sv.weapon + 1).filter(w => w.level <= sv.shelter.level);
}

// A rung he holds but can't use yet, or null.
function parked(sv) {
  return WEAPONS.slice(0, sv.weapon + 1).find(w => w.level > sv.shelter.level) || null;
}

// The weapon in hand: the best gun, bow or vehicle he has loaded, or else the best weapon for his
// hands (the chainsaw, above the rifle on the ladder, is only for when the guns run dry).
function weaponInHand(sv) {
  const ready = owned(sv).filter(w => loaded(sv, w));
  return ready.filter(w => w.range > 1).pop() || ready.pop();
}

// The best weapon for his hands, for when the rest run out.
function melee(sv) {
  return owned(sv).filter(w => w.range === 1 && !w.vehicle).pop();
}

// He owns a gun (and so wants bullets), and the most bullets any of his guns takes a shot.
function gunRounds(sv) {
  return owned(sv).reduce((most, w) => Math.max(most, rounds(sv, w)), 0);
}

function driving(sv) {
  return owned(sv).some(w => w.vehicle);
}

function heroDamage(sv, w = weaponInHand(sv)) {
  const gun = w.ammo ? 1 + 0.1 * skillTier(sv, 'gunsmithing') : 1;
  const fed = sv.fed > 0 ? 1 + MEAL.bonus : 1;
  const trained = hasRoom(sv, 'training') ? 1.1 : 1;
  const modded = 1 + MODS.step * sv.mods.weapon;
  return Math.round((w.damage + Math.floor(sv.shelter.level * 0.8)) * (1 + 0.2 * skillTier(sv, 'combat')) * gun * fed * trained * modded * strength(sv));
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

// What the next walls take of wood and scrap. With steel plates, scrap stands in for the wood he
// lacks, up to STEEL.share of it.
function wallBill(sv) {
  const wood = wallCost(sv.shelter.level);
  if (!knows(sv, 'steel')) {
    return { wood, scrap: wood / 2 };
  }
  const used = Math.max(Math.ceil(wood * (1 - STEEL.share)), Math.min(wood, sv.wood));
  return { wood: used, scrap: wood / 2 + STEEL.rate * (wood - used) };
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

// The share of each bite his clothes stop. Patches add to it, and let it go past the usual most.
function armor(sv) {
  const power = GEAR_SLOTS.reduce((sum, s) => sum + gearPower(sv.gear[s.key]), 0) + PATCH.power * sv.mods.patch;
  return Math.min(sv.mods.patch ? PATCH.max : ARMOR_MAX, power / (power + ARMOR_SCALE));
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

// What the survivor builds next, if he can pay for it. Bullets, arrows, meals, clothes and things
// to throw come first (they are cheap and wanted at once), then turrets and the generator (he
// saves up for them), a better weapon, the lab and its research once he flies (he saves up for
// those too, but doesn't wait on samples), and stronger walls (which also open more turret slots).
function nextBuild(sv) {
  const none = { scrap: 0, wood: 0, cloth: 0, food: 0 };
  const gun = gunRounds(sv);
  if (gun && knows(sv, 'ammo') && sv.ammo < Math.max(BULLETS.low, 4 * gun) && sv.scrap >= BULLETS.scrap) {
    return { ...none, kind: 'ammo', scrap: BULLETS.scrap };
  }
  if (owned(sv).some(w => w.arrows) && sv.arrows < ARROWS.low && sv.wood >= ARROWS.wood) {
    return { ...none, kind: 'arrows', wood: ARROWS.wood };
  }
  if (knows(sv, 'cooking') && sv.meals < MAX_MEALS - 2 && sv.food >= MEAL.food) {
    return { ...none, kind: 'cook', food: MEAL.food };
  }
  if (knows(sv, 'grenade') && sv.grenades < THROW.max && sv.scrap >= GRENADE.scrap) {
    return { ...none, kind: 'grenade', scrap: GRENADE.scrap };
  }
  // A molotov's gas is only spared while the vehicles keep a tank's worth.
  if (knows(sv, 'molotov') && sv.molotovs < THROW.max && sv.bottles >= MOLOTOV.bottles && sv.cloth >= MOLOTOV.cloth
    && sv.gas >= MOLOTOV.gas + (driving(sv) ? 20 : 0)) {
    return { ...none, kind: 'molotov', ...MOLOTOV };
  }
  const clothes = nextClothes(sv);
  if (clothes && sv.cloth >= clothes.cloth && sv.scrap >= clothes.scrap) {
    return { ...none, kind: 'clothes', cloth: clothes.cloth, scrap: clothes.scrap, data: clothes };
  }
  // The lumber camp and the trading post are cheap, and built as soon as he can pay for them.
  if (sv.shelter.level >= SURPLUS_LEVEL && !sv.lumber && sv.scrap >= LUMBER.scrap && sv.food >= LUMBER.food) {
    return { ...none, kind: 'lumber', scrap: LUMBER.scrap, food: LUMBER.food };
  }
  if (sv.shelter.level >= SURPLUS_LEVEL && !sv.post && sv.totals.trades > 0 && sv.scrap >= POST.scrap && sv.cloth >= POST.cloth) {
    return { ...none, kind: 'post', scrap: POST.scrap, cloth: POST.cloth };
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
  // The lab goes on with the samples it has, even while the helicopter is parked.
  const stage = sv.lab ? nextStage(sv) : null;
  if (stage && sv.samples >= stage.samples) {
    return sv.scrap >= stage.scrap ? { ...none, kind: 'research', scrap: stage.scrap } : null;
  }
  // Walls of wood come first; with steel plates in them, they wait for the surplus (see surplus()).
  const walls = wallCost(sv.shelter.level);
  if (sv.wood >= walls && sv.scrap >= walls / 2) {
    return { ...none, kind: 'walls', scrap: walls / 2, wood: walls };
  }
  return surplus(sv);
}

// ---------- the surplus ----------

function lumberPay(sv) {
  return LUMBER.pay * sv.shelter.level;
}

function lumberWood(sv) {
  return Math.round(lumberPay(sv) * LUMBER.wood * (townHas(sv, 'houses') ? 1.5 : 1));
}

function modCost(n) {
  return Math.round(MODS.scrap * MODS.grow ** n);
}

function patchCost(n) {
  return Math.round(PATCH.cloth * PATCH.grow ** n);
}

function feastCost(sv) {
  return FEAST.food[0] + FEAST.food[1] * sv.wave;
}

function guardMax(sv) {
  return GUARDS.max + (townHas(sv, 'inn') ? 2 : 0);
}

function guardsOnDuty(sv) {
  return sv.paid ? sv.guards : 0;
}

// He patches his clothes once he sews, wears something in every slot and can't sew anything better.
function canPatch(sv) {
  return knows(sv, 'sewing') && GEAR_SLOTS.every(s => sv.gear[s.key]) && !nextClothes(sv);
}

// What he keeps back from the surplus: what the next walls take, the next weapon once he can craft
// it, the lab and its research when they are due, the town's next building, and KEEP.
function reserve(sv) {
  const walls = wallBill(sv);
  const keep = { scrap: walls.scrap + KEEP.scrap, cloth: KEEP.cloth, food: KEEP.food };
  const w = WEAPONS[sv.weapon + 1];
  if (w && sv.shelter.level >= w.level && knows(sv, w.blueprint)) {
    keep.scrap += w.cost;
  }
  if (flying(sv) && !sv.lab) {
    keep.scrap += LAB.scrap;
  } else if (sv.lab && sv.samples >= nextStage(sv).samples) {
    keep.scrap += nextStage(sv).scrap;
  }
  const town = nextTown(sv);
  if (town) {
    for (const key of ['scrap', 'cloth', 'food']) {
      keep[key] += town[key];
    }
  }
  return keep;
}

// What is spare of each material, beyond reserve().
function spare(sv) {
  const keep = reserve(sv);
  return Object.fromEntries(['scrap', 'cloth', 'food'].map(k => [k, sv[k] - keep[k]]));
}

// What he spends the surplus on, in this order: the town's next building (there is no starting it
// while the settlers raise the last), walls with steel plates in them, a feast when there is none,
// or else the cheapest of the workbench's mods, a patch and another guard.
function surplus(sv) {
  if (sv.shelter.level < SURPLUS_LEVEL) {
    return null;
  }
  const none = { scrap: 0, wood: 0, cloth: 0, food: 0 };
  const left = spare(sv);
  const town = nextTown(sv);
  const walls = wallBill(sv);
  // What is kept back already holds the town's building and the walls' plates, so the building can
  // take the plates' scrap, and the plated walls can be built once nothing more is spare.
  const plates = walls.scrap - wallCost(sv.shelter.level) / 2;
  if (town && sv.townLeft === 0 && left.scrap + plates >= 0 && left.cloth >= 0 && left.food >= 0) {
    return { ...none, kind: 'town', scrap: town.scrap, cloth: town.cloth, food: town.food };
  }
  if (plates > 0 && sv.wood >= walls.wood && left.scrap >= 0) {
    return { ...none, kind: 'walls', scrap: walls.scrap, wood: walls.wood };
  }
  if (knows(sv, 'cooking') && sv.feast <= 0 && left.food >= feastCost(sv)) {
    return { ...none, kind: 'feast', food: feastCost(sv) };
  }
  const options = [
    { ...none, kind: 'mod', scrap: modCost(sv.mods.weapon), data: { track: 'weapon' } },
    sv.turrets ? { ...none, kind: 'mod', scrap: modCost(sv.mods.turret), data: { track: 'turret' } } : null,
    canPatch(sv) ? { ...none, kind: 'patch', cloth: patchCost(sv.mods.patch) } : null,
    sv.guards < guardMax(sv) && sv.paid ? { ...none, kind: 'hire', ...GUARDS.fee } : null,
  ].filter(o => o && ['scrap', 'cloth', 'food'].every(k => o[k] <= left[k]));
  const worth = o => o.scrap * VALUE.scrap + o.cloth * VALUE.cloth + o.food * VALUE.food;
  return options.reduce((a, b) => (!a || worth(b) < worth(a) ? b : a), null);
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
  if (gunRounds(sv) && !knows(sv, 'ammo')) {
    return '📜 a blueprint for bullets';
  }
  const top = WEAPONS[sv.weapon];
  if (top.vehicle && sv.gas < burns(sv, top)) {
    return `⛽ gas for the ${top.name.toLowerCase()} (gas stations, cars by the road)`;
  }
  if (w && sv.shelter.level >= w.level && sv.scrap < w.cost) {
    return `${w.icon} ${w.name} ${w.cost} 🔩`;
  }
  if (flying(sv) && !sv.lab) {
    return `🧪 lab ${LAB.scrap} 🔩 + ${LAB.wood} 🪵`;
  }
  if (sv.lab && sv.samples >= nextStage(sv).samples) {
    return `${nextStage(sv).icon} ${nextStage(sv).name} ${nextStage(sv).scrap} 🔩`;
  }
  const waiting = parked(sv);
  const walls = wallBill(sv);
  return `🧱 walls ${walls.wood} 🪵 + ${walls.scrap} 🔩${waiting ? ` (${waiting.icon} at Lv ${waiting.level})` : ''}`;
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
  // 1.31.0 put new rungs in the ladder: an older save keeps its weapon, and with it every rung below
  // (and their blueprints), a vehicle gets a tank of gas, and its tyrants were all of the first kind.
  if ((parsed.v || 0) < 4) {
    sv.weapon = OLD_RUNGS[Math.min(sv.weapon, OLD_RUNGS.length - 1)];
    if (driving(sv)) {
      sv.gas = Math.max(sv.gas, START_GAS);
    }
    sv.totals.tyrants = sv.totals.bosses;
  }
  for (const w of WEAPONS.slice(0, sv.weapon + 1)) {
    if (w.blueprint && !sv.blueprints.includes(w.blueprint)) {
      sv.blueprints.push(w.blueprint);
    }
  }
  sv.gear = { ...sv.gear };
  sv.mods = { ...fresh.mods, ...sv.mods };
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

// Writes a moment in the shelter's journal (/vwc:journal survival), which keeps the last
// JOURNAL_SIZE.
function record(sv, text, now) {
  sv.journal.push({ at: now, text });
  if (sv.journal.length > JOURNAL_SIZE) {
    sv.journal.splice(0, sv.journal.length - JOURNAL_SIZE);
  }
}

// A message worth keeping: shown on the stats row and written in the journal.
function news(sv, text, now) {
  say(sv, text, now);
  record(sv, text, now);
}

// News from companion.js (the update notice), kept on the stats row for `ms`. With `keep`, it is
// also written in the journal (the achievements earned here).
function announce(text, now, ms, keep) {
  const sv = load(now);
  sv.msg = { text, at: now, ms };
  if (keep) {
    record(sv, text, now);
  }
  save(sv);
}

function makeZombie(sv) {
  // More kinds turn up as the waves go on: brutes, then runners, then screamers, bloaters,
  // spitters and juggernauts. Runners come out early at night, and twice as often. In October
  // some come with pumpkin heads, or dressed as clowns.
  const runner = sv.night ? (sv.wave >= 2 ? Math.min(0.4, 0.08 * (sv.wave - 1)) : 0) : sv.wave >= 4 ? Math.min(0.25, 0.04 * (sv.wave - 3)) : 0;
  const halloween = sv.season === 'Halloween';
  const chances = [
    ['pumpkin', halloween ? 0.12 : 0],
    ['clown', halloween ? 0.06 : 0],
    ['juggernaut', sv.wave >= 12 ? Math.min(0.06, 0.01 * (sv.wave - 11)) : 0],
    ['screamer', sv.wave >= 6 ? Math.min(0.06, 0.01 * (sv.wave - 5)) : 0],
    ['bloater', sv.wave >= 7 ? Math.min(0.08, 0.015 * (sv.wave - 6)) : 0],
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

// A piece of clothing: `bonus` tiers better than the waves would give, or of tier `exact`.
function dropGear(sv, now, bonus = 0, exact = null) {
  const slot = GEAR_SLOTS[randInt(0, GEAR_SLOTS.length - 1)];
  // Better tiers turn up further into the waves.
  const tier = exact ?? Math.min(GEAR_TIERS.length - 1, Math.floor(Math.random() * (1 + sv.wave / 6)) + bonus);
  sv.totals.gearFound++;
  wear(sv, { slot: slot.key, tier, quality: randInt(0, 9) }, now, true);
}

// The counter each kind of tyrant adds to, besides `bosses`.
const TYRANT_TOTALS = { boss: 'tyrants', queen: 'queens', behemoth: 'behemoths', brood: 'broods' };
// Other kinds counted on their own.
const KIND_TOTALS = { brute: 'brutes', juggernaut: 'juggernauts', rat: 'rats', raider: 'raiders', pumpkin: 'pumpkins', clown: 'clowns' };

// A dead raider's bullets, now and then his gun (a blueprint he still needs, or else scrap) and,
// rarely, his Tactical gear.
function raiderDrops(sv, now) {
  sv.ammo += randInt(...RAIDERS.ammo);
  if (Math.random() < RAIDERS.gun) {
    const gun = ['pistol', 'rifle'].find(k => !knows(sv, k) && BLUEPRINTS[k].after(sv));
    if (gun) {
      learnBlueprint(sv, gun, now, `${BLUEPRINTS[gun].icon} A raider's ${BLUEPRINTS[gun].name.toLowerCase()}: he works out how to make one`);
    } else {
      sv.scrap += 15;
      sv.totals.scrapFound += 15;
    }
  }
  if (Math.random() < RAIDERS.tactical) {
    dropGear(sv, now, 0, GEAR_TIERS.length - 1);
  }
}

// `source` is who did it: 'hand', 'throw' (a molotov or a grenade), 'turret', 'trap' (a trap or
// spikes), 'ally' (a drifter or the lookout) or 'fence'. Under a blood moon a zombie drops
// BLOOD.drops times as much.
function hitZombie(sv, z, dmg, source, hits, now) {
  if (z.hp <= 0) {
    return;
  }
  z.hp -= dmg;
  hits.push(z.x);
  if (z.hp > 0) {
    return;
  }
  const def = ZOMBIES[z.kind];
  sv.kills++;
  sv.waveKills++;
  if (KIND_TOTALS[z.kind]) {
    sv.totals[KIND_TOTALS[z.kind]]++;
  }
  if (def.boss) {
    sv.totals.bosses++;
    sv.totals[TYRANT_TOTALS[z.kind]]++;
    news(sv, `${def.icon} The ${def.name} is dead (wave ${sv.wave})`, now);
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
  } else if (source === 'throw') {
    sv.totals.thrownKills++;
  } else {
    sv.totals.handKills++;
  }
  if (flying(sv) && !def.raider) {
    const chance = SAMPLES[def.boss ? 'boss' : z.kind] || 0;
    addSamples(sv, chance >= 1 ? chance : Math.random() < chance ? 1 : 0);
  }
  const more = (sv.blood ? BLOOD.drops : 1) * (def.drops ?? 1);
  const scrap = Math.round((def.scrap + (Math.random() < 0.5 ? 1 : 0)) * more);
  sv.scrap += scrap;
  sv.totals.scrapFound += scrap;
  if (Math.random() < DROPS.wood * more) {
    sv.wood++;
    sv.totals.woodFound++;
  }
  if (Math.random() < DROPS.cloth * more) {
    sv.cloth++;
  }
  // A pumpkin head is good eating, half the time.
  if (Math.random() < DROPS.food * more + (z.kind === 'pumpkin' ? 0.5 : 0)) {
    sv.food++;
  }
  if (!def.boss && Math.random() < DROPS.gear * more) {
    dropGear(sv, now);
  }
  if (def.raider) {
    raiderDrops(sv, now);
  }
  if (def.burst) {
    burst(sv, z, source, hits, now);
  }
  if (def.split) {
    for (let i = 0; i < BROOD + Math.floor(sv.wave / 20); i++) {
      const w = spawn(sv, 'walker');
      w.x = z.x + (i % 3) - 1;
      sv.zombies.push(w);
    }
    say(sv, '🐛 The brood splits into walkers', now);
  }
}

// A bloater bursts: everything within a tile is hurt, zombies, him and the walls alike.
function burst(sv, z, source, hits, now) {
  sv.totals.bursts++;
  const dmg = Math.round(BURST * ZOMBIES.walker.dmg * (1 + 0.15 * (sv.wave - 1)));
  (sv.fx.bursts = sv.fx.bursts || []).push(z.x);
  for (const other of sv.zombies) {
    if (other !== z && Math.abs(other.x - z.x) <= 1) {
      hitZombie(sv, other, dmg, source, hits, now);
    }
  }
  if (out(sv) && Math.abs(sv.x - z.x) <= 1) {
    sv.hp -= Math.max(1, Math.round(dmg * biteShare(sv)));
  }
  if (Math.abs(z.x) <= WALL + 1) {
    sv.shelter.hp -= dmg;
  }
}

// He is out on the strip, where things can reach him: not inside, down, or busy building.
function out(sv) {
  return sv.x !== 0 && sv.down === 0 && sv.rebuild === 0 && !(sv.job && sv.job.kind !== 'explore');
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
  if (['turret', 'walls', 'weapon', 'lab', 'generator', 'room', 'lumber', 'post', 'town', 'mod'].includes(kind)) {
    sv.totals.builds++;
  }
  if (kind === 'lumber') {
    sv.lumber = true;
    news(sv, '🪓 A lumber camp is built: woodcutters cut wood for food', now);
  } else if (kind === 'post') {
    sv.post = true;
    news(sv, '🏪 A trading post is built: traders come twice as often, with twice as much to swap', now);
  } else if (kind === 'town') {
    const b = TOWN[sv.town];
    sv.town++;
    sv.townLeft = b.steps;
    news(sv, `${b.icon} The settlers start on the ${b.name.toLowerCase()}`, now);
  } else if (kind === 'mod') {
    const n = ++sv.mods[data.track];
    say(sv, data.track === 'weapon' ? `🪛 Workbench: his weapons +${n}, ${Math.round(MODS.step * 100 * n)}% harder`
      : `🪛 Workbench: the turrets are Mk ${n}, ${Math.round(MODS.step * 100 * n)}% harder`, now);
  } else if (kind === 'patch') {
    sv.mods.patch++;
    say(sv, `🪡 Patched his clothes: they stop ${Math.round(armor(sv) * 100)}% of every bite`, now);
  } else if (kind === 'hire') {
    sv.guards++;
    sv.paid = true;
    news(sv, `💂 A guard is hired for the walls (${sv.guards}/${guardMax(sv)}), paid in food`, now);
  } else if (kind === 'feast') {
    sv.feast = FEAST.steps;
    sv.totals.feasts++;
    say(sv, `🍗 A feast at the shelter: everyone fights ${Math.round(FEAST.bonus * 100)}% harder for ${FEAST.steps / 60} min`, now);
  } else if (kind === 'room') {
    const r = ROOMS[data.key];
    sv.rooms.push(data.key);
    sv.totals.roomsBuilt++;
    news(sv, `${r.icon} ${r.name} built in the cellar: ${r.text}`, now);
  } else if (kind === 'generator') {
    sv.generator = true;
    news(sv, '⚡ Generator built: it runs on the tokens Claude uses', now);
  } else if (kind === 'lab') {
    sv.lab = true;
    news(sv, '🧪 The lab is built: the samples can be studied', now);
  } else if (kind === 'research') {
    const stage = nextStage(sv);
    sv.samples -= stage.samples;
    if (sv.cures === 0 && sv.stage < CURE.length - 1) {
      sv.stage++;
      news(sv, `${stage.icon} ${stage.name}: ${stage.text}`, now);
    } else {
      sv.stage = CURE.length;
      sv.cures++;
      news(sv, sv.cures === 1 ? '💉 The cure works ✨ but a new strain is spreading' : `💉 Another strain cured ✨${sv.cures}`, now);
    }
  } else if (kind === 'arrows') {
    sv.arrows += ARROWS.made;
    say(sv, `🏹 ${ARROWS.made} arrows cut`, now);
  } else if (kind === 'molotov' || kind === 'grenade') {
    sv[`${kind}s`]++;
    say(sv, kind === 'molotov' ? '🍾 A molotov is ready' : '💣 A grenade is ready', now);
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
    news(sv, `${WEAPONS[sv.weapon].icon} ${WEAPONS[sv.weapon].name} crafted`, now);
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
  const wave = sv.wave;
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
  sv.fires = [];
  sv.fx = null;
  news(sv, `🔥 The shelter fell at wave ${wave}, rebuilding`, now);
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

// A blueprint he now knows, written in the journal.
function learnBlueprint(sv, key, now, text = `📜 Found the ${BLUEPRINTS[key].name} blueprint`) {
  sv.blueprints.push(key);
  sv.misses = 0;
  news(sv, text, now);
}

function gather(sv, crate, now) {
  if (crate.kind === 'blueprint') {
    learnBlueprint(sv, crate.key, now);
    return;
  }
  if (crate.kind === 'drop') {
    openDrop(sv, now);
    return;
  }
  if (crate.kind === 'trader') {
    trade(sv, now);
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
  if (driving(sv)) {
    addGas(sv, SUPPLY.gas);
    found.push(`${SUPPLY.gas} gas`);
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

function addGas(sv, n) {
  sv.gas += n;
  sv.totals.gasFound += n;
}

// What he has of a material against what he wants of it: the next walls' wood and scrap, some
// cloth and food (more food once woodcutters work for it), the cloth and food the town's next
// building takes, and gas once he drives.
function wants(sv) {
  const walls = wallCost(sv.shelter.level);
  const town = nextTown(sv) || { cloth: 0, food: 0 };
  return {
    scrap: walls / 2, wood: walls, cloth: 40 + town.cloth, food: 30 + (sv.lumber ? 10 * lumberPay(sv) : 0) + town.food,
    ...(driving(sv) ? { gas: 60 } : {}),
  };
}

// The trader swaps a share of what the survivor has most of (against what he wants of it) for
// what he has least of, at fair rates, and never more than he carries or than is wanted.
function trade(sv, now) {
  const want = wants(sv);
  const keys = Object.keys(want);
  const share = k => sv[k] / want[k];
  const give = keys.reduce((a, b) => (share(b) > share(a) ? b : a));
  const get = keys.reduce((a, b) => (share(b) < share(a) ? b : a));
  const cap = (TRADER.cap[0] + TRADER.cap[1] * sv.wave) * (sv.post ? POST.cap : 1);
  const worth = Math.min(sv[give] * TRADER.share * VALUE[give], cap, Math.max(0, want[get] - sv[get]) * VALUE[get]);
  const paid = Math.ceil(worth / VALUE[give]);
  const got = Math.floor(worth / VALUE[get]);
  if (give === get || share(give) < 2 * share(get) || got < 1) {
    say(sv, '🐫 A trader passes by, but there is nothing to swap', now);
    return;
  }
  sv[give] -= paid;
  if (get === 'gas') {
    addGas(sv, got);
  } else {
    sv[get] += got;
    if (get === 'scrap' || get === 'wood') {
      sv.totals[`${get}Found`] += got;
    }
  }
  sv.totals.trades++;
  news(sv, `🐫 Traded ${paid} ${give} for ${got} ${get} with a passing trader`, now);
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
  if (Math.random() >= UNDERSTAND[0] + UNDERSTAND[1] * skillTier(sv, 'studying') + (hasRoom(sv, 'library') ? LIBRARY : 0)) {
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
  news(sv, `👷 ${resident.name} moves in: ${role.icon} the ${role.name}`, now);
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
    sv.hp = Math.min(heroMax(sv), sv.hp + Math.round(heroMax(sv) * MEAL.heal * (1 + 0.15 * cook) * (hasRoom(sv, 'still') ? 1.5 : 1)));
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
  const first = weaponInHand(sv);
  const hands = melee(sv);
  const fire = shelterFire(sv);
  const turrets = Math.abs(from) <= sees(sv, TURRET_RANGE) ? fire : 0;
  const total = group.reduce((sum, z) => sum + z.hp, 0);
  let pool = total;
  // The shots the weapon in hand has before he is down to his hands.
  let shots = first === hands ? Infinity : Math.min(first.ammo ? sv.ammo / rounds(sv, first) : Infinity,
    first.arrows ? sv.arrows : Infinity, first.gas ? sv.gas / burns(sv, first) : Infinity);
  let steps = 0;
  while (pool > 0 && steps < 150) {
    const w = shots >= 1 ? first : hands;
    shots--;
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

// What the shelter shoots every step: the turrets, the drifters and guards on the walls and the lookout.
function shelterFire(sv) {
  return sv.turrets * turretDamage(sv) + (sv.drifters.length + guardsOnDuty(sv)) * drifterDamage(sv) + (hasRole(sv, 'lookout') ? turretDamage(sv) : 0);
}

function startJob(sv, build) {
  for (const key of ['scrap', 'wood', 'cloth', 'food', 'bottles', 'gas']) {
    sv[key] -= build[key] || 0;
  }
  const time = Math.ceil(JOB_STEPS[build.kind] * (1 - 0.25 * skillTier(sv, 'engineering')));
  sv.job = { kind: build.kind, left: time, data: build.data };
}

// A blueprint he finds on a search, if any he could use is still missing.
function findBlueprint(sv, now) {
  const key = pickBlueprint(sv);
  if (key) {
    learnBlueprint(sv, key, now);
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
  // Some places need a few waves behind him.
  if (sv.wave < (SITES[kind].wave || 0)) {
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
    && !sv.zombies.some(z => ZOMBIES[z.kind].boss || Math.abs(z.x) <= WALL + 3);
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
  // With the boat, he goes on to an island at the end of the road.
  if (sv.boat) {
    d += randInt(...TRIP.gap) + 3;
    stops.push({ kind: 'island', x: side * d });
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
    // He siphons the gas left in the cars by the road, once a trip each.
    trip.siphoned = trip.siphoned || [];
    if (wreck(sv.x) && !trip.siphoned.includes(sv.x)) {
      trip.siphoned.push(sv.x);
      const n = randInt(...WRECK_GAS);
      addGas(sv, n);
      say(sv, `⛽ Siphoned ${n} gas from a car by the road`, now);
    }
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

// Zombies (or, in caves, bats: `kind`) jump him at `x`.
function ambush(sv, x, count, now, kind) {
  for (let i = 0; i < Math.min(6, repelled(sv, count)); i++) {
    const z = kind ? spawn(sv, kind) : makeZombie(sv);
    // Out on the road there is no end of the strip to keep them in.
    z.x = Math.abs(x) > RADIUS ? x + (i % 3) - 1 : Math.max(-RADIUS, Math.min(RADIUS, x + (i % 3) - 1));
    sv.zombies.push(z);
  }
  say(sv, kind === 'bat' ? '🦇 Bats pour out of the dark!' : '💥 Ambush!', now);
}

// `count` of `kind` (or of every kind, by makeZombie) come in from one end of the strip.
function band(sv, count, kind) {
  const side = Math.random() < 0.5 ? -1 : 1;
  for (let i = 0; i < count; i++) {
    const z = kind ? spawn(sv, kind) : makeZombie(sv);
    z.x = side * (RADIUS - Math.min(i, 5));
    sv.zombies.push(z);
  }
  return side;
}

function horde(sv, now, away) {
  const count = repelled(sv, Math.min(8, 3 + Math.floor(sv.wave / 4)));
  const side = band(sv, count);
  sv.totals.hordes++;
  say(sv, `🧟 A horde of ${count} comes ${away ? 'for the shelter while he is away' : `from the ${side < 0 ? 'left' : 'right'}`}`, now);
}

// Instead of a horde, now and then: a band of raiders, or a swarm of rats.
function onslaught(sv, now) {
  const roll = Math.random();
  if (sv.wave >= RAIDERS.wave && roll < RAIDERS.share) {
    const count = randInt(...RAIDERS.size);
    const side = band(sv, count, 'raider');
    sv.totals.raids++;
    say(sv, `🦹 ${count} raiders come from the ${side < 0 ? 'left' : 'right'}, guns out`, now);
  } else if (roll < RAIDERS.share + SWARM.share) {
    const side = band(sv, randInt(...SWARM.size), 'rat');
    sv.totals.swarms++;
    say(sv, `🐀 A swarm of rats pours in from the ${side < 0 ? 'left' : 'right'}`, now);
  } else {
    horde(sv, now);
  }
}

// What he finds in a place, after the search. Scouting makes the finds bigger.
function explore(sv, site, now) {
  const def = SITES[site.kind];
  const scout = skillTier(sv, 'scouting');
  const dive = skillTier(sv, 'diving');
  sv.totals.sites++;
  let bonus = (1 + 0.25 * scout) * (def.road || def.boat ? 1 + 0.1 * sv.wave : 1);
  if (site.kind === 'lake' && sv.season === 'Winter') {
    // The lake is frozen over: he cuts a hole and fishes, which is safe, if cold.
    const n = Math.round(randInt(...FISHING.food) * bonus);
    sv.food += n;
    sv.totals.fish += n;
    say(sv, `🎣 Fished through the ice: +${n} food`, now);
    return;
  }
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
  const bats = def.bats && Math.random() < def.bats - (sv.dog ? DOG.bark : 0);
  if (bats) {
    ambush(sv, site.x, 3 + Math.floor(sv.wave / 5), now, 'bat');
  }
  if (site.kind === 'shelter') {
    sv.hp = heroMax(sv);
  }
  if (site.kind === 'island') {
    sv.totals.islands++;
  }
  const found = [];
  for (const [key, range] of Object.entries(def.loot)) {
    if (Array.isArray(range)) {
      // Gas, bottles and medkits come as they are; the rest grows with his finds.
      const n = Math.round(randInt(range[0], range[1]) * (SUPPLIES.includes(key) ? 1 : bonus));
      if (key === 'gas') {
        addGas(sv, n);
      } else {
        sv[key] += n;
      }
      if (key === 'scrap' || key === 'wood') {
        sv.totals[`${key}Found`] += n;
      }
      if (key === 'food' && site.kind === 'harbor') {
        sv.totals.fish += n;
      }
      found.push(`${n} ${key}`);
    }
  }
  say(sv, `${def.icon} ${def.name[0].toUpperCase()}${def.name.slice(1)}: +${found.join(', +')}`, now);
  if (site.kind === 'harbor' && !sv.boat) {
    sv.boat = true;
    news(sv, '🚤 He patches up a boat at the harbor: his trips can reach an island now', now);
  }
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
    news(sv, `🐕 A dog named ${sv.dog.name} follows him home`, now);
  }
  // A passage at the back of the caves leads to a hidden bunker, which he searches next.
  if (def.hidden && !bats && Math.random() < def.hidden) {
    sv.job = { kind: 'explore', left: JOB_STEPS.explore, data: { kind: 'bunker', x: site.x } };
    say(sv, '🚪 A passage in the caves leads to a hidden bunker', now);
  }
}

// A zombie takes a step toward the shelter. A barricade in the way stops it: it chews through
// instead (a juggernaut breaks it in one blow, and the behemoth walks on through it). Spikes hurt
// every zombie that crosses them, and a trap catches the first one; raiders step around both.
function advance(sv, z, dmg, hits, now) {
  const def = ZOMBIES[z.kind];
  const next = z.x - sign(z.x);
  const d = sv.defenses.find(e => e.x === next);
  if (d && d.type === 'barricade') {
    d.hp = def.smash ? 0 : d.hp - dmg;
    if (d.hp <= 0) {
      sv.defenses.splice(sv.defenses.indexOf(d), 1);
    }
    if (!def.through) {
      return;
    }
  }
  z.x = next;
  if (def.raider) {
    return;
  }
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

// Who he goes for first: a screamer (or the queen) in reach, before it calls more, else the nearest.
function target(sv, x, within) {
  const loud = sv.zombies.filter(z => ZOMBIES[z.kind].scream && z.hp > 0);
  return nearest(loud, x, within) || nearest(sv.zombies, x, within);
}

// A screamer that sees him shrieks once, and runners come from its end of the strip; the queen
// calls hers every QUEEN.every steps for as long as she is on the strip.
function scream(sv, now) {
  for (const z of sv.zombies) {
    const def = ZOMBIES[z.kind];
    if (!def.scream || z.idle || Math.abs(z.x) > RADIUS) {
      continue;
    }
    const calls = def.boss ? sv.step % QUEEN.every === 0 : !z.screamed && out(sv) && Math.abs(z.x - sv.x) <= SIGHT;
    if (!calls) {
      continue;
    }
    z.screamed = true;
    const count = def.boss ? QUEEN.runners : Math.min(SCREAM_MAX, SCREAM + Math.floor(sv.wave / 15));
    for (let i = 0; i < count; i++) {
      const r = spawn(sv, 'runner');
      r.x = sign(z.x) * RADIUS;
      sv.zombies.push(r);
    }
    if (!def.boss) {
      sv.totals.screams++;
      say(sv, `😱 A screamer shrieks: ${count} runners come running`, now);
    }
  }
}

// He throws a molotov or a grenade on his own at the zombie with the most others around it, when
// that is THROW.group or more, in reach and not too close to him or the shelter.
function throwAt(sv, hits, now) {
  if (sv.step - sv.thrown < THROW.every || (!sv.grenades && !sv.molotovs)) {
    return false;
  }
  const kind = sv.grenades ? 'grenade' : 'molotov';
  const reach = kind === 'grenade' ? GRENADE.reach : FIRE.reach;
  let best = null;
  let most = 0;
  for (const z of sv.zombies) {
    const d = Math.abs(z.x - sv.x);
    if (z.hp <= 0 || z.idle || d < 2 || d > THROW.range || Math.abs(z.x) <= WALL) {
      continue;
    }
    const near = sv.zombies.filter(o => o.hp > 0 && Math.abs(o.x - z.x) <= reach).length;
    if (near > most) {
      best = z;
      most = near;
    }
  }
  if (!best || most < THROW.group || Math.abs(best.x - sv.x) <= reach) {
    return false;
  }
  sv[`${kind}s`]--;
  sv.thrown = sv.step;
  sv.totals.thrown++;
  sv.fx.throws.push({ from: sv.x, to: best.x, kind });
  if (kind === 'grenade') {
    const dmg = Math.round((40 + 6 * sv.shelter.level) * strength(sv));
    for (const z of sv.zombies.filter(o => Math.abs(o.x - best.x) <= GRENADE.reach)) {
      hitZombie(sv, z, dmg, 'throw', hits, now);
    }
    say(sv, `💣 A grenade into ${most} zombies`, now);
  } else {
    sv.fires.push({ x: best.x, left: FIRE.steps });
    say(sv, `🍾 A molotov sets ${most} zombies alight`, now);
  }
  return true;
}

// The fires from his molotovs burn whatever stands in them, and die down.
function burn(sv, hits, now) {
  const dmg = Math.round((8 + 2 * sv.shelter.level) * strength(sv));
  for (const f of sv.fires) {
    for (const z of sv.zombies.filter(o => Math.abs(o.x - f.x) <= FIRE.reach)) {
      hitZombie(sv, z, dmg, 'throw', hits, now);
    }
    f.left--;
  }
  sv.fires = sv.fires.filter(f => f.left > 0);
}

// The season on the strip, from the adventure's: October's pumpkin heads and clowns, December's
// snow (the zombies wade through it, and the lakes freeze).
function noticeSeason(sv, season, now) {
  if (season !== sv.season && season) {
    news(sv, season === 'Halloween' ? '🎃 Halloween reaches the strip: pumpkin heads and 🤡 clowns'
      : '⛄ Snow on the strip: the zombies wade through it, and the lakes freeze over', now);
  }
  sv.season = season || null;
}

function step(sv, now) {
  sv.step++;
  sv.doing = null;
  const hits = [];
  sv.fx = { step: sv.step, hits, throws: [], bursts: [] };

  if (sv.rebuild > 0) {
    sv.rebuild--;
    if (sv.rebuild === 0) {
      sv.shelter.hp = shelterMax(sv);
      sv.hp = heroMax(sv);
      news(sv, '🏠 Shelter rebuilt', now);
    }
    return;
  }
  if (sv.fed > 0) {
    sv.fed--;
  }
  if (sv.feast > 0) {
    sv.feast--;
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
  // The tyrants take turns: the tyrant, the screamer queen, the behemoth and the brood.
  if (sv.boss && !sv.zombies.some(z => ZOMBIES[z.kind].boss)) {
    sv.boss = false;
    const kind = nextTyrant(sv);
    sv.zombies.push(spawn(sv, kind));
    const tricks = { boss: '', queen: ', calling runners as she comes', behemoth: ', walking through barricades', brood: ', crawling with young' };
    say(sv, `${ZOMBIES[kind].icon} A ${ZOMBIES[kind].name} comes for the shelter${tricks[kind]}`, now);
  }
  if (sv.sites.length < 2 && sv.step % SITE_EVERY === 0) {
    sv.sites.push(newSite(sv));
  }
  if (sv.wave >= 3 && sv.step % HORDE_EVERY === 0 && Math.random() < 0.5) {
    onslaught(sv, now);
  }
  // A trader waiting on the strip doesn't count toward the most crates at once.
  if (sv.crates.filter(c => c.kind !== 'trader').length < MAX_CRATES && sv.step % CRATE_EVERY === 0) {
    sv.crates.push(newCrate(sv));
  }
  // A trader comes by now and then, by day, and moves on if the survivor doesn't reach him. With
  // a trading post they come more often and stay longer.
  if (sv.step >= sv.traderAt) {
    const often = sv.post ? POST.often : 1;
    sv.traderAt = sv.step + TRADER.every / often;
    if (!sv.night && Math.random() < TRADER.chance) {
      const side = Math.random() < 0.5 ? -1 : 1;
      sv.crates.push({ x: side * randInt(3, RADIUS - 1), kind: 'trader', until: sv.step + TRADER.stays * often });
      say(sv, '🐫 A trader comes down the road', now);
    }
  }
  sv.crates = sv.crates.filter(c => !c.until || c.until > sv.step);
  scream(sv, now);
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
  // And so do the rooms in the cellar, and the radio mast.
  if (hasRoom(sv, 'greenhouse') && sv.step % GREENHOUSE.every === 0) {
    sv.food += GREENHOUSE.food;
  }
  if (townHas(sv, 'mast') ? sv.step % MAST_EVERY === 0 : hasRoom(sv, 'radio') && sv.step % RADIO_EVERY === 0) {
    landDrop(sv);
    say(sv, townHas(sv, 'mast') ? '📡 The radio mast calls in a supply drop' : '📻 The radio calls in a supply drop', now);
  }
  // The woodcutters go out from their camp while the walls want wood, if there is food to pay them
  // and still some left in the pantry after.
  if (sv.lumber && sv.step % LUMBER.every === 0 && sv.wood < wallCost(sv.shelter.level) && sv.food >= lumberPay(sv) + KEEP.food) {
    const pay = lumberPay(sv);
    const wood = lumberWood(sv);
    sv.food -= pay;
    sv.wood += wood;
    sv.totals.woodFound += wood;
    sv.totals.woodCut += wood;
    say(sv, `🪓 The woodcutters bring ${wood} wood, for ${pay} food`, now);
  }
  // The guards are paid now and then; without the food for all of them, they stay home until there is.
  if (sv.guards && sv.step % GUARDS.every === 0) {
    const pay = GUARDS.pay * sv.guards;
    const paid = sv.food >= pay;
    if (paid) {
      sv.food -= pay;
    }
    if (paid !== sv.paid) {
      say(sv, paid ? '💂 The guards are paid and back on the walls' : '💂 No food to pay the guards: they stay home', now);
    }
    sv.paid = paid;
  }
  // The settlers raise the town's next building, while he goes on as before.
  if (sv.townLeft > 0) {
    sv.townLeft--;
    if (sv.townLeft === 0) {
      const b = TOWN[sv.town - 1];
      news(sv, sv.town === TOWN.length ? `${b.icon} The ${b.name.toLowerCase()} opens: the town is alive again, and the shelter is a haven`
        : `${b.icon} The ${b.name.toLowerCase()} ${b.key === 'houses' ? 'are' : 'is'} built: ${b.text}`, now);
    }
  }

  // The turrets he has built guard the shelter on their own, and so do the drifters and the guards
  // on the walls and the lookout on the roof (in the dark, only as far as the lights let them see).
  for (let t = 0; t < sv.turrets; t++) {
    const z = target(sv, 0, sees(sv, TURRET_RANGE));
    if (z) {
      hitZombie(sv, z, turretDamage(sv), 'turret', hits, now);
    }
  }
  for (let d = 0; d < sv.drifters.length + guardsOnDuty(sv); d++) {
    const z = nearest(sv.zombies, 0, sees(sv, DRIFTER_RANGE));
    if (z) {
      hitZombie(sv, z, drifterDamage(sv), 'ally', hits, now);
    }
  }
  const spotted = hasRole(sv, 'lookout') ? nearest(sv.zombies, 0, sees(sv, LOOKOUT_RANGE)) : null;
  if (spotted) {
    hitZombie(sv, spotted, turretDamage(sv), 'ally', hits, now);
  }
  burn(sv, hits, now);
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
    } else if (sv.medkits > 0 && sv.hp < heroMax(sv) * RETREAT[1]) {
      // A medkit cuts the rest short.
      sv.medkits--;
      sv.totals.medkits++;
      sv.hp = Math.min(heroMax(sv), sv.hp + Math.round(heroMax(sv) * MEDKIT));
      sv.doing = 'rest';
      say(sv, '💊 Patched up with a medkit: the rest is cut short', now);
    } else {
      sv.hp = Math.min(heroMax(sv), sv.hp + ((hasRole(sv, 'medic') ? 6 : 3) + (hasRoom(sv, 'infirmary') ? 2 : 0)) * (townHas(sv, 'fountain') ? 2 : 1));
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
    const foe = target(sv, sv.x, weapon.range);
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
    } else if (throwAt(sv, hits, now)) {
      sv.zombies = sv.zombies.filter(z => z.hp > 0);
    } else if (foe) {
      sv.ammo -= rounds(sv, weapon);
      sv.gas = Math.max(0, sv.gas - burns(sv, weapon));
      if (weapon.arrows) {
        sv.arrows--;
      }
      const dmg = heroDamage(sv);
      const struck = [foe, ...sv.zombies.filter(z => weapon.splash && z !== foe && z.hp > 0 && Math.abs(z.x - foe.x) <= weapon.splash)];
      hitZombie(sv, foe, dmg, 'hand', hits, now);
      // A vehicle's shot lands on the zombies around the target too.
      for (const z of struck.slice(1)) {
        hitZombie(sv, z, Math.round(dmg / 2), 'hand', hits, now);
      }
      // The pickup's ram knocks whoever is left standing back a tile.
      if (weapon.ram) {
        for (const z of struck.filter(o => o.hp > 0)) {
          const back = z.x + (sign(z.x - sv.x) || sign(z.x));
          z.x = Math.abs(z.x) <= RADIUS ? Math.max(-RADIUS, Math.min(RADIUS, back)) : back;
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
      ? sv.crates.findIndex(c => c.x !== sv.x && c.kind !== 'trader' && Math.abs(c.x - sv.x) <= DOG.fetch) : -1;
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
    // Snow slows them down by a step.
    const every = def.every + (sv.season === 'Winter' ? 1 : 0);
    if (sv.down === 0 && !(sv.job && sv.job.kind !== 'explore') && !sv.resting && Math.abs(z.x - sv.x) <= (def.shoots || 1) && sv.x !== 0) {
      // Like the walls, he takes a bite (or a raider's shot) every other step.
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
    } else if (sv.step % every === 0) {
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
      sv.hp = Math.min(heroMax(sv), sv.hp + (1 + (aid >= 1 ? 1 : 0) + (aid >= 3 ? 1 : 0)) * (townHas(sv, 'fountain') ? 2 : 1));
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
    if (sv.wave % 10 === 0 && sv.wave >= sv.bestWave) {
      news(sv, `🧟 Wave ${sv.wave}: a tyrant is coming`, now);
    } else {
      say(sv, `🧟 Wave ${sv.wave}`, now);
    }
  }
  learn(sv, now);
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
// the subagents at work (`drifters`, see meetDrifters), whether it is `night`, the `tokens`
// Claude has used so far, for the generator, and the adventure's `season` ('Halloween', 'Winter'
// or null).
function tick(active, now, world = {}) {
  const sv = load(now);
  meetDrifters(sv, world.drifters || [], now);
  noticeNight(sv, !!world.night, now);
  noticeSeason(sv, world.season, now);
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

// The town on the stats row: the building going up and how far along it is, or how many stand.
function townText(sv) {
  const built = townBuilt(sv);
  if (sv.townLeft > 0) {
    const b = TOWN[sv.town - 1];
    return `${b.icon} ${Math.floor((1 - sv.townLeft / b.steps) * 100)}%`;
  }
  return built === TOWN.length ? '🌆 haven' : built ? `🌆 ${built}/${TOWN.length}` : null;
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
  // What a shot of the weapon in hand takes, and what is left of it.
  const load = [w.ammo ? `${sv.ammo}` : null, w.arrows ? `${sv.arrows}` : null, w.gas ? `⛽ ${Math.floor(sv.gas)}` : null].filter(Boolean).join(' ');
  const throws = [sv.molotovs ? `🍾 ${sv.molotovs}` : null, sv.grenades ? `💣 ${sv.grenades}` : null].filter(Boolean).join(' ');
  // The sign's count only shows once it differs from the day count, after a fall.
  const days = sv.days ? `📅 Day ${sv.days}${sv.safeDays < sv.days ? ` 🪧 ${sv.safeDays}` : ''}` : null;
  const fuel = Math.round((sv.fuel / FUEL_MAX) * 100);
  const parts = [
    [`${shelterIcon(lvl)} Shelter ${color(GOLD, `Lv ${lvl}`)}${sv.cures ? color(GOLD, ` ✨${sv.cures}`) : ''} ${color(barColor, bar)} ${sv.shelter.hp}/${max}`, 6],
    [days, 4.4],
    [ctx.night ? (bloodMoon(ctx.now) ? color(RED, '🌕 blood moon') : '🌙 night') : null, 3.9],
    [sv.season === 'Halloween' ? '🎃' : sv.season === 'Winter' ? '⛄' : null, 2.1],
    [`🧑 ${w.icon} ${w.name}${sv.mods.weapon ? ` +${sv.mods.weapon}` : ''}${load ? ` ${load}` : ''}`, 4],
    [throws || null, 2.9],
    [sv.medkits ? `💊 ${sv.medkits}` : null, 2.7],
    [stock, 5],
    [sv.job ? `${sv.job.kind === 'explore' ? '🔍' : '🔨'} ${JOB_NAMES[sv.job.kind]} ${sv.job.left}` : sv.mode ? (sv.x === 0 ? '🧱 holed up' : '🏃 falling back')
      : sv.trip && sv.x !== 0 ? tripText(sv)
        : sv.x === 0 && (sv.resting || sv.doing === 'study') ? restText(sv) : `🎯 ${goalText(sv)}`, 3],
    [`🗼 ${sv.turrets}/${slotsAt(lvl)}${sv.mods.turret ? ` Mk ${sv.mods.turret}` : ''}`, 4.2],
    [townText(sv), 3.3],
    [sv.generator ? (fuel > 0 ? `⚡ ${fuel}%` : color('2', '⚡ 0%')) : null, 3.7],
    // While he is away, the map follows him, so this tells of the zombies at the walls.
    [sv.trip && atWalls ? color(RED, `🧟 ${atWalls} at the walls`) : null, 5.2],
    [sv.drifters.length ? `🤠 ${sv.drifters.length}` : null, 3.8],
    [sv.guards ? (sv.paid ? `💂 ${sv.guards}` : color('2', `💂 ${sv.guards}`)) : null, 3.75],
    [sv.residents.length ? `👷 ${sv.residents.length}${sv.dog ? ' 🐕' : ''}` : sv.dog ? '🐕' : null, 3.2],
    [flying(sv) || sv.lab ? `🧪 ${sv.samples}` : null, 3.4],
    [sv.defenses.length ? `🚧 ${sv.defenses.length}` : null, 3.6],
    [guard ? `🧥 ${guard}%` : null, 3.5],
    [sv.meals || sv.fed ? `🍲 ${sv.meals}${sv.fed ? ' 😋' : ''}` : null, 2.8],
    [sv.feast > 0 ? `🍗 ${Math.ceil(sv.feast / 60)} min` : null, 2.6],
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
const CRATE_ICONS = { scrap: '📦', wood: '🪵', cloth: '🧵', food: '🥩', blueprint: '📜', drop: '🪂', trader: '🐫' };

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
    } else if (sv.fires.some(f => f.x === x)) {
      row += '🔥';
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
      // In October a pumpkin stands in for every other tree, and in December a snowman.
      const odd = hash(x + 31) % 2 === 0;
      row += odd && sv.season === 'Halloween' ? '🎃' : odd && sv.season === 'Winter' ? '⛄' : '🌲';
    } else {
      row += '  ';
    }
  }
  return row;
}

const FLOOR = { bg: '48;2;58;52;44', fg: '38;2;120;108;90' };
const BLOOD_FLOOR = { bg: '48;2;68;26;26', fg: '38;2;150;72;72' };
const SNOW_FG = '38;2;241;245;249';
const LIT = 3;   // with the generator running, its lights reach this many tiles either side of the shelter

// The ground darkens with the adventure's daylight (ctx.light, shaded by ctx.shade), except where
// the lights reach, and turns red under a blood moon.
function floorRow(sv, ctx) {
  const { tiles, left } = mapSpan(sv, ctx);
  const light = ctx.light ?? 1;
  const blood = ctx.night && bloodMoon(ctx.now);
  const lamps = light < 1 && powered(sv) && sv.rebuild === 0;
  // In December snow lies on the ground, white flakes on the dirt.
  const snow = sv.season === 'Winter';
  const fg = snow ? SNOW_FG : FLOOR.fg;
  let row = '';
  let style = null;
  for (let i = 0; i < tiles; i++) {
    const x = left + i;
    const glow = lamps && Math.abs(x) <= LIT ? 1 : light;
    const code = blood ? `${BLOOD_FLOOR.bg};${BLOOD_FLOOR.fg}`
      : glow < 1 && ctx.shade ? `${ctx.shade(FLOOR.bg, glow)};${ctx.shade(fg, glow)}` : `${FLOOR.bg};${fg}`;
    if (code !== style) {
      row += `${ESC}${code}m`;
      style = code;
    }
    row += (hash(x + 7919) % 3 === 0 ? (snow ? '* ' : '· ') : '  ');
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
    // The journal isn't drawn, so it stays here.
    sv: { ...sv, journal: undefined },
    hud: statParts(sv, ctx).parts.map(p => plain(p[0])),
    news: sv.msg && ctx.now - sv.msg.at < (sv.msg.ms || MSG_MS) ? sv.msg.text : null,
    waiting: !ctx.active,
    max: shelterMax(sv),
    heroMax: heroMax(sv),
    weapon: { key: WEAPONS.indexOf(w), id: w.name.toLowerCase(), name: w.name, vehicle: !!w.vehicle },
    season: sv.season,
    bosses: TYRANTS,
    reach: Object.fromEntries(Object.entries(ZOMBIES).filter(([, z]) => z.reach).map(([k, z]) => [k, z.reach])),
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
    // What the surplus built around the shelter: the town's buildings standing, the one going up
    // and how far along it is, and the guards on the walls.
    town: {
      built: TOWN.slice(0, townBuilt(sv)).map(b => b.key),
      building: sv.townLeft > 0 ? TOWN[sv.town - 1].key : null,
      progress: sv.townLeft > 0 ? 1 - sv.townLeft / TOWN[sv.town - 1].steps : 1,
    },
    guards: guardsOnDuty(sv),
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
  if (!flying(sv) && !sv.lab) {
    return ['  Lab           after the 🚁 helicopter: zombies carry samples of the virus, and a lab studies them for a cure'];
  }
  if (!sv.lab) {
    return [`  Lab           not built yet (${LAB.scrap} scrap, ${LAB.wood} wood) · 🧪 ${sv.samples} samples kept`];
  }
  const next = nextStage(sv);
  const done = sv.cures ? CURE.length - 1 : sv.stage;
  const grounded = flying(sv) ? [] : [`    🚁 the helicopter is parked until shelter Lv ${WEAPONS[WEAPONS.length - 1].level}: no new samples until then`];
  return [
    sv.cures
      ? `  Lab           🧪 ${sv.samples} samples · next: 💉 a cure for the new strain (${next.samples} samples, ${next.scrap} scrap)`
      : `  Lab           🧪 ${sv.samples} samples · next: ${next.icon} ${next.name} (${next.samples} samples, ${next.scrap} scrap): ${next.text}`,
    ...grounded,
    ...CURE.slice(0, done).map(c => `    ${c.icon} ${c.name}: ${c.text}`),
    ...(sv.cures ? [`    💉 Cured ${sv.cures} time${sv.cures === 1 ? '' : 's'} ✨: ${Math.round(CURE_BONUS * 100 * sv.cures)}% more damage and walls`] : []),
  ];
}

// What he does with what piles up: the woodcutters, the steel plates, the trading post, and what
// he spends the surplus on.
function surplusLines(sv) {
  if (sv.shelter.level < SURPLUS_LEVEL) {
    return [`  Surplus       from shelter Lv ${SURPLUS_LEVEL} he puts what piles up to use: woodcutters, steel plates, a trading post, a workbench, patches, guards and feasts, and from Lv ${TOWN_LEVEL} a town`];
  }
  const left = spare(sv);
  const m = sv.mods;
  const pct = n => `${Math.round(MODS.step * 100 * n)}%`;
  const cheaper = sv.turrets && m.turret < m.weapon ? m.turret : m.weapon;
  return [
    `  Woodcutters   ${sv.lumber ? `🪓 every ${LUMBER.every / 60} min of work, ${lumberWood(sv)} wood for ${lumberPay(sv)} food, while the walls want wood · ${sv.totals.woodCut} cut`
      : `🪓 a lumber camp (${LUMBER.scrap} scrap, ${LUMBER.food} food) puts woodcutters to work for food`}`,
    `  Steel plates  ${knows(sv, 'steel') ? `🔩 scrap stands in for up to ${Math.round(STEEL.share * 100)}% of the walls' wood, ${STEEL.rate} for each, once the town's next building is kept back`
      : '📜 a blueprint for them would let scrap stand in for wood in the walls'}`,
    `  Trading post  ${sv.post ? '🏪 traders come twice as often, stay twice as long and bring twice as much to swap'
      : sv.totals.trades ? `🏪 to build for ${POST.scrap} scrap, ${POST.cloth} cloth` : '🏪 once he has traded with a passing 🐫 trader'} · ${sv.totals.trades} trades`,
    `  Spare         🔩 ${Math.max(0, left.scrap)} scrap · 🧵 ${Math.max(0, left.cloth)} cloth · 🥩 ${Math.max(0, left.food)} food: what is left once the next walls${nextTown(sv) ? ', the town\'s next building' : ''} and a little of everything are kept back`,
    `  Workbench     🪛 his weapons +${m.weapon} (${pct(m.weapon)} harder) · 🗼 turrets Mk ${m.turret} (${pct(m.turret)} harder) · the next mod for ${modCost(cheaper)} spare scrap`,
    `  Patches       🪡 ${m.patch ? `${m.patch} on his clothes (+${PATCH.power * m.patch} power, up to ${Math.round(PATCH.max * 100)}% protection)` : 'none yet'} · ${canPatch(sv) ? `the next for ${patchCost(m.patch)} spare cloth` : 'once nothing better can be sewn'}`,
    `  Guards        💂 ${sv.guards}/${guardMax(sv)} hired${sv.guards ? (sv.paid ? ', on the walls' : ', at home until there is food to pay them') : ''} · each shoots like a drifter (${drifterDamage(sv)} damage) for ${GUARDS.pay} food every ${GUARDS.every / 60} min · hired for ${GUARDS.fee.food} food and ${GUARDS.fee.cloth} cloth`,
    `  Feasts        🍗 ${!knows(sv, 'cooking') ? 'once he can cook' : sv.feast > 0 ? `feasting for ${Math.ceil(sv.feast / 60)} more min: everyone fights ${Math.round(FEAST.bonus * 100)}% harder`
      : `the next for ${feastCost(sv)} spare food: everyone fights ${Math.round(FEAST.bonus * 100)}% harder for ${FEAST.steps / 60} min`} · ${sv.totals.feasts} held`,
    ...townLines(sv),
  ];
}

function townLines(sv) {
  if (sv.shelter.level < TOWN_LEVEL && !sv.town) {
    return [`  Town          🌆 from shelter Lv ${TOWN_LEVEL} he rebuilds the town around the shelter, one building at a time`];
  }
  const built = townBuilt(sv);
  const raising = sv.townLeft > 0 ? TOWN[sv.town - 1] : null;
  const next = nextTown(sv);
  const head = built === TOWN.length ? '🌆 the town is alive again: the shelter is a haven'
    : `🌆 ${built}/${TOWN.length} built${raising ? ` · the settlers are raising the ${raising.name.toLowerCase()}: ${Math.floor((1 - sv.townLeft / raising.steps) * 100)}%, ${Math.ceil(sv.townLeft / 60)} min of work left` : ''}`
      + (next ? ` · next: ${next.icon} ${next.name} for ${next.scrap} scrap, ${next.cloth} cloth, ${next.food} food` : '');
  return [
    `  Town          ${head}`,
    ...TOWN.map((b, i) => `    ${b.icon} ${b.name}: ${b.text} (${i < built ? 'built' : i < sv.town ? 'going up' : `${Math.round(b.steps / 60)} min to raise`})`),
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
  const sky = (sv.night ? (sv.blood ? '🌕 a blood moon: more zombies, and twice the drops'
    : `🌙 night: more zombies and runners${powered(sv) ? ', the lights are on' : `, the guns see only ${NIGHT_RANGE} tiles without lights`}`) : 'day')
    + (sv.season === 'Halloween' ? ' · 🎃 Halloween: pumpkin heads and 🤡 clowns' : sv.season === 'Winter' ? ' · ⛄ snow: the zombies are slower, and he fishes the frozen lakes' : '');
  return [
    `  Days          ${sv.days ? `📅 Day ${sv.days} · 🪧 ${sv.safeDays} day${sv.safeDays === 1 ? '' : 's'} without a breach (best ${sv.bestSafe})` : 'his first day starts with the first step'}`,
    `  Now           ${sky} · next blood moon: ${nextBloodMoon(sv, now)}`,
    `  Generator     ${power}`,
  ];
}

// What would let a held wave go on: stronger walls, or another turret while a slot is free.
function heldBy(sv) {
  const walls = wallBill(sv);
  const turret = sv.turrets < slotsAt(sv.shelter.level) && knows(sv, 'turret') ? 'another turret, or ' : '';
  return `${turret}walls Lv ${sv.shelter.level + 1} (${walls.wood} wood, ${walls.scrap} scrap${knows(sv, 'steel') ? ' with steel plates' : ''}; he has ${sv.wood} wood)`;
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
  const boat = sv.boat ? ` · 🚤 a boat takes him on to an island (${sv.totals.islands} visited)` : ' · a 🚢 harbor may have a boat for him';
  return `  Trips         ${wait} · ${made}${boat}`;
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
    ...surplusLines(sv),
    '',
    `  Survivor      🧑 ${w.icon} ${w.name}${w.ammo ? ` (${sv.ammo} bullets)` : ''}${w.arrows ? ` (${sv.arrows} arrows)` : ''} · ${heroDamage(sv)} damage · reach ${w.range} · life ${sv.hp}/${heroMax(sv)}`,
    `  Next weapon   ${parked(sv) ? `${parked(sv).icon} ${parked(sv).name}: his, but parked until shelter Lv ${parked(sv).level}`
      : next ? `${next.icon} ${next.name}: shelter Lv ${next.level}, ${next.cost} scrap` : 'that is the best there is'}`,
    `  Supplies      ⛽ ${Math.floor(sv.gas)} gas${driving(sv) ? ` (the ${WEAPONS.filter(x => x.vehicle && owned(sv).includes(x)).map(x => x.name.toLowerCase()).join(' and the ')} burn${owned(sv).filter(x => x.vehicle).length > 1 ? '' : 's'} it)` : ''} · 🍾 ${sv.bottles} bottles · 💊 ${sv.medkits} medkits (each cuts a rest short)`,
    `  To throw      ${knows(sv, 'molotov') || knows(sv, 'grenade') ? `🍾 ${sv.molotovs} molotovs${knows(sv, 'molotov') ? '' : '?'} · 💣 ${sv.grenades} grenades${knows(sv, 'grenade') ? '' : '?'} · thrown on their own at ${THROW.group} or more zombies` : 'nothing yet: molotovs and grenades come from blueprints'} · ${sv.totals.thrown} thrown, ${sv.totals.thrownKills} kills`,
    `  Wearing       protects ${Math.round(armor(sv) * 100)}% of every bite`,
    ...GEAR_SLOTS.map(s => gearLine(sv, s)),
    '',
    `Blueprints: ${known.join(', ') || 'none yet'}${left ? ` · ${left} still to find` : ' · he has them all'}`,
    '',
    'What the survivor has learned:',
    ...Object.keys(SKILLS).map(k => tierText(sv, k)),
    '',
    `🧟 Wave ${sv.wave}: ${waveHeld(sv) ? `held until the shelter is stronger: ${heldBy(sv)}` : `${Math.max(0, waveNeed(sv.wave) - sv.waveKills)} of ${waveNeed(sv.wave)} zombies left`} · best wave ${sv.bestWave}`,
    `  Zombies       ${sv.kills} killed · ${sv.totals.brutes} brutes · ${sv.totals.juggernauts} juggernauts · ${sv.totals.rats} rats · ${sv.totals.turretKills} by the turrets · ${sv.totals.screams} screams · ${sv.totals.bursts} bloaters burst`,
    `  Tyrants       ${TYRANTS.map(k => `${ZOMBIES[k].icon} ${sv.totals[TYRANT_TOTALS[k]]}`).join(' · ')} · the next: ${ZOMBIES[nextTyrant(sv)].icon} the ${ZOMBIES[nextTyrant(sv)].name}, at wave ${Math.max(10, Math.ceil((sv.wave + (sv.boss ? 0 : 1)) / 10) * 10)}`,
    `  Raiders       ${sv.totals.raids} bands · ${sv.totals.raiders} raiders killed · 🐫 ${sv.totals.trades} trades with passing traders`,
    `  Gathered      ${sv.totals.scrapFound} scrap · ${sv.totals.woodFound} wood · ${sv.totals.gearFound} pieces of clothing found`,
    `  Made          ${sv.totals.builds} built · ${sv.totals.clothes} clothes · ${sv.totals.meals} meals · ${sv.totals.bulletsMade} bullets`,
    `  Traps        ${sv.totals.trapKills} killed by traps and spikes · ${sv.totals.game} game caught · ${sv.totals.defenses} set up\n  Retreats      ${sv.totals.retreats} times he fell back from a fight he couldn't win\n  Explored      ${sv.totals.sites} places · ${sv.totals.dives} lake dives · ${sv.totals.hordes} hordes met`,
    `  Helpers       ${sv.totals.drifters} drifters came · ${sv.totals.allyKills} zombies shot by drifters and the lookout · ${sv.totals.drops} supply drops${sv.totals.runs ? ` · ${sv.totals.runs} scavenging runs` : ''}${sv.dog ? ` · ${sv.totals.fetched} crates fetched by ${sv.dog.name}` : ''}`,
    `  Nights        ${sv.totals.bloodMoons} blood moon${sv.totals.bloodMoons === 1 ? '' : 's'} · ${sv.totals.fenceKills} zombies killed by the fence`,
    `  The shelter fell ${sv.totals.falls} time${sv.totals.falls === 1 ? '' : 's'}`,
  ];
  return lines.join('\n');
}

// What the adventure's Shelter achievements are measured by (see companion.js).
function facts(now) {
  const sv = load(now);
  return {
    svWave: sv.bestWave,
    svKills: sv.kills,
    svTyrants: sv.totals.bosses,
    svTyrantKinds: TYRANTS.filter(k => sv.totals[TYRANT_TOTALS[k]] > 0).length,
    svBlueprints: sv.blueprints.length,
    svPeople: sv.residents.length,
    svRooms: sv.rooms.length,
    svCures: sv.cures,
    svHelicopter: sv.weapon >= WEAPONS.length - 1 ? 1 : 0,
    svBloodMoons: sv.totals.bloodMoons,
    svRaiders: sv.totals.raiders,
    svTrades: sv.totals.trades,
    svSafe: sv.bestSafe,
    svFalls: sv.totals.falls,
    svPumpkins: sv.totals.pumpkins,
    svIslands: sv.totals.islands,
    svTown: townBuilt(sv),
    svWoodCut: sv.totals.woodCut,
  };
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function localDate(at) {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function localTime(at) {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// /vwc:journal survival: the shelter's notable moments by day, like the heroes' journal. `all`
// shows everything kept instead of the last JOURNAL_SHOWN.
function journalReport(all, now) {
  const sv = load(now);
  const what = 'Blueprints, tyrants, falls and rebuilds, weapons, rooms, people, the town, the cure and achievements';
  if (!sv.journal.length) {
    return `📜 Journal · 🏠 Survival · nothing written yet\n\n${what} are written down as they happen.`;
  }
  const shown = all ? sv.journal : sv.journal.slice(-JOURNAL_SHOWN);
  const count = shown.length < sv.journal.length ? `the last ${shown.length} of ${sv.journal.length} moments` : `${sv.journal.length} moment${sv.journal.length === 1 ? '' : 's'}`;
  const lines = [`📜 Journal · 🏠 Survival · ${count}`];
  let day = null;
  for (const e of shown) {
    if (localDate(e.at) !== day) {
      day = localDate(e.at);
      lines.push('', `${WEEKDAYS[new Date(e.at).getDay()]} ${day}`);
    }
    lines.push(`  ${localTime(e.at)} ${e.text}`);
  }
  lines.push('', `${what} are written down as they happen. The shelter keeps its last ${JOURNAL_SIZE}.`);
  if (shown.length < sv.journal.length) {
    lines.push(`/vwc:journal survival all shows all ${sv.journal.length}.`);
  }
  return lines.join('\n');
}

// /vwc:card survival: the card's title and lines (companion.js draws the frame).
function cardLines(now) {
  const sv = load(now);
  const w = weaponInHand(sv);
  const n = x => x.toLocaleString('en-US');
  const built = townBuilt(sv);
  const people = [sv.residents.length ? `👷 ${sv.residents.length} living there` : null, sv.dog ? `🐕 ${sv.dog.name}` : null, `🗼 ${sv.turrets} turrets`, sv.rooms.length ? `🪜 ${sv.rooms.length}/${Object.keys(ROOMS).length} cellar rooms` : null,
    built === TOWN.length ? '🌆 a haven' : built ? `🌆 ${built}/${TOWN.length} of the town` : null];
  return {
    title: `${shelterIcon(sv.shelter.level)} Shelter · Lv ${sv.shelter.level} · 🧟 Wave ${sv.wave}`,
    lines: [
      [`🧑 ${w.icon} ${w.name}`, `🧥 ${Math.round(armor(sv) * 100)}% protection`, `📜 ${sv.blueprints.length}/${Object.keys(BLUEPRINTS).length} blueprints`].join(' · '),
      [`💀 ${n(sv.kills)} zombies`, `👺 ${sv.totals.bosses} tyrant${sv.totals.bosses === 1 ? '' : 's'}`, `🏆 best wave ${sv.bestWave}`, sv.cures ? `💉 cured ✨${sv.cures}` : null].filter(Boolean).join(' · '),
      people.filter(Boolean).join(' · '),
      [sv.days ? `📅 Day ${sv.days}` : null, `🪧 best ${sv.bestSafe} day${sv.bestSafe === 1 ? '' : 's'} without a breach`, `🔥 fell ${sv.totals.falls} time${sv.totals.falls === 1 ? '' : 's'}`].filter(Boolean).join(' · '),
    ],
  };
}

module.exports = {
  isShown, setShown, setGame, load, save, tick, render, shelterReport, step, newSave, supplyDrop, announce, moveIn, bloodMoon,
  windowLine, windowView, facts, journalReport, cardLines,
  BLUEPRINTS, shelterMax, slotsAt, turretDamage, turretCost, wallCost, heroMax, waveNeed, skillTier, armor,
  WEAPONS, ZOMBIES, SKILLS, GEAR_SLOTS, RADIUS, fightEstimate, ROLES, CURE, ROOMS, TYRANTS, weaponInHand,
  TOWN,
};
