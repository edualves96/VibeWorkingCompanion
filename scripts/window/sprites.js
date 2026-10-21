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
