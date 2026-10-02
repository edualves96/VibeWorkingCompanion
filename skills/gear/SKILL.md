---
name: gear
description: List the gear every VibeWorkCompanion hero wears (helmet, chest, pants, shoulders, gloves, boots) with each piece's rarity, power and stats.
disable-model-invocation: true
model: haiku
effort: low
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" *)
---

Your heroes' gear:

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" --data "${CLAUDE_PLUGIN_DATA}" gear`

Show the result above to the user exactly as written, in a code block, and add nothing else.
