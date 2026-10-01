# VibeWorkCompanion

An idle RPG hero that lives in the bottom-right corner of your Claude Code status line.
While Claude works, your hero walks through the world, fights monsters, gains XP, levels up and
unlocks weapons and powers. When Claude stops and waits for you, the hero waits too (💤).

```
⚠️ Opus 5.5 | my-project | main | ▰▰▰▰▰▰▱▱▱▱ 63% (634 200 / 1 000 000) | ⏳ 1h59m (42%)
                      🧝 Archer Lv 12 ▰▰▰▰▱▱▱▱▱▱ 812/2429 XP · 🏹 Bow · 🎯🍃🦅 · 🌴 Coast · 💀 431
                                                 .   🧝  . 🔸  🦀  🌴      🐚    . .         🌴
                                                 ~      ~   ~         ~    ~      ~    ~
```

- **Work time is game time:** a 2m45s task is 2m45s of adventure, and the tokens Claude uses give bonus XP.
- **Three classes:** 🧙 Mage, 🤺 Warrior and 🧝 Archer, each with its own save, weapons and powers.
- **Seven biomes,** each with its own floor, enemies and a boss every ~15 minutes of work:
  🌼 Meadow, 🌲 Dark Forest, 💎 Caves, 🌴 Coast, 🌵 Desert, 🪦 Graveyard, 🌋 Volcano. After the
  Volcano the world loops back to the Meadow, "II", with tougher enemies.
- **Level milestones bring bosses:** a ⭐ mini boss (a "Giant" version of a zone enemy) at levels
  5, 15, 25…, and a 👑 boss (an "Elder" version of the zone's boss, tougher than the one at the
  end of the zone) at levels 10, 20, 30…
- **Keeps your status line:** if you already have one, it stays on top and the companion goes under it.

## Install

Requirements: [Node.js](https://nodejs.org) 18 or newer on your `PATH` (check with `node --version`)
and a recent Claude Code (built and tested with 2.1.286).

1. Inside Claude Code, add this repository as a plugin marketplace and install the plugin:

   ```
   /plugin marketplace add edualves96/VibeWorkingCompanion
   /plugin install vwc@vibeworkcompanion
   ```

2. Restart Claude Code, so the plugin's hooks start running.

   - **If you don't have a status line yet,** the companion turns it on by itself at this first
     start, and the class picker appears at the bottom right.
   - **If you already have a status line,** nothing is changed until you ask. Run this once to
     add the companion; your status line stays on top with the companion under it:

     ```
     /vwc:setup
     ```

3. Pick your hero:

   ```
   /vwc:chooseclass archer
   ```

Run `/vwc:commands` any time to see every command.

## Updating

Claude Code only updates plugins by itself for Anthropic's own marketplaces, so new versions of
this one don't arrive until you turn that on or update by hand:

- **Automatic (recommended):** `/plugin` → Marketplaces → `vibeworkcompanion` → Enable
  auto-update. Claude Code then checks for a new version shortly after you start a session and
  tells you when one is installed; run `/reload-plugins` to switch to it.
- **By hand:**

  ```
  /plugin marketplace update vibeworkcompanion
  /reload-plugins
  ```

After an update the stats row says `🆕 Updated to <version>` and what's new, for 30 seconds.
`/vwc:commands` shows which version you have. Your heroes are kept: they live in the plugin's
data folder, which updates don't touch.

## Commands

| Command | What it does |
|---------|--------------|
| `/vwc:setup` | Points your status line at the companion. Your previous status line is saved and shown on top. Only needed if you already had a status line; safe to run again. |
| `/vwc:setup remove` | Turns the companion's status line off and puts back the one you had before (if any). It won't come back by itself. |
| `/vwc:chooseclass <mage\|warrior\|archer>` | Switch class. The first time creates that hero; after that you resume its save. With no class, lists your heroes. |
| `/vwc:createchar <mage\|warrior\|archer>` | Start over with a new level 1 hero of that class. The old one is backed up first. |
| `/vwc:hide <bar\|companion\|all>` | Hide the status bar (the info row on top), the companion (the hero rows), or both. A hidden hero keeps adventuring in the background. The choice is remembered across restarts. |
| `/vwc:show <bar\|companion\|all>` | Show them again. |
| `/vwc:stats <above\|below>` | Put the hero's stats row (level, XP, weapon, zone, kills) above the map, where it starts, or below it. With no argument it switches to the other place. The choice is remembered across restarts. |
| `/vwc:commands` | List every command, your heroes, and what is currently shown or hidden. |

The commands run a small script before Claude sees anything, and then use Haiku to repeat the
result, so they are quick and cheap. Claude never runs them on its own.

## Classes

| Class | Hero | Fights from | Basic attack | Weapons | Powers |
|-------|------|-------------|--------------|---------|--------|
| Mage | 🧙 | 3 tiles | 🔹 magic missile | 🪵 📜 🪄 📖 🔮 💎 🌟 | 🔥 ⚡ 🧊 🌊 💫 |
| Warrior | 🤺 | 2 tiles (melee) | 💥 | 🔪 🏏 🪓 🔨 🔱 🪝 🌟 | 💪 🌀 💢 🩸 🌋 |
| Archer | 🧝 | 5 tiles | 🔸 arrow that flies across the gap | 🪨 🪃 🏹 🪶 🌙 💘 🌟 | 🎯 🍃 🦅 💨 🌠 |

The mage hits weakly but has the strongest and most frequent spells, the warrior hits hardest, and
the archer lands double-damage critical shots 20% of the time. All three level up at the same pace
(within one level of each other up to 30 hours of work, checked by simulation), so the choice is
about style. Only the active class's hero moves; the others wait where you left them.

## How it works

The hero takes one step per second of **working time**. Hooks tell it when Claude is working:

| Event | Hero |
|-------|------|
| You send a message (`UserPromptSubmit`) | walks |
| Claude uses a tool (`PostToolUse`, `PostToolUseFailure`) | walks |
| Claude finishes its turn (`Stop`, `StopFailure`) | waits |
| Claude needs your permission (`PermissionRequest`) | waits |
| Claude asks you a question (`AskUserQuestion`, `ExitPlanMode`) | waits |
| You press Esc | waits (read from the transcript, since no hook fires) |

- **One hero for all your windows:** it walks while at least one Claude Code session is working.
- **Subagents don't count:** only the main conversation moves the hero.
- **Sleep doesn't count:** gaps longer than 30 s (a sleeping laptop, a closed terminal) are ignored.
- **A missed "finished" event can't keep it walking:** a session that has sent no hook event and
  written nothing to its transcript for 10 minutes counts as waiting. One very long silent
  command (a 15-minute build, say) pauses the hero after 10 minutes until it finishes.

Enemies have life, which grows with the zone. Each hit does the class's base damage plus its
per-level damage times your level, plus the weapon's bonus; a power that is ready multiplies it,
and a critical hit doubles it. For a hero on pace, a normal enemy takes about 5 hits, a mini boss
about 15, a zone boss about 35 and a level boss about 50; a hero ahead of the curve kills faster.
While you fight, the stats row shows the enemy's life and the damage of each hit:

```
🧝 Archer Lv 13 ▰▱▱▱▱▱▱▱▱▱ 371/3086 XP · 🪶 Fletched Bow · 🌲 Dark Forest II · 💀 587 · 🐺 Wolf ▰▰▰▰▰▱▱▱▱▱ 136/304 -72
```

XP comes from kills (`1.6 * (3 + zone + random(0..zone))`, bosses x10) and from tokens: every 2,000 tokens
Claude uses (input + cache writes + output, not cache reads) is worth one kill. Going from level
`L` to `L+1` takes `10 + 1.4 * L^3` XP. Rough pacing: level 3 after 2 minutes of work, level 9 after
an hour, level 15 after 3 hours, the last weapon after about 25 hours.

## Make your own version

Everything is MIT licensed: change whatever you like. Your changes stay in your own copy. Nobody
can push to this repository unless they're added as a collaborator; the most anyone can do is
open a pull request, which can be accepted or ignored.

1. Fork this repository on GitHub (or just clone it), and clone your copy:

   ```sh
   git clone https://github.com/<you>/<your-fork>.git
   ```

2. If you installed the original, remove it first, so the hooks don't run twice and the two
   marketplaces (which share the name `vibeworkcompanion`) don't clash:

   ```
   /plugin uninstall vwc@vibeworkcompanion
   /plugin marketplace remove vibeworkcompanion
   ```

3. Add your local folder as a marketplace and install from it:

   ```
   /plugin marketplace add C:/path/to/your-fork
   /plugin install vwc@vibeworkcompanion
   /vwc:setup
   ```

4. Edit files in your folder. Claude Code runs the plugin from a copy in its plugin cache, which
   it refreshes from your folder at the next session start or when you run `/reload-plugins`.

To share your version, push it to your fork; others install it with
`/plugin marketplace add <you>/<your-fork>`. If you rename the plugin, change `name` in both
`.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`, and the `/vwc:` prefix used in
`scripts/companion.js` (`COMMAND_PREFIX`) and in `scripts/setup.js`.

For every release, bump `version` in `.claude-plugin/plugin.json`. Claude Code compares it to
decide whether there is an update, so changes pushed without a new version never reach anyone.
Add a line for the new version to `WHATS_NEW` in `scripts/companion.js` to say what's new in the
update notice.

## Customize

Everything below is in `scripts/companion.js`.

### Tuning constants (top of the file)

| Constant | Default | Meaning |
|----------|---------|---------|
| `STEP_MS` | `1000` | Working time per game step. Lower it to make the hero faster. |
| `ZONE_LENGTH` | `600` | Tiles per zone. A boss waits at the end of each zone. |
| `TOKENS_PER_KILL` | `2000` | Tokens worth one kill's XP. Lower it for more token XP. |
| `ENEMY_HP` | `[20, 60, 0.7]` | Enemy life: `20 + 60 * zone^0.7`, give or take 20%. Raise it for longer fights. |
| `RANKS` | | Life and XP of mini bosses (`2.5`, `5`), zone bosses (`5`, `10`) and level bosses (`8`, `16`), as multiples of a normal enemy's. |
| `KILL_XP` | `1.6` | Multiplier on the XP of every kill (and of tokens). Raise it to level faster. |
| `WORLD_TILES` | `24` | Width of the world in tiles (each tile is 2 columns). |
| `MSG_MS` | `10000` | How long messages like "🎉 Level 5!" stay visible. |
| `MAX_GAP_MS` | `30000` | Gaps between refreshes longer than this are ignored. |
| `SESSION_STALE_MS` | `60000` | A session silent for this long no longer counts as working. |

Difficulty lives in `xpNeed()` (the level curve), `makeEnemy()` (enemy HP and XP) and `attackOf()`
(hero damage, from the class's `atk`). If you make fights longer or shorter, change `KILL_XP` the
opposite way, or levelling slows down or speeds up with them.

### Add a biome

Add an entry to `BIOMES`. Zones cycle through the list in order:

```js
{ name: 'Swamp', icon: '🐸', color: '38;2;101;163;13',
  decor: ['🌿', '🍄', '🪵'], enemies: [['🐊', 'Croc'], ['🦟', 'Mosquito'], ['🐍', 'Snake']],
  boss: ['🦕', 'Bog Beast'],
  floor: { bg: '48;2;40;60;30', fg: '38;2;132;204;22', marks: ['~', ','] } },
```

`color` is an ANSI color (`38;2;R;G;B`) for the zone name. In `floor`, `bg` is the ground color
(`48;2;R;G;B`), `fg` the color of the marks, and `marks` the characters scattered on about 1 cell
in 3. Marks must be plain ASCII, exactly 1 column wide, so the floor stays under the world tiles.

### Change a class, or add one

Each entry in `CLASSES` has its own stats, weapons and powers:

```js
paladin: {
  name: 'Paladin', icon: '💂', blurb: 'melee, steady hits, holy powers',
  range: 2,          // starts fighting when an enemy is this many tiles ahead
  atk: [3, 1.1],     // damage = 3 + 1.1 x level, plus the weapon's atk
  crit: 0.1,         // 10% chance of a double-damage hit
  hit: '💥',         // icon of a basic attack
  weapons: [         // unlocked at `lvl`, `atk` is added to the damage
    { lvl: 1, icon: '🔨', name: 'Mace', atk: 0 },
    // ...
  ],
  powers: [          // unlocked at `lvl`, hit for `mult` x damage, usable every `cd` steps
    { lvl: 3, icon: '🌟', name: 'Smite', mult: 3, cd: 8 },
    // ...
  ],
},
```

A new class appears in `/vwc:chooseclass` and `/vwc:createchar` automatically. Every class needs
a first weapon at level 1. The class picker has room for three heroes, so a fourth class can be
chosen but isn't drawn there.

### Emoji rules (read this before adding icons)

The layout relies on every icon being exactly 2 columns wide. Use only emoji that show as emoji
by default (Unicode `Emoji_Presentation=Yes`), such as 🐉 🔥 🌲 💎. Avoid:

- **Symbols that need the `U+FE0F` variation selector to look like emoji:** ⚔️ 🗡️ ☠️ ❄️ 🕷️ ⛰️ 🗝️
- **ZWJ sequences** (several emoji glued together): 🧙‍♂️ 🧟‍♀️

If you add an icon below `U+1F000` that is 2 columns wide, add its code point to `displayWidth()`,
as was done for ⚡ ✨ ⏳.

### Position and size

- **Stats row above or below the map:** `/vwc:stats below` does it without editing anything. The
  order is picked at the end of `render()`.
- **Right alignment:** `alignRight()` in `render()`. Remove the `.map(...)` there to put the
  companion on the left.
- **Why the padding starts with an escape code:** Claude Code trims every status line row, which
  would remove plain leading spaces. The padding starts with an invisible `\x1b[0m` reset, which
  the trim leaves alone.
- **Width budget:** `scripts/statusline.js` uses `COLUMNS - 6`. Claude Code passes the terminal
  width in `COLUMNS`, pads the status line by 2 columns on each side, and cuts off anything wider.
  If the right edge is cut off in your terminal, increase the `6`.
- **Narrow terminals:** when the stats row doesn't fit, parts are dropped in priority order (powers
  first, then kills, zone and weapon). See the numbers in `statsRow()`.

### The info row (row 1)

If you had a status line before `/vwc:setup`, it runs and is shown on top. Otherwise `infoRow()` in
`scripts/statusline.js` draws model, folder, git branch, context usage and rate limits.

## Files

| Path | What it is |
|------|------------|
| `.claude-plugin/plugin.json` | Plugin manifest (name `vwc`, version). |
| `.claude-plugin/marketplace.json` | Makes this repository its own marketplace (`vibeworkcompanion`). |
| `hooks/hooks.json` | The hooks that tell the companion when Claude is working. |
| `skills/` | The `/vwc:` commands: `setup`, `chooseclass`, `createchar`, `hide`, `show`, `stats` and `commands`. |
| `scripts/companion.js` | The engine: save file, classes, biomes, game rules, rendering. |
| `scripts/statusline.js` | What the status line runs: info row plus the three companion rows. |
| `scripts/hook.js` | What the hooks run. |
| `scripts/cli.js` | Class switching, new characters, hide/show, the stats row's place, and the command list. |
| `scripts/setup.js` | Turns the status line on and off in your `settings.json`. |

Your saves live in the plugin's data folder, `~/.claude/plugins/data/<plugin id>/`, which survives
plugin updates:

| File | What it is |
|------|------------|
| `state.json` | One hero per class, which one is active, what `/vwc:hide` has hidden, where `/vwc:stats` put the stats row, and the last plugin version it saw (for the update notice). Delete it to start everything over. |
| `backups/` | Heroes replaced by `/vwc:createchar`. To restore one, copy it into `state.json` under `heroes.<class>`. |
| `statusline.js` | Small launcher that your status line runs; it finds the current plugin version. |
| `previous-statusline.json` | The status line you had before setup. |
| `settings.backup-*.json` | Copies of your `settings.json` from before each setup change. |
| `auto-setup.json` | Records that the first-start check ran and what it did, so it only ever runs once. |

## Debugging and testing

- **Debug log:** create an empty file named `debug` in the data folder. Every tick and hook is
  then logged to `debug.log` there, including the terminal width. Delete `debug` to stop.
- **Test without touching your save:** point `COMPANION_DIR` at another folder and pipe in a fake
  status line payload:

  ```sh
  mkdir -p /tmp/vwc-test
  echo '{"session_id":"t","model":{"display_name":"Opus"},"workspace":{"current_dir":"/tmp"}}' \
    | COMPANION_DIR=/tmp/vwc-test COLUMNS=120 node scripts/statusline.js
  ```

- **Validate after editing the manifests:** `claude plugin validate .`

## Troubleshooting

- **No companion in the status line:** run `/vwc:setup`. If you had no `settings.json` file at
  all before installing, Claude Code may only notice the new status line after one more restart.
- **"VibeWorkCompanion: plugin not found":** the plugin was removed or moved. Reinstall it, or run
  `/vwc:setup remove` to restore your old status line.
- **The hero never moves:** the hooks aren't running. Restart Claude Code after installing, and
  check that `node --version` works in your terminal.
- **Rows look misaligned:** an icon isn't exactly 2 columns wide in your terminal. See the emoji
  rules above.

## Uninstall

1. `/vwc:setup remove` puts your previous status line back.
2. `/plugin uninstall vwc@vibeworkcompanion` removes the plugin. This also deletes the data folder
   with your heroes. To keep them, uninstall from your shell with
   `claude plugin uninstall vwc@vibeworkcompanion --keep-data` instead.

## License

[MIT](LICENSE)
