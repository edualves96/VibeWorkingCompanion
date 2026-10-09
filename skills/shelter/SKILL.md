---
name: shelter
description: Show the inside of the Survival game's shelter in VibeWorkCompanion (walls, turrets, scrap, weapon, waves).
disable-model-invocation: true
model: haiku
effort: low
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" *)
---

Your shelter:

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" --data "${CLAUDE_PLUGIN_DATA}" shelter`

Show the result above to the user exactly as written, in a code block, and add nothing else.
