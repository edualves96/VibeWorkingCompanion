---
name: achievements
description: List the VibeWorkCompanion achievements, which ones are earned and how close the others are.
disable-model-invocation: true
model: haiku
effort: low
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" *)
---

Your achievements:

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" --data "${CLAUDE_PLUGIN_DATA}" achievements`

Show the result above to the user exactly as written, in a code block, and add nothing else.
