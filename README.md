# VibeWorkCompanion

An idle RPG hero that lives in the bottom-right corner of your Claude Code status line.
While Claude works, your hero walks through the world, fights monsters that fight back, gains
XP, levels up, unlocks weapons, finds random skills and gear, and earns achievements. When Claude
stops and waits for you, the hero waits too (💤). It never needs anything from you while you work:
it equips what it finds, drinks its potions and gets back up on its own.

```
⚠️ Opus 5.5 | my-project | main | ▰▰▰▰▰▰▱▱▱▱ 63% (634 200 / 1 000 000) | ⏳ 1h59m (42%)
                🧝 Archer Lv 12 ▰▰▰▰▱▱▱▱▱▱ 812/2429 XP · 🏹 Bow · 🎯🍃 · 🌴 Coast · 💀 431 · 🦑 Squid ▰▰▰▱▱▱▱▱▱▱ 61/236
                             💗 ▰▰▰▰▰▰▰▱▱▱ 284/402 -19 · 🧪 2
                                                 .   🧝  . 🔸  💧  🦑      🐚    . .         🌴
                                                 ~      ~   ~         ~    ~      ~    ~
```

- **Work time is game time:** a 2m45s task is 2m45s of adventure, and the tokens Claude uses give bonus XP.
- **Three classes:** 🧙 Mage, 🤺 Warrior and 🧝 Archer, each with its own save, weapons and skills.
- **Random skills:** the bosses of levels 5, 10, 15… drop a randomly rolled skill. A hero holds two,
  and a better find replaces the weaker one. Area skills (a Nova, a Volley, a Cleave…) hit a whole
  group of enemies at once.
- **Life and enemies that fight back:** the hero has a 💗 life bar under its XP bar. Enemies,
  sometimes in groups of up to 4, close in to strike, and some (🐍 🦇 👺 🦑 👻 🐲, the 🐙 Kraken and the 🐉 Dragon) shoot from
  a distance, so every class takes hits. Potions are drunk on their own, and a knocked out hero
  rests a moment and gets back up stronger. It costs time, never progress.
- **Random gear:** six slots (🪖 helmet, 🥋 chest, 👖 pants, 🧣 shoulders, 🧤 gloves, 🥾 boots), empty
  at first. Enemies sometimes drop a randomly rolled piece and bosses always do; a better piece is
  equipped, a worse one is left lying on the ground.
- **46 achievements** for kills, groups, bosses, survival, levels, skills, gear and hours of work, plus a
  couple of secret ones. 🏅 pops up on the stats row when you earn one.
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
| `/vwc:skills` | Every hero's skills with their rarity, power and stats, and which boss drops the next one. |
| `/vwc:gear` | What every hero wears in each of the six gear slots, with each piece's rarity, power and stats, and what they add up to. |
| `/vwc:achievements` | Every achievement: the ones you earned (with the date and the hero), and how close you are to the rest. |
| `/vwc:stats <above\|below>` | Put the hero's stats row (level, XP, weapon, zone, kills) above the map, where it starts, or below it. With no argument it switches to the other place. The choice is remembered across restarts. |
| `/vwc:commands` | List every command, your heroes, how many achievements you have, and what is currently shown or hidden. |

The commands run a small script before Claude sees anything, and then use Haiku to repeat the
result, so they are quick and cheap. Claude never runs them on its own.

## Classes

| Class | Hero | Fights from | Basic attack | Weapons | Skills |
|-------|------|-------------|--------------|---------|--------|
| Mage | 🧙 | 3 tiles | 🔹 magic missile | 🪵 📜 🪄 📖 🔮 💎 🌟 | 🔥 ⚡ 🧊 🌊 💫 🌑 spells |
| Warrior | 🤺 | 2 tiles (melee) | 💥 | 🔪 🏏 🪓 🔨 🔱 🪝 🌟 | 💪 🌀 💢 🩸 🌋 🔥 strikes |
| Archer | 🧝 | 5 tiles | 🔸 arrow that flies across the gap | 🪨 🪃 🏹 🪶 🌙 💘 🌟 | 🎯 🍃 🦅 💨 🌠 🔥 shots |

The mage hits weakly but rolls the strongest skills, the warrior hits hardest (its skills roll a
little weaker), and the archer lands double-damage critical shots 20% of the time. The warrior,
always up close, has the most life; the archer, which shoots most enemies before they reach it,
has the least, so bosses are its danger. On average all
three level up at the same pace (within one level of each other up to 30 hours of work, checked by
simulation), so the choice is about style. Skills are random, so luck can put a hero a level or
two ahead or behind. Only the active class's hero moves; the others wait where you left them.

## Skills

Every hero starts with no skills. Reaching levels 5, 15, 25… summons a mini boss and levels 10, 20,
30… a boss; defeating it drops a random skill:

```
🏆 Defeated 🦖 Elder Sand Rex! · 🎁 New skill: ⚡ Storm Lance (rare)
🏆 Defeated 🦅 Giant Vulture! · 🎁 💫 Star Ray (epic) replaces 🌑 Shadow Bolt
```

- **What a skill does:** it's a special attack that fires every few seconds for several times the
  damage (its icon flies across the map), plus a passive bonus that is always on: extra damage or
  extra critical chance.
- **Single-target or area:** the second word of the name says which. Area skills hit the target
  and every enemy up to 3 tiles behind it, so a whole group, each for 85% of the extra damage a
  single-target skill of the same strength would add; their icon lands on every enemy hit.
  Mage: Nova, Burst, Wave. Warrior: Cleave, Slam, Smash. Archer: Volley, Rain, Barrage. When
  several skills are ready, the hero fires the one that adds the most damage, counting an area
  skill once per enemy it would hit.
- **What's rolled:** the name (from the class's parts, like 🧊 Frost + Lance), the rarity (common
  55%, rare 30%, epic 12%, legendary 3%, which multiplies the strength), the cooldown (6 to 16 s,
  with a bigger multiplier the longer it is) and the bonus. Skills found at higher levels roll
  stronger, and the bosses of levels 10, 20, 30… roll the rarity twice and keep the better result.
- **Two slots:** a new skill takes a free slot. Once both are full, it replaces the weaker skill if
  its **power** is higher, and is discarded otherwise. Power is the extra damage per second the
  attack adds plus the bonus, as one number to compare by; an area skill's power is that of the
  single-target skill it would be, so the two compare fairly.
- `/vwc:skills` shows each skill's rarity, power and stats, and which boss drops the next one:

  ```
  ▶ 🧝 Archer Lv 10 · 2 of 2 skills
      🦅 Eagle Bolt       legendary power  61   x5.6 damage every 9 s, +10% critical chance
      🍃 Wind Barrage     rare      power  42   x4.6 area damage every 12 s, +7% damage
      Next skill: from the mini boss at level 15
  ```

Skills found before 1.7.0 with an area form in their name (like a Frost Nova) became area skills,
with the same power. Heroes from before 1.4.0 had fixed powers. When they first load in 1.4.0 they get a rolled skill
for every milestone they had already passed, keeping the best two.

## Gear

Every hero starts with nothing in its six gear slots. A normal enemy drops a piece 3% of the
time (about one every 4 minutes of work, counting the bosses) and every boss drops one, rolling
the rarity twice like a skill from a level 10 boss. Nothing to do on your side:

```
🎁 🧤 Iron Grips (rare) equipped
🎁 🥾 Steel Treads (epic) replaces Iron Boots
🏆 Defeated 🦍 Ape King! · 🎁 🧣 Steel Spaulders (rare) left behind, yours is better
```

- **What's rolled:** the slot, the rarity (same chances as skills), and the stats: `+% damage`,
  `+% critical chance`, `+% XP` or `+% life`, sometimes two of them. Gear found at higher levels rolls
  stronger, and its material shows how deep it was found: Leather, Bronze (level 5), Iron (10),
  Steel (15), Silver (20), Mithril (25), Dragonscale (35).
- **Better or left behind:** a piece's **power** is the sum of its stats (a +1% critical chance is
  worth +1% damage on average). A piece with more power than the one in its slot is equipped right
  away; otherwise it stays on the ground where the enemy fell, and you keep the old one.
- **How much it adds:** a full set adds about +30% after an hour of work, +60% after 8 hours and
  +85% after 30 hours, spread over damage, critical chance, XP and life.
- `/vwc:gear` shows what each hero wears:

  ```
  ▶ 🧝 Archer Lv 16 · 6 of 6 slots · +24% damage, +6% critical chance, +11% XP · 💗 467 life
      🪖 Helmet     Steel Circlet        epic      power  9   +9% damage
      🥋 Chest      Steel Robe           common    power  5   +5% XP
      👖 Pants      Iron Leggings        rare      power  6   +4% damage, +2% critical chance
      ...
  ```

Heroes from before 1.5.0 start with empty slots, like new ones.

## Life and combat

The hero's life bar sits right under its XP bar, with the potions it carries:

```
🧝 Archer Lv 16 ▰▱▱▱▱▱▱▱▱▱ 1060/5744 XP · 🪶 Fletched Bow · 💎 Caves II · 👺 Goblin ▰▰▱▱▱▱▱▱▱▱ 50/326 -135
             💗 ▰▰▰▰▰▰▰▰▱▱ 441/467 -26 · 🧪 1
```

- **Enemies fight back,** one at a time or as a group: the nearest one, with the rest of its
  group, notices the hero 8 tiles away and walks up to it. The ones that shoot stop 4 tiles away and fire: 🟢 venom (🐍), 🟣 shrieks and curses
  (🦇 👻), 🟤 rocks (👺), 💧 water (🦑 🐙) and 🔴 fire (🐲 🐉). Mini bosses and bosses strike every
  other second, harder. Their damage grows with the zone, like their life.
- **Groups:** 4 in 10 times, enemies come as a group of 2 (20%), 3 (12%) or 4 (8%), standing side
  by side, a mix of the zone's enemies. Each is weaker than one alone (65% of the life, damage and
  XP), but they fight together: the melee ones queue up behind each other, the ones that shoot
  fire over them, and there's no pause to heal until the last one falls. The stats row shows the
  rest of the group as "+2", and an area hit as "x3" after the damage.
- **Range matters:** the archer gets about 4 free shots at an enemy walking up to it, the mage 2,
  the warrior 1.
- **Life** grows with the level and with gear's `+% life`. It comes back while walking between
  fights, and all of it on a level up.
- **Potions:** 🧪 dropped by 1 enemy in 20 and by every boss, up to 3 at a time. The hero drinks
  one on its own when its life drops below 30%, getting half of it back.
- **Knocked out:** at 0 life the hero shows 😵 and rests for 15 seconds of work while the enemy
  heals. Then it gets back up with full life and +25% damage for every knockout until its next win,
  so it always gets through in the end. Nothing is lost but the time.

For a hero on pace (checked by simulation), that's 3 or 4 potions an hour and a knockout every 6
or 7 hours of work, mostly by bosses, about the same for all three classes.

## Achievements

46 achievements, shared by all your heroes. When you earn one, the stats row says
`🏅 Achievement: Dragonslayer`. `/vwc:achievements` lists them all, with how close you are:

```
🏅 Achievements · 19 of 46 earned

Combat
  ✅ First Blood        defeat an enemy                                2026-10-02 🧝
  ⬜ Slayer             defeat 1,000 enemies                           778/1,000
  ...
```

| Group | Achievements |
|-------|--------------|
| Combat | defeat 1, 100, 1,000 and 10,000 enemies; land a hit of 250 and of 2,500 damage; a critical hit with a skill; hit 4 enemies with one area skill; defeat 500 groups |
| Bosses | the first zone boss, a mini boss, an Elder boss, 5 Elder bosses, the Dragon of the Volcano, and of Volcano X |
| Survival | drink a potion, and 100; win a fight with under 10% life; get knocked out and back up |
| Journey | levels 5, 10, 20, 30 and 35 (the star weapon); reach all 7 biomes; play every class; every class to level 10 |
| Skills | find a skill; hold two; replace one; find an epic, and a legendary; hold two legendaries |
| Gear | find a piece; fill all 6 slots; find an epic, and a legendary; leave 100 pieces behind |
| Work | 1, 8 and 40 hours of work; 1 million and 10 million tokens; one turn of 30 minutes; two secrets |

Kills, hours and other totals add up all your heroes, including ones replaced by
`/vwc:createchar`. A save from before 1.5.0 gets credit right away for what it shows: levels,
kills, zones, hours of work, level bosses passed and skills held.

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
per-level damage times your level, plus the weapon's bonus, raised by the damage bonuses of
skills and gear; a skill that is off cooldown multiplies it, and a critical hit doubles it. For a hero on pace, a normal enemy takes about 5 hits, a mini boss
about 15, a zone boss about 35 and a level boss about 50; a hero ahead of the curve kills faster.
While you fight, the stats row shows the enemy's life and the damage of each hit, and the life
row under it the damage you take (see [Life and combat](#life-and-combat)):

```
🧝 Archer Lv 13 ▰▱▱▱▱▱▱▱▱▱ 371/3086 XP · 🪶 Fletched Bow · 🌲 Dark Forest II · 💀 587 · 🐺 Wolf ▰▰▰▰▰▱▱▱▱▱ 136/304 -72
```

XP comes from kills (`1.6 * (3 + zone + random(0..zone))`, bosses x10) and from tokens: every 2,000 tokens
Claude uses (input + cache writes + output, not cache reads) is worth one kill. Gear with `+% XP`
raises both. Going from level `L` to `L+1` takes `10 + 1.4 * L^3` XP. Rough pacing, counting
kills only: level 3 after 2 minutes of work, level 9 after an hour, level 15 after 3 hours,
level 25 after 8 hours, the last weapon (level 35) after about 16 hours. Token XP comes on top:
with 300,000 tokens an hour of work, a hero is one to two levels further along.

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
| `RANKS` | | Life, XP and damage of mini bosses (`2.5`, `5`, `1.5`), zone bosses (`5`, `10`, `1.5`) and level bosses (`8`, `16`, `2`), as multiples of a normal enemy's, and how often they strike (`every` 2 seconds). |
| `KILL_XP` | `1.6` | Multiplier on the XP of every kill (and of tokens). Raise it to level faster. |
| `MAX_SKILLS` | `2` | How many skills a hero holds. |
| `RARITIES` | | Each rarity's chance and how much it multiplies the strength of a skill or a piece of gear. |
| `ENEMY_ATK` | `0.085` | Enemy damage per hit, as a share of a normal enemy's life in that zone (times the rank's `atk` in `RANKS`). Raise it for a harder game. |
| `AGGRO`, `SHOT_RANGE` | `8`, `4` | How far away the nearest enemy notices the hero, and how far the ones that shoot fire from. |
| `HERO_LIFE` | `[40, 12, 1.4]` | Hero life: `40 + 12 * level^1.4`, times the class's `life`. |
| `REGEN` | `0.02` | Share of the hero's life that comes back each second out of combat. |
| `POTION_DROP`, `MAX_POTIONS` | `0.05`, `3` | Chance a normal enemy drops a potion (bosses always do), and how many the hero carries. |
| `POTION_AT`, `POTION_HEAL` | `0.3`, `0.5` | Life below which a potion is drunk, and how much of the life it gives back. |
| `GROUP_SIZES` | `[0.6, 0.2, 0.12, 0.08]` | Chances that enemies come alone, or in a group of 2, 3 or 4. |
| `GROUP_MEMBER`, `GROUP_GAP` | `0.65`, `3` | A group member's life, damage and XP compared to an enemy alone, and the extra tiles after a group per extra enemy. |
| `AREA`, `AREA_MULT` | `3`, `0.85` | How many tiles behind the target an area skill reaches, and its share of a single-target skill's extra damage. |
| `KO_STEPS`, `RALLY` | `15`, `0.25` | Seconds a knocked out hero rests, and the extra damage per knockout until its next win. |
| `GEAR_DROP` | `0.03` | Chance that a normal enemy drops a piece of gear. Bosses always do. |
| `GEAR_SLOTS` | | The six slots, with their icon and the base names a piece can roll (`Helm`, `Hood`…). |
| `GEAR_MATERIALS` | | The material in a piece's name, by the level it was found at. |
| `ACHIEVEMENT_GROUPS` | | Every achievement: its name, what to do, the fact it measures (see `achievementFacts()`) and the goal. |
| `WORLD_TILES` | `24` | Width of the world in tiles (each tile is 2 columns). |
| `MSG_MS` | `10000` | How long messages like "🎉 Level 5!" stay visible. |
| `MAX_GAP_MS` | `30000` | Gaps between refreshes longer than this are ignored. |
| `SESSION_STALE_MS` | `60000` | A session silent for this long no longer counts as working. |

Difficulty lives in `xpNeed()` (the level curve), `makeEnemy()` (enemy HP and XP), `attackOf()`
(hero damage, from the class's `atk`), `rollSkill()` (how strong skills roll at each level) and
`rollGear()` (how strong gear rolls). If you make fights longer or shorter, change `KILL_XP` the
opposite way, or levelling slows down or speeds up with them.

### Add a biome

Add an entry to `BIOMES`. Zones cycle through the list in order:

```js
{ name: 'Swamp', icon: '🐸', color: '38;2;101;163;13',
  decor: ['🌿', '🍄', '🪵'], enemies: [['🐊', 'Croc'], ['🦟', 'Mosquito', '🟢'], ['🐍', 'Snake']],
  boss: ['🦕', 'Bog Beast'],
  floor: { bg: '48;2;40;60;30', fg: '38;2;132;204;22', marks: ['~', ','] } },
```

An enemy with a third icon, like the mosquito's `🟢`, shoots it from a distance instead of
walking up to the hero. `color` is an ANSI color (`38;2;R;G;B`) for the zone name. In `floor`, `bg` is the ground color
(`48;2;R;G;B`), `fg` the color of the marks, and `marks` the characters scattered on about 1 cell
in 3. Marks must be plain ASCII, exactly 1 column wide, so the floor stays under the world tiles.

### Change a class, or add one

Each entry in `CLASSES` has its own stats, weapons and skill parts:

```js
paladin: {
  name: 'Paladin', icon: '💂', blurb: 'melee, steady hits, holy skills',
  range: 2,          // starts fighting when an enemy is this many tiles ahead
  atk: [3, 1.1],     // damage = 3 + 1.1 x level, plus the weapon's atk
  crit: 0.1,         // 10% chance of a double-damage hit
  life: 1.2,         // multiplies the hero's life
  hit: '💥',         // icon of a basic attack
  weapons: [         // unlocked at `lvl`, `atk` is added to the damage
    { lvl: 1, icon: '🔨', name: 'Mace', atk: 0 },
    // ...
  ],
  skills: {          // random skills are named "<part> <form>", e.g. "Holy Smite"
    power: 1,        // scales how strong this class's skills roll
    parts: [['🌟', 'Holy'], ['🔥', 'Burning'], /* ... */],   // the part also gives the icon
    forms: ['Smite', 'Strike', /* ... */],          // single-target skills
    areaForms: ['Wrath', 'Nova', /* ... */],        // area skills
  },
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
- **Narrow terminals:** when the stats row doesn't fit, parts are dropped in priority order (skills
  first, then kills, zone and weapon), and a long message is cut short with "…". The life row
  stays under the XP bar, dropping its extras (rally, then potions) if they don't fit. See the numbers in `statsRow()`.

### The info row (row 1)

If you had a status line before `/vwc:setup`, it runs and is shown on top. Otherwise `infoRow()` in
`scripts/statusline.js` draws model, folder, git branch, context usage and rate limits.

## Files

| Path | What it is |
|------|------------|
| `.claude-plugin/plugin.json` | Plugin manifest (name `vwc`, version). |
| `.claude-plugin/marketplace.json` | Makes this repository its own marketplace (`vibeworkcompanion`). |
| `hooks/hooks.json` | The hooks that tell the companion when Claude is working. |
| `skills/` | The `/vwc:` commands: `setup`, `chooseclass`, `createchar`, `hide`, `show`, `stats`, `skills`, `gear`, `achievements` and `commands`. |
| `scripts/companion.js` | The engine: save file, classes, biomes, game rules, rendering. |
| `scripts/statusline.js` | What the status line runs: info row plus the three companion rows. |
| `scripts/hook.js` | What the hooks run. |
| `scripts/cli.js` | Class switching, new characters, hide/show, the stats row's place, the skills, gear and achievements lists, and the command list. |
| `scripts/setup.js` | Turns the status line on and off in your `settings.json`. |

Your saves live in the plugin's data folder, `~/.claude/plugins/data/<plugin id>/`, which survives
plugin updates:

| File | What it is |
|------|------------|
| `state.json` | One hero per class (with its skills, gear and counts for achievements), which one is active, the achievements earned and the totals they need, what `/vwc:hide` has hidden, where `/vwc:stats` put the stats row, and the last plugin version it saw (for the update notice). Delete it to start everything over. |
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
