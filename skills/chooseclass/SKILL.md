---
name: chooseclass
description: Switch the VibeWorkCompanion hero to another class (mage, warrior or archer, or the trainer once any hero reaches level 50). Each class keeps its own save, so switching back resumes where it left off.
argument-hint: "[mage|warrior|archer|trainer]"
disable-model-invocation: true
model: haiku
effort: low
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" *)
---

Result of switching the companion's class:

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" --data "${CLAUDE_PLUGIN_DATA}" class "$ARGUMENTS"`

Show the result above to the user exactly as written, in a code block, and add nothing else.
