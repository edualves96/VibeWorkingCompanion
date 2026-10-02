'use strict';
// Character commands for the companion, used by the /vwc:chooseclass and /vwc:createchar skills:
//   node cli.js --data <dir> class <mage|warrior|archer>   switch class (each class keeps its own save)
//   node cli.js --data <dir> new <mage|warrior|archer>     start over with a fresh hero of that class
//   node cli.js --data <dir> status                        list every class's hero
//   node cli.js --data <dir> hide <bar|companion|all>      stop drawing a part of the status line
//   node cli.js --data <dir> show <bar|companion|all>      draw it again
//   node cli.js --data <dir> stats [above|below]           put the stats row above or below the map (no place: switch)
//   node cli.js --data <dir> progress [on|off]             show or hide the stats row and life bar (no choice: switch)
//   node cli.js --data <dir> skills                        every hero's skills and their stats
//   node cli.js --data <dir> gear                          every hero's gear, slot by slot
//   node cli.js --data <dir> achievements                  every achievement, earned or with its progress
//   node cli.js --data <dir> statistics                    every hero's work time, tokens, turns, kills and more
//   node cli.js --data <dir> journal [class] [all]         notable moments by day: one hero's, or everything kept
//   node cli.js --data <dir> card [class|all]              a card of a hero to paste in a chat or a PR
//   node cli.js --data <dir> commands                     list every command, plus the current state
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
  ['stats <above|below>', 'put the hero\'s stats row above or below the map (no place: switch)'],
  ['showprogress <on|off>', 'show or hide the stats and life rows, leaving only the map (no choice: switch)'],
  ['skills', 'your heroes\' skills, their stats, and where the next one comes from'],
  ['gear', 'what your heroes wear in each of the 6 gear slots'],
  ['achievements', 'every achievement: the ones you earned, and how close you are to the rest'],
  ['statistics', 'each hero\'s work time, tokens, turns (longest, shortest, average), kills and more'],
  ['journal [class] [all]', 'what happened while you worked; a class for one hero, all for everything kept'],
  ['card [class|all]', 'a card of your hero to paste in Slack or a PR'],
  ['setup', 'turn the companion status line on (an existing status line stays on top)'],
  ['setup remove', 'turn it off and put back your previous status line'],
  ['commands', 'this list'],
];

function commands() {
  const width = Math.max(...COMMANDS.map(([c]) => c.length)) + p.length + 2;
  const list = COMMANDS.map(([c, what]) => `  ${(p + c).padEnd(width)}${what}`);
  const root = companion.loadSaved(now);
  const shown = companion.display(root);
  const progress = shown.progress ? `progress shown · stats ${shown.stats} the map` : 'progress hidden (map only)';
  const state = `status bar ${shown.bar ? 'shown' : 'hidden'} · companion ${shown.companion ? 'shown' : 'hidden'} · ${progress}`;
  const version = companion.pluginVersion();
  const title = version ? `VibeWorkCompanion ${version} commands` : 'VibeWorkCompanion commands';
  const earned = `Achievements: ${companion.earnedCount(root)} of ${companion.ACHIEVEMENTS.length} earned`;
  return [title, ...list, '', 'Your heroes:', companion.status(now), '', earned, `Display: ${state}`].join('\n');
}

function run() {
  if (command === 'status') {
    return companion.status(now);
  }
  if (command === 'skills') {
    return companion.skillsReport(now);
  }
  if (command === 'gear') {
    return companion.gearReport(now);
  }
  if (command === 'achievements') {
    return companion.achievementsReport(now);
  }
  if (command === 'statistics') {
    return companion.statisticsReport(now);
  }
  if (command === 'journal') {
    return companion.journalReport(arg, now);
  }
  if (command === 'card') {
    return companion.cardReport(arg, now);
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
  if (command === 'stats') {
    const place = companion.placeKey(arg);
    if (!place && arg && arg.trim()) {
      return `"${arg}" is not a place for the stats row. Usage: ${p}stats <above | below>, or ${p}stats alone to switch.`;
    }
    return companion.setStatsPlace(place, now);
  }
  if (command === 'progress') {
    const visible = companion.progressKey(arg);
    if (visible === null && arg && arg.trim()) {
      return `"${arg}" is not on or off. Usage: ${p}showprogress <on | off>, or ${p}showprogress alone to switch.`;
    }
    return companion.setProgress(visible, now);
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
