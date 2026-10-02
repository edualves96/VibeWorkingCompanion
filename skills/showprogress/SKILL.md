---
name: showprogress
description: 'Show or hide the VibeWorkCompanion hero''s progress (the stats row with name, level, XP, weapon, zone and kills, and the life bar) to see only the map: "on" or "off". With no argument it switches.'
argument-hint: "[on|off]"
disable-model-invocation: true
model: haiku
effort: low
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" *)
---

Result of showing or hiding the hero's progress:

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" --data "${CLAUDE_PLUGIN_DATA}" progress "$ARGUMENTS"`

Show the result above to the user exactly as written, in a code block, and add nothing else.
