---
name: journal
description: Show the VibeWorkCompanion journal - the heroes' notable moments (level ups, bosses, skills and gear found, reforges, knockouts, achievements) by day, with the time. A class shows one hero's, "all" everything kept.
argument-hint: "[mage|warrior|archer] [all]"
disable-model-invocation: true
model: haiku
effort: low
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" *)
---

Your heroes' journal:

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" --data "${CLAUDE_PLUGIN_DATA}" journal "$ARGUMENTS"`

Show the result above to the user exactly as written, in a code block, and add nothing else.
