'use strict';
// Checks scripts/roster.js, the Trainer's critters, after every change:
//   node scripts/check-roster.js
// Prints every problem found (and exits with 1), or a summary when there is none.

const { TYPES, SPECIES } = require('./roster');
const { CLASSES, BIOMES, displayWidth } = require('./companion');

const problems = [];
const fail = text => problems.push(text);

// An icon is a single emoji drawn 2 columns wide (see the emoji rules in IDEAS.md): no U+FE0F,
// no ZWJ sequences, and one the status line counts as 2 columns.
function checkIcon(icon, what) {
  if ([...icon].length !== 1 || !/^\p{Emoji_Presentation}$/u.test(icon) || displayWidth(icon) !== 2) {
    fail(`${what}: ${icon} breaks the emoji rules`);
  }
}

for (const [key, t] of Object.entries(TYPES)) {
  if (!CLASSES[t.like]) {
    fail(`type ${key}: there is no class "${t.like}" to fight like`);
  }
  checkIcon(t.hit, `type ${key}, basic hit`);
  for (const [icon] of t.parts) {
    checkIcon(icon, `type ${key}, skill part`);
  }
  if (t.parts.length === 0 || t.forms.length === 0 || t.areaForms.length === 0) {
    fail(`type ${key}: needs skill parts, forms and area forms`);
  }
}

const biomes = BIOMES.map(b => b.name);
const byNumber = new Map(SPECIES.map(s => [s.n, s]));
const names = new Set();
const evolvesFrom = new Map();
if (SPECIES.length !== 151) {
  fail(`${SPECIES.length} species instead of 151`);
}
SPECIES.forEach((s, i) => {
  const what = `#${s.n} ${s.name}`;
  if (s.n !== i + 1) {
    fail(`${what}: should be number ${i + 1}`);
  }
  if (names.has(s.name.toLowerCase())) {
    fail(`${what}: another species has that name`);
  }
  names.add(s.name.toLowerCase());
  checkIcon(s.icon, what);
  if (!TYPES[s.type]) {
    fail(`${what}: there is no type "${s.type}"`);
  }
  if (![1, 2, 3].includes(s.stage)) {
    fail(`${what}: stage ${s.stage} isn't 1, 2 or 3`);
  }
  if (!(s.power >= 0.7 && s.power <= 1.3)) {
    fail(`${what}: power ${s.power} is outside 0.7 to 1.3`);
  }
  if (s.rare != null && !(s.rare > 0 && s.rare <= 1)) {
    fail(`${what}: rare ${s.rare} is outside 0 to 1`);
  }
  if (s.where === 'legend') {
    if (!s.legend && !s.secret) {
      fail(`${what}: a legendary needs the level it appears at, or to be the secret one`);
    }
  } else if (!biomes.includes(s.where)) {
    fail(`${what}: there is no biome "${s.where}"`);
  }
  if (!s.evolves) {
    return;
  }
  if (!(s.evolves.at > 1)) {
    fail(`${what}: evolves at level ${s.evolves.at}`);
  }
  for (const n of [].concat(s.evolves.to)) {
    const next = byNumber.get(n);
    if (!next) {
      fail(`${what}: evolves into #${n}, which doesn't exist`);
      continue;
    }
    if (next.stage !== s.stage + 1) {
      fail(`${what}: evolves into ${next.name}, which isn't one stage higher`);
    }
    if (next.power <= s.power) {
      fail(`${what}: evolves into ${next.name}, which isn't stronger`);
    }
    if (next.evolves && next.evolves.at <= s.evolves.at) {
      fail(`${what}: ${next.name} evolves again before ${s.name} evolves into it`);
    }
    if (evolvesFrom.has(n)) {
      fail(`${next.name}: both ${evolvesFrom.get(n).name} and ${s.name} evolve into it`);
    }
    evolvesFrom.set(n, s);
  }
});
for (const s of SPECIES.filter(x => x.stage > 1 && !evolvesFrom.has(x.n))) {
  fail(`#${s.n} ${s.name}: stage ${s.stage}, but nothing evolves into it`);
}
// Every biome has one zone boss, and critters to meet by day.
for (const b of biomes) {
  const bosses = SPECIES.filter(s => s.where === b && s.boss);
  if (bosses.length !== 1) {
    fail(`${b}: ${bosses.length} zone bosses instead of 1`);
  }
  if (!SPECIES.some(s => s.where === b && s.stage === 1 && !s.boss && !s.night)) {
    fail(`${b}: no base form comes out by day`);
  }
}
// Legendaries are the Elder bosses of their levels, one per level, plus one secret.
const levels = SPECIES.filter(s => s.legend).map(s => s.legend);
if (levels.some(l => l % 10 !== 0) || new Set(levels).size !== levels.length) {
  fail(`legendary levels ${levels.join(', ')} must be different multiples of 10`);
}
if (SPECIES.filter(s => s.secret).length !== 1) {
  fail('there must be exactly one secret species');
}

if (problems.length > 0) {
  console.log(problems.join('\n'));
  process.exitCode = 1;
} else {
  const count = f => SPECIES.filter(f).length;
  const where = [...biomes, 'legend'].map(b => `${b} ${count(s => s.where === b)}`).join(' · ');
  console.log(`roster OK: ${SPECIES.length} species, ${Object.keys(TYPES).length} types`);
  console.log(`  ${where}`);
  console.log(`  ${count(s => s.night)} at night · ${count(s => s.boss)} zone bosses · ${count(s => s.rare)} rare · ${count(s => s.evolves)} evolve`);
}
