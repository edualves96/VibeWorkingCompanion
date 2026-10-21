'use strict';
// The Survival game drawn as a pixel-art diorama: a 320x222 canvas scaled up without smoothing,
// the strip above ground and the shelter's rooms dug under it. It asks the companion's server for the game every POLL_MS and eases everything toward it, since
// the game itself only moves once a second. It never changes the game.

const W = 320;
const H = 222;
const GROUND = 155;         // where the earth begins, under the lane
const TW = 14;              // a tile of the strip, in pixels
const LANE = 146;           // where feet stand
const HORIZON = 112;
const POLL_MS = 400;
const KEY = new URLSearchParams(location.search).get('k');

const canvas = document.getElementById('scene');
const g = canvas.getContext('2d');
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

// ---------- the land, made once ----------

const rand = rng(1225);
const lattice = Array.from({ length: 512 }, () => rand());
function noise(x) {
  const i = Math.floor(x);
  const f = x - i;
  const s = f * f * (3 - 2 * f);
  return lattice[i & 511] * (1 - s) + lattice[(i + 1) & 511] * s;
}
const SPAN = W + 200;        // wide enough for the camera's drift at every depth
const LAYERS = [
  { depth: 0.12, base: 92, amp: 30, freq: 0.012, day: '#8fa9cf', night: '#2c2852', blood: '#3a1418' },
  { depth: 0.3, base: 102, amp: 16, freq: 0.03, day: '#6f93a8', night: '#24213f', blood: '#2c0e12', pines: true },
  { depth: 0.55, base: 114, amp: 6, freq: 0.06, day: '#4f7d52', night: '#16202a', blood: '#1e0a0c', pines: true },
];
for (const layer of LAYERS) {
  layer.top = Array.from({ length: SPAN }, (_, i) => Math.round(layer.base - noise(i * layer.freq + layer.depth * 97) * layer.amp
    - noise(i * layer.freq * 3.1) * layer.amp * 0.3));
  layer.trees = [];
  if (layer.pines) {
    for (let i = 0; i < SPAN; i += 3 + Math.floor(rand() * 7)) {
      layer.trees.push({ i, h: 6 + Math.floor(rand() * (layer.depth > 0.4 ? 12 : 7)) });
    }
  }
}
const STARS = Array.from({ length: 70 }, () => ({ x: rand() * W, y: rand() * 95, b: rand(), s: rand() < 0.15 ? 2 : 1 }));
const TUFTS = Array.from({ length: 70 }, () => ({ x: rand() * SPAN, y: 152 + rand() * 3, h: 2 + Math.floor(rand() * 4), c: rand() }));
const PEBBLES = Array.from({ length: 40 }, () => ({ x: rand() * SPAN, y: 138 + rand() * 12 }));
const CLOUDS = Array.from({ length: 6 }, () => ({ x: rand() * SPAN, y: 14 + rand() * 50, w: 3 + Math.floor(rand() * 4), v: 1 + rand() * 2 }));
const STONES = Array.from({ length: 60 }, () => ({ x: rand() * SPAN, y: GROUND + 3 + rand() * (H - GROUND - 5), w: 1 + Math.floor(rand() * 3), c: rand() }));
const FLIES = Array.from({ length: 14 }, () => ({ x: rand() * W, y: 100 + rand() * 60, p: rand() * 6.28 }));

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
    const x = Math.round((c.x + clock * c.v - camX * 0.05) % SPAN) - 100;
    g.fillStyle = view.blood ? 'rgba(90,20,24,0.6)' : mix('#2a2a48', '#f4f8fb', dayness());
    g.globalAlpha = 0.35 + dayness() * 0.55;
    for (let i = 0; i < c.w; i++) {
      const h = i === 0 || i === c.w - 1 ? 3 : 5 + (i % 2) * 2;
      g.fillRect(x + i * 5, Math.round(c.y) - h, 6, h);
    }
    g.fillRect(x - 2, Math.round(c.y) - 2, c.w * 5 + 7, 2);
  }
  g.globalAlpha = 1;
  // The sun by day, the moon by night, along an arc by the hour.
  const now = new Date();
  const hour = now.getHours() + now.getMinutes() / 60;
  const up = view.night ? ((hour + 4) % 24) / 10 : (hour - 6) / 14;
  const x = 20 + Math.max(0, Math.min(1, up)) * (W - 40);
  const y = 70 - Math.sin(Math.max(0, Math.min(1, up)) * Math.PI) * 50;
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
      const top = layer.top[(x + off) % SPAN];
      g.fillRect(x, top, 1, 140 - top);
    }
    for (const tree of layer.trees) {
      const x = tree.i - off;
      if (x < -6 || x > W + 6) {
        continue;
      }
      const base = layer.top[tree.i % SPAN] + 2;
      for (let row = 0; row < tree.h; row++) {
        const half = Math.floor(row / 2.2);
        g.fillRect(x - half, base - tree.h + row, half * 2 + 1, 1);
      }
    }
  }
  // Grass behind the lane, the dirt lane, grass in front.
  rect(0, 128, W, 10, view.blood ? '#2a1010' : mix('#1c3324', '#4d8a3e', t));
  rect(0, 136, W, 16, view.blood ? '#3a1d18' : mix('#3b2f27', '#8d6c49', t));
  rect(0, 136, W, 1, view.blood ? '#4a2520' : mix('#4a3b30', '#a3825c', t));
  rect(0, 152, W, 3, view.blood ? '#241010' : mix('#15281c', '#3f7a33', t));
  // The earth under it all, in layers, with stones.
  rect(0, GROUND, W, H - GROUND, '#3b2a1d');
  rect(0, GROUND, W, 2, '#4a3524');
  rect(0, GROUND + 30, W, 1, '#33251a');
  rect(0, GROUND + 52, W, 1, '#2e2117');
  for (const st of STONES) {
    rect((st.x - camX + SPAN) % SPAN - 100, st.y, st.w, 1, st.c < 0.5 ? '#5a4a3e' : '#2a1e15');
  }
  g.fillStyle = view.blood ? '#4a2a24' : mix('#4a3d33', '#a8896a', t);
  for (const p of PEBBLES) {
    const x = (p.x - camX + SPAN) % SPAN - 100;
    g.fillRect(Math.round(x), Math.round(p.y), 1, 1);
  }
}

function drawTufts() {
  const t = dayness();
  for (const tuft of TUFTS) {
    const x = Math.round((tuft.x - camX * 1.15 + SPAN * 4) % SPAN - 100);
    const sway = Math.round(Math.sin(clock * 1.5 + tuft.x) * 0.6);
    g.fillStyle = view.blood ? '#3a1414' : mix(tuft.c < 0.5 ? '#1f3b25' : '#27482c', tuft.c < 0.5 ? '#5aa045' : '#6cb550', t);
    for (let i = 0; i < tuft.h; i++) {
      g.fillRect(x + (i > tuft.h / 2 ? sway : 0), Math.round(tuft.y) - i, 1, 1);
      g.fillRect(x + 2 + (i > tuft.h / 2 ? sway : 0), Math.round(tuft.y) - Math.max(0, i - 1), 1, 1);
    }
  }
}

// ---------- the shelter and what stands around it ----------

function drawShelter(x, level) {
  const sv = view.sv;
  const night = !view.night ? '#78b6d6' : '#ffd36b';
  if (sv.rebuild > 0) {
    rect(x - 13, LANE - 5, 26, 5, '#5a5048');
    rect(x - 9, LANE - 8, 18, 3, '#6e625a');
    flames(x - 5, LANE - 7, 3);
    flames(x + 4, LANE - 8, 4);
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
    if (view.cooking) {
      smoke(x + 9, LANE - 28);
    }
  } else {
    rect(x - 12, LANE - 13, 24, 13, '#8b5a2b');
    for (let i = 0; i < 24; i += 3) rect(x - 12 + i, LANE - 13, 1, 13, '#734a22');
    for (let row = 0; row < 7; row++) rect(x - 14 + row, LANE - 14 - row, 28 - row * 2, 1, '#7a2e2e');
    rect(x - 3, LANE - 8, 6, 8, '#4a2e16');
    rect(x + 5, LANE - 10, 4, 3, night);
  }
  if (sv.cures > 0) {
    const tw = Math.sin(clock * 3) > 0 ? '#fff7b0' : '#ffd84a';
    rect(x - 1, LANE - shelterHeight(level) - 8, 3, 1, tw);
    rect(x, LANE - shelterHeight(level) - 9, 1, 3, tw);
  }
}

function shelterHeight(level) {
  return level >= 12 ? 44 : level >= 7 ? 29 : level >= 4 ? 26 : 21;
}

function drawWall(x, level) {
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

// Where a turret stands: the two nearest the shelter on its roof corners, the others on legs.
function turretSpot(tile, level) {
  if (Math.abs(tile) !== 1) {
    return { x: sx(tile), y: LANE, legs: true };
  }
  const half = level >= 12 ? 18 : level >= 7 ? 16 : level >= 4 ? 15 : 12;
  const roof = level >= 12 ? 16 : level >= 7 ? 29 : level >= 4 ? 16 : 13;
  return { x: sx(0) + tile * (half - 3), y: LANE - roof + 9, legs: false };
}

function drawTurret(spot, face, heavy, firing) {
  const { x, y } = spot;
  const metal = heavy ? '#7d8590' : '#8b5a2b';
  if (spot.legs) {
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
  if (firing) {
    rect(face > 0 ? x + 8 : x - 9, y - 15, 2, 2, '#ffe680');
  }
}

function drawDefense(d, x) {
  if (d.type === 'barricade') {
    rect(x - 5, LANE - 3, 11, 3, '#b8a47a');
    for (let i = 0; i < 7; i++) {
      rect(x - 4 + i, LANE - 9 + i, 2, 1, '#8b5a2b');
      rect(x + 3 - i, LANE - 9 + i, 2, 1, '#734a22');
    }
  } else if (d.type === 'trap') {
    rect(x - 3, LANE - 1, 7, 1, '#6e6e74');
    for (let i = -3; i <= 3; i += 2) rect(x + i, LANE - 2, 1, 1, '#a0a0a8');
  } else {
    for (let i = -5; i <= 5; i += 2) {
      rect(x + i, LANE - 3, 1, 3, '#9a9aa2');
      rect(x + i, LANE - 4, 1, 1, '#c8c8d0');
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
  drop: (x, fall) => {
    const y = LANE - fall;
    rect(x - 3, y - 6, 7, 6, '#6b7a3a');
    rect(x - 3, y - 4, 7, 1, '#2e2e2e');
    // The canopy: on the way down above the crate, then draped beside it.
    if (fall > 0) {
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
  lake: x => {
    g.fillStyle = '#2f6a9a';
    g.beginPath();
    g.ellipse(x, LANE - 3, 13, 3, 0, 0, 6.29);
    g.fill();
    const s = Math.round(Math.sin(clock * 2 + x) * 3);
    rect(x - 6 + s, LANE - 4, 4, 1, '#7fb6e0');
    rect(x + 3 - s, LANE - 2, 3, 1, '#7fb6e0');
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
};

function flames(x, y, size) {
  for (let i = 0; i < size + 2; i++) {
    const f = Math.sin(clock * 12 + i * 2.3 + x);
    rect(x + (i % 3) - 1, y - i - (f > 0 ? 1 : 0), 1, 1, i < 2 ? '#ff5a1f' : i < size ? '#ffa02e' : '#ffe27a');
  }
}

function smoke(x, y) {
  for (let i = 0; i < 4; i++) {
    const t = (clock * 0.6 + i / 4) % 1;
    g.globalAlpha = 0.4 * (1 - t);
    rect(x + Math.sin(t * 5 + i) * 2, y - t * 16, 2, 2, '#c8c8c8');
  }
  g.globalAlpha = 1;
}

function drawDecor() {
  const sv = view.sv;
  if (sv.rebuild > 0) {
    return;
  }
  if (view.cooking) {
    const x = sx(-9);
    rect(x - 3, LANE - 1, 7, 1, '#5a3a1a');
    rect(x - 2, LANE - 2, 5, 1, '#734a22');
    flames(x - 1, LANE - 2, 3);
    flames(x + 1, LANE - 3, 4);
  }
  if (sv.generator) {
    const x = sx(-8);
    rect(x - 4, LANE - 7, 9, 7, '#d8b030');
    for (let i = 0; i < 9; i += 3) rect(x - 4 + i, LANE - 2, 2, 2, '#2e2e2e');
    rect(x, LANE - 6, 1, 2, '#2e2e2e');
    rect(x - 1, LANE - 4, 2, 1, '#2e2e2e');
    // The cable to the shelter, along the ground.
    g.globalAlpha = 0.6;
    rect(x + 5, LANE - 1, sx(-1) - x - 5, 1, '#2e2e2e');
    g.globalAlpha = 1;
    if (view.powered && Math.sin(clock * 9) > 0.6) {
      rect(x + 3, LANE - 9, 1, 1, '#fff6a0');
      rect(x - 3, LANE - 8, 1, 1, '#fff6a0');
    }
  }
  if (sv.lab) {
    const x = sx(8);
    rect(x - 7, LANE - 12, 14, 12, '#d8dcdc');
    rect(x - 7, LANE - 13, 14, 1, '#a8aeb0');
    rect(x - 4, LANE - 9, 3, 3, '#7dff9a');
    rect(x + 2, LANE - 6, 3, 6, '#5a6266');
    rect(x - 1, LANE - 17, 2, 4, '#7dff9a');
    rect(x - 2, LANE - 14, 4, 1, '#7dff9a');
  }
  if (sv.shelter.level >= 8) {
    const x = sx(9);
    rect(x, LANE - 18, 1, 18, '#9a9aa2');
    for (let row = 0; row < 5; row++) {
      const wave = Math.round(Math.sin(clock * 4 + row * 0.8));
      rect(x + 1, LANE - 18 + row + wave * 0, 7 + wave, 1, row % 2 ? '#c0392b' : '#e74c3c');
    }
  }
}

// ---------- people and zombies ----------

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

function drawWeapon(x, y, face, key) {
  const f = (dx, dy, w, h, c) => rect(face > 0 ? x + dx : x - dx - w + 1, y + dy, w, h, c);
  if (key === 1) {
    f(3, -9, 1, 6, '#6b4423');
    f(4, -10, 2, 3, '#b8bcc4');
  } else if (key === 2) {
    f(4, -7, 3, 1, '#2e2e2e');
    f(4, -6, 1, 1, '#2e2e2e');
  } else if (key === 3) {
    f(1, -7, 8, 1, '#3a3a3a');
    f(1, -6, 3, 1, '#6b4423');
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

function drawZombie(z, dt) {
  const target = sx(z.x);
  const e = ease(`z${z.id ?? z.x}`, target, dt);
  const depth = ((hash(z.id || 7) % 5) - 2);
  const face = z.x > 0 ? -1 : 1;
  const atWall = Math.abs(z.x) <= view.layout.wall + (z.kind === 'spitter' ? 3 : 0);
  const lunge = atWall && Math.sin(clock * 8 + (z.id || 0)) > 0.3 ? face : 0;
  const shake = z.held > 0 ? (Math.floor(clock * 20) % 2 ? 1 : -1) : 0;
  const img = SPRITES[z.kind] ? SPRITES[z.kind](z.held > 0 ? 0 : frame(e)) : SPRITES.walker(frame(e));
  const y = LANE + depth;
  rect(e.x - img.width / 2 + 1, y, img.width - 2, 1, 'rgba(0,0,0,0.25)');
  blit(g, img, e.x + lunge + shake, y, face < 0);
  hpBar(e.x, y - img.height - 3, z.hp, z.max);
  if (z.kind === 'spitter' && atWall && Math.abs(z.x) > view.layout.wall && Math.random() < 0.02) {
    tracers.push({ x1: e.x, y1: y - 10, x2: sx(Math.sign(z.x) * view.layout.wall), y2: LANE - 8, life: 0.4, color: '#b6ff4a', arc: true });
  }
  return e;
}

function drawHero(dt) {
  const sv = view.sv;
  if (sv.x === 0 || sv.rebuild > 0 || sv.down > 0) {
    shown.delete('hero');
    return null;
  }
  const e = ease('hero', sx(sv.x), dt);
  const face = sv.facing || 1;
  if (view.weapon.vehicle) {
    if (view.weapon.name === 'Helicopter') {
      const y = LANE - 16 + Math.round(Math.sin(clock * 3));
      rect(e.x - 8, LANE, 16, 1, 'rgba(0,0,0,0.25)');
      blit(g, SPRITES.heli(), e.x, y, face < 0);
      const spin = Math.floor(clock * 20) % 2;
      rect(e.x - (spin ? 12 : 6), y - 8, spin ? 24 : 12, 1, '#1e1e1e');
    } else {
      blit(g, SPRITES.tank(), e.x, LANE, face < 0);
    }
    return e;
  }
  rect(e.x - 3, LANE, 6, 1, 'rgba(0,0,0,0.25)');
  const tier = sv.gear && sv.gear.body ? sv.gear.body.tier : 0;
  blit(g, SPRITES.survivor(frame(e), tier), e.x, LANE, face < 0);
  drawWeapon(e.x, LANE, face, view.weapon.key);
  if (sv.job && sv.job.kind === 'explore') {
    bubble(e.x, LANE - 19, '?');
  }
  return e;
}

function drawDog(hero, dt) {
  const sv = view.sv;
  if (!sv.dog || !hero) {
    shown.delete('dog');
    return;
  }
  const e = ease('dog', hero.x - (sv.facing || 1) * TW * 0.8, dt);
  e.moving = e.moving || hero.moving;
  blit(g, SPRITES.dog(frame(e)), e.x, LANE + 1, (sv.facing || 1) < 0);
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

function burst(x, y, colors, n) {
  for (let i = 0; i < n; i++) {
    particles.push({ x, y, vx: (Math.random() - 0.5) * 40, vy: -Math.random() * 40, life: 0.5 + Math.random() * 0.4, color: colors[i % colors.length] });
  }
}

function drawEffects(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    p.vy += 90 * dt;
    p.x += p.vx * dt;
    p.y = Math.min(LANE + 2, p.y + p.vy * dt);
    g.globalAlpha = Math.min(1, p.life * 2);
    rect(p.x, p.y, 1, 1, p.color);
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
    g.moveTo(t.x1, t.y1);
    if (t.arc) {
      g.quadraticCurveTo((t.x1 + t.x2) / 2, t.y1 - 14, t.x2, t.y2);
    } else {
      g.lineTo(t.x2, t.y2);
    }
    g.stroke();
  }
  g.globalAlpha = 1;
}

// A new step: shots, hits and the zombies that died since the last one.
function onStep(prev) {
  const sv = view.sv;
  const hits = sv.fx && sv.fx.step === sv.step ? sv.fx.hits : [];
  const shooters = [];
  if (sv.x !== 0) {
    shooters.push({ x: sx(sv.x), y: LANE - (view.weapon.name === 'Helicopter' ? 18 : 8), reach: 10 });
  }
  for (const t of view.layout.turrets) {
    const spot = turretSpot(t, sv.shelter.level);
    shooters.push({ x: spot.x, y: spot.y - 14, reach: 6, turret: t });
  }
  for (const d of view.layout.drifters) shooters.push({ x: sx(d), y: LANE - 20, reach: 6 });
  for (const hx of hits) {
    const x = sx(hx);
    burst(x, LANE - 7, ['#fff2a0', '#ffd040', '#8fbf5a'], 5);
    const from = shooters.filter(s => Math.abs(s.x - x) <= s.reach * TW).sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0];
    if (from && Math.abs(from.x - x) > TW) {
      tracers.push({ x1: from.x, y1: from.y, x2: x, y2: LANE - 7, life: 0.12, color: '#ffe680' });
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
        burst(e ? e.x : sx(z.x), LANE - 6, ['#86a85e', '#5d7b3f', '#a03030'], z.kind === 'boss' ? 30 : 10);
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

const ROOM_W = 40;
const ROOM_H = 28;
const SHAFT = 10;
const FLOORS = [159, 191];   // the tops of the first floor's rooms and of the cellar's
// Each room has its own place, so none moves when another is dug: [floor, side, slot from the shaft].
const SLOTS = {
  workshop: [0, -1, 0], storage: [0, -1, 1], kitchen: [0, -1, 2], bunks: [0, 1, 0], study: [0, 1, 1], lab: [0, 1, 2],
  infirmary: [1, -1, 0], greenhouse: [1, -1, 1], training: [1, -1, 2], armory: [1, 1, 0], radio: [1, 1, 1],
};
const WALLS = {
  workshop: '#5a4a3c', storage: '#54483a', kitchen: '#6b5040', bunks: '#4a4a5c', study: '#4c4038', lab: '#8e989c',
  infirmary: '#aeb4b8', greenhouse: '#3c5a40', training: '#5c4a4a', armory: '#4a4f46', radio: '#43504a',
};
const SPINES = ['#a33a2e', '#2f6fbf', '#d9a42b', '#4f8a3e', '#7a4b9a', '#c8c0a8'];

// Where a room is: its left and top, and the line its floor is at (where feet stand).
function roomBox(key) {
  const [floor, side, i] = SLOTS[key];
  const cx = sx(0);
  const x = side < 0 ? cx - SHAFT / 2 - 2 - (i + 1) * ROOM_W - i * 2 : cx + SHAFT / 2 + 2 + i * (ROOM_W + 2);
  return { x: Math.round(x), y: FLOORS[floor], f: FLOORS[floor] + ROOM_H - 3 };
}

function roomShell(b, key) {
  rect(b.x - 1, b.y - 1, ROOM_W + 2, ROOM_H + 2, '#1e140c');
  rect(b.x, b.y, ROOM_W, ROOM_H, WALLS[key]);
  rect(b.x, b.y, ROOM_W, 2, '#2a1e14');
  rect(b.x, b.f, ROOM_W, 3, '#6b4a30');
  rect(b.x, b.f, ROOM_W, 1, '#8a6440');
  rect(b.x + ROOM_W / 2, b.y + 2, 1, 2, '#3a3a3a');
  rect(b.x + ROOM_W / 2 - 1, b.y + 4, 3, 1, '#ffe08a');
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
  infirmary(b, s) {
    rect(b.x + 4, b.f - 5, 16, 3, '#e8ecee');
    rect(b.x + 4, b.f - 6, 3, 1, '#ffffff');
    rect(b.x + 4, b.f - 2, 1, 2, '#9aa4a8');
    rect(b.x + 19, b.f - 2, 1, 2, '#9aa4a8');
    rect(b.x + 28, b.y + 7, 5, 1, '#d03030');
    rect(b.x + 30, b.y + 5, 1, 5, '#d03030');
    rect(b.x + 23, b.f - 14, 1, 14, '#9a9aa2');
    rect(b.x + 22, b.f - 15, 3, 3, '#cfe8ff');
  },
  greenhouse(b, s) {
    rect(b.x + 3, b.y + 3, 34, 1, '#d070ff');
    for (let i = 0; i < 5; i++) {
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
    rect(b.x + 10, b.y + 2, 1, 5, '#7d8590');
    rect(b.x + 8 + swing, b.y + 7, 5, 11, '#b03a2e');
    rect(b.x + 22, b.f - 4, 12, 2, '#3a3a3a');
    rect(b.x + 24, b.f - 7, 1, 3, '#9a9aa2');
    rect(b.x + 31, b.f - 7, 1, 3, '#9a9aa2');
    rect(b.x + 23, b.f - 7, 10, 1, '#5a5a60');
  },
  armory(b, s) {
    rect(b.x + 3, b.y + 6, 20, 13, '#5a3a1a');
    for (let i = 0; i < 3; i++) {
      rect(b.x + 5, b.y + 8 + i * 4, 15, 1, '#2e2e2e');
      rect(b.x + 5, b.y + 9 + i * 4, 4, 1, '#6b4423');
    }
    rect(b.x + 27, b.f - 5, 9, 5, '#5d6640');
    rect(b.x + 27, b.f - 3, 9, 1, '#d8b030');
  },
  radio(b, s) {
    rect(b.x + 4, b.f - 7, 22, 2, '#7a4b2a');
    rect(b.x + 5, b.f - 5, 1, 5, '#5a361e');
    rect(b.x + 24, b.f - 5, 1, 5, '#5a361e');
    rect(b.x + 7, b.f - 13, 12, 6, '#3d4a3a');
    rect(b.x + 9, b.f - 11, 3, 2, '#e8e2d0');
    rect(b.x + 14, b.f - 11, 1, 1, Math.sin(clock * 4) > 0 ? '#ff4040' : '#5a2020');
    rect(b.x + 16, b.f - 11, 1, 1, Math.sin(clock * 3 + 1) > 0 ? '#40ff60' : '#205a28');
    rect(b.x + 30, b.y, 1, b.f - b.y - 13, '#2e2e2e');
  },
};

// A room still being dug: beams and sparks.
function scaffold(b) {
  rect(b.x, b.y, ROOM_W, ROOM_H, '#2e2116');
  for (let i = 0; i < ROOM_W; i += 10) rect(b.x + i, b.y, 1, ROOM_H, '#8b5a2b');
  rect(b.x, b.y + 10, ROOM_W, 1, '#8b5a2b');
  rect(b.x, b.f, ROOM_W, 3, '#5a3f28');
  sparks(b.x + 20, b.f - 6);
}

// The room for what he is doing inside.
function roomFor(doing, inside) {
  const has = key => inside.rooms.includes(key) || inside.built.includes(key);
  if ((doing === 'cook' || doing === 'eat') && has('kitchen')) return 'kitchen';
  if (doing === 'study' && has('study')) return 'study';
  if (doing === 'organize') return 'storage';
  if ((doing === 'lab' || doing === 'research') && has('lab')) return 'lab';
  if (doing === 'room' && inside.building) return inside.building;
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
  const visible = [...inside.rooms, ...(inside.cellar ? inside.built : [])];
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
  if (inside.cellar && inside.building) {
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
    blit(g, SPRITES.resident(0), b.x + ROOM_W - 8, b.f - bob, true);
  });
  if (!here || sv.rebuild > 0) {
    return;
  }
  const b = roomBox(here);
  const f = b.f;
  const tier = sv.gear && sv.gear.body ? sv.gear.body.tier : 0;
  if (here === 'bunks' || here === 'infirmary') {
    const bed = here === 'bunks' ? b.x + 11 : b.x + 12;
    blit(g, SPRITES.down(), bed, here === 'bunks' ? f - 3 : f - 4, false);
    zz(bed + 6, f - 10);
  } else if (here === 'storage') {
    const t = (Math.sin(clock * 1.4) + 1) / 2;
    const x = b.x + 8 + t * 14;
    blit(g, SPRITES.survivor(Math.floor(clock * 6) % 2, tier), x, f, Math.cos(clock * 1.4) < 0);
    rect(x - 2, f - 17, 5, 4, '#9a6a3c');
  } else {
    const spot = { kitchen: [b.x + 16, true], study: [b.x + 21, true], workshop: [b.x + 15, true], lab: [b.x + 17, true] }[here] || [b.x + 20, false];
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
    blit(g, SPRITES.dog(0), d.x + ROOM_W - 6, d.f, true);
  }
  if (view.waiting) {
    zz(b.x + ROOM_W / 2, b.y + 10);
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
    hole(sx(-9), LANE - 4, flick, flick, 0.9);
    glows.push([sx(-9), LANE - 4, flick, flick, 'rgba(255,140,50,0.16)']);
  }
  if (sv.rebuild > 0) {
    hole(sx(0), LANE - 6, 22, 22, 0.9);
    glows.push([sx(0), LANE - 6, 22, 22, 'rgba(255,120,40,0.18)']);
  }
  if (sv.lab) {
    hole(sx(8), LANE - 10, 10, 10, 0.8);
    glows.push([sx(8), LANE - 10, 10, 10, 'rgba(110,255,150,0.15)']);
  }
  for (const t of tracers) {
    hole(t.x2, t.y2, 8, 8, 0.8);
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

// ---------- the frame ----------

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
  const target = sv.x !== 0 ? Math.max(-50, Math.min(50, sx(sv.x) + camX - W / 2)) * 0.35 : 0;
  camX += (target - camX) * (1 - Math.exp(-dt * 1.5));

  drawSky();
  drawLand();
  for (const s of sv.sites) {
    if (s.kind === 'building') SITE.building(sx(s.x));
  }
  for (const s of sv.sites) {
    if (s.kind !== 'building') SITE[s.kind](sx(s.x));
  }
  for (const d of sv.defenses) {
    if (d.type !== 'barricade' && sv.rebuild === 0) drawDefense(d, sx(d.x));
  }
  drawDecor();
  if (sv.rebuild === 0) {
    for (const tile of [-view.layout.wall, view.layout.wall]) {
      if (sv.shelter.level >= 3 && !view.layout.drifters.includes(tile)) drawWall(sx(tile), sv.shelter.level);
    }
  }
  drawShelter(sx(0), sv.shelter.level);
  if (sv.rebuild === 0) {
    const heavy = (sv.blueprints || []).includes('heavy');
    for (const t of view.layout.turrets) {
      drawTurret(turretSpot(t, sv.shelter.level), Math.sign(t) || 1, heavy, clock - (firing.get(t) || -9) < 0.12);
    }
    for (const d of sv.defenses) {
      if (d.type === 'barricade') drawDefense(d, sx(d.x));
    }
    for (const tile of view.layout.drifters) {
      if (sv.shelter.level >= 3) drawWall(sx(tile), sv.shelter.level);
      blit(g, SPRITES.drifter(), sx(tile), LANE - (sv.shelter.level >= 3 ? 9 : 0), tile < 0);
    }
    if ((sv.residents || []).some(r => r.role === 'lookout')) {
      const near = sv.zombies.reduce((a, z) => (!a || Math.abs(z.x) < Math.abs(a.x) ? z : a), null);
      blit(g, SPRITES.resident(0), sx(0) + 4, LANE - shelterHeight(sv.shelter.level) + 3, near ? near.x < 0 : false);
    }
  }
  for (const c of sv.crates) {
    const since = landing.has(c.x) ? clock - landing.get(c.x) : 99;
    const fall = c.kind === 'drop' ? Math.max(0, 120 - since * 60) : 0;
    (CRATE[c.kind] || CRATE.scrap)(sx(c.x), fall);
  }
  const hero = drawHero(dt);
  drawDog(hero, dt);
  const order = [...sv.zombies].sort((a, b) => (hash(a.id || 7) % 5) - (hash(b.id || 7) % 5));
  for (const z of order) drawZombie(z, dt);
  drawTufts();
  drawInside();
  drawEffects(dt);
  drawLight();
  if (view.waiting && hero) {
    const zt = (clock * 1.2) % 1;
    g.globalAlpha = 1 - zt;
    g.fillStyle = '#e8e8f8';
    g.font = '7px monospace';
    g.fillText('z', hero.x + 5 + zt * 4, LANE - 15 - zt * 8);
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
