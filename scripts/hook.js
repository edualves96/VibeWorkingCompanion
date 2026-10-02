'use strict';
// Claude Code hook: tells the companion whether Claude is working or waiting on you.

const fs = require('fs');
const path = require('path');
const companion = require('./companion');

const at = Date.now();

// The status line launcher written by /vwc:setup lives in the plugin's data folder and reads
// this file to find the current plugin version, because the plugin folder moves on every update.
function rememberPluginRoot() {
  const root = process.env.CLAUDE_PLUGIN_ROOT;
  const data = process.env.CLAUDE_PLUGIN_DATA;
  if (!root || !data) {
    return;
  }
  const file = path.join(data, 'plugin-root.txt');
  try {
    if (fs.readFileSync(file, 'utf8') === root) {
      return;
    }
  } catch {}
  try {
    fs.mkdirSync(data, { recursive: true });
    fs.writeFileSync(file, root);
  } catch {}
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  raw += chunk;
});
process.stdin.on('end', () => {
  rememberPluginRoot();
  let ev;
  try {
    ev = JSON.parse(raw);
  } catch {
    return;
  }
  if (ev.hook_event_name === 'SessionStart') {
    try {
      require('./setup').autoSetup(process.env.CLAUDE_PLUGIN_DATA);
    } catch {}
  }
  if (!ev.session_id) {
    return;
  }
  // Only the main conversation moves the hero; subagent events would wake it while you're being
  // asked something. A subagent brings an ally instead, while it runs.
  if (ev.agent_id || ev.hook_event_name === 'SubagentStart' || ev.hook_event_name === 'SubagentStop') {
    companion.onAgentEvent(ev, at);
    return;
  }
  companion.onHookEvent(ev, at);
});
