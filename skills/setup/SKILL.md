---
name: setup
description: Turn on the VibeWorkCompanion status line (run once after installing the plugin), or turn it off with "remove" before uninstalling.
argument-hint: "[remove]"
disable-model-invocation: true
model: haiku
effort: low
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.js" *)
---

Result of the VibeWorkCompanion setup:

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.js" "${CLAUDE_PLUGIN_DATA}" "$ARGUMENTS"`

Show the result above to the user exactly as written, in a code block, and add nothing else.
