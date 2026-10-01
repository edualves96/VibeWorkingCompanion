---
name: skills
description: List the VibeWorkCompanion heroes' skills with their stats (rarity, power, damage, cooldown, bonus) and where the next skill comes from.
disable-model-invocation: true
model: haiku
effort: low
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" *)
---

Your heroes' skills:

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" --data "${CLAUDE_PLUGIN_DATA}" skills`

Show the result above to the user exactly as written, in a code block, and add nothing else.
