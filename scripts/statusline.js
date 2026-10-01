'use strict';
// Claude Code status line: an info row (your previous status line if /vwc:setup found one,
// otherwise the built-in one below) plus the three companion rows.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const companion = require('./companion');

const ESC = '\x1b[';
const RESET = `${ESC}0m`;
const NEUTRAL = '39';
const MODEL = '38;2;214;200;255';
const DIR = '38;2;236;255;220';
const BRANCH = '38;2;209;213;219';

// Reads .git/HEAD directly; spawning git every second costs more than the rest of the script.
function gitBranch(start) {
  let d = start;
  for (;;) {
    const dotGit = path.join(d, '.git');
    try {
      let gitDir = dotGit;
      if (fs.statSync(dotGit).isFile()) {
        const m = /gitdir:\s*(.+)/.exec(fs.readFileSync(dotGit, 'utf8'));
        if (!m) {
          return null;
        }
        gitDir = path.resolve(d, m[1].trim());
      }
      const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
      const m = /^ref: refs\/heads\/(.+)$/.exec(head);
      return m ? m[1] : 'HEAD';
    } catch {}
    const up = path.dirname(d);
    if (up === d) {
      return null;
    }
    d = up;
  }
}

function formatReset(seconds) {
  const s = Math.max(0, seconds);
  const days = Math.floor(s / 86400);
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor(s / 60) % 60;
  if (hours >= 24) {
    return `${days}d${hours % 24}h`;
  }
  return `${hours}h${String(minutes).padStart(2, '0')}m`;
}

function infoRow(data) {
  const cwd = (data.workspace && data.workspace.current_dir) || data.cwd || '';
  const model = (data.model && data.model.display_name) || '';

  let contextText = null;
  let modelIcon = '';
  const cw = data.context_window;
  if (cw && cw.used_percentage != null) {
    const usedPct = Number(cw.used_percentage);
    const windowSize = cw.context_window_size > 0 ? cw.context_window_size : 200000;
    const usedTok = (cw.total_input_tokens || 0) + (cw.total_output_tokens || 0);

    let colorCode = '38;2;34;197;94';
    let icon = '';
    if (usedPct >= 80) {
      colorCode = '38;2;239;68;68';
      icon = '💀 ';
    } else if (usedPct >= 70) {
      colorCode = '38;2;249;115;22';
      icon = '🚨 ';
    } else if (usedPct >= 60) {
      colorCode = '38;2;234;179;8';
      icon = '⚠️ ';
    }

    const filled = Math.max(0, Math.min(10, Math.floor(usedPct / 10)));
    const bar = '▰'.repeat(filled) + '▱'.repeat(10 - filled);
    const tokenStr = `${usedTok.toLocaleString()} / ${windowSize.toLocaleString()}`;
    contextText = `${ESC}${colorCode}m${bar} ${Math.round(usedPct)}%${RESET} ${ESC}${NEUTRAL}m(${tokenStr})${RESET}`;
    if (icon) {
      modelIcon = `${ESC}${colorCode}m${icon}${RESET}`;
    }
  }

  let rateLimitText = null;
  const rl = data.rate_limits;
  if (rl) {
    const now = Math.floor(Date.now() / 1000);
    const bits = [];
    for (const [key, icon] of [['five_hour', '⏳'], ['seven_day', '📅']]) {
      const w = rl[key];
      if (w && w.resets_at) {
        const pct = w.used_percentage != null ? ` (${Math.round(w.used_percentage)}%)` : '';
        bits.push(`${icon} ${formatReset(w.resets_at - now)}${pct}`);
      }
    }
    if (bits.length > 0) {
      rateLimitText = `${ESC}${NEUTRAL}m${bits.join(' ')}${RESET}`;
    }
  }

  const parts = [`${modelIcon}${ESC}${MODEL}m${model}${RESET}`, `${ESC}${DIR}m${path.basename(cwd)}${RESET}`];
  const branch = cwd ? gitBranch(cwd) : null;
  if (branch) {
    parts.push(`${ESC}${BRANCH}m${branch}${RESET}`);
  }
  if (contextText) {
    parts.push(contextText);
  }
  if (rateLimitText) {
    parts.push(rateLimitText);
  }
  return parts.join(` ${ESC}1;37m|${RESET} `);
}

// /vwc:setup saves the status line the user had before, so installing the companion doesn't
// take it away. It runs with the same input and its rows go on top. Returns null when there
// is none or it fails, and the built-in info row is used instead.
function previousRows(input) {
  let prev;
  try {
    prev = JSON.parse(fs.readFileSync(path.join(companion.DIR, 'previous-statusline.json'), 'utf8'));
  } catch {
    return null;
  }
  if (!prev || !prev.command) {
    return null;
  }
  // Claude Code runs status line commands in bash when Git Bash is installed, so try that first on Windows.
  const shells = process.platform === 'win32' ? ['bash', undefined] : [undefined];
  for (const shell of shells) {
    try {
      const out = execSync(prev.command, { input, shell, timeout: 1500, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
      const rows = out.split('\n').map(r => r.replace(/\r$/, '')).filter(r => r.trim());
      return rows.length > 0 ? rows : null;
    } catch (e) {
      if (e.code !== 'ENOENT') {
        return null;
      }
    }
  }
  return null;
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  raw += chunk;
});
process.stdin.on('end', () => {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return;
  }
  const now = Date.now();
  let root = null;
  let error = null;
  try {
    // Runs even when the companion is hidden, so the hero keeps adventuring in the background.
    root = companion.onStatusLine(data, now);
  } catch (e) {
    error = e;
  }
  // /vwc:hide and /vwc:show choose what is drawn. Both hidden prints nothing, which leaves the status line empty.
  const show = root ? companion.display(root) : { bar: true, companion: true };
  const rows = [];
  if (show.bar) {
    rows.push(...(previousRows(raw) || [infoRow(data)]));
  }
  if (show.companion) {
    try {
      if (error) {
        throw error;
      }
      // Claude Code pads the footer by 2 columns each side; 2 more stay spare so the right edge is never truncated.
      const cols = (Number(process.env.COLUMNS) || 120) - 6;
      rows.push(...companion.render(root, now, cols));
    } catch (e) {
      // A companion bug must never blank the info row.
      rows.push(`${ESC}2mcompanion error: ${e.message}${RESET}`);
    }
  }
  process.stdout.write(rows.join('\n'));
});
