'use strict';
// Character commands for the companion, used by the /vwc:chooseclass and /vwc:createchar skills:
//   node cli.js --data <dir> class <mage|warrior|archer>   switch class (each class keeps its own save)
//   node cli.js --data <dir> new <mage|warrior|archer>     start over with a fresh hero of that class
//   node cli.js --data <dir> status                        list every class's hero
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

function run() {
  if (command === 'status') {
    return companion.status(now);
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
