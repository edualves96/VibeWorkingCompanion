---
name: show
description: 'Show a hidden part of the VibeWorkCompanion status line again: "bar" (the info row), "companion" (the hero rows) or "all".'
argument-hint: "[bar|companion|all]"
disable-model-invocation: true
model: haiku
effort: low
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" *)
---

Result of showing part of the status line:

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" --data "${CLAUDE_PLUGIN_DATA}" show "$ARGUMENTS"`

Show the result above to the user exactly as written, in a code block, and add nothing else.
