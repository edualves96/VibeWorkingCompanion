---
name: window
description: Open the VibeWorkCompanion Survival game in a pixel-art window of its own (true), or bring it back to the status line (false).
disable-model-invocation: true
model: haiku
effort: low
argument-hint: "[true|false]"
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" *)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" --data "${CLAUDE_PLUGIN_DATA}" window $ARGUMENTS`

Show the result above to the user exactly as written, and add nothing else.
