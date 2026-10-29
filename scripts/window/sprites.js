'use strict';
// The window's pixel art: each sprite is a map of characters, one per pixel ('.' is see-through),
// with a palette. They all face right and are flipped to face left. Bigger things (the shelter,
// towers, places) are drawn in scene.js from rectangles.

const PAL = {
  // people
  h: '#3b2a1a', k: '#e0ac69', K: '#b98552', e: '#1b1b1b', p: '#3d3d52', P: '#2a2a3a', s: '#2b1d14',
  // zombies
  g: '#86a85e', G: '#5d7b3f', r: '#e04040', t: '#8b6f58', T: '#6b5444', q: '#4b4a5e', m: '#5b1f1f',
  v: '#9ccf4f', V: '#6c9a2e', L: '#d8ff6a', w: '#8e8e94', W: '#6a6a70', R: '#b33a2e', D: '#5e2a26',
  y: '#ffd23f', B: '#e8e2d0',
  // the drifter, the dog, the vehicles
  n: '#6b4423', o: '#b5523b', O: '#8c3c2a', j: '#3e5a86', d: '#9a6a3c', u: '#5f3f21',
  a: '#5f6b3a', A: '#47512b', c: '#2e2e2e', x: '#9fd3e6',
};

// Jackets by the tier of the vest he wears: rags, cloth, leather, kevlar, tactical.
const JACKETS = [['#8a7a5c', '#6a5d45'], ['#4a6fa5', '#34507a'], ['#7a4b2a', '#5a361e'], ['#5d6640', '#454c2f'], ['#2f3238', '#1f2125']];

const MAPS = {
  survivor: [
    '...hhh...',
    '..hhhhh..',
    '..hkkkh..',
    '..kkkek..',
    '..kkkkK..',
    '...kkK...',
    '..ccccc..',
    '.kcCcccc.',
    '.kcCccck.',
    '..cCccc..',
    '..ppppp..',
  ],
  legs: [['..pp.pp..', '..pp.pp..', '..ss.ss..'], ['..pp..pp.', '.pp...pp.', '.ss....ss']],
  down: [
    '..............',
    '..............',
    '.hh.kk..ccc...',
    'hhhkkkccccccpp',
    '.hh.kk.cCccppss',
  ],
  walker: [
    '...ggg...',
    '..ggggg..',
    '..ggrgr..',
    '..ggggg..',
    '...gGg...',
    '..ttttt..',
    '..tttttgg',
    '..tTtTtgg',
    '..ttttt..',
    '..qqqqq..',
  ],
  zlegs: [['..qq.qq..', '..qq..q..', '..GG..G..'], ['..qq.qq..', '.qq...qq.', '.GG...GG.']],
  brute: [
    '....gggg....',
    '...gggggg...',
    '...grggrg...',
    '...gggggg...',
    '...ggmmgg...',
    '..tttttttt..',
    '.gttttttttgg',
    'ggtTttttTtgg',
    'gg.tttttt.gg',
    'g..tTttTt..g',
    '...tttttt...',
    '...qqqqqq...',
  ],
  blegs: [['...qq..qq...', '...qq..qq...', '..GGG..GGG..'], ['...qq..qq...', '..qq....qq..', '.GGG....GGG.']],
  runner: [
    '........w.w',
    '.......wwww',
    'w.....wwwrw',
    '.wwwwwwwwWW',
    '.wWwwwwww..',
  ],
  rlegs: [['.w.w...w.w.', '.w..w..w..w'], ['..ww...ww..', '.w..w.w..w.']],
  spitter: [
    '...vvv...',
    '..vvvvv..',
    '..vrvvr..',
    '..vvvvv..',
    '..vvLLv..',
    '.vvvvvvv.',
    'vvVvvvVvv',
    'vvvvvvvvv',
    '.vvVvvvv.',
    '..vvvvv..',
  ],
  tyrant: [
    '.....RRRRR.....',
    '....RRRRRRR....',
    '...BRyRRRyRB...',
    '....RRRRRRR....',
    '....RRmmmRR....',
    '...RRRRRRRRR...',
    '.RRDDDDDDDDDRR.',
    'RRRDDDDDDDDDRRR',
    'RR.DDDDDDDDD.RR',
    'RR.DDDDDDDDD.RR',
    'B..DDDDDDDDD..B',
    '...DDDDDDDDD...',
    '...qqqqqqqqq...',
    '...qqqq.qqqq...',
  ],
  tlegs: [['...qqq...qqq...', '...qqq...qqq...', '...qqq...qqq...', '..RRRR...RRRR..'],
    ['...qqq...qqq...', '..qqq.....qqq..', '..qqq.....qqq..', '.RRRR.....RRRR.']],
  drifter: [
    '...nnn...',
    '.nnnnnnn.',
    '..kkkkk..',
    '..kkkek..',
    '..kkkkk..',
    '.ooooooo.',
    'oooOoooOo',
    'ooooooooo',
    '.ooooooo.',
    '..jjjjj..',
    '..jj.jj..',
    '..jj.jj..',
    '..nn.nn..',
  ],
  dog: [
    '.......dd',
    'd.....ddc',
    '.ddddddd.',
    '.dddddud.',
  ],
  doglegs: [['.d.d..d.d', '.d.d..d.d'], ['..d.d.d.d', '.d...d..d']],
  tank: [
    '..........cc..........',
    '........aaaaaccccccccc',
    '.......aaaaaaa........',
    '..aaaaaaaaaaaaaaaaa...',
    '.aAaaaaaaaaaaaaaaaaa..',
    'cccccccccccccccccccc..',
    'cWcWcWcWcWcWcWcWcWcc..',
    '.cccccccccccccccccc...',
  ],
  heli: [
    '...........c..............',
    '........aaaaaaa...........',
    'aaa....aaaaaaaaaxx........',
    '.aaaaaaaaaaaaaaaxxx.......',
    '..A....aaaaaaaaaaa........',
    '.........c....c...........',
    '.......cccccccccccc.......',
  ],
  pickup: [
    '.............oooooo...',
    '............oxxxxxoo..',
    '............oxxxxxooo.',
    'oo.........ooooooooooo',
    'ooooooooooooooooooooyo',
    'OOOOOOOOOOOOOOOOOOOOOO',
    '.Occc.........OcccO...',
    '..cWc..........cWc....',
    '...c............c.....',
  ],
  // The zombies of 1.31.0: a screamer with its mouth wide open, a swollen bloater, an armored
  // juggernaut, rats and bats, raiders (people, with guns), and October's pumpkin heads and clowns.
  screamer: [
    '...ggg...',
    '..ggggg..',
    '..grgrg..',
    '..gmmmg..',
    '..gmmmg..',
    '...gmg...',
    '..ttttt..',
    '.gtttttg.',
    'g.tTtTt.g',
    '..ttttt..',
    '..qqqqq..',
  ],
  bloater: [
    '....vvvv....',
    '...vvvvvv...',
    '...vrvvrv...',
    '...vvvvvv...',
    '..vvvLLvvv..',
    '.vvvvvvvvvv.',
    'vvVvvLvvvVvv',
    'vvvvvvvvvvvv',
    'vvvLvvvvLvvv',
    '.vvvvvvvvvv.',
    '..vvVvvVvv..',
    '...qqqqqq...',
  ],
  juggernaut: [
    '.....gggg.....',
    '....gggggg....',
    '...wgrggrgw...',
    '...wggggggw...',
    '....ggmmgg....',
    '..wwwwwwwwww..',
    '.wwWwwwwwwWww.',
    'gwwwwwwwwwwwwg',
    'ggwWwwwwwwWwgg',
    'gg.wwwwwwww.gg',
    'g..wWwwwwWw..g',
    '...wwwwwwww...',
    '...qqqqqqqq...',
  ],
  jlegs: [['...qqq..qqq...', '...qqq..qqq...', '..GGGG..GGGG..'], ['...qqq..qqq...', '..qqq....qqq..', '.GGGG....GGGG.']],
  rat: [
    '......w.',
    '..wwwwww',
    '.wwwwwrw',
    'w.wwwww.',
  ],
  ratlegs: [['..w..w..'], ['.w....w.']],
  // A bat's two wing beats.
  bat: [[
    'w.......w',
    'ww.....ww',
    '.wwrwrww.',
    '..wwwww..',
    '....w....',
  ], [
    '...www...',
    '..wrwrw..',
    '.wwwwwww.',
    'ww.....ww',
    'w.......w',
  ]],
  raider: [
    '..PPPPP....',
    '.PPPPPPP...',
    '..PkkkP....',
    '..keeek....',
    '..kkkkk....',
    '...kkK.....',
    '..PPPPP....',
    '.PPpPPPPkcc',
    '.kPpPPP.c..',
    '..PpPPP....',
    '..ppppp....',
  ],
  pumpkin: [
    '....G....',
    '..ooooo..',
    '.ooyoyoo.',
    '.ooooooo.',
    '.ooyyyoo.',
    '..ooooo..',
    '..ttttt..',
    '..tttttgg',
    '..tTtTtgg',
    '..ttttt..',
    '..qqqqq..',
  ],
  clown: [
    '.R.....R.',
    'RRBBBBBRR',
    '.RBeBeBR.',
    '..BBrBB..',
    '..BrrrB..',
    '...BBB...',
    '..yyjyy..',
    '.ByyjyyyB',
    '.ByyjyyyB',
    '..yyjyy..',
    '..jjjjj..',
  ],
  // The tyrants that take turns with the first: the screamer queen, the behemoth (a juggernaut
  // that walks through barricades) and the brood (which splits into walkers).
  queen: [
    '....y.y.y.y....',
    '....yyyyyyy....',
    '...bbbbbbbbb...',
    '..bbBeBBBeBbb..',
    '..bbBBBBBBBbb..',
    '..bbBBmmmBBbb..',
    '..bbbBmmmBbbb..',
    '.bbbiiiiiiibbb.',
    'bb.iiiiiiiii.bb',
    'B..iiIiiiIii..B',
    'B..iiiiiiiiii.B',
    '...iiiiiiiii...',
    '..iiiiiiiiiii..',
    '..iiiiiiiiiii..',
  ],
  behemoth: [
    '.....TTTTTTT.....',
    '....TTTTTTTTT....',
    '...TTyTTTTTyTT...',
    '...TTTTTTTTTTT...',
    '..BTTTmmmmmTTTB..',
    '..B.TTTTTTTTT.B..',
    '.wwwwwwwwwwwwwww.',
    'wwwWwwwwwwwwwWwww',
    'TTwwwwwwwwwwwwwTT',
    'TTwWwwwwwwwwwWwTT',
    'TT.wwwwwwwwwww.TT',
    'TT.wWwwwwwwwWw.TT',
    'T..wwwwwwwwwww..T',
    '...wwwwwwwwwww...',
    '...qqqqqqqqqqq...',
  ],
  hlegs: [['...qqqq...qqqq...', '...qqqq...qqqq...', '..TTTTT...TTTTT..'], ['...qqqq...qqqq...', '..qqqq.....qqqq..', '.TTTTT.....TTTTT.']],
  brood: [
    '......ggg......',
    '.....ggggg.....',
    '.....grgrg.....',
    '.....ggmgg.....',
    '...MMMMMMMMM...',
    '..MMLMMMMMLMM..',
    '.MMMMMgrgMMMMM.',
    'MMLMMMMMMMMMLMM',
    'MMMMgrgMMMMMMMM',
    'MMMMMMMMMgrgMMM',
    '.MMMLMMMMMMLMM.',
    '..MMMMMMMMMMM..',
    '...MMMMMMMMM...',
    '....MMMMMMM....',
  ],
  brlegs: [['...q.q.q.q.q...', '..q.q.q.q.q.q..'], ['..q.q.q.q.q.q..', '...q.q.q.q.q...']],
  // The passing trader and his camel, with a striped blanket over its hump.
  trader: [
    '...BBB...',
    '..BBBBB..',
    '..kkkkk..',
    '..kkkek..',
    '..kkkkk..',
    '.jjjjjjj.',
    'jjjJjjjJj',
    'jjjjjjjjj',
    '.jjjjjjj.',
    '.jjjjjjj.',
    '.jjjjjjj.',
    '..nn.nn..',
  ],
  camel: [
    '............dd.',
    '...........dddd',
    '....rr.....dd..',
    '...ryyr...dd...',
    '.ddrrrrddddd...',
    'ddddddddddd....',
    '.ddddddddd.....',
    '.d.d....d.d....',
    '.d.d....d.d....',
    '.u.u....u.u....',
  ],
};

const cache = new Map();

// The sprite `name` (with `legs`, a list of leg rows, under it) as a canvas, cached by `key`.
function build(key, rows, pal) {
  if (cache.has(key)) {
    return cache.get(key);
  }
  const w = Math.max(...rows.map(r => r.length));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = rows.length;
  const g = c.getContext('2d');
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = pal[row[x]];
      if (row[x] !== '.' && col) {
        g.fillStyle = col;
        g.fillRect(x, y, 1, 1);
      }
    }
  });
  cache.set(key, c);
  return c;
}

const SPRITES = {
  survivor(frame, tier) {
    const [c, C] = JACKETS[Math.max(0, Math.min(JACKETS.length - 1, tier))];
    return build(`survivor${frame}${tier}`, [...MAPS.survivor, ...MAPS.legs[frame]], { ...PAL, c, C });
  },
  down: () => build('down', MAPS.down, { ...PAL, c: JACKETS[1][0], C: JACKETS[1][1] }),
  // A resident is drawn like him, in an orange jacket.
  resident: frame => build(`resident${frame}`, [...MAPS.survivor, ...MAPS.legs[frame]], { ...PAL, c: '#d9822b', C: '#a85f1a' }),
  walker: frame => build(`walker${frame}`, [...MAPS.walker, ...MAPS.zlegs[frame]], PAL),
  brute: frame => build(`brute${frame}`, [...MAPS.brute, ...MAPS.blegs[frame]], { ...PAL, g: '#6f8a55', G: '#4d6438', t: '#5a4a3e' }),
  runner: frame => build(`runner${frame}`, [...MAPS.runner, ...MAPS.rlegs[frame]], PAL),
  spitter: frame => build(`spitter${frame}`, [...MAPS.spitter, ...MAPS.zlegs[frame]], PAL),
  boss: frame => build(`boss${frame}`, [...MAPS.tyrant, ...MAPS.tlegs[frame]], PAL),
  drifter: () => build('drifter', MAPS.drifter, PAL),
  dog: frame => build(`dog${frame}`, [...MAPS.dog, ...MAPS.doglegs[frame]], PAL),
  tank: () => build('tank', MAPS.tank, PAL),
  heli: () => build('heli', MAPS.heli, PAL),
  pickup: () => build('pickup', MAPS.pickup, PAL),
  screamer: frame => build(`screamer${frame}`, [...MAPS.screamer, ...MAPS.zlegs[frame]], { ...PAL, g: '#b4bca4', G: '#8a947a', t: '#5f5a6e', T: '#4a4658' }),
  bloater: frame => build(`bloater${frame}`, [...MAPS.bloater, ...MAPS.blegs[frame]], { ...PAL, v: '#b8c45a', V: '#8a9a3a', L: '#e8f07a' }),
  juggernaut: frame => build(`juggernaut${frame}`, [...MAPS.juggernaut, ...MAPS.jlegs[frame]], { ...PAL, g: '#6f8a55', G: '#4d6438' }),
  rat: frame => build(`rat${frame}`, [...MAPS.rat, ...MAPS.ratlegs[frame]], { ...PAL, w: '#8a7e74', r: '#ff5050' }),
  bat: frame => build(`bat${frame}`, MAPS.bat[frame], { ...PAL, w: '#4a3a4e', r: '#ff5050' }),
  raider: frame => build(`raider${frame}`, [...MAPS.raider, ...MAPS.legs[frame]], { ...PAL, P: '#22222a', p: '#2f2f3a', s: '#141414', e: '#101010', K: '#9a7048' }),
  pumpkin: frame => build(`pumpkin${frame}`, [...MAPS.pumpkin, ...MAPS.zlegs[frame]], { ...PAL, o: '#e8862a', y: '#ffd23f', G: '#4f7a2a' }),
  clown: frame => build(`clown${frame}`, [...MAPS.clown, ...MAPS.zlegs[frame]], { ...PAL, B: '#f0ece4', q: '#3e5a86', G: '#e04040' }),
  queen: frame => build(`queen${frame}`, [...MAPS.queen, ...MAPS.tlegs[frame]],
    { ...PAL, b: '#6a5a7a', B: '#c8c8d0', m: '#3a0d1a', i: '#4a2a5a', I: '#6a3a7a', q: '#3a2048', R: '#2a1a30' }),
  behemoth: frame => build(`behemoth${frame}`, [...MAPS.behemoth, ...MAPS.hlegs[frame]],
    { ...PAL, T: '#6b5a4e', w: '#7a7a82', W: '#55555c', y: '#ff5030', m: '#2a1a1a', q: '#3a3036' }),
  brood: frame => build(`brood${frame}`, [...MAPS.brood, ...MAPS.brlegs[frame]], { ...PAL, M: '#6a4a6e', L: '#c8ff6a', q: '#3a2a3e' }),
  trader: () => build('trader', MAPS.trader, { ...PAL, B: '#e8e2d0', j: '#3e6a86', J: '#2c4e66' }),
  camel: () => build('camel', MAPS.camel, { ...PAL, d: '#c8a06a', u: '#6b4a2a', r: '#b33a2e', y: '#ffd23f' }),
};

// Draws `img` with its feet at (x, y), its middle at x, facing right or (`flip`) left.
function blit(g, img, x, y, flip) {
  const left = Math.round(x - img.width / 2);
  const top = Math.round(y - img.height);
  if (!flip) {
    g.drawImage(img, left, top);
    return;
  }
  g.save();
  g.translate(left + img.width, top);
  g.scale(-1, 1);
  g.drawImage(img, 0, 0);
  g.restore();
}

window.SPRITES = SPRITES;
window.blit = blit;
window.PAL = PAL;
