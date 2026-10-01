'use strict';
// Character commands for the companion, used by the /vwc:chooseclass and /vwc:createchar skills:
//   node cli.js --data <dir> class <mage|warrior|archer>   switch class (each class keeps its own save)
//   node cli.js --data <dir> new <mage|warrior|archer>     start over with a fresh hero of that class
//   node cli.js --data <dir> status                        list every class's hero
//   node cli.js --data <dir> hide <bar|companion|all>      stop drawing a part of the status line
//   node cli.js --data <dir> show <bar|companion|all>      draw it again
//   node cli.js --data <dir> commands                      list every command, plus the current state
// --data is the plugin's data folder, where the save lives. Skills don't get it as an
// environment variable, so they pass it here.
// Always exits 0: a non-zero exit would abort the slash command before Claude can reply.

const args = process.argv.slice(2);
const dataAt = args.indexOf('--data');
if (dataAt >= 0) {
  process.env.COMPANION_DIR = args[dataAt + 1];
  args.splice(dataAt, 2);
}

const companion = require('./companion');

const [command, arg] = args;
const names = Object.keys(companion.CLASSES).join(' | ');
const p = companion.COMMAND_PREFIX;
const usage = `Usage: ${p}chooseclass <${names}> or ${p}createchar <${names}>`;
const now = Date.now();

const COMMANDS = [
  ['chooseclass <mage|warrior|archer>', 'switch class; each class keeps its own save'],
  ['createchar <mage|warrior|archer>', 'start over with a new level 1 hero (the old one is backed up)'],
  ['hide <bar|companion|all>', 'hide the status bar, the companion, or both'],
  ['show <bar|companion|all>', 'show them again'],
  ['setup', 'turn the companion status line on (an existing status line stays on top)'],
  ['setup remove', 'turn it off and put back your previous status line'],
  ['commands', 'this list'],
];

function commands() {
  const width = Math.max(...COMMANDS.map(([c]) => c.length)) + p.length + 2;
  const list = COMMANDS.map(([c, what]) => `  ${(p + c).padEnd(width)}${what}`);
  const shown = companion.display(companion.load(now));
  const state = `status bar ${shown.bar ? 'shown' : 'hidden'} · companion ${shown.companion ? 'shown' : 'hidden'}`;
  return ['VibeWorkCompanion commands', ...list, '', 'Your heroes:', companion.status(now), '', `Display: ${state}`].join('\n');
}

function run() {
  if (command === 'status') {
    return companion.status(now);
  }
  if (command === 'commands') {
    return commands();
  }
  if (command === 'hide' || command === 'show') {
    const part = companion.partKey(arg);
    if (!part) {
      const what = arg ? `"${arg}" is not something that can be hidden.` : 'Say what to hide or show.';
      return `${what} Usage: ${p}hide <bar | companion | all> or ${p}show <bar | companion | all>`;
    }
    return companion.setVisible(part, command === 'show', now);
  }
  if (command !== 'class' && command !== 'new') {
    return usage;
  }
  const cls = companion.classKey(arg);
  if (!cls) {
    const what = arg ? `"${arg}" is not a class.` : 'Pick a class.';
    return `${what} ${usage}\n\n${companion.status(now)}`;
  }
  return command === 'class' ? companion.chooseClass(cls, now) : companion.createCharacter(cls, now);
}

try {
  console.log(run());
} catch (e) {
  console.log(`Companion error: ${e.message}`);
}
