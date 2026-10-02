---
name: statistics
description: Show each VibeWorkCompanion hero's statistics (work time, tokens, Claude turns with the longest, shortest and average, XP, kills, bosses, finds and more) and the totals of all heroes.
disable-model-invocation: true
model: haiku
effort: low
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" *)
---

Your heroes' statistics:

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" --data "${CLAUDE_PLUGIN_DATA}" statistics`

Show the result above to the user exactly as written, in a code block, and add nothing else.
