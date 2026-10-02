---
name: card
description: Show a short card of a VibeWorkCompanion hero (class, level, weapon, skills, where it is, kills, bosses, best gear, work time and achievements) to paste in Slack or a pull request.
argument-hint: "[mage|warrior|archer|all]"
disable-model-invocation: true
model: haiku
effort: low
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" *)
---

Your hero's card:

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" --data "${CLAUDE_PLUGIN_DATA}" card "$ARGUMENTS"`

Show the result above to the user exactly as written, in a code block, and add nothing else.
