---
name: game
description: Switch the VibeWorkCompanion game on display between the Adventure and the Survival game. Only the one on display advances.
disable-model-invocation: true
model: haiku
effort: low
argument-hint: "[adventure|survival]"
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" *)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" --data "${CLAUDE_PLUGIN_DATA}" game $ARGUMENTS`

Show the result above to the user exactly as written, and add nothing else.
