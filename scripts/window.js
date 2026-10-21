'use strict';
// The Survival game in a window of its own: /vwc:window true opens it, /vwc:window false brings it
// back to the status line. The game still runs in the status line's ticks (survival.js); the
// window only looks at it, through a small server that only this machine can reach (127.0.0.1,
// with a key in the address) and that reads survival.json.
//
// The window is Edge or Chrome as an app window, with a profile of its own: it is then a browser of
// its own, so the server sees it close and stops, and the status line shows the game again. With
// neither browser, a normal tab opens, and the server stops once the tab has been quiet for
// QUIET_MS. It also stops when the adventure is put back on display.
//
//   node window.js serve      the server itself (started by open(), detached)

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const survival = require('./survival');

const DIR = process.env.COMPANION_DIR || process.env.CLAUDE_PLUGIN_DATA || __dirname;
const INFO_FILE = path.join(DIR, 'window.json');     // { pid, port, key, browser } while it is open
const CLOSE_FILE = path.join(DIR, 'window.close');   // asks the server to close the window
const PROFILE = path.join(os.tmpdir(), 'vwc-window');
const PAGES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/scene.js': ['scene.js', 'text/javascript; charset=utf-8'],
  '/sprites.js': ['sprites.js', 'text/javascript; charset=utf-8'],
};
const SIZE = [1000, 700];
const START_MS = 6000;         // how long open() waits for the server
const STOP_MS = 5000;          // and close() for it to stop
const CLOSING_MS = 1500;       // the page gets this long to close itself before the browser is ended
const HANDOFF_MS = 4000;       // a browser that exits this soon handed the window to one already running
const QUIET_MS = 3 * 60 * 1000;
const STALE_MS = 5000;         // a status line silent this long means nobody is working

function readInfo() {
  try {
    return JSON.parse(fs.readFileSync(INFO_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

function remove(file) {
  try { fs.unlinkSync(file); } catch {}
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Ends a process and everything it started (a browser has many).
function kill(pid) {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  } else {
    try { process.kill(pid, 'SIGTERM'); } catch {}
  }
}

// Whether the window is open: its server is running. Called on every status line render.
function isOpen() {
  const info = readInfo();
  return !!info && alive(info.pid);
}

// ---------- the commands (cli.js) ----------

// Starts the server, detached so it outlives the command, and waits until it is listening.
function open() {
  remove(INFO_FILE);
  remove(CLOSE_FILE);
  const child = spawn(process.execPath, [__filename, 'serve'], {
    detached: true, stdio: 'ignore', windowsHide: true, env: { ...process.env, COMPANION_DIR: DIR },
  });
  child.unref();
  for (let waited = 0; waited < START_MS; waited += 50) {
    const info = readInfo();
    if (info && info.port) {
      return true;
    }
    sleep(50);
  }
  return false;
}

// Asks the server to close the window, and makes sure it did.
function close() {
  const info = readInfo();
  if (!info || !alive(info.pid)) {
    remove(INFO_FILE);
    return false;
  }
  fs.writeFileSync(CLOSE_FILE, '');
  for (let waited = 0; waited < STOP_MS && alive(info.pid); waited += 50) {
    sleep(50);
  }
  if (alive(info.pid)) {
    kill(info.pid);
    if (info.browser) {
      kill(info.browser);
    }
  }
  remove(INFO_FILE);
  remove(CLOSE_FILE);
  return true;
}

// /vwc:window [true|false]: no choice switches.
function command(arg, now) {
  const key = String(arg || '').trim().toLowerCase();
  const on = ['true', 'on', 'open', 'yes'].includes(key) ? true
    : ['false', 'off', 'close', 'no'].includes(key) ? false
      : key ? null : !isOpen();
  if (on === null) {
    return `"${arg}" is not true or false. Usage: /vwc:window <true | false>, or /vwc:window alone to switch.`;
  }
  if (!on) {
    return close() ? '↩ Survival is back in the status line.' : 'Survival is not in a window: it is in the status line already.';
  }
  if (isOpen()) {
    return '🪟 Survival is already in its window. /vwc:window false brings it back to the status line.';
  }
  const switched = !survival.isShown();
  if (switched) {
    survival.setGame('survival', now);
  }
  if (!open()) {
    return 'Companion error: the window could not start.';
  }
  return `🪟 Survival opens in its own window${switched ? ', and is now the game on display' : ''}. The status line shows a single line until you close the window or run /vwc:window false.`;
}

// ---------- the server ----------

// Edge or Chrome, to open the page as an app window, or null.
function findBrowser() {
  const candidates = [];
  if (process.platform === 'win32') {
    for (const root of [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, process.env.LOCALAPPDATA]) {
      if (root) {
        candidates.push(path.join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
        candidates.push(path.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'));
      }
    }
  } else if (process.platform === 'darwin') {
    candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
    candidates.push('/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge');
    candidates.push('/Applications/Chromium.app/Contents/MacOS/Chromium');
  } else {
    for (const dir of (process.env.PATH || '').split(path.delimiter)) {
      for (const name of ['google-chrome', 'chromium', 'chromium-browser', 'microsoft-edge']) {
        candidates.push(path.join(dir, name));
      }
    }
  }
  return candidates.find(file => fs.existsSync(file)) || null;
}

// Opens the page: as an app window (returning that browser's process), or in the default browser.
function launch(url) {
  const exe = findBrowser();
  if (exe) {
    return spawn(exe, [
      `--app=${url}`, `--user-data-dir=${PROFILE}`, `--window-size=${SIZE.join(',')}`,
      '--no-first-run', '--no-default-browser-check', '--disable-sync',
    ], { stdio: 'ignore', windowsHide: false });
  }
  const opener = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  spawn(opener[0], opener[1], { stdio: 'ignore', detached: true, windowsHide: true }).unref();
  return null;
}

function serve() {
  const companion = require('./companion');
  const key = crypto.randomBytes(16).toString('hex');
  let port = 0;
  let browser = null;
  let started = 0;
  let lastSeen = Date.now();
  let closing = 0;
  // The save is read again only when it has changed, about once a step.
  let saved = { at: -1, sv: null };

  const state = now => {
    const at = fs.statSync(path.join(DIR, 'survival.json')).mtimeMs;
    if (at !== saved.at) {
      saved = { at, sv: survival.load(now) };
    }
    const sv = saved.sv;
    const view = survival.windowView(sv, {
      now, night: companion.isNight(now), light: companion.daylight(now),
      active: !!sv.active && now - sv.lastTick < STALE_MS,
    });
    return { ...view, now, closing: closing > 0 };
  };

  const server = http.createServer((req, res) => {
    // Only pages asked for by this address: no other site can reach it through a name of its own.
    if (req.headers.host !== `127.0.0.1:${port}`) {
      res.writeHead(403).end();
      return;
    }
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (url.pathname === '/state') {
      if (url.searchParams.get('k') !== key) {
        res.writeHead(403).end();
        return;
      }
      lastSeen = Date.now();
      let body;
      try {
        body = JSON.stringify(state(lastSeen));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'text/plain' }).end(String(e.message));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(body);
      return;
    }
    const page = PAGES[url.pathname];
    if (!page) {
      res.writeHead(404).end();
      return;
    }
    fs.readFile(path.join(__dirname, 'window', page[0]), (err, data) => {
      if (err) {
        res.writeHead(500).end();
        return;
      }
      res.writeHead(200, { 'Content-Type': page[1], 'Cache-Control': 'no-store' }).end(data);
    });
  });

  const stop = () => {
    if (browser && browser.exitCode === null) {
      kill(browser.pid);
    }
    const info = readInfo();
    if (info && info.pid === process.pid) {
      remove(INFO_FILE);
    }
    process.exit(0);
  };

  server.listen(0, '127.0.0.1', () => {
    port = server.address().port;
    const url = `http://127.0.0.1:${port}/?k=${key}`;
    fs.writeFileSync(INFO_FILE, JSON.stringify({ pid: process.pid, port, key }));
    if (!process.env.VWC_WINDOW_NO_BROWSER) {
      browser = launch(url);
      started = Date.now();
    }
    if (browser) {
      fs.writeFileSync(INFO_FILE, JSON.stringify({ pid: process.pid, port, key, browser: browser.pid }));
      browser.on('error', () => {
        browser = null;
      });
      browser.on('exit', () => {
        // Closed by hand: back to the status line. Gone at once: it handed the window over to a
        // browser already running on that profile, so the tab's silence tells when it closes.
        if (closing || Date.now() - started > HANDOFF_MS) {
          stop();
        }
        browser = null;
      });
    }
  });

  setInterval(() => {
    const now = Date.now();
    if (!closing && (fs.existsSync(CLOSE_FILE) || !survival.isShown())) {
      closing = now;
      remove(CLOSE_FILE);
    }
    if (closing && now - closing > CLOSING_MS) {
      stop();
    }
    if (!closing && !browser && now - lastSeen > QUIET_MS) {
      stop();
    }
  }, 250);
}

if (require.main === module && process.argv[2] === 'serve') {
  serve();
}

module.exports = { isOpen, open, close, command, serve, INFO_FILE };
