---
name: dex
description: Show the VibeWorkCompanion dex - the critters the Trainer has caught, by biome, his partner and the last ones new in the dex. "all" lists all 151, caught, seen or not met yet.
argument-hint: "[all]"
disable-model-invocation: true
model: haiku
effort: low
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" *)
---

Your trainer's dex:

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" --data "${CLAUDE_PLUGIN_DATA}" dex "$ARGUMENTS"`

Show the result above to the user exactly as written, in a code block, and add nothing else.
