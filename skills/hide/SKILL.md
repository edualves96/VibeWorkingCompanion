---
name: hide
description: 'Hide part of the VibeWorkCompanion status line: "bar" (the info row), "companion" (the hero rows; the hero keeps playing in the background) or "all".'
argument-hint: "[bar|companion|all]"
disable-model-invocation: true
model: haiku
effort: low
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" *)
---

Result of hiding part of the status line:

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" --data "${CLAUDE_PLUGIN_DATA}" hide "$ARGUMENTS"`

Show the result above to the user exactly as written, in a code block, and add nothing else.
