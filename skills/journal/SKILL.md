---
name: journal
description: Show the VibeWorkCompanion journal - every hero's notable moments (level ups, bosses, skills and gear found, reforges, knockouts, achievements) by day, with the time.
disable-model-invocation: true
model: haiku
effort: low
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" *)
---

Your heroes' journal:

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" --data "${CLAUDE_PLUGIN_DATA}" journal`

Show the result above to the user exactly as written, in a code block, and add nothing else.
