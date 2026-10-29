'use strict';
// The Survival game drawn as a pixel-art diorama: a 320x222 canvas scaled up without smoothing,
// the strip above ground and the shelter's rooms dug under it. It asks the companion's server for the game every POLL_MS and eases everything toward it, since
// the game itself only moves once a second. It never changes the game.
//
// The strip is seen from a little above, so it has some depth: the lane recedes, what stands on it
// is drawn as solid blocks with tops and sides, the zombies spread over its width, and by day
// everything casts a shadow away from the sun.

const W = 320;
const H = 222;
const GROUND = 155;         // where the earth begins, under the lane
const TW = 14;              // a tile of the strip, in pixels
const LANE = 146;           // where feet stand
const BACK = 10;            // the lane's far edge, in rows behind where feet stand
const LEAN = 0.01;          // how far in toward the middle each row of depth draws a thing (see at())
const HORIZON = 112;
const POLL_MS = 400;
const KEY = new URLSearchParams(location.search).get('k');

const canvas = document.getElementById('scene');
let g = canvas.getContext('2d');   // solid() points it at a canvas of its own for a moment
g.imageSmoothingEnabled = false;
const shade = document.createElement('canvas');
shade.width = W;
shade.height = H;
const sg = shade.getContext('2d');

let view = null;
let lastStep = -1;
let failures = 0;
let camX = 0;
let clock = 0;
const shown = new Map();     // what is on screen: key -> { x, moving }
const particles = [];
const tracers = [];
const landing = new Map();   // supply drops coming down: x -> when they appeared
const firing = new Map();    // turrets that just fired: tile -> when
const screams = new Map();   // screamers that just shrieked: id -> when
const lobs = [];             // molotovs and grenades in the air
const blasts = [];           // where they landed, and bloaters burst: fireballs, explosions, bile

// ---------- helpers ----------

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(n) {
  let h = Math.imul(n | 0, 2654435761);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519);
  return (h ^ (h >>> 13)) >>> 0;
}

function hex(c) {
  return [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
}

function mix(a, b, t) {
  const [x, y] = [hex(a), hex(b)];
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(',')})`;
}

function rect(x, y, w, h, c) {
  g.fillStyle = c;
  g.fillRect(Math.round(x), Math.round(y), w, h);
}

const sx = tile => W / 2 + tile * TW - camX;
const onScreen = (px, z = 0) => at(W / 2 + px - camX, z);   // px along the strip, z rows back
// Where a thing at screen x is drawn when it stands `z` rows behind where feet stand (in front, if
// negative): a little in toward the middle of the view, as the far side of the strip is narrower.
// It is also drawn z rows higher.
const at = (x, z) => x + (W / 2 - x) * z * LEAN;
// The tyrants' kinds, how far from the walls each kind attacks them, and the weapon in hand (a
// server from before 1.31.0 sends none of them).
const isBoss = z => (view.bosses || ['boss']).includes(z.kind);
const reachOf = kind => (view.reach || { spitter: 3 })[kind] || 0;
const weaponId = () => view.weapon.id || view.weapon.name.toLowerCase();
const winter = () => view.season === 'Winter';

// ---------- the land, made once ----------

const rand = rng(1225);
const lattice = Array.from({ length: 512 }, () => rand());
function noise(x) {
  const i = Math.floor(x);
  const f = x - i;
  const s = f * f * (3 - 2 * f);
  return lattice[i & 511] * (1 - s) + lattice[(i + 1) & 511] * s;
}
const SPAN = W + 200;        // the stones, pebbles, tufts and clouds repeat this often
const wrap = v => ((v % SPAN) + SPAN) % SPAN;
// The hills are worked out column by column, so they go on as far as his trips take the camera.
const LAYERS = [
  { depth: 0.12, base: 92, amp: 30, freq: 0.012, day: '#8fa9cf', night: '#2c2852', blood: '#3a1418' },
  { depth: 0.3, base: 102, amp: 16, freq: 0.03, day: '#6f93a8', night: '#24213f', blood: '#2c0e12', pines: 7 },
  { depth: 0.55, base: 114, amp: 6, freq: 0.06, day: '#4f7d52', night: '#16202a', blood: '#1e0a0c', pines: 12 },
];
function hillTop(layer, i) {
  return Math.round(layer.base - noise(i * layer.freq + layer.depth * 97) * layer.amp - noise(i * layer.freq * 3.1) * layer.amp * 0.3);
}
const STARS = Array.from({ length: 70 }, () => ({ x: rand() * W, y: rand() * 95, b: rand(), s: rand() < 0.15 ? 2 : 1 }));
const TUFTS = Array.from({ length: 70 }, () => ({ x: rand() * SPAN, y: 152 + rand() * 3, h: 2 + Math.floor(rand() * 4), c: rand() }));
const PEBBLES = Array.from({ length: 40 }, () => ({ x: rand() * SPAN, y: 138 + rand() * 12 }));
const CLOUDS = Array.from({ length: 6 }, () => ({ x: rand() * SPAN, y: 14 + rand() * 50, w: 3 + Math.floor(rand() * 4), v: 1 + rand() * 2 }));
const STONES = Array.from({ length: 60 }, () => ({ x: rand() * SPAN, y: GROUND + 3 + rand() * (H - GROUND - 5), w: 1 + Math.floor(rand() * 3), c: rand() }));
const FLIES = Array.from({ length: 14 }, () => ({ x: rand() * W, y: 100 + rand() * 60, p: rand() * 6.28 }));
const FLAKES = Array.from({ length: 70 }, () => ({ x: rand() * SPAN, y: rand() * GROUND, v: 8 + rand() * 10, p: rand() * 6.28 }));

// ---------- sky and land ----------

// How far toward day it is (0 night, 1 day), from the companion's daylight.
function dayness() {
  return Math.max(0, Math.min(1, (view.light - 0.45) / 0.55));
}

function skyColors() {
  if (view.blood) {
    return ['#14030a', '#5a1418'];
  }
  const t = dayness();
  const night = ['#0b0f2a', '#2b2352'];
  const dusk = ['#33407a', '#e89a6a'];
  const day = ['#5aa0e6', '#c4e6f7'];
  return t < 0.5 ? [mix(night[0], dusk[0], t * 2), mix(night[1], dusk[1], t * 2)]
    : [mix(dusk[0], day[0], (t - 0.5) * 2), mix(dusk[1], day[1], (t - 0.5) * 2)];
}

// The sun by day, the moon by night, along an arc by the hour.
function sunAt() {
  const now = new Date();
  const hour = now.getHours() + now.getMinutes() / 60;
  const up = Math.max(0, Math.min(1, view.night ? ((hour + 4) % 24) / 10 : (hour - 6) / 14));
  return { x: 20 + up * (W - 40), y: 70 - Math.sin(up * Math.PI) * 50 };
}

function drawSky() {
  const [top, bottom] = skyColors();
  const grad = g.createLinearGradient(0, 0, 0, HORIZON);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bottom);
  g.fillStyle = grad;
  g.fillRect(0, 0, W, HORIZON + 10);
  const dark = 1 - dayness();
  for (const s of STARS) {
    const a = dark * (0.4 + 0.6 * Math.abs(Math.sin(clock * (0.5 + s.b) + s.b * 9)));
    if (a > 0.05) {
      g.globalAlpha = a;
      rect(s.x, s.y, s.s, s.s, view.blood ? '#ffb0a0' : '#fff6d8');
    }
  }
  g.globalAlpha = 1;
  // Clouds drift by, pale by day and dark by night.
  for (const c of CLOUDS) {
    const x = Math.round(wrap(c.x + clock * c.v - camX * 0.05)) - 100;
    g.fillStyle = view.blood ? 'rgba(90,20,24,0.6)' : mix('#2a2a48', '#f4f8fb', dayness());
    g.globalAlpha = 0.35 + dayness() * 0.55;
    for (let i = 0; i < c.w; i++) {
      const h = i === 0 || i === c.w - 1 ? 3 : 5 + (i % 2) * 2;
      g.fillRect(x + i * 5, Math.round(c.y) - h, 6, h);
    }
    g.fillRect(x - 2, Math.round(c.y) - 2, c.w * 5 + 7, 2);
  }
  g.globalAlpha = 1;
  const { x, y } = sunAt();
  if (view.night) {
    const r = view.blood ? 11 : 8;
    g.fillStyle = view.blood ? 'rgba(255,60,40,0.18)' : 'rgba(255,250,220,0.12)';
    g.beginPath();
    g.arc(x, y, r + 6, 0, 6.29);
    g.fill();
    g.fillStyle = view.blood ? '#d8432f' : '#f4efd8';
    g.beginPath();
    g.arc(x, y, r, 0, 6.29);
    g.fill();
    rect(x - 3, y - 2, 2, 2, view.blood ? '#a8301f' : '#d8d2b8');
    rect(x + 2, y + 2, 3, 2, view.blood ? '#a8301f' : '#d8d2b8');
  } else {
    g.fillStyle = 'rgba(255,240,180,0.25)';
    g.beginPath();
    g.arc(x, y, 12, 0, 6.29);
    g.fill();
    g.fillStyle = '#fff2b0';
    g.beginPath();
    g.arc(x, y, 7, 0, 6.29);
    g.fill();
  }
}

function drawLand() {
  const t = dayness();
  for (const layer of LAYERS) {
    const color = view.blood ? layer.blood : mix(layer.night, layer.day, t);
    const off = Math.round(100 + camX * layer.depth);
    g.fillStyle = color;
    for (let x = 0; x < W; x++) {
      const top = hillTop(layer, x + off);
      g.fillRect(x, top, 1, 140 - top);
    }
    // In December the hills are white along their tops.
    if (winter() && !view.blood) {
      g.fillStyle = mix('#5a6478', '#eef3f8', t);
      for (let x = 0; x < W; x++) g.fillRect(x, hillTop(layer, x + off), 1, 2);
      g.fillStyle = color;
    }
    // A pine on about one column in six.
    for (let x = -6; layer.pines && x < W + 6; x++) {
      const h = hash((x + off) * 31 + layer.pines);
      if (h % 6 !== 0) {
        continue;
      }
      const tall = 6 + ((h >>> 8) % layer.pines);
      const base = hillTop(layer, x + off) + 2;
      for (let row = 0; row < tall; row++) {
        const half = Math.floor(row / 2.2);
        g.fillRect(x - half, base - tall + row, half * 2 + 1, 1);
      }
    }
  }
  // Grass behind the lane, the dirt lane (darker the farther back, with the strip's tiles faintly
  // marked as they recede), grass in front.
  rect(0, 128, W, 10, view.blood ? '#2a1010' : mix('#1c3324', '#4d8a3e', t));
  rect(0, 136, W, 16, view.blood ? '#3a1d18' : mix('#3b2f27', '#8d6c49', t));
  for (let row = 0; row < 12; row++) {
    g.globalAlpha = 0.2 * (1 - row / 12);
    rect(0, 136 + row, W, 1, '#1a120c');
  }
  g.globalAlpha = 0.18;
  g.fillStyle = '#2a1e14';
  const first = Math.floor((camX - W / 2) / TW) - 3;
  for (let tile = first; tile < first + W / TW + 6; tile++) {
    const x = sx(tile + 0.5);
    for (let row = 1; row < 16; row++) {
      g.fillRect(Math.round(at(x, LANE - 136 - row)), 136 + row, 1, 1);
    }
  }
  g.globalAlpha = 1;
  rect(0, 136, W, 1, view.blood ? '#4a2520' : mix('#4a3b30', '#a3825c', t));
  rect(0, 152, W, 3, view.blood ? '#241010' : mix('#15281c', '#3f7a33', t));
  rect(0, 152, W, 1, view.blood ? '#301414' : mix('#1d3424', '#4f9040', t));
  // Snow covers the grass and lies thinner on the lane, trodden in where it is walked.
  if (winter() && !view.blood) {
    const snow = mix('#4a5468', '#eef3f8', t);
    g.globalAlpha = 0.85;
    rect(0, 128, W, 8, snow);
    rect(0, 152, W, 3, snow);
    g.globalAlpha = 0.3;
    rect(0, 137, W, 15, snow);
    g.globalAlpha = 0.7;
    g.fillStyle = snow;
    for (const p of PEBBLES) {
      const x = wrap(p.x * 1.7 - camX) - 100;
      g.fillRect(Math.round(at(x, LANE - p.y)), Math.round(p.y), 2, 1);
    }
    g.globalAlpha = 1;
  }
  // The earth under it all, in layers, with stones.
  rect(0, GROUND, W, H - GROUND, '#3b2a1d');
  rect(0, GROUND, W, 2, '#4a3524');
  rect(0, GROUND + 30, W, 1, '#33251a');
  rect(0, GROUND + 52, W, 1, '#2e2117');
  for (const st of STONES) {
    rect(wrap(st.x - camX) - 100, st.y, st.w, 1, st.c < 0.5 ? '#5a4a3e' : '#2a1e15');
  }
  g.fillStyle = view.blood ? '#4a2a24' : mix('#4a3d33', '#a8896a', t);
  for (const p of PEBBLES) {
    const x = wrap(p.x - camX) - 100;
    g.fillRect(Math.round(at(x, LANE - p.y)), Math.round(p.y), 1, 1);
  }
}

function drawTufts() {
  const t = dayness();
  for (const tuft of TUFTS) {
    const x = Math.round(wrap(tuft.x - camX * 1.15) - 100);
    const sway = Math.round(Math.sin(clock * 1.5 + tuft.x) * 0.6);
    g.fillStyle = view.blood ? '#3a1414' : winter() ? mix('#3a4250', '#b8c4cc', t)
      : mix(tuft.c < 0.5 ? '#1f3b25' : '#27482c', tuft.c < 0.5 ? '#5aa045' : '#6cb550', t);
    for (let i = 0; i < tuft.h; i++) {
      g.fillRect(x + (i > tuft.h / 2 ? sway : 0), Math.round(tuft.y) - i, 1, 1);
      g.fillRect(x + 2 + (i > tuft.h / 2 ? sway : 0), Math.round(tuft.y) - Math.max(0, i - 1), 1, 1);
    }
  }
}

// ---------- the shelter and what stands around it ----------

// The shelter from the front (or its ruins while it is rebuilt), with its windows lit at night.
// What moves on it is drawn by shelterLife.
function paintShelter(x, level, ruins, lit) {
  const night = lit ? '#ffd36b' : '#78b6d6';
  if (ruins) {
    rect(x - 13, LANE - 5, 26, 5, '#5a5048');
    rect(x - 9, LANE - 8, 18, 3, '#6e625a');
    return;
  }
  if (level >= 12) {
    rect(x - 18, LANE - 16, 36, 16, '#7d7d84');
    for (let i = 0; i < 36; i += 6) rect(x - 18 + i, LANE - 16 + (i % 12 ? 5 : 10), 5, 1, '#696970');
    rect(x - 16, LANE - 24, 32, 8, '#8a8a90');
    rect(x - 20, LANE - 27, 40, 3, '#a8322e');
    rect(x - 13, LANE - 33, 26, 6, '#8a8a90');
    rect(x - 16, LANE - 36, 32, 3, '#a8322e');
    rect(x - 8, LANE - 40, 16, 4, '#a8322e');
    rect(x - 1, LANE - 44, 2, 4, '#e8c050');
    rect(x - 4, LANE - 9, 8, 9, '#3a2614');
    for (const wx of [-12, 8]) rect(x + wx, LANE - 21, 4, 3, night);
    rect(x - 2, LANE - 31, 4, 3, night);
  } else if (level >= 7) {
    rect(x - 16, LANE - 26, 32, 26, '#8d8d94');
    for (let y = 0; y < 26; y += 4) {
      for (let i = (y / 4) % 2 ? 0 : 3; i < 32; i += 6) rect(x - 16 + i, LANE - 26 + y, 1, 4, '#76767c');
      rect(x - 16, LANE - 26 + y, 32, 1, '#7a7a80');
    }
    for (let i = 0; i < 32; i += 6) rect(x - 16 + i, LANE - 29, 4, 3, '#8d8d94');
    rect(x - 4, LANE - 10, 8, 10, '#3a2614');
    rect(x - 3, LANE - 11, 6, 1, '#3a2614');
    for (const wx of [-11, 8]) rect(x + wx, LANE - 19, 3, 4, night);
  } else if (level >= 4) {
    rect(x - 15, LANE - 16, 30, 16, '#b07a43');
    for (let i = 0; i < 30; i += 3) rect(x - 15 + i, LANE - 16, 1, 16, '#966534');
    for (let row = 0; row < 9; row++) rect(x - 17 + row, LANE - 17 - row, 34 - row * 2, 1, row % 3 ? '#8c3b2b' : '#7a3224');
    rect(x + 7, LANE - 27, 4, 7, '#6e6e74');
    rect(x - 3, LANE - 9, 6, 9, '#4a2e16');
    for (const wx of [-11, 7]) rect(x + wx, LANE - 12, 4, 4, night);
  } else {
    rect(x - 12, LANE - 13, 24, 13, '#8b5a2b');
    for (let i = 0; i < 24; i += 3) rect(x - 12 + i, LANE - 13, 1, 13, '#734a22');
    for (let row = 0; row < 7; row++) rect(x - 14 + row, LANE - 14 - row, 28 - row * 2, 1, '#7a2e2e');
    rect(x - 3, LANE - 8, 6, 8, '#4a2e16');
    rect(x + 5, LANE - 10, 4, 3, night);
  }
}

// The fire in its ruins, the chimney's smoke and the cure's star, over the shelter at (x, y).
function shelterLife(x, y, level) {
  const sv = view.sv;
  if (sv.rebuild > 0) {
    flames(x - 5, y - 7, 3);
    flames(x + 4, y - 8, 4);
    return;
  }
  if (view.cooking && level >= 4 && level < 7) {
    smoke(x + 9, y - 28);
  }
  if (sv.cures > 0) {
    const tw = Math.sin(clock * 3) > 0 ? '#fff7b0' : '#ffd84a';
    rect(x - 1, y - shelterHeight(level) - 8, 3, 1, tw);
    rect(x, y - shelterHeight(level) - 9, 1, 3, tw);
  }
}

function shelterHeight(level) {
  return level >= 12 ? 44 : level >= 7 ? 29 : level >= 4 ? 26 : 21;
}

function paintWall(x, level) {
  if (level >= 7) {
    rect(x - 5, LANE - 12, 10, 12, '#8d8d94');
    rect(x - 5, LANE - 14, 3, 2, '#8d8d94');
    rect(x + 2, LANE - 14, 3, 2, '#8d8d94');
    rect(x - 5, LANE - 6, 10, 1, '#76767c');
    return;
  }
  for (let i = -4; i <= 4; i += 2) {
    rect(x + i, LANE - 11, 2, 11, '#8b5a2b');
    rect(x + i, LANE - 12, 1, 1, '#a8743d');
  }
  rect(x - 4, LANE - 7, 10, 1, '#5a3a1a');
}

// Where a turret stands: the two nearest the shelter on its roof corners, the others on legs at
// the back of the lane.
const TOWER_Z = 6;
function turretSpot(tile, level) {
  if (Math.abs(tile) !== 1) {
    return { x: at(sx(tile), TOWER_Z), y: LANE - TOWER_Z, legs: true };
  }
  const half = level >= 12 ? 18 : level >= 7 ? 16 : level >= 4 ? 15 : 12;
  const roof = level >= 12 ? 16 : level >= 7 ? 29 : level >= 4 ? 16 : 13;
  return { x: sx(0) + tile * (half - 3), y: LANE - roof + 9, legs: false };
}

function paintTurret(x, y, legs, face, heavy) {
  const metal = heavy ? '#7d8590' : '#8b5a2b';
  if (legs) {
    rect(x - 3, y - 9, 1, 9, '#5a3a1a');
    rect(x + 2, y - 9, 1, 9, '#5a3a1a');
    rect(x - 3, y - 5, 6, 1, '#5a3a1a');
  }
  rect(x - 4, y - 11, 9, 2, metal);
  rect(x - 3, y - 15, 6, 4, heavy ? '#5d646e' : '#6e6e74');
  rect(face > 0 ? x + 3 : x - 7, y - 14, 5, 1, '#2e2e2e');
  if (heavy) {
    rect(face > 0 ? x + 3 : x - 7, y - 12, 5, 1, '#2e2e2e');
  }
}

function paintDefense(type, x, y = LANE) {
  if (type === 'barricade') {
    rect(x - 5, y - 3, 11, 3, '#b8a47a');
    for (let i = 0; i < 7; i++) {
      rect(x - 4 + i, y - 9 + i, 2, 1, '#8b5a2b');
      rect(x + 3 - i, y - 9 + i, 2, 1, '#734a22');
    }
  } else if (type === 'trap') {
    rect(x - 3, y - 1, 7, 1, '#6e6e74');
    for (let i = -3; i <= 3; i += 2) rect(x + i, y - 2, 1, 1, '#a0a0a8');
  } else {
    for (let i = -5; i <= 5; i += 2) {
      rect(x + i, y - 3, 1, 3, '#9a9aa2');
      rect(x + i, y - 4, 1, 1, '#c8c8d0');
    }
  }
}

const CRATE = {
  scrap: x => {
    rect(x - 3, LANE - 6, 7, 6, '#9a6a3c');
    rect(x - 3, LANE - 6, 7, 1, '#b8844f');
    rect(x - 3, LANE - 3, 7, 1, '#6e6e74');
  },
  wood: x => {
    for (const [dx, dy] of [[-3, -2], [1, -2], [-1, -4]]) {
      rect(x + dx, LANE + dy, 4, 2, '#8b5a2b');
      rect(x + dx, LANE + dy, 1, 2, '#c8a070');
    }
  },
  cloth: x => {
    rect(x - 3, LANE - 4, 7, 4, '#6a5acd');
    rect(x - 3, LANE - 4, 1, 4, '#8f80e8');
  },
  food: x => {
    rect(x - 3, LANE - 4, 6, 4, '#c0504d');
    rect(x - 2, LANE - 3, 3, 1, '#f0a0a0');
    rect(x + 3, LANE - 3, 2, 1, '#e8e2d0');
  },
  blueprint: x => {
    rect(x - 3, LANE - 6, 7, 6, '#2f6fbf');
    for (let y = 1; y < 6; y += 2) rect(x - 2, LANE - 6 + y, 5, 1, '#b8d8ff');
  },
  drop: (x, falling) => {
    const y = LANE;
    rect(x - 3, y - 6, 7, 6, '#6b7a3a');
    rect(x - 3, y - 4, 7, 1, '#2e2e2e');
    // The canopy: on the way down above the crate, then draped beside it.
    if (falling) {
      for (let row = 0; row < 5; row++) rect(x - 7 + row, y - 19 + row - 2, 15 - row * 2, 1, row % 2 ? '#f0f0f0' : '#d0453a');
      rect(x - 6, y - 15, 1, 9, '#c8c8c8');
      rect(x + 6, y - 15, 1, 9, '#c8c8c8');
    } else {
      rect(x + 4, LANE - 2, 6, 2, '#d0453a');
      rect(x + 5, LANE - 3, 4, 1, '#f0f0f0');
    }
  },
};

const SITE = {
  building: x => {
    rect(x - 10, LANE - 33, 20, 25, '#6e6a66');
    rect(x - 10, LANE - 33, 20, 1, '#8a8682');
    rect(x + 6, LANE - 35, 4, 2, '#6e6a66');
    for (const [wx, wy] of [[-7, -29], [1, -29], [-7, -21], [1, -21]]) rect(x + wx, LANE + wy, 4, 5, (wx + wy) % 3 ? '#2a2a30' : '#40404a');
    rect(x - 2, LANE - 14, 4, 6, '#2a2a30');
    rect(x + 4, LANE - 27, 1, 9, '#55514d');
  },
  // A pond in the grass behind the lane, centered on (x, y): its muddy bank, the water, ripples.
  // In December it is frozen over, with a hole cut to fish through.
  lake: (x, y) => {
    pond(x, y, 15, 3, '#4f5a38');
    if (winter()) {
      pond(x, y, 13, 2, '#bcd6e6');
      rect(x - 8, y - 1, 5, 1, '#e6f2fa');
      rect(x + 5, y + 1, 4, 1, '#e6f2fa');
      rect(x - 1, y, 3, 1, '#1e3a52');
      rect(x, y - 6, 1, 6, '#6b4423');
      rect(x + 1, y - 1, 1, 1, '#d03030');
      return;
    }
    pond(x, y, 13, 2, '#2f6a9a');
    const s = Math.round(Math.sin(clock * 2 + x) * 3);
    rect(x - 6 + s, y - 1, 4, 1, '#7fb6e0');
    rect(x + 3 - s, y + 1, 3, 1, '#7fb6e0');
  },
  shelter: x => {
    for (let row = 0; row < 9; row++) rect(x - row, LANE - 9 + row, row * 2 + 1, 1, row % 3 ? '#b5a46a' : '#9a8a55');
    rect(x - 1, LANE - 4, 3, 4, '#3a3222');
  },
  bunker: x => {
    rect(x - 9, LANE - 5, 18, 5, '#4f5a4a');
    rect(x - 7, LANE - 7, 14, 2, '#5f6a58');
    rect(x - 3, LANE - 6, 6, 2, '#8a9096');
    rect(x - 1, LANE - 7, 2, 1, '#c0c6cc');
  },
  // Down the road, on his trips.
  farm: x => {
    // A red barn with a white-trimmed door, and a silo.
    rect(x - 14, LANE - 16, 20, 16, '#a33a2e');
    for (let row = 0; row < 7; row++) rect(x - 15 + row, LANE - 17 - row, 22 - row * 2, 1, '#5a3a2a');
    rect(x - 8, LANE - 10, 8, 10, '#6b2a20');
    rect(x - 8, LANE - 10, 8, 1, '#e8e2d0');
    rect(x - 8, LANE - 10, 1, 10, '#e8e2d0');
    rect(x - 1, LANE - 10, 1, 10, '#e8e2d0');
    for (let i = 0; i < 8; i++) rect(x - 8 + i, LANE - 10 + Math.round((i * 9) / 7), 1, 1, '#e8e2d0');
    rect(x - 6, LANE - 20, 4, 3, '#e8e2d0');
    rect(x + 8, LANE - 24, 7, 24, '#9a9aa2');
    for (let y = 4; y < 24; y += 5) rect(x + 8, LANE - 24 + y, 7, 1, '#85858d');
    rect(x + 8, LANE - 26, 7, 2, '#7d8590');
    rect(x + 9, LANE - 27, 5, 1, '#7d8590');
  },
  station: x => {
    // The shop with its sign, and two pumps with their hoses under a canopy on two posts.
    rect(x - 16, LANE - 13, 13, 13, '#c8c0b0');
    rect(x - 16, LANE - 14, 13, 1, '#a8a090');
    rect(x - 14, LANE - 10, 5, 4, '#5a7a8a');
    rect(x - 8, LANE - 9, 3, 9, '#5a4a3a');
    rect(x - 13, LANE - 22, 1, 8, '#7d8590');
    rect(x - 15, LANE - 25, 5, 3, '#d9a42b');
    rect(x - 2, LANE - 17, 20, 3, '#e8e8e0');
    rect(x - 2, LANE - 15, 20, 1, '#c0392b');
    rect(x - 1, LANE - 14, 1, 14, '#9a9aa2');
    rect(x + 16, LANE - 14, 1, 14, '#9a9aa2');
    for (const px of [3, 10]) {
      rect(x + px, LANE - 7, 4, 7, '#c0392b');
      rect(x + px + 1, LANE - 6, 2, 2, '#e8e2d0');
      rect(x + px + 4, LANE - 6, 1, 4, '#2e2e2e');
      rect(x + px + 4, LANE - 2, 1, 1, '#9a9aa2');
    }
  },
  hospital: x => {
    // White, two floors, with a red cross over the glass doors.
    rect(x - 14, LANE - 26, 28, 26, '#dcdee0');
    rect(x - 14, LANE - 27, 28, 1, '#b8bcc0');
    rect(x - 14, LANE - 14, 28, 1, '#c4c8cc');
    for (const [wx, wy] of [[-11, -23], [-6, -23], [3, -23], [8, -23], [-11, -11], [8, -11]]) rect(x + wx, LANE + wy, 3, 4, '#5a7a8a');
    rect(x - 2, LANE - 24, 4, 8, '#d03030');
    rect(x - 4, LANE - 22, 8, 4, '#d03030');
    rect(x - 4, LANE - 9, 8, 9, '#8ab4c8');
    rect(x, LANE - 9, 1, 9, '#5a7a8a');
    rect(x - 5, LANE - 10, 10, 1, '#9a9aa2');
  },
  caves: x => {
    // A mound of rock with a dark mouth, and a few stones by it.
    for (let row = 0; row < 20; row++) {
      const half = Math.round(Math.sqrt(1 - ((19 - row) / 20) ** 2) * 19);
      rect(x - half, LANE - 20 + row, half * 2 + 1, 1, row % 4 ? '#6e6a66' : '#5e5a56');
    }
    rect(x - 12, LANE - 15, 6, 1, '#8a8682');
    rect(x + 5, LANE - 18, 7, 1, '#8a8682');
    for (let row = 0; row < 10; row++) {
      const half = Math.round(Math.sqrt(1 - ((9 - row) / 10) ** 2) * 5);
      rect(x - half, LANE - 10 + row, half * 2 + 1, 1, '#141210');
    }
    rect(x - 17, LANE - 2, 3, 2, '#7a7672');
    rect(x + 15, LANE - 3, 4, 3, '#6a6662');
  },
  supermarket: x => {
    // Wide and low, with a blue sign, a glass front and a cart left outside.
    rect(x - 18, LANE - 16, 36, 16, '#d8d0c0');
    rect(x - 18, LANE - 20, 36, 4, '#2f6fbf');
    for (let i = 0; i < 6; i++) rect(x - 13 + i * 4, LANE - 19, 2, 2, i % 2 ? '#ffd23f' : '#f4f4f4');
    rect(x - 15, LANE - 12, 22, 8, '#8ab4c8');
    for (let i = 0; i < 22; i += 6) rect(x - 15 + i, LANE - 12, 1, 8, '#9a9aa2');
    rect(x + 9, LANE - 10, 6, 10, '#5a7a8a');
    rect(x + 12, LANE - 10, 1, 10, '#9a9aa2');
    rect(x + 20, LANE - 5, 6, 1, '#9a9aa2');
    rect(x + 20, LANE - 5, 1, 4, '#9a9aa2');
    rect(x + 25, LANE - 5, 1, 3, '#9a9aa2');
    rect(x + 21, LANE - 3, 5, 1, '#9a9aa2');
    rect(x + 21, LANE - 1, 1, 1, '#2e2e2e');
    rect(x + 25, LANE - 1, 1, 1, '#2e2e2e');
  },
  // By the water (see WATERSIDE): a pier with a boat and a shed, and an island with a palm.
  harbor: x => {
    rect(x - 22, LANE - 13, 11, 13, '#6b7a8a');
    for (let row = 0; row < 4; row++) rect(x - 23 + row, LANE - 14 - row, 13 - row * 2, 1, '#4a5662');
    rect(x - 19, LANE - 8, 4, 8, '#3a4652');
    rect(x - 10, LANE - 5, 26, 2, '#8b5a2b');
    for (let i = 0; i < 26; i += 5) rect(x - 9 + i, LANE - 3, 1, 3, '#5a3a1a');
    rect(x - 8, LANE - 8, 1, 3, '#2e2e2e');
    boat(x + 10, LANE - 6);
  },
  island: x => {
    for (let row = 0; row < 7; row++) {
      const half = Math.round(Math.sqrt(1 - ((6 - row) / 7) ** 2) * 14);
      rect(x - half, LANE - 7 + row, half * 2 + 1, 1, row < 2 ? '#e8d8a0' : '#d4c088');
    }
    for (let i = 0; i < 14; i++) rect(x + Math.round(Math.sin(i / 5) * 2), LANE - 7 - i, 2, 1, '#8b6a4a');
    const top = LANE - 21;
    for (const [dx, dy, w] of [[-7, 1, 6], [3, 1, 6], [-5, -1, 5], [2, -1, 5], [-2, -2, 5]]) rect(x + dx, top + dy, w, 1, '#4f9a3a');
    rect(x - 8, top + 2, 2, 1, '#3a7a2a');
    rect(x + 8, top + 2, 2, 1, '#3a7a2a');
    rect(x, top + 2, 2, 2, '#6b4a2a');
  },
  town: x => {
    // A house, a taller block and a shop with an awning.
    rect(x - 18, LANE - 14, 12, 14, '#8a7a68');
    for (let row = 0; row < 4; row++) rect(x - 19 + row, LANE - 15 - row, 14 - row * 2, 1, '#6b3a2e');
    rect(x - 15, LANE - 10, 3, 3, '#3a3a40');
    rect(x - 10, LANE - 7, 3, 7, '#4a3a2a');
    rect(x - 6, LANE - 24, 11, 24, '#6e6a66');
    rect(x - 6, LANE - 24, 11, 1, '#8a8682');
    for (const [wx, wy] of [[-4, -21], [1, -21], [-4, -15], [1, -15]]) rect(x + wx, LANE + wy, 2, 3, '#2a2a30');
    rect(x - 2, LANE - 7, 3, 7, '#2a2a30');
    rect(x + 6, LANE - 12, 12, 12, '#9a6a4a');
    rect(x + 6, LANE - 13, 12, 1, '#7a4a32');
    rect(x + 6, LANE - 11, 12, 2, '#c0392b');
    rect(x + 8, LANE - 8, 8, 4, '#5a7a8a');
  },
  base: x => {
    // A hangar behind a wire fence, and a watchtower.
    for (let row = 0; row < 14; row++) {
      const half = Math.round(Math.sqrt(1 - ((13 - row) / 14) ** 2) * 13);
      rect(x - half, LANE - 14 + row, half * 2 + 1, 1, row % 3 ? '#5d6640' : '#4d5534');
    }
    rect(x - 4, LANE - 7, 8, 7, '#2e3224');
    rect(x + 13, LANE - 22, 1, 22, '#5a3a1a');
    rect(x + 17, LANE - 22, 1, 22, '#5a3a1a');
    rect(x + 12, LANE - 26, 7, 4, '#6b5a3a');
    rect(x + 12, LANE - 27, 7, 1, '#4d5534');
    for (let i = -18; i <= -14; i += 2) rect(x + i, LANE - 7, 1, 7, '#9a9aa2');
    rect(x - 18, LANE - 6, 6, 1, '#9a9aa2');
    rect(x - 18, LANE - 3, 6, 1, '#9a9aa2');
  },
};

// How far back a place stands and how deep it is, [z, depth], when not [8, 8]: shallower for the low
// ones, and for those with thin parts (a palm, a boat) that would smear if drawn deep.
const SITE_DEPTH = { shelter: [7, 5], bunker: [7, 5], caves: [8, 2], harbor: [8, 2], island: [8, 1] };

// By the road past the ends of the strip: a signpost, and wrecked cars here and there (where the
// status line's map shows them too).
const ROADSIDE = {
  sign: x => {
    rect(x, LANE - 12, 1, 12, '#6b4423');
    rect(x - 4, LANE - 13, 9, 4, '#9a6a3c');
    rect(x - 3, LANE - 11, 7, 1, '#e8e2d0');
  },
  wreck: x => {
    rect(x - 7, LANE - 5, 14, 4, '#8a4a2e');
    rect(x - 4, LANE - 8, 8, 3, '#7a4028');
    rect(x - 3, LANE - 7, 3, 2, '#2e3a40');
    rect(x + 1, LANE - 7, 2, 2, '#2e3a40');
    rect(x - 7, LANE - 3, 14, 1, '#5a3020');
    rect(x - 5, LANE - 2, 3, 2, '#1e1e1e');
    rect(x + 3, LANE - 2, 3, 2, '#1e1e1e');
  },
};
const wreck = (tile, radius) => Math.abs(tile) > radius + 2 && hash(tile + 1777) % 10 === 0;

function flames(x, y, size) {
  for (let i = 0; i < size + 2; i++) {
    const f = Math.sin(clock * 12 + i * 2.3 + x);
    rect(x + (i % 3) - 1, y - i - (f > 0 ? 1 : 0), 1, 1, i < 2 ? '#ff5a1f' : i < size ? '#ffa02e' : '#ffe27a');
  }
}

// An oval of `color` centered on (x, y), rx wide and ry tall either side: ponds and the sea.
function pond(x, y, rx, ry, color) {
  for (let dy = -ry; dy <= ry; dy++) {
    const half = Math.round(rx * Math.sqrt(1 - (dy / (ry + 0.5)) ** 2));
    rect(x - half, y + dy, half * 2 + 1, 1, color);
  }
}

// The water behind a place by it, on the grass at the back of the lane (frozen in December).
const WATERSIDE = { harbor: 24, island: 20 };
function sea(x, y, rx) {
  pond(x, y, rx + 2, 4, '#4f5a38');
  pond(x, y, rx, 3, winter() ? '#bcd6e6' : '#2f6a9a');
  if (!winter()) {
    const s = Math.round(Math.sin(clock * 1.6 + x) * 4);
    rect(x - 12 + s, y - 1, 5, 1, '#7fb6e0');
    rect(x + 6 - s, y + 2, 4, 1, '#7fb6e0');
  }
}

// A small motorboat with its cabin, its waterline at y.
function boat(x, y) {
  rect(x - 8, y - 3, 17, 2, '#e8e2d0');
  rect(x - 7, y - 1, 15, 1, '#a33a2e');
  rect(x + 8, y - 4, 2, 2, '#e8e2d0');
  rect(x - 4, y - 7, 7, 4, '#e8e2d0');
  rect(x - 2, y - 6, 2, 2, '#5a7a8a');
  rect(x + 1, y - 6, 1, 2, '#5a7a8a');
  rect(x - 5, y - 8, 9, 1, '#a33a2e');
}

// A jack-o'-lantern, lit from inside at night.
function jack(x, y) {
  rect(x - 2, y - 4, 5, 4, '#e07a1f');
  rect(x - 3, y - 3, 7, 2, '#e07a1f');
  rect(x - 1, y - 4, 1, 4, '#c0601a');
  rect(x + 1, y - 4, 1, 4, '#c0601a');
  rect(x, y - 5, 1, 1, '#4f7a2a');
  const glow = view.night ? '#ffe27a' : '#3a1a08';
  rect(x - 2, y - 3, 1, 1, glow);
  rect(x + 2, y - 3, 1, 1, glow);
  rect(x - 1, y - 1, 3, 1, glow);
}

// At Halloween, jack-o'-lanterns stand along the back of the lane here and there.
function pumpkinTiles() {
  if (view.season !== 'Halloween') {
    return [];
  }
  const first = Math.floor((camX - W / 2) / TW) - 3;
  const tiles = [];
  for (let tile = first; tile < first + W / TW + 6; tile++) {
    if (Math.abs(tile) > 3 && Math.abs(tile) !== view.layout.radius + 1 && hash(tile + 3301) % 4 === 0) {
      tiles.push(tile);
    }
  }
  return tiles;
}

function smoke(x, y) {
  for (let i = 0; i < 4; i++) {
    const t = (clock * 0.6 + i / 4) % 1;
    g.globalAlpha = 0.4 * (1 - t);
    rect(x + Math.sin(t * 5 + i) * 2, y - t * 16, 2, 2, '#c8c8c8');
  }
  g.globalAlpha = 1;
}

const DECOR = {
  generator: x => {
    rect(x - 4, LANE - 7, 9, 7, '#d8b030');
    for (let i = 0; i < 9; i += 3) rect(x - 4 + i, LANE - 2, 2, 2, '#2e2e2e');
    rect(x, LANE - 6, 1, 2, '#2e2e2e');
    rect(x - 1, LANE - 4, 2, 1, '#2e2e2e');
  },
  lab: x => {
    rect(x - 7, LANE - 12, 14, 12, '#d8dcdc');
    rect(x - 7, LANE - 13, 14, 1, '#a8aeb0');
    rect(x - 4, LANE - 9, 3, 3, '#7dff9a');
    rect(x + 2, LANE - 6, 3, 6, '#5a6266');
    rect(x - 1, LANE - 17, 2, 4, '#7dff9a');
    rect(x - 2, LANE - 14, 4, 1, '#7dff9a');
  },
};

function campfire(x, y) {
  rect(x - 3, y - 1, 7, 1, '#5a3a1a');
  rect(x - 2, y - 2, 5, 1, '#734a22');
  flames(x - 1, y - 2, 3);
  flames(x + 1, y - 3, 4);
}

function flag(x, y) {
  rect(x, y - 18, 1, 18, '#9a9aa2');
  for (let row = 0; row < 5; row++) {
    const wave = Math.round(Math.sin(clock * 4 + row * 0.8));
    rect(x + 1, y - 18 + row, 7 + wave, 1, row % 2 ? '#c0392b' : '#e74c3c');
  }
}

// ---------- depth ----------

// Solid things (the shelter, walls, towers, places) are drawn from the front once, into a canvas
// of their own, then stamped back a row at a time to give them depth: darkened where a side shows,
// lit along their top edges.
const SW = 96;
const SH = 72;
const SB = SH - 4;           // where a solid's base is, in its canvas
const solids = new Map();    // key -> { front, side, top, shade, h }

function canvasOf(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function solid(key, paint) {
  let s = solids.get(key);
  if (s) {
    return s;
  }
  const front = canvasOf(SW, SH);
  const keep = g;
  g = front.getContext('2d');
  g.translate(0, SB - LANE);
  paint(SW / 2);
  g = keep;
  // A copy of the front, with `fill` laid over it by `op`; `edge` keeps only its top edge first.
  const copy = (fill, op, edge) => {
    const c = canvasOf(SW, SH);
    const cg = c.getContext('2d');
    cg.drawImage(front, 0, 0);
    if (edge) {
      cg.globalCompositeOperation = 'destination-out';
      cg.drawImage(front, 0, 1);
    }
    cg.globalCompositeOperation = op;
    cg.fillStyle = fill;
    cg.fillRect(0, 0, SW, SH);
    return c;
  };
  // Its height, for its shadow: down to its base from the first row with anything in it.
  const px = front.getContext('2d').getImageData(0, 0, SW, SH).data;
  let first = 3;
  while (first < px.length && !px[first]) {
    first += 4;
  }
  s = {
    front,
    side: copy('rgba(0,0,0,0.35)', 'source-atop'),
    top: copy('rgba(255,246,220,0.35)', 'source-atop', true),
    shade: copy('#000', 'source-in'),
    h: Math.max(0, SB - Math.floor(first / 4 / SW)),
  };
  solids.set(key, s);
  return s;
}

// Draws a solid with the middle of its base at (x, y), `depth` rows deep.
function extrude(s, x, y, depth) {
  const left = Math.round(x) - SW / 2;
  const top = Math.round(y) - SB;
  const lean = (W / 2 - x) * LEAN;
  for (let i = depth; i > 0; i--) {
    const dx = Math.round(i * lean);
    g.drawImage(s.side, left + dx, top - i);
    g.drawImage(s.top, left + dx, top - i);
  }
  g.drawImage(s.front, left, top);
}

// By day shadows fall toward the front, away from the sun, longer as it sets. Set every frame.
let sunlight = null;         // { x, len, alpha }, or null when it is too dark for shadows

// The shadow of `rows` rows of silhouette `src`, ending at row `bottom`, cast from a base at
// (left, y): squashed and leaned away from the sun.
function cast(src, bottom, rows, left, y, flip) {
  const n = Math.max(1, Math.round(rows * sunlight.len));
  const lean = Math.max(-1.6, Math.min(1.6, (left + src.width / 2 - sunlight.x) / 90));
  g.save();
  g.globalAlpha = sunlight.alpha;
  if (flip) {
    g.translate(left * 2 + src.width, 0);
    g.scale(-1, 1);
  }
  for (let r = 0; r < n; r++) {
    const row = bottom - 1 - Math.floor((r * rows) / n);
    const dx = Math.round(r * lean);
    g.drawImage(src, 0, row, src.width, 1, left + (flip ? -dx : dx), Math.round(y) + r, src.width, 1);
  }
  g.restore();
}

const silhouettes = new WeakMap();
function shadowOfSprite(img, x, y, flip) {
  if (!sunlight) {
    rect(x - img.width / 2 + 1, y, img.width - 2, 1, 'rgba(0,0,0,0.25)');
    return;
  }
  let s = silhouettes.get(img);
  if (!s) {
    s = canvasOf(img.width, img.height);
    const cg = s.getContext('2d');
    cg.drawImage(img, 0, 0);
    cg.globalCompositeOperation = 'source-in';
    cg.fillStyle = '#000';
    cg.fillRect(0, 0, img.width, img.height);
    silhouettes.set(img, s);
  }
  cast(s, img.height, img.height, Math.round(x - img.width / 2), y, flip);
}

function shadowOfSolid(s, x, y) {
  if (sunlight && s.h > 0) {
    cast(s.shade, SB, s.h, Math.round(x) - SW / 2, y, false);
  }
}

// Everything standing on the strip, each with how far back it is (`z`, to draw them back to front),
// how to draw it and its shadow.
function scenery(sv) {
  const items = [];
  // A solid `depth` rows deep with its front `z` rows back, drawn in order of `sort` (its back, by
  // default), and `after` drawn over it.
  const block = (key, paint, x, z, depth, after, sort) => {
    const s = solid(key, paint);
    const bx = at(x, z);
    const by = LANE - z;
    items.push({
      z: sort ?? z + depth,
      draw: () => {
        extrude(s, bx, by, depth);
        if (after) {
          after(bx, by);
        }
      },
      shadow: () => shadowOfSolid(s, bx, by),
    });
  };
  const flat = (z, draw) => items.push({ z, draw });
  const level = sv.shelter.level;
  const rubble = sv.rebuild > 0;
  const heavy = (sv.blueprints || []).includes('heavy');

  // The places to explore, the one being searched, and those his trip is headed for.
  const searching = sv.job && sv.job.kind === 'explore' ? [sv.job.data] : [];
  for (const site of [...sv.sites, ...searching, ...(sv.trip ? sv.trip.stops : [])]) {
    if (!SITE[site.kind]) {
      continue;
    }
    if (site.kind === 'lake') {
      flat(BACK + 4, () => SITE.lake(at(sx(site.x), BACK + 4), LANE - BACK - 4));
    } else {
      // The water is drawn first, so the place stands in front of it.
      if (WATERSIDE[site.kind]) {
        flat(BACK + 9, () => sea(at(sx(site.x), BACK + 5), LANE - BACK - 5, WATERSIDE[site.kind]));
      }
      const [z, depth] = SITE_DEPTH[site.kind] || [8, 8];
      block(`site:${site.kind}`, SITE[site.kind], sx(site.x), z, depth);
    }
  }
  const radius = view.layout.radius;
  const first = Math.floor((camX - W / 2) / TW) - 3;
  for (let tile = first; tile < first + W / TW + 6; tile++) {
    if (Math.abs(tile) === radius + 1) {
      block('sign', ROADSIDE.sign, sx(tile), 7, 1);
    } else if (wreck(tile, radius)) {
      block('wreck', ROADSIDE.wreck, sx(tile), 6, 5);
    }
  }
  for (const tile of pumpkinTiles()) {
    flat(BACK + 1, () => jack(at(sx(tile) + 4, BACK + 1), LANE - BACK - 1));
  }
  // The boat he found at a harbor waits by the road on the side of his last trip.
  if (sv.boat) {
    const side = sv.trip ? sv.trip.side : 1;
    flat(BACK, () => boat(at(sx(side * (radius + 2)), BACK), LANE - BACK + 1));
  }
  // The patches still burning where a molotov landed.
  for (const f of sv.fires || []) {
    flat(0.5, () => {
      const x = sx(f.x);
      g.globalAlpha = 0.5;
      rect(at(x, 1) - 7, LANE - 1, 15, 2, '#2a1a10');
      g.globalAlpha = 1;
      for (let i = -6; i <= 6; i += 2) {
        flames(at(x + i, 1), LANE - ((i + 8) % 3), Math.max(1, Math.min(5, f.left)) + 1 - (Math.abs(i) >> 2));
      }
    });
  }
  if (!rubble) {
    if (view.cooking) {
      flat(4, () => campfire(at(sx(-9), 4), LANE - 4));
    }
    if (sv.generator) {
      block('generator', DECOR.generator, sx(-8), 5, 4, (x, y) => {
        // The cable to the shelter, along the ground.
        g.globalAlpha = 0.6;
        rect(x + 5, y - 1, at(sx(-1), 5) - x - 5, 1, '#2e2e2e');
        g.globalAlpha = 1;
        if (view.powered && Math.sin(clock * 9) > 0.6) {
          rect(x + 3, y - 9, 1, 1, '#fff6a0');
          rect(x - 3, y - 8, 1, 1, '#fff6a0');
        }
      });
    }
    if (sv.lab) {
      block('lab', DECOR.lab, sx(8), 6, 6);
    }
    if (level >= 8) {
      flat(7, () => flag(at(sx(9), 7), LANE - 7));
    }
    for (const d of sv.defenses) {
      const x = sx(d.x);
      if (d.type === 'trap') {
        flat(BACK, () => {
          for (const z of [6, 2, -2]) paintDefense('trap', at(x, z), LANE - z);
        });
        continue;
      }
      // Barricades and spikes are set up across the lane, a row of them from back to front.
      for (const z of [7, 2, -3]) {
        block(`defense:${d.type}`, x0 => paintDefense(d.type, x0), x, z, 1, null, z);
      }
    }
    for (const t of view.layout.turrets) {
      const spot = turretSpot(t, level);
      if (spot.legs) {
        const face = Math.sign(t) || 1;
        block(`turret:${heavy}:${face}:legs`, x0 => paintTurret(x0, LANE, true, face, heavy), sx(t), TOWER_Z, 3,
          (x, y) => turretFlash(t, x, y));
      }
    }
    if (level >= 3) {
      for (const tile of [-view.layout.wall, view.layout.wall]) {
        // The walls run across the lane, with the drifters standing on their front ends.
        const drifter = view.layout.drifters.includes(tile);
        block(`wall:${level >= 7}`, x0 => paintWall(x0, level), sx(tile), -2, 6,
          drifter ? (x, y) => blit(g, SPRITES.drifter(), x, y - 9, tile < 0) : null);
      }
    }
  }
  // The shelter, with the turrets on its roof and the lookout between them.
  const lit = !!view.night;
  block(`shelter:${rubble ? 'ruins' : level >= 12 ? 12 : level >= 7 ? 7 : level >= 4 ? 4 : 1}:${lit}`,
    x0 => paintShelter(x0, level, rubble, lit), sx(0), 0, rubble ? 4 : 8, (x, y) => {
      shelterLife(x, y, level);
      if (rubble) {
        return;
      }
      for (const t of view.layout.turrets) {
        const spot = turretSpot(t, level);
        if (!spot.legs) {
          const s = solid(`turret:${heavy}:${t}`, x0 => paintTurret(x0, LANE, false, t, heavy));
          extrude(s, spot.x, spot.y, 3);
          turretFlash(t, spot.x, spot.y);
        }
      }
      if ((sv.residents || []).some(r => r.role === 'lookout')) {
        const near = sv.zombies.reduce((a, z) => (!a || Math.abs(z.x) < Math.abs(a.x) ? z : a), null);
        blit(g, SPRITES.resident(0), x + 4, y - shelterHeight(level) + 3, near ? near.x < 0 : false);
      }
    });
  if (!rubble && level < 3) {
    for (const tile of view.layout.drifters) {
      const x = sx(tile);
      items.push({
        z: 0,
        draw: () => blit(g, SPRITES.drifter(), x, LANE, tile < 0),
        shadow: () => shadowOfSprite(SPRITES.drifter(), x, LANE, tile < 0),
      });
    }
  }
  // The crates lie just behind where he walks. A passing trader stands there too, with his camel
  // further out, facing the shelter.
  for (const c of sv.crates) {
    if (c.kind === 'trader') {
      const side = Math.sign(c.x) || 1;
      const x = at(sx(c.x), 3);
      const camel = SPRITES.camel();
      const trader = SPRITES.trader();
      const nod = Math.sin(clock * 1.3 + c.x) > 0.6 ? 1 : 0;
      items.push({
        z: 3,
        draw: () => {
          blit(g, camel, x + side * 6, LANE - 3 + nod, side > 0);
          blit(g, trader, x - side * 5, LANE - 2, side > 0);
        },
        shadow: () => {
          shadowOfSprite(camel, x + side * 6, LANE - 3, side > 0);
          shadowOfSprite(trader, x - side * 5, LANE - 2, side > 0);
        },
      });
      continue;
    }
    const since = landing.has(c.x) ? clock - landing.get(c.x) : 99;
    const fall = c.kind === 'drop' ? Math.max(0, 120 - since * 60) : 0;
    const kind = CRATE[c.kind] ? c.kind : 'scrap';
    const s = solid(`crate:${kind}:${fall > 0}`, x0 => CRATE[kind](x0, fall > 0));
    const x = at(sx(c.x), 2);
    items.push({
      z: 2.5,
      draw: () => extrude(s, x, LANE - 2 - fall, 3),
      shadow: () => !fall && shadowOfSolid(s, x, LANE - 2),
    });
  }
  return items;
}

function turretFlash(t, x, y) {
  if (clock - (firing.get(t) || -9) < 0.12) {
    const face = Math.sign(t) || 1;
    rect(face > 0 ? x + 8 : x - 9, y - 15, 2, 2, '#ffe680');
  }
}

// ---------- people and zombies ----------

// Eases what is on screen toward where the game has it. `target` and the result's x are in pixels
// along the strip from the shelter, not on screen, so a second camera (see shelterCam) can share them.
function ease(key, target, dt) {
  let e = shown.get(key);
  if (!e || Math.abs(e.x - target) > TW * 4) {
    e = { x: target, moving: false };
    shown.set(key, e);
  }
  const step = target - e.x;
  e.x += step * (1 - Math.exp(-dt * 6));
  e.moving = Math.abs(step) > 0.6;
  e.seen = clock;
  return e;
}

function frame(e) {
  return e.moving ? Math.floor(clock * 7) % 2 : 0;
}

// What he holds, by the weapon's id (the vehicles are drawn instead of him).
function drawWeapon(x, y, face, id) {
  const f = (dx, dy, w, h, c) => rect(face > 0 ? x + dx : x - dx - w + 1, y + dy, w, h, c);
  if (id === 'bat') {
    f(3, -7, 1, 3, '#8b5a2b');
    f(3, -11, 2, 4, '#c8a070');
  } else if (id === 'axe') {
    f(3, -9, 1, 6, '#6b4423');
    f(4, -10, 2, 3, '#b8bcc4');
  } else if (id === 'machete') {
    f(3, -6, 1, 2, '#3a2614');
    f(3, -12, 1, 6, '#d8dce4');
    f(4, -11, 1, 4, '#b8bcc4');
  } else if (id === 'bow') {
    f(4, -11, 1, 1, '#8b5a2b');
    f(5, -10, 1, 5, '#8b5a2b');
    f(4, -5, 1, 1, '#8b5a2b');
    f(3, -10, 1, 5, '#d8d2c0');
  } else if (id === 'pistol') {
    f(4, -7, 3, 1, '#2e2e2e');
    f(4, -6, 1, 1, '#2e2e2e');
  } else if (id === 'rifle') {
    f(1, -7, 8, 1, '#3a3a3a');
    f(1, -6, 3, 1, '#6b4423');
  } else if (id === 'chainsaw') {
    f(2, -8, 4, 3, '#d9822b');
    f(2, -9, 2, 1, '#2e2e2e');
    f(6, -7, 5, 2, '#9a9aa2');
    for (let i = 0; i < 5; i += 2) f(6 + i + (Math.floor(clock * 20) % 2), -8, 1, 1, '#5a5a60');
  }
}

function hpBar(x, y, hp, max) {
  if (hp >= max) {
    return;
  }
  const w = 8;
  rect(x - w / 2, y, w, 1, '#3a0d0d');
  rect(x - w / 2, y, Math.max(1, Math.round((w * hp) / max)), 1, hp / max < 0.35 ? '#ff5050' : '#7ee07e');
}

// The rows of the lane the zombies keep to, each its own, so a crowd spreads over it.
const DEPTHS = [-3, -1, 1, 3, 5];
const depthOf = z => DEPTHS[hash(z.id || 7) % DEPTHS.length];

function zombie(z, dt) {
  const depth = depthOf(z);
  const e = ease(`z${z.id ?? z.x}`, z.x * TW, dt);
  const x = onScreen(e.x, depth);
  const face = z.x > 0 ? -1 : 1;
  const reach = reachOf(z.kind);
  const atWall = Math.abs(z.x) <= view.layout.wall + reach;
  const lunge = atWall && !reach && Math.sin(clock * 8 + (z.id || 0)) > 0.3 ? face : 0;
  const shake = z.held > 0 ? (Math.floor(clock * 20) % 2 ? 1 : -1) : 0;
  // Bats flap all the time, flying a little above the lane.
  const bat = z.kind === 'bat';
  const step = bat ? Math.floor(clock * 8 + (z.id || 0)) % 2 : z.held > 0 ? 0 : frame(e);
  const img = SPRITES[z.kind] ? SPRITES[z.kind](step) : SPRITES.walker(frame(e));
  const y = LANE - depth - (bat ? 12 + Math.round(Math.sin(clock * 4 + (z.id || 0)) * 2) : 0);
  const shriek = clock - (screams.get(z.id) ?? -9);
  return {
    z: depth,
    shadow: () => (bat ? rect(x - 2, LANE - depth, 5, 1, 'rgba(0,0,0,0.25)') : shadowOfSprite(img, x, y, face < 0)),
    draw: () => {
      blit(g, img, x + lunge + shake, y, face < 0);
      hpBar(x, y - img.height - 3, z.hp, z.max);
      // A screamer shrieks once when it sees him; the queen calls her runners every few seconds.
      if (shriek < 1.5) {
        screech(x, y - img.height + 3, shriek / 1.5);
      } else if (z.kind === 'queen' && clock % 4 < 1.2) {
        screech(x, y - img.height + 6, (clock % 4) / 1.2);
      }
      if (dt <= 0 || !reach || Math.random() >= 0.02) {
        return;
      }
      // Those with reach attack from a distance: a spitter spits at the walls, and a raider shoots
      // the walls, or him when he is close.
      const sv = view.sv;
      const near = z.kind === 'raider' && sv.x !== 0 && sv.down === 0 && Math.abs(z.x - sv.x) <= reach;
      if (near) {
        tracer(x + face * 4, y - 8, at(sx(sv.x), 0), LANE - 8, 0.1, '#ffe680');
      } else if (atWall && Math.abs(z.x) > view.layout.wall) {
        const wall = Math.sign(z.x) * view.layout.wall;
        if (z.kind === 'raider') {
          tracer(x + face * 4, y - 8, at(sx(wall), depth), y - 7, 0.1, '#ffe680');
        } else {
          tracer(x, y - 10, at(sx(wall), depth), y - 8, 0.4, '#b6ff4a', true);
        }
      }
    },
  };
}

// Rings of sound from a mouth at (x, y), `p` of the way through a shriek.
function screech(x, y, p) {
  g.strokeStyle = '#f4f0ff';
  for (let k = 0; k < 3; k++) {
    const r = 3 + ((p * 3 + k / 3) % 1) * 12;
    g.globalAlpha = Math.max(0, 0.8 * (1 - r / 15));
    g.beginPath();
    g.arc(x, y, r, -0.7, 0.7);
    g.stroke();
    g.beginPath();
    g.arc(x, y, r, Math.PI - 0.7, Math.PI + 0.7);
    g.stroke();
  }
  g.globalAlpha = 1;
}

function hero(dt) {
  const sv = view.sv;
  if (sv.x === 0 || sv.rebuild > 0 || sv.down > 0) {
    shown.delete('hero');
    return null;
  }
  const e = ease('hero', sv.x * TW, dt);
  const x = onScreen(e.x);
  const face = sv.facing || 1;
  if (view.weapon.vehicle) {
    const heli = weaponId() === 'helicopter';
    const img = heli ? SPRITES.heli() : weaponId() === 'pickup' ? SPRITES.pickup() : SPRITES.tank();
    return {
      z: 0,
      e,
      x,
      shadow: () => shadowOfSprite(img, x, LANE, face < 0),
      draw: () => {
        if (!heli) {
          blit(g, img, x, LANE, face < 0);
          return;
        }
        const y = LANE - 16 + Math.round(Math.sin(clock * 3));
        blit(g, img, x, y, face < 0);
        const spin = Math.floor(clock * 20) % 2;
        rect(x - (spin ? 12 : 6), y - 8, spin ? 24 : 12, 1, '#1e1e1e');
      },
    };
  }
  const tier = sv.gear && sv.gear.body ? sv.gear.body.tier : 0;
  const img = SPRITES.survivor(frame(e), tier);
  return {
    z: 0,
    e,
    x,
    shadow: () => shadowOfSprite(img, x, LANE, face < 0),
    draw: () => {
      blit(g, img, x, LANE, face < 0);
      drawWeapon(x, LANE, face, weaponId());
      if (sv.job && sv.job.kind === 'explore') {
        bubble(x, LANE - 19, '?');
      }
    },
  };
}

// The dog trots behind him, a little nearer the front.
function dog(him, dt) {
  const sv = view.sv;
  if (!sv.dog || !him) {
    shown.delete('dog');
    return null;
  }
  const face = sv.facing || 1;
  const e = ease('dog', him.e.x - face * TW * 0.8, dt);
  e.moving = e.moving || him.e.moving;
  const x = onScreen(e.x, -2);
  const img = SPRITES.dog(frame(e));
  return {
    z: -2,
    shadow: () => shadowOfSprite(img, x, LANE + 2, face < 0),
    draw: () => blit(g, img, x, LANE + 2, face < 0),
  };
}

function bubble(x, y, text) {
  rect(x - 3, y - 6, 7, 7, '#f4f4f4');
  rect(x - 1, y + 1, 2, 1, '#f4f4f4');
  g.fillStyle = '#222';
  g.font = '7px monospace';
  g.textAlign = 'center';
  g.fillText(text, x + 0.5, y);
}

// ---------- effects ----------

// Bits flying from (x, y) on screen that land on the ground at `floor`. Effects keep where they are
// along the strip (x + camX), so they stay put as the camera moves, and show in the shelter cam.
function burst(x, y, colors, n, floor) {
  for (let i = 0; i < n; i++) {
    particles.push({ x: x + camX, y, floor, vx: (Math.random() - 0.5) * 40, vy: -Math.random() * 40, life: 0.5 + Math.random() * 0.4, color: colors[i % colors.length] });
  }
}

// A shot from (x1, y1) to (x2, y2) on screen, lasting `life` seconds; `arc` lobs it.
function tracer(x1, y1, x2, y2, life, color, arc) {
  tracers.push({ x1: x1 + camX, y1, x2: x2 + camX, y2, life, color, arc });
}

// A molotov or grenade thrown from tile `from` to tile `to`, lobbed high; it bursts where it lands.
function lob(from, to, kind) {
  lobs.push({ x1: sx(from) + camX, y1: LANE - 12, x2: at(sx(to), 2) + camX, y2: LANE - 3, t: 0, kind });
}

const BLAST = {
  molotov: { r: 13, life: 0.6, core: '#ffe27a', edge: '#ff6a1f', bits: ['#ffa02e', '#ff5a1f', '#ffe27a'] },
  grenade: { r: 17, life: 0.45, core: '#fff6d0', edge: '#ffa02e', bits: ['#6e6e74', '#9a9aa2', '#ffd040'] },
  bile: { r: 15, life: 0.5, core: '#e8f07a', edge: '#7a9a2a', bits: ['#b8c45a', '#8a9a3a', '#e8f07a'] },
};

// A blast of `kind` (see BLAST) at (x, y) on screen.
function blast(x, y, kind) {
  const b = BLAST[kind];
  blasts.push({ x: x + camX, y, kind, life: b.life });
  burst(x, y - 3, b.bits, kind === 'grenade' ? 24 : 18, y + 2);
}

function drawLobs(dt) {
  for (let i = lobs.length - 1; i >= 0; i--) {
    const l = lobs[i];
    l.t += dt / 0.45;
    if (l.t >= 1) {
      lobs.splice(i, 1);
      blast(l.x2 - camX, l.y2, l.kind);
      continue;
    }
    const x = l.x1 + (l.x2 - l.x1) * l.t - camX;
    const y = l.y1 + (l.y2 - l.y1) * l.t - Math.sin(l.t * Math.PI) * 18;
    if (l.kind === 'molotov') {
      rect(x, y - 1, 2, 4, '#4f8a3e');
      rect(x, y - 1, 1, 1, '#8fd070');
      rect(x, y - 3, 1, 2, Math.floor(clock * 20) % 2 ? '#ffa02e' : '#ffe27a');
    } else {
      rect(x - 1, y - 1, 3, 3, '#3a4a2a');
      rect(x - 1, y - 1, 1, 1, '#7a8a5a');
      rect(x, y - 2, 1, 1, '#9a9aa2');
    }
  }
  for (let i = blasts.length - 1; i >= 0; i--) {
    const b = blasts[i];
    const def = BLAST[b.kind];
    b.life -= dt;
    if (b.life <= 0) {
      blasts.splice(i, 1);
      continue;
    }
    const r = Math.max(1, def.r * Math.sqrt(1 - b.life / def.life));
    const x = Math.round(b.x - camX);
    const y = Math.round(b.y - r * 0.4);
    g.globalAlpha = Math.min(1, b.life * 4) * 0.85;
    pond(x, y, Math.round(r), Math.round(r * 0.6), def.edge);
    pond(x, y, Math.round(r * 0.55), Math.round(r * 0.35), def.core);
    g.globalAlpha = 1;
  }
}

function drawEffects(dt) {
  drawLobs(dt);
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    p.vy += 90 * dt;
    p.x += p.vx * dt;
    p.y = Math.min(p.floor, p.y + p.vy * dt);
    g.globalAlpha = Math.min(1, p.life * 2);
    rect(p.x - camX, p.y, 1, 1, p.color);
  }
  for (let i = tracers.length - 1; i >= 0; i--) {
    const t = tracers[i];
    t.life -= dt;
    if (t.life <= 0) {
      tracers.splice(i, 1);
      continue;
    }
    g.globalAlpha = Math.min(1, t.life * 6);
    g.strokeStyle = t.color;
    g.beginPath();
    g.moveTo(t.x1 - camX, t.y1);
    if (t.arc) {
      g.quadraticCurveTo((t.x1 + t.x2) / 2 - camX, t.y1 - 14, t.x2 - camX, t.y2);
    } else {
      g.lineTo(t.x2 - camX, t.y2);
    }
    g.stroke();
  }
  g.globalAlpha = 1;
}

// A new step: shots, hits and the zombies that died since the last one.
function onStep(prev) {
  const sv = view.sv;
  const fx = sv.fx && sv.fx.step === sv.step ? sv.fx : {};
  const hits = fx.hits || [];
  const shooters = [];
  // The pickup rams what it hits; a bow shoots arrows.
  if (sv.x !== 0 && weaponId() !== 'pickup') {
    shooters.push({ x: sx(sv.x), y: LANE - (weaponId() === 'helicopter' ? 18 : 8), reach: 10, color: weaponId() === 'bow' ? '#d8c8a0' : null });
  }
  for (const t of fx.throws || []) lob(t.from, t.to, t.kind);
  for (const bx of fx.bursts || []) {
    const hit = (prev && prev.sv.zombies.find(z => z.x === bx && z.kind === 'bloater')) || null;
    const depth = hit ? depthOf(hit) : 0;
    blast(at(sx(bx), depth), LANE - depth, 'bile');
  }
  // A screamer that has just seen him shrieks.
  if (prev) {
    for (const z of sv.zombies) {
      const before = prev.sv.zombies.find(p => p.id === z.id);
      if (z.screamed && before && !before.screamed) {
        screams.set(z.id, clock);
      }
    }
  }
  for (const t of view.layout.turrets) {
    const spot = turretSpot(t, sv.shelter.level);
    shooters.push({ x: spot.x, y: spot.y - 14, reach: 6, turret: t });
  }
  for (const d of view.layout.drifters) shooters.push({ x: sx(d), y: LANE - 20, reach: 6 });
  for (const hx of hits) {
    // Hit where a zombie on that tile stands (one just killed, if none is left).
    const hit = sv.zombies.find(z => z.x === hx) || (prev && prev.sv.zombies.find(z => z.x === hx));
    const depth = hit ? depthOf(hit) : 0;
    const x = at(sx(hx), depth);
    const y = LANE - depth - 7;
    burst(x, y, ['#fff2a0', '#ffd040', '#8fbf5a'], 5, y + 9);
    const from = shooters.filter(s => Math.abs(s.x - x) <= s.reach * TW).sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0];
    if (from && Math.abs(from.x - x) > TW) {
      tracer(from.x, from.y, x, y, 0.12, from.color || '#ffe680');
      if (from.turret !== undefined) {
        firing.set(from.turret, clock);
      }
    }
  }
  if (prev) {
    const ids = new Set(sv.zombies.map(z => z.id));
    for (const z of prev.sv.zombies) {
      if (z.id !== undefined && !ids.has(z.id) && sv.rebuild === 0) {
        const e = shown.get(`z${z.id}`);
        const depth = depthOf(z);
        burst(onScreen(e ? e.x : z.x * TW, depth), LANE - depth - 6, ['#86a85e', '#5d7b3f', '#a03030'], isBoss(z) ? 30 : 10, LANE - depth + 2);
      }
    }
  }
  for (const c of sv.crates) {
    if (c.kind === 'drop' && !landing.has(c.x)) {
      landing.set(c.x, prev ? clock : clock - 10);
    }
  }
}

// ---------- inside: the rooms under the shelter ----------

const ROOM_W = [40, 32];     // a room's width on the first floor, and in the cellar, which fits 4 a side
const ROOM_H = 28;
const SHAFT = 10;
const FLOORS = [159, 191];   // the tops of the first floor's rooms and of the cellar's
// Each room has its own place, so none moves when another is dug: [floor, side, slot from the shaft].
const SLOTS = {
  workshop: [0, -1, 0], storage: [0, -1, 1], kitchen: [0, -1, 2], bunks: [0, 1, 0], study: [0, 1, 1], lab: [0, 1, 2],
  infirmary: [1, -1, 0], greenhouse: [1, -1, 1], training: [1, -1, 2], garage: [1, -1, 3],
  armory: [1, 1, 0], radio: [1, 1, 1], library: [1, 1, 2], still: [1, 1, 3],
};
const WALLS = {
  workshop: '#5a4a3c', storage: '#54483a', kitchen: '#6b5040', bunks: '#4a4a5c', study: '#4c4038', lab: '#8e989c',
  infirmary: '#aeb4b8', greenhouse: '#3c5a40', training: '#5c4a4a', armory: '#4a4f46', radio: '#43504a',
  library: '#4a3a30', still: '#4e4a3c', garage: '#4a4c52',
};
const SPINES = ['#a33a2e', '#2f6fbf', '#d9a42b', '#4f8a3e', '#7a4b9a', '#c8c0a8'];

// Where a room is: its left and top, the line its floor is at (where feet stand), and its width.
function roomBox(key) {
  const [floor, side, i] = SLOTS[key];
  const w = ROOM_W[floor];
  const cx = sx(0);
  const x = side < 0 ? cx - SHAFT / 2 - 2 - (i + 1) * w - i * 2 : cx + SHAFT / 2 + 2 + i * (w + 2);
  return { x: Math.round(x), y: FLOORS[floor], f: FLOORS[floor] + ROOM_H - 3, w };
}

// A room seen like a dollhouse: its ceiling, side walls and floor slant in toward its back wall.
function roomShell(b, key) {
  rect(b.x - 1, b.y - 1, b.w + 2, ROOM_H + 2, '#1e140c');
  rect(b.x, b.y, b.w, ROOM_H, WALLS[key]);
  const side = mix(WALLS[key], '#000000', 0.3);
  for (let i = 0; i < 3; i++) {
    rect(b.x + i, b.y + i, b.w - i * 2, 1, '#2a1e14');
    rect(b.x + i, b.y + i + 1, 1, b.f - b.y - i * 2 + 1, side);
    rect(b.x + b.w - 1 - i, b.y + i + 1, 1, b.f - b.y - i * 2 + 1, side);
    rect(b.x + 2 - i, b.f + i, b.w - 4 + i * 2, 1, ['#6b4a30', '#7a5636', '#8a6440'][i]);
  }
  // The floorboards, toward the back wall.
  for (let k = 1; k < Math.round(b.w / 5); k++) {
    for (let i = 0; i < 3; i++) rect(b.x + 2 + k * 4.5 - i * (1 - k * 0.25), b.f + i, 1, 1, '#5a3e28');
  }
  rect(b.x + b.w / 2, b.y + 2, 1, 2, '#3a3a3a');
  rect(b.x + b.w / 2 - 1, b.y + 4, 3, 1, '#ffe08a');
}

function sparks(x, y) {
  if (Math.sin(clock * 17) > 0.2) {
    rect(x + Math.round(Math.sin(clock * 31) * 2), y - Math.round(Math.abs(Math.cos(clock * 23)) * 3), 1, 1, '#ffe680');
  }
}

const FURNISH = {
  workshop(b, s) {
    rect(b.x + 3, b.f - 7, 20, 2, '#8b5a2b');
    rect(b.x + 4, b.f - 5, 1, 5, '#6b4423');
    rect(b.x + 21, b.f - 5, 1, 5, '#6b4423');
    rect(b.x + 18, b.f - 9, 3, 2, '#7d8590');
    rect(b.x + 4, b.y + 6, 1, 5, '#6b4423');
    rect(b.x + 3, b.y + 6, 3, 1, '#9a9aa2');
    rect(b.x + 8, b.y + 7, 6, 2, '#b8bcc4');
    rect(b.x + 16, b.y + 6, 1, 5, '#9a9aa2');
    rect(b.x + 30, b.f - 6, 7, 6, '#9a6a3c');
    rect(b.x + 30, b.f - 4, 7, 1, '#6e6e74');
    if (s.busy) {
      sparks(b.x + 12, b.f - 8);
    }
  },
  storage(b, s) {
    for (const y of [b.y + 10, b.y + 18]) rect(b.x + 2, y, 36, 1, '#6b4423');
    rect(b.x + 2, b.y + 5, 1, b.f - b.y - 5, '#6b4423');
    rect(b.x + 37, b.y + 5, 1, b.f - b.y - 5, '#6b4423');
    const sv = view.sv;
    const stock = sv.scrap + sv.wood + sv.cloth + sv.food;
    const boxes = Math.min(14, 1 + Math.floor(Math.log2(stock + 1) * 1.4));
    const colors = ['#9a6a3c', '#8b5a2b', '#6a5acd', '#c0504d', '#7d8590'];
    for (let i = 0; i < boxes; i++) {
      const shelf = i < 7 ? b.y + 10 : b.y + 18;
      rect(b.x + 4 + (i % 7) * 5, shelf - 4, 4, 4, colors[i % colors.length]);
    }
    rect(b.x + 26, b.f - 4, 5, 4, '#b8a47a');
    rect(b.x + 31, b.f - 3, 4, 3, '#a8946a');
  },
  kitchen(b, s) {
    rect(b.x + 3, b.f - 9, 9, 9, '#3a3a40');
    rect(b.x + 3, b.f - 9, 9, 1, '#55555c');
    rect(b.x + 5, b.f - 5, 5, 2, s.busy ? '#ff6a2a' : '#2a2a2e');
    rect(b.x + 5, b.f - 12, 5, 3, '#7d8590');
    if (s.busy) {
      smoke(b.x + 7, b.f - 13);
    }
    rect(b.x + 22, b.f - 6, 13, 2, '#8b5a2b');
    rect(b.x + 23, b.f - 4, 1, 4, '#6b4423');
    rect(b.x + 33, b.f - 4, 1, 4, '#6b4423');
    rect(b.x + 26, b.f - 7, 3, 1, '#e8e2d0');
    rect(b.x + 16, b.y + 8, 21, 1, '#6b4423');
    for (let i = 0; i < Math.min(5, view.sv.meals); i++) rect(b.x + 17 + i * 4, b.y + 5, 2, 3, '#e8913a');
  },
  bunks(b, s) {
    const beds = Math.max(1, view.inside.beds);
    for (let k = 0; k < Math.min(2, Math.ceil(beds / 2)); k++) {
      const x = b.x + 3 + k * 18;
      rect(x, b.f - 16, 1, 16, '#6b4423');
      rect(x + 14, b.f - 16, 1, 16, '#6b4423');
      rect(x + 1, b.f - 4, 13, 2, '#4a6fa5');
      rect(x + 1, b.f - 5, 3, 1, '#e8e2d0');
      if (beds > 2 * k + 1) {
        rect(x + 1, b.f - 13, 13, 2, '#4a6fa5');
        rect(x + 1, b.f - 14, 3, 1, '#e8e2d0');
      }
    }
  },
  study(b, s) {
    rect(b.x + 4, b.f - 7, 14, 2, '#7a4b2a');
    rect(b.x + 5, b.f - 5, 1, 5, '#5a361e');
    rect(b.x + 16, b.f - 5, 1, 5, '#5a361e');
    rect(b.x + 6, b.f - 10, 1, 3, '#2e2e2e');
    rect(b.x + 5, b.f - 11, 3, 1, '#ffd36b');
    if (s.busy) {
      rect(b.x + 10, b.f - 8, 4, 1, '#f4f0e0');
      rect(b.x + 12, b.f - 8, 1, 1, Math.sin(clock * 3) > 0 ? '#c8c0a8' : '#f4f0e0');
    }
    rect(b.x + 25, b.y + 5, 12, b.f - b.y - 5, '#5a3a1a');
    const spines = Math.min(20, 3 + view.inside.books * 2);
    for (let i = 0; i < spines; i++) {
      rect(b.x + 26 + (i % 5) * 2, b.y + 6 + Math.floor(i / 5) * 5, 1, 4, SPINES[i % SPINES.length]);
    }
  },
  lab(b, s) {
    rect(b.x + 3, b.f - 7, 30, 2, '#e8ecee');
    rect(b.x + 4, b.f - 5, 1, 5, '#9aa4a8');
    rect(b.x + 31, b.f - 5, 1, 5, '#9aa4a8');
    rect(b.x + 6, b.f - 11, 2, 4, '#6ff0a0');
    rect(b.x + 12, b.f - 10, 3, 3, '#6fb8ff');
    rect(b.x + 20, b.f - 12, 2, 5, '#c08aff');
    if (Math.sin(clock * 5) > 0) rect(b.x + 7, b.f - 13, 1, 1, '#b8ffd0');
  },
  // The cellar's rooms, narrower than the first floor's (see ROOM_W).
  infirmary(b, s) {
    rect(b.x + 3, b.f - 5, 13, 3, '#e8ecee');
    rect(b.x + 3, b.f - 6, 3, 1, '#ffffff');
    rect(b.x + 3, b.f - 2, 1, 2, '#9aa4a8');
    rect(b.x + 15, b.f - 2, 1, 2, '#9aa4a8');
    rect(b.x + 23, b.y + 7, 5, 1, '#d03030');
    rect(b.x + 25, b.y + 5, 1, 5, '#d03030');
    rect(b.x + 19, b.f - 14, 1, 14, '#9a9aa2');
    rect(b.x + 18, b.f - 15, 3, 3, '#cfe8ff');
  },
  greenhouse(b, s) {
    rect(b.x + 3, b.y + 3, b.w - 6, 1, '#d070ff');
    for (let i = 0; i < Math.floor((b.w - 4) / 7); i++) {
      const x = b.x + 4 + i * 7;
      rect(x, b.f - 3, 4, 3, '#a0522d');
      const h = 3 + ((i * 7) % 4);
      const sway = Math.round(Math.sin(clock * 1.2 + i));
      rect(x + 1 + sway, b.f - 3 - h, 1, h, '#4f9a3a');
      rect(x + sway, b.f - 3 - h, 3, 1, '#6cc04a');
    }
  },
  training(b, s) {
    const swing = Math.round(Math.sin(clock * 2.5) * 1.5);
    rect(b.x + 9, b.y + 2, 1, 5, '#7d8590');
    rect(b.x + 7 + swing, b.y + 7, 5, 11, '#b03a2e');
    rect(b.x + 17, b.f - 4, 12, 2, '#3a3a3a');
    rect(b.x + 19, b.f - 7, 1, 3, '#9a9aa2');
    rect(b.x + 26, b.f - 7, 1, 3, '#9a9aa2');
    rect(b.x + 18, b.f - 7, 10, 1, '#5a5a60');
  },
  armory(b, s) {
    rect(b.x + 2, b.y + 6, 16, 13, '#5a3a1a');
    for (let i = 0; i < 3; i++) {
      rect(b.x + 4, b.y + 8 + i * 4, 12, 1, '#2e2e2e');
      rect(b.x + 4, b.y + 9 + i * 4, 4, 1, '#6b4423');
    }
    rect(b.x + 21, b.f - 5, 8, 5, '#5d6640');
    rect(b.x + 21, b.f - 3, 8, 1, '#d8b030');
  },
  radio(b, s) {
    rect(b.x + 3, b.f - 7, 18, 2, '#7a4b2a');
    rect(b.x + 4, b.f - 5, 1, 5, '#5a361e');
    rect(b.x + 19, b.f - 5, 1, 5, '#5a361e');
    rect(b.x + 5, b.f - 13, 11, 6, '#3d4a3a');
    rect(b.x + 7, b.f - 11, 3, 2, '#e8e2d0');
    rect(b.x + 12, b.f - 11, 1, 1, Math.sin(clock * 4) > 0 ? '#ff4040' : '#5a2020');
    rect(b.x + 14, b.f - 11, 1, 1, Math.sin(clock * 3 + 1) > 0 ? '#40ff60' : '#205a28');
    rect(b.x + 25, b.y, 1, b.f - b.y - 13, '#2e2e2e');
  },
  library(b, s) {
    // Shelves full of books on both sides, and a lamp on a little table between them.
    for (const [x, w] of [[3, 10], [20, 9]]) {
      rect(b.x + x, b.y + 5, w, b.f - b.y - 5, '#5a3a1a');
      for (let row = 0; row < 4; row++) {
        for (let i = 0; i < w - 1; i++) {
          if (hash(x * 31 + row * 7 + i) % 5) {
            rect(b.x + x + 1 + i, b.y + 7 + row * 5, 1, 3 + (hash(i + row) % 2), SPINES[hash(x + i * 3 + row) % SPINES.length]);
          }
        }
      }
    }
    rect(b.x + 14, b.f - 5, 5, 1, '#7a4b2a');
    rect(b.x + 14, b.f - 4, 1, 4, '#5a361e');
    rect(b.x + 18, b.f - 4, 1, 4, '#5a361e');
    rect(b.x + 16, b.f - 9, 1, 4, '#2e2e2e');
    rect(b.x + 15, b.f - 10, 3, 1, '#ffd36b');
    if (s.busy) {
      rect(b.x + 15, b.f - 6, 3, 1, '#f4f0e0');
    }
  },
  still(b, s) {
    // Barrels of water, a copper pot, its pipe coiling down to a bucket that fills drop by drop.
    for (const x of [3, 9]) {
      rect(b.x + x, b.f - 8, 5, 8, '#8b5a2b');
      rect(b.x + x, b.f - 7, 5, 1, '#5a5a60');
      rect(b.x + x, b.f - 2, 5, 1, '#5a5a60');
    }
    rect(b.x + 15, b.f - 8, 7, 8, '#c87533');
    rect(b.x + 16, b.f - 10, 5, 2, '#c87533');
    rect(b.x + 16, b.f - 6, 5, 1, '#e8a060');
    rect(b.x + 18, b.y + 7, 1, b.f - 10 - b.y - 7, '#b8642a');
    rect(b.x + 18, b.y + 7, 8, 1, '#b8642a');
    for (let i = 0; i < 4; i++) rect(b.x + 25 + (i % 2), b.y + 8 + i * 2, 1, 2, '#b8642a');
    rect(b.x + 23, b.f - 4, 5, 4, '#7d8590');
    rect(b.x + 23, b.f - 4, 5, 1, '#9aa4a8');
    const drop = (clock * 1.5) % 1;
    rect(b.x + 25, b.y + 16 + Math.round(drop * (b.f - 4 - b.y - 16)), 1, 1, '#7fb6e0');
  },
  garage(b, s) {
    // A lift with a jeep up on it, a pegboard of tools, a can of gas and an oil stain.
    rect(b.x + 3, b.f - 16, 1, 16, '#9a9aa2');
    rect(b.x + 21, b.f - 16, 1, 16, '#9a9aa2');
    rect(b.x + 3, b.f - 9, 19, 1, '#d8b030');
    rect(b.x + 5, b.f - 13, 15, 3, '#5d6640');
    rect(b.x + 11, b.f - 16, 6, 3, '#5d6640');
    rect(b.x + 12, b.f - 15, 4, 1, '#9fd3e6');
    rect(b.x + 6, b.f - 11, 3, 2, '#1e1e1e');
    rect(b.x + 16, b.f - 11, 3, 2, '#1e1e1e');
    rect(b.x + 24, b.y + 6, 6, 8, '#8b6a4a');
    rect(b.x + 25, b.y + 7, 1, 4, '#b8bcc4');
    rect(b.x + 27, b.y + 7, 2, 1, '#b8bcc4');
    rect(b.x + 28, b.y + 9, 1, 4, '#c0392b');
    rect(b.x + 25, b.f - 5, 3, 5, '#c0392b');
    rect(b.x + 26, b.f - 6, 1, 1, '#2e2e2e');
    g.globalAlpha = 0.6;
    rect(b.x + 8, b.f + 1, 9, 1, '#1a1a1a');
    g.globalAlpha = 1;
    if (s.busy) {
      sparks(b.x + 12, b.f - 9);
    }
  },
};

// A room still being dug: beams and sparks.
function scaffold(b) {
  rect(b.x, b.y, b.w, ROOM_H, '#2e2116');
  for (let i = 0; i < b.w; i += 10) rect(b.x + i, b.y, 1, ROOM_H, '#8b5a2b');
  rect(b.x, b.y + 10, b.w, 1, '#8b5a2b');
  rect(b.x, b.f, b.w, 3, '#5a3f28');
  sparks(b.x + b.w / 2, b.f - 6);
}

// The room for what he is doing inside (one this window knows how to draw).
function roomFor(doing, inside) {
  const has = key => inside.rooms.includes(key) || inside.built.includes(key);
  if ((doing === 'cook' || doing === 'eat') && has('kitchen')) return 'kitchen';
  if (doing === 'study' && has('library')) return 'library';
  if (doing === 'study' && has('study')) return 'study';
  if (doing === 'organize') return 'storage';
  if ((doing === 'lab' || doing === 'research') && has('lab')) return 'lab';
  if (doing === 'room' && SLOTS[inside.building]) return inside.building;
  if (doing === 'rest' || doing === 'down' || view.sv.resting) return has('infirmary') ? 'infirmary' : 'bunks';
  return 'workshop';
}

const RESIDENT_ROOM = { mechanic: 'workshop', scavenger: 'storage', cook: 'kitchen', medic: 'infirmary' };

function zz(x, y) {
  const zt = (clock * 0.7) % 1;
  g.globalAlpha = 1 - zt;
  g.fillStyle = '#e8e8f8';
  g.font = '7px monospace';
  g.fillText('z', x + zt * 5, y - zt * 8);
  g.globalAlpha = 1;
}

function drawInside() {
  const inside = view.inside;
  // A server started before 1.29.0 sends no rooms.
  if (!inside) {
    return;
  }
  const sv = view.sv;
  // Rooms from a newer game than this window are left out.
  const visible = [...inside.rooms, ...(inside.cellar ? inside.built : [])].filter(key => SLOTS[key] && FURNISH[key]);
  const cx = sx(0);
  const deepest = inside.cellar ? FLOORS[1] + ROOM_H : FLOORS[0] + ROOM_H;
  // The shaft down from the shelter's door, with its ladder.
  rect(cx - SHAFT / 2, 152, SHAFT, deepest - 152, '#22170f');
  rect(cx - 3, 152, 1, deepest - 152, '#6b4423');
  rect(cx + 2, 152, 1, deepest - 152, '#6b4423');
  for (let y = 154; y < deepest; y += 4) rect(cx - 3, y, 6, 1, '#8b5a2b');
  const doing = sv.doing;
  const here = inside.inside ? roomFor(doing, inside) : null;
  for (const key of visible) {
    const b = roomBox(key);
    roomShell(b, key);
    FURNISH[key](b, { busy: here === key && !['rest', 'down'].includes(doing) });
  }
  if (inside.cellar && SLOTS[inside.building]) {
    scaffold(roomBox(inside.building));
  }
  // The people living there, each in their room.
  (sv.residents || []).forEach((r, i) => {
    const key = r.role === 'medic' && !visible.includes('infirmary') ? 'bunks' : RESIDENT_ROOM[r.role];
    if (!key || !visible.includes(key)) {
      return;
    }
    const b = roomBox(key);
    const bob = Math.sin(clock * 2 + i) > 0.7 ? 1 : 0;
    blit(g, SPRITES.resident(0), b.x + b.w - 8, b.f - bob, true);
  });
  if (!here || !visible.includes(here) || sv.rebuild > 0) {
    return;
  }
  const b = roomBox(here);
  const f = b.f;
  const tier = sv.gear && sv.gear.body ? sv.gear.body.tier : 0;
  if (here === 'bunks' || here === 'infirmary') {
    const bed = here === 'bunks' ? b.x + 11 : b.x + 10;
    blit(g, SPRITES.down(), bed, here === 'bunks' ? f - 3 : f - 4, false);
    zz(bed + 6, f - 10);
  } else if (here === 'storage') {
    const t = (Math.sin(clock * 1.4) + 1) / 2;
    const x = b.x + 8 + t * 14;
    blit(g, SPRITES.survivor(Math.floor(clock * 6) % 2, tier), x, f, Math.cos(clock * 1.4) < 0);
    rect(x - 2, f - 17, 5, 4, '#9a6a3c');
  } else {
    const spot = { kitchen: [b.x + 16, true], study: [b.x + 21, true], workshop: [b.x + 15, true], lab: [b.x + 17, true], library: [b.x + 22, true] }[here] || [b.x + 20, false];
    blit(g, SPRITES.survivor(0, tier), spot[0], f, spot[1]);
    if (doing === 'eat') {
      rect(spot[0] + 4, f - 7, 3, 1, '#e8913a');
    }
    if (doing === 'study') {
      rect(spot[0] - 5, f - 8, 3, 2, '#f4f0e0');
    }
  }
  if (sv.dog && visible.includes('bunks')) {
    const d = roomBox('bunks');
    blit(g, SPRITES.dog(0), d.x + d.w - 6, d.f, true);
  }
  if (view.waiting) {
    zz(b.x + b.w / 2, b.y + 10);
  }
}

// ---------- light ----------

function drawLight() {
  const dark = (1 - view.light) / (1 - 0.45);
  if (dark <= 0.01 && !view.blood) {
    return;
  }
  sg.clearRect(0, 0, W, H);
  const fade = sg.createLinearGradient(0, 96, 0, 124);
  const a = Math.min(0.62, dark * 0.62);
  const tint = view.blood ? '40,4,8' : '8,10,32';
  fade.addColorStop(0, `rgba(${tint},0)`);
  fade.addColorStop(1, `rgba(${tint},${a})`);
  sg.fillStyle = fade;
  sg.fillRect(0, 96, W, GROUND - 96);
  // Light cuts holes in the dark.
  sg.globalCompositeOperation = 'destination-out';
  const hole = (x, y, rx, ry, strength) => {
    sg.save();
    sg.translate(x, y);
    sg.scale(rx / ry, 1);
    const r = sg.createRadialGradient(0, 0, 0, 0, 0, ry);
    r.addColorStop(0, `rgba(0,0,0,${strength})`);
    r.addColorStop(1, 'rgba(0,0,0,0)');
    sg.fillStyle = r;
    sg.fillRect(-ry, -ry, ry * 2, ry * 2);
    sg.restore();
  };
  const sv = view.sv;
  const glows = [];
  if (view.powered && sv.rebuild === 0) {
    hole(sx(0), LANE - 8, (view.layout.lit + 0.5) * TW, 30, 0.95);
    glows.push([sx(0), LANE - 8, (view.layout.lit + 0.5) * TW, 30, 'rgba(255,230,150,0.10)']);
  }
  if (sv.rebuild === 0) {
    hole(sx(0), LANE - 12, 14, 12, 0.7);
  }
  if (view.cooking && sv.rebuild === 0) {
    const flick = 22 + Math.sin(clock * 11) * 2;
    hole(at(sx(-9), 4), LANE - 8, flick, flick, 0.9);
    glows.push([at(sx(-9), 4), LANE - 8, flick, flick, 'rgba(255,140,50,0.16)']);
  }
  if (sv.rebuild > 0) {
    hole(sx(0), LANE - 6, 22, 22, 0.9);
    glows.push([sx(0), LANE - 6, 22, 22, 'rgba(255,120,40,0.18)']);
  }
  if (sv.lab) {
    hole(at(sx(8), 6), LANE - 16, 10, 10, 0.8);
    glows.push([at(sx(8), 6), LANE - 16, 10, 10, 'rgba(110,255,150,0.15)']);
  }
  for (const t of tracers) {
    hole(t.x2 - camX, t.y2, 8, 8, 0.8);
  }
  // Fires, blasts and the jack-o'-lanterns light up the dark around them.
  for (const f of sv.fires || []) {
    const r = 14 + Math.min(5, f.left) * 2 + Math.sin(clock * 11 + f.x) * 2;
    hole(at(sx(f.x), 1), LANE - 4, r, r, 0.9);
    glows.push([at(sx(f.x), 1), LANE - 4, r, r, 'rgba(255,140,50,0.18)']);
  }
  for (const b of blasts) {
    hole(b.x - camX, b.y - 4, 26, 26, Math.min(1, b.life * 3));
  }
  for (const tile of pumpkinTiles()) {
    const x = at(sx(tile) + 4, BACK + 1);
    hole(x, LANE - BACK - 3, 7, 7, 0.8);
    glows.push([x, LANE - BACK - 3, 7, 7, 'rgba(255,150,40,0.25)']);
  }
  sg.globalCompositeOperation = 'source-over';
  g.drawImage(shade, 0, 0);
  g.globalCompositeOperation = 'lighter';
  for (const [x, y, rx, ry, color] of glows) {
    g.save();
    g.translate(x, y);
    g.scale(rx / ry, 1);
    const r = g.createRadialGradient(0, 0, 0, 0, 0, ry);
    r.addColorStop(0, color);
    r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r;
    g.fillRect(-ry, -ry, ry * 2, ry * 2);
    g.restore();
  }
  g.globalCompositeOperation = 'source-over';
  if (view.night) {
    for (const f of FLIES) {
      const x = (f.x + Math.sin(clock * 0.4 + f.p) * 20 + W) % W;
      const y = f.y + Math.sin(clock * 0.9 + f.p * 2) * 6;
      g.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(clock * 2 + f.p));
      rect(x, y, 1, 1, view.blood ? '#ff8a6a' : '#e8ff9a');
    }
    g.globalAlpha = 1;
  }
}

// In December snow falls over the strip, down to the ground.
function drawSnow() {
  if (!winter()) {
    return;
  }
  for (const f of FLAKES) {
    const y = (f.y + clock * f.v) % GROUND;
    const x = wrap(f.x - camX * 0.9 + Math.sin(clock * 0.8 + f.p) * 6) - 100;
    g.globalAlpha = f.v > 13 ? 1 : 0.5;
    rect(x, y, 1, 1, '#f4f8fc');
  }
  g.globalAlpha = 1;
}

// ---------- the frame ----------

// Everything from the camera at camX onto `g`. A dt of 0 moves nothing on: the shelter cam draws the
// same moment again from another camera (and leaves out the rooms, which it doesn't show).
function drawWorld(dt) {
  const sv = view.sv;
  drawSky();
  drawLand();
  const sun = sunAt();
  sunlight = !view.night && !view.blood && dayness() > 0.05
    ? { x: sun.x, len: 0.3 + ((sun.y - 20) / 50) * 0.45, alpha: 0.35 * dayness() } : null;
  const him = hero(dt);
  const items = [...scenery(sv), him, dog(him, dt), ...sv.zombies.map(z => zombie(z, dt))].filter(Boolean);
  // The shadows first, all on the ground (none on the earth's cut face below it), then everything
  // from the back of the lane to the front.
  g.save();
  g.beginPath();
  g.rect(0, 0, W, GROUND);
  g.clip();
  for (const item of items) {
    if (item.shadow) item.shadow();
  }
  g.restore();
  items.sort((a, b) => b.z - a.z);
  for (const item of items) item.draw();
  drawTufts();
  if (dt > 0) {
    drawInside();
  }
  drawEffects(dt);
  drawLight();
  drawSnow();
  return him;
}

// While he is away down the road, a view of the shelter in the corner, its frame flashing red
// while zombies are at the walls, and the walls' life under it.
const CAM = { w: 120, h: 56, top: 96 };
const camCanvas = canvasOf(W, H);
const camG = camCanvas.getContext('2d');
function shelterCam() {
  const sv = view.sv;
  const keep = [g, camX];
  g = camG;
  camX = 0;
  drawWorld(0);
  [g, camX] = keep;
  const attacked = sv.zombies.some(z => Math.abs(z.x) <= view.layout.wall + reachOf(z.kind));
  const edge = attacked && Math.floor(clock * 4) % 2 ? '#ff5050' : attacked ? '#a03030' : '#e6e3d8';
  rect(2, 2, CAM.w + 4, CAM.h + 7, '#0d0e14');
  rect(3, 3, CAM.w + 2, CAM.h + 2, edge);
  g.drawImage(camCanvas, W / 2 - CAM.w / 2, CAM.top, CAM.w, CAM.h, 4, 4, CAM.w, CAM.h);
  const life = Math.max(0, Math.min(1, sv.shelter.hp / view.max));
  rect(4, CAM.h + 6, CAM.w, 2, '#3a0d0d');
  rect(4, CAM.h + 6, Math.round(CAM.w * life), 2, life < 0.25 ? '#ff5050' : life < 0.5 ? '#ffd040' : '#7ee07e');
}

let last = performance.now();
function draw(t) {
  const dt = Math.min(0.1, (t - last) / 1000);
  last = t;
  clock += view && view.waiting ? dt * 0.35 : dt;
  if (!view) {
    requestAnimationFrame(draw);
    return;
  }
  const sv = view.sv;
  // The camera leans toward him as he patrols, and follows him down the road on a trip.
  const target = sv.trip ? sv.x * TW : Math.max(-50, Math.min(50, sv.x * TW)) * 0.35;
  camX += (target - camX) * (1 - Math.exp(-dt * 1.5));

  const him = drawWorld(dt);
  if (sv.trip && Math.abs(camX) > W / 2 + 30) {
    shelterCam();
  }
  if (view.waiting && him) {
    const zt = (clock * 1.2) % 1;
    g.globalAlpha = 1 - zt;
    g.fillStyle = '#e8e8f8';
    g.font = '7px monospace';
    g.fillText('z', him.x + 5 + zt * 4, LANE - 15 - zt * 8);
    g.globalAlpha = 1;
  }
  for (const [key, e] of shown) {
    if (clock - e.seen > 2) shown.delete(key);
  }
  requestAnimationFrame(draw);
}

// ---------- the page around it ----------

function fit() {
  const hud = document.getElementById('hud').offsetHeight + document.getElementById('news').offsetHeight;
  const scale = Math.max(1, Math.floor(Math.min(innerWidth / W, (innerHeight - hud - 16) / H)));
  canvas.style.width = `${W * scale}px`;
  canvas.style.height = `${H * scale}px`;
}

function showHud() {
  const hud = document.getElementById('hud');
  hud.replaceChildren(...view.hud.map(text => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = text;
    return chip;
  }));
  const news = document.getElementById('news');
  news.textContent = view.news || (view.waiting ? '💤 waiting for you' : '');
  news.className = view.news ? 'news' : 'news quiet';
}

async function poll() {
  try {
    const res = await fetch(`/state?k=${encodeURIComponent(KEY)}`, { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(res.status);
    }
    const next = await res.json();
    failures = 0;
    const prev = view;
    view = next;
    if (view.closing) {
      document.body.classList.add('gone');
      window.close();
      return;
    }
    if (view.sv.step !== lastStep) {
      onStep(prev && prev.sv.step !== view.sv.step ? prev : null);
      lastStep = view.sv.step;
    }
    showHud();
    fit();
  } catch {
    failures++;
    if (failures >= 4) {
      document.body.classList.add('gone');
      window.close();
      return;
    }
  }
  setTimeout(poll, POLL_MS);
}

addEventListener('resize', fit);
poll();
requestAnimationFrame(draw);
