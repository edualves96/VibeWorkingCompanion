---
name: createchar
description: Start over in VibeWorkCompanion with a brand new level 1 hero of a class (mage, warrior or archer). The previous hero of that class is backed up first.
argument-hint: "[mage|warrior|archer]"
disable-model-invocation: true
model: haiku
effort: low
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" *)
---

Result of creating a new companion character:

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" --data "${CLAUDE_PLUGIN_DATA}" new "$ARGUMENTS"`

Show the result above to the user exactly as written, in a code block, and add nothing else.
