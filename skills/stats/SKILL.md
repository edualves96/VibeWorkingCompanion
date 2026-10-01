---
name: stats
description: 'Move the VibeWorkCompanion hero stats row (level, XP, weapon, zone, kills) "above" or "below" the map. With no argument it switches to the other place.'
argument-hint: "[above|below]"
disable-model-invocation: true
model: haiku
effort: low
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" *)
---

Result of moving the stats row:

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" --data "${CLAUDE_PLUGIN_DATA}" stats "$ARGUMENTS"`

Show the result above to the user exactly as written, in a code block, and add nothing else.
