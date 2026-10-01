---
name: commands
description: List every VibeWorkCompanion command, with your heroes and what is currently shown or hidden.
disable-model-invocation: true
model: haiku
effort: low
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" *)
---

VibeWorkCompanion commands and current state:

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" --data "${CLAUDE_PLUGIN_DATA}" commands`

Show the result above to the user exactly as written, in a code block, and add nothing else.
