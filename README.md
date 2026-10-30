# VibeWorkCompanion

An idle RPG hero that lives in the bottom-right corner of your Claude Code status line.
While Claude works, your hero walks through the world, fights monsters that fight back, gains
XP, levels up, unlocks weapons, finds random skills and gear, and earns achievements. When Claude
runs subagents, they join the fight as allies. When Claude stops and waits for you, the hero waits
too (💤). It never needs anything from you while you work: it equips what it finds, salvages the
rest, drinks its potions and gets back up on its own.

```
⚠️ Opus 5.5 | my-project | main | ▰▰▰▰▰▰▱▱▱▱ 63% (634 200 / 1 000 000) | ⏳ 1h59m (42%)
            🧝 Archer Lv 12 ▰▰▰▰▱▱▱▱▱▱ 812/2429 XP · 🏹 Bow · 🎯🍃 · 🌴 Coast 37% · 💀 431 · 🦑 Squid ▰▰▰▱▱▱▱▱▱▱ 61/236
                         💗 ▰▰▰▰▰▰▰▱▱▱ 284/402 -19 · 🧪 2 · 🔩 7/10
                                                   🦊🧝  . 🔸🐾💧  🦑      🐚    . .         🌴
                                                 ~      ~   ~         ~    ~      ~    ~
```

- **Work time is game time:** a 2m45s task is 2m45s of adventure, and the tokens Claude uses give bonus XP.
- **Three classes, and a fourth to unlock:** 🧙 Mage, 🤺 Warrior and 🧝 Archer, each with its own
  save, weapons and skills. Reach level 50 with any of them to unlock 🧢 Bash the Trainer: his
  partner critter fights for him, and he catches critters to fill a dex of 151. See
  [The Trainer](#the-trainer).
- **Random skills:** the bosses of levels 5, 10, 15… drop a randomly rolled skill. A hero holds two,
  and a better find replaces the weaker one. Area skills (a Nova, a Volley, a Cleave…) hit a whole
  group of enemies at once.
- **Life and enemies that fight back:** the hero has a 💗 life bar under its XP bar. Enemies,
  sometimes in groups of up to 4, close in to strike, and some (🐍 🦇 👺 🦑 👻 🐲, the 🐙 Kraken and the 🐉 Dragon) shoot from
  a distance, so every class takes hits. Potions are drunk on their own, and a knocked out hero
  rests a moment and gets back up stronger. It costs time, never progress.
- **Random gear:** six slots (🪖 helmet, 🥋 chest, 👖 pants, 🧣 shoulders, 🧤 gloves, 🥾 boots), empty
  at first. Enemies sometimes drop a randomly rolled piece and bosses always do; a better piece is
  equipped, a worse one is salvaged into 🔩 shards, which reforge your weakest piece.
- **Subagents are allies:** every subagent Claude runs brings a 🦊 fox, 🦉 owl, 🐕 hound, 🧚 fairy or
  🦄 unicorn that walks behind the hero and fights with it until the subagent finishes.
- **A journal:** level ups, bosses, finds, reforges and achievements are shown on the stats row for
  a few seconds, which you'll often miss while you work. `/vwc:journal` lists them by day.
- **A card to share:** `/vwc:card` shows your hero as a short card to paste in Slack or a PR.
- **Breaks are rewarded:** a break of more than 5 minutes fills a 💤 rested pool, up to an hour,
  and kills give double XP while it lasts once you're back.
- **Campfires:** when Claude compacts the conversation, the hero makes camp ⛺: full life and +25%
  damage for 10 minutes of work.
- **Day and night:** the floor follows your local clock, darker and bluer from 20:00 to 06:00, and
  each biome has a creature of the night (🐺 🧜 🧞…) that only comes out then.
- **Seasonal events:** 🎃 Halloween all October, with pumpkins, 🍬 candy and 👻 ghost waves, and 🎄
  Winter all December, with snowmen and snow.
- **Elite enemies:** 1 enemy in 20 (1 in 10 at night) is Swift, Armored, Vampiric or Explosive,
  tougher and better paid.
- **Bounties:** each biome sets a short goal on its own (defeat 11 🐺 Wolves, defeat 2 elites, beat
  the 🦍 Ape King without a potion), paid in shards, a potion or a lucky piece of gear.
- **Treasure goblins:** now and then a 💰 runs from the hero instead of fighting. Catch it in time
  and it drops 20 shards and a lucky piece of gear.
- **Weapon mastery:** from level 35 on, kills rank up your 🌟 star weapon (`Star Bow +3`), each
  rank adding 2% damage, with no end.
- **Work streaks:** days in a row with work count toward three achievements (5, 20 and 100 days).
  Missing a day just starts a new streak; nothing is taken away.
- **94 achievements** for kills, groups, bosses, survival, levels, skills, gear, allies, catches, seasons,
  hours of work and the Survival game's shelter, plus a few secret ones. 🏅 pops up on the stats row when you earn one.
- **Ten biomes,** each with its own floor, enemies and a boss every ~17 minutes of work:
  🌼 Meadow, 🌲 Dark Forest, 💎 Caves, 🌴 Coast, 🌵 Desert, 🪦 Graveyard, 🌋 Volcano, 🐸 Swamp,
  🧊 Tundra, 🌈 Sky Islands. After the Sky Islands the world loops back to the Meadow, "II", with
  tougher enemies. The stats row shows how
  far through the current biome you are (`🌴 Coast 37%`); its boss waits at 100%. A 🌙 after it
  means it's night (when elites are twice as common), and a 🎃 or 🎄 that a seasonal event is on.
- **Level milestones bring bosses:** a ⭐ mini boss (a "Giant" version of a zone enemy) at levels
  5, 15, 25…, and a 👑 boss (an "Elder" version of the zone's boss, tougher than the one at the
  end of the zone) at levels 10, 20, 30…
- **Keeps your status line:** if you already have one, it stays on top and the companion goes under it.

## Privacy

The companion never reads your work. It doesn't look at your prompts, Claude's answers, your code
or your files, so it's safe to run on work projects and code under an NDA.

- **It only needs two numbers:** *when* Claude is working, from the hook events (including when its
  subagents start and stop, for the allies), and *how many tokens* each response used, from the
  `usage` field in Claude Code's local transcript. Claude Code
  hands every hook the prompt text (and `/compact` its instructions), but the companion ignores it. In the transcript it skips every
  line without a `usage` field and keeps only the token counts from the rest. The one text it
  checks for is Claude Code's own `[Request interrupted by user` marker, so pressing Esc pauses
  the hero.
- **Nothing from your work is saved:** the save file holds hero stats, timestamps, token totals,
  the IDs of the last few API messages (so tokens aren't counted twice) and where it stopped
  reading each session's transcript. See [Files](#files) for everything it writes.
- **Nothing leaves your machine:** no network access, and no npm dependencies. The scripts only
  use Node's built-in modules, and `child_process` only runs the status line you already had, so it
  keeps showing above the hero. The one exception is opt-in: `/vwc:window true` starts a small
  server that listens on `127.0.0.1` only (with a random key in its address) and opens a local
  browser window on it. It sends nothing anywhere, and it stops when the window closes.
- **Easy to check:** about 7,800 lines of plain JavaScript, with no build step and nothing
  minified. The transcript reading is `ingestTranscript()` in `scripts/companion.js`.

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

**More than one Claude Code window?** Update and reload every one of them. A window still on an
older version doesn't know newer heroes: while the 🧢 Trainer is your active hero, its status line
shows `companion error: …` instead of the companion, and work done in that window doesn't count
until it updates. Your save is safe, since a version that can't read it doesn't write to it. With
any other hero active, older windows work as before.

## Commands

| Command | What it does |
|---------|--------------|
| `/vwc:setup` | Points your status line at the companion. Your previous status line is saved and shown on top. Only needed if you already had a status line; safe to run again. |
| `/vwc:setup remove` | Turns the companion's status line off and puts back the one you had before (if any). It won't come back by itself. |
| `/vwc:chooseclass <mage\|warrior\|archer\|trainer>` | Switch class. The first time creates that hero; after that you resume its save. With no class, lists your heroes. The 🧢 trainer (also `bash`) unlocks once any hero reaches level 50. |
| `/vwc:createchar <mage\|warrior\|archer\|trainer>` | Start over with a new level 1 hero of that class. The old one is backed up first. A trainer's dex is kept. |
| `/vwc:hide <bar\|companion\|all>` | Hide the status bar (the info row on top), the companion (the hero rows), or both. A hidden hero keeps adventuring in the background. The choice is remembered across restarts. |
| `/vwc:show <bar\|companion\|all>` | Show them again. |
| `/vwc:skills` | Every hero's skills with their rarity, power and stats, and which boss drops the next one. |
| `/vwc:gear` | What every hero wears in each of the six gear slots, with each piece's rarity, power and stats, and what they add up to. |
| `/vwc:achievements` | Every achievement: the ones you earned (with the date and the hero), and how close you are to the rest. |
| `/vwc:statistics` | Each hero's work time, tokens, Claude turns (how many, the longest, shortest and average), XP, kills, bosses, finds and more, plus the totals of all heroes. See [Statistics](#statistics). |
| `/vwc:card [class\|all\|survival]` | A short card of your hero (or another class's, or all of them, or the Survival game's shelter) to paste in Slack or a pull request. See [Card](#card). |
| `/vwc:journal [class] [all]` | What happened while you worked: level ups, new weapons and biomes, bosses, skills, gear, reforges, knockouts and achievements, by day and time. A class shows only that hero's, `survival` the Survival game's shelter, and `all` everything kept instead of the last 50 lines. See [Journal](#journal). |
| `/vwc:dex [all]` | The 🧢 Trainer's dex: how many of the 151 critters he has caught, by biome, at night and legendary, his partner, and the last ones new in the dex. `all` lists all 151: caught (and when), seen, or not met yet. |
| `/vwc:stats <above\|below>` | Put the hero's stats row (level, XP, weapon, zone, kills) above the map, where it starts, or below it. With no argument it switches to the other place. The choice is remembered across restarts. |
| `/vwc:showprogress <on\|off>` | `off` hides the hero's progress (the stats row with name, level, XP, weapon, zone and kills, and the 💗 life bar) so only the map is shown; `on` brings it back. With no argument it switches. Level-ups, loot and other news are shown on the stats row, so you won't see them while it's hidden. The choice is remembered across restarts. |
| `/vwc:game <adventure\|survival>` | Switch the game on display. Only the one on display advances, so the other waits where it was. With no argument it switches. See [Survival](#survival). |
| `/vwc:shelter` | The inside of the Survival game's shelter: the day count, the next blood moon, the generator, walls, turrets, scrap, weapon, the people living there, the rooms and books, the lab, what he does with his surplus, the town, waves and totals. |
| `/vwc:window <true\|false>` | `true` opens the Survival game in a pixel-art window of its own, and the status line shows a single line; `false` brings it back to the status line. With no argument it switches. See [Survival window](#survival-window). |
| `/vwc:commands` | List every command, your heroes, how many achievements you have, and what is currently shown or hidden. |

The commands run a small script before Claude sees anything, and then use Haiku to repeat the
result, so they are quick and cheap. Claude never runs them on its own.

## Classes

| Class | Hero | Fights from | Basic attack | Weapons | Skills |
|-------|------|-------------|--------------|---------|--------|
| Mage | 🧙 | 3 tiles | 🔹 magic missile | 🪵 📜 🪄 📖 🔮 💎 🌟 | 🔥 ⚡ 🧊 🌊 💫 🌑 spells |
| Warrior | 🤺 | 2 tiles (melee) | 💥 | 🔪 🏏 🪓 🔨 🔱 🪝 🌟 | 💪 🌀 💢 🩸 🌋 🔥 strikes |
| Archer | 🧝 | 5 tiles | 🔸 arrow that flies across the gap | 🪨 🪃 🏹 🪶 🌙 💘 🌟 | 🎯 🍃 🦅 💨 🌠 🔥 shots |
| Trainer (level 50) | 🧢 | his partner's, by its type | his partner's (⚡ 🔥 💧 🍃…) | 🔴 🟠 🟡 🟢 🔵 🟣 🌟 balls | his partner's type |

The mage hits weakly but rolls the strongest skills, the warrior hits hardest (its skills roll a
little weaker), and the archer lands double-damage critical shots 20% of the time. The warrior,
always up close, has the most life; the archer, which shoots most enemies before they reach it,
has the least, so bosses are its danger. On average all
three level up at the same pace (within about a level of each other up to 30 hours of work, checked by
simulation), so the choice is about style. Skills are random, so luck can put a hero a level or
two ahead or behind. Only the active class's hero moves; the others wait where you left them.
The 🧢 Trainer, unlocked at level 50, keeps the same pace (see [The Trainer](#the-trainer)).

## Weapon mastery

Nothing new drops for the weapon after level 35, so from then on it gets better with use. Every
kill made with the 🌟 star weapon (the Mage's, Warrior's, Archer's or Trainer's) counts toward its
next rank: the first takes 100 kills, the second 200, the third 300, and so on. Each rank adds 2%
to the hero's damage, and nothing stops it. The weapon shows its rank on the stats row
(`🌟 Star Bow +3`), the journal writes down each new rank, and `/vwc:statistics` shows the kills
left for the next one. A hero at level 35 or more when it updates starts at rank 0.

## The Trainer

🧢 Bash the Trainer is the fourth class. He unlocks for good once any hero reaches level 50 (the
Legend achievement, about 30 hours of work), and starts at level 1 in the 🌼 Meadow like any new
hero: `/vwc:chooseclass trainer`, or `bash`.

```
🧢 Trainer Lv 21 ▰▰▰▰▱▱▱▱▱▱ 5310/12975 XP · 🐭 Clauchu · 🔵 Context Ball · ⚡🔋 · 🪦 Graveyard III 91% · 💀 1763 · 📕 23/151
            💗 ▰▰▰▰▰▰▰▰▰▱ 918/1077 · 🧪 3 · 🔩 12/30
                   🦊🧢🐭  . ⚡ 👻    . 🦴.     .
```

- **His partner fights for him,** with Bash one tile behind it. He starts with 🐭 Clauchu, an
  electric critter that never evolves. A partner fights like the class its type matches (electric,
  fire, water, psychic, ghost and ice like the mage; normal, fighting, rock, ground and dragon like
  the warrior; flying, bug, poison and grass like the archer), with its type's hit and skills
  (Overclock Zap, Null Pointer, Core Dump, Tree Shake…). Its species' power makes it a little
  stronger or weaker. When it loses, it faints and gets back up, like any knocked out hero.
- **Balls are his weapons:** 🔴 Clau Ball, 🟠 Byte Ball, 🟡 Token Ball, 🟢 Cache Ball, 🔵 Context Ball,
  🟣 Prompt Ball and 🌟 Star Ball, as strong as the other classes' weapons at the same levels, and
  each one better at catching.
- **Wild critters** come out among the usual enemies on his map: 40% of what spawns, always alone.
  Each biome has its own (Packey and Ramdata in the Meadow, Gitdude in the Caves, Rubberduck and
  Tentaclaude on the Coast…), a pair that comes out at night (and a quarter as often by day), and a
  critter as its zone boss (🐻 Blocklax, 🪲 Pinsort…). Evolved forms only show up deeper in the
  world. The usual enemies, elites and seasonal enemies can't be caught.
- **Catching happens on its own.** A defeated critter is caught 8% of the time (up to 16% with the
  🌟 Star Ball) and a boss half the time: `🔵 Caught 🦀 Crabbyte! 📕 17/151`. A catch grows to
  Bash's level right away, evolving through every evolution level he has passed:
  `🟢 Caught 🌰 Kakunit, ✨ it evolved into 🐝 Bugdrill! 📕 29/151`. Species you haven't caught yet
  show up more often.
- **A stronger catch becomes the partner,** but only if Bash ends up stronger with it, which the
  game checks first, so a swap never makes him weaker:
  `🔄 🐻 Blocklax is your new partner, in place of 🐭 Clauchu · its skills: 🔁 Retry Rumble`. The gear
  stays with Bash and fits whoever fights. The old partner leaves with its skills, and the new one
  brings its own, as many and as rare. Expect 3 or 4 partners in 40 hours of work.
- **Level bosses are critters too:** a Giant critter at levels 5, 15, 25…, an Elder one at levels
  10, 60, 70…, and at levels 20, 30, 40 and 50 the legendaries 🦢 Haikuno, 🦅 Sonnetdos, 🦚 Opustres
  and 🧬 Clewtwo, which are always caught. Once you have the other 150, a secret last one shows up.
- **The dex** keeps the critters caught, shared by every trainer, so `/vwc:createchar trainer` never
  loses it. `/vwc:dex` shows how far along you are, your partner and the last ones new in the dex,
  and `/vwc:dex all` lists all 151 (one you haven't met yet only shows where to look):

  ```
  📕 Dex · 107 of 151 caught · 146 seen

    🌼 Meadow 16/19 · 🌲 Dark Forest 20/21 · 💎 Caves 16/22 · 🌴 Coast 12/24
    🌵 Desert 14/22 · 🪦 Graveyard 16/18 · 🌋 Volcano 13/20 · 🌟 Legendaries 0/5 · 🌙 At night 5/14
    Partner: 🗿 Gitlem (rock, since 2026-10-06) · 3 partners so far
  ```

- **Pace:** checked by simulation, a trainer levels like the other classes, has most of the dex
  after 10 to 13 hours of work, and all of it at about level 50 (30 to 34 hours).
- **Names:** every critter is a parody, a coding or Claude pun on a famous original and never the
  original itself. All 151, with their types and where they live, are in `scripts/roster.js`.

## Survival

A second game, switched on with `/vwc:game survival` (and off with `/vwc:game adventure`). Only the
game on display advances, so the other waits where it was. Like the adventure it needs no input:
it takes one step per second of Claude's work.

- The 🧑 survivor patrols a strip around the 🏠 shelter in the center, fighting 🧟 zombies. Crossing
  the shelter's tile means going inside, where nothing can reach him: when he is badly hurt he goes
  home and rests until he is better. The shelter grows with its walls (🏠 → 🏡 → 🏰 → 🏯) and gets
  a 🔥 cooking fire, a ⚡ generator, a 🚩 flag and a 🧪 lab as it develops.
- **Zombies:** 🧟 walkers, 👹 brutes (from wave 2), 🐺 runners (wave 4), 😱 screamers (wave 6) that
  call runners the first time they see him (so he and the turrets shoot them first), 🤮 bloaters
  (wave 7) that burst when they die and hurt everything around them, zombies included, 🦠 spitters
  that attack the walls from a distance (wave 8), and 🦏 juggernauts (wave 12) that break a
  barricade in one blow. From wave 3 a whole group may arrive at once ("a horde of 5 comes from the
  left"), or a swarm of 🐀 rats, many and weak.
- **Tyrants.** Every 10th wave a tyrant comes, who drops better clothes, and they take turns, each
  with its own trick: the 👺 tyrant, the 👸 screamer queen (calls runners in as she comes), the 🦣
  behemoth (walks through barricades) and the 🐛 brood (splits into walkers when it dies).
- **🦹 Raiders.** From wave 5, now and then a band of raiders comes instead of zombies. They shoot
  from 3 tiles (at him and at the walls) and step around traps and spikes, but they drop bullets,
  now and then a gun (the pistol or rifle blueprint, if he still needs it) and, rarely, Tactical
  gear. They never take anything.
- **🐫 A passing trader.** Every so often, by day, a trader stops on the strip for a few minutes.
  When the survivor reaches the trader, a share of what he has most of is swapped for what he is
  shortest of (wood for the walls, gas for the vehicles…), at fair rates and on its own. No shop,
  no choices.
- **🎃 Seasons.** The adventure's seasons reach the strip: in October 🎃 pumpkin-headed zombies
  (good eating) and 🤡 clowns come, and pumpkins stand among the trees; in December ⛄ snow covers
  the ground, the zombies wade through it a step slower, and the lakes freeze, so he fishes through
  the ice (safe, and food) instead of diving.
- **🌙 Nights.** Night follows the same clock as the adventure's (20:00 to 06:00): the ground
  darkens, more zombies come (runners from wave 2), and the turrets, drifters and lookout only see 5
  tiles unless the generator lights the strip. On the night of the full moon, worked out from the
  date, a 🌕 blood moon rises: the ground turns red, more zombies still come, and they drop twice as
  much. `/vwc:shelter` says when the next one is.
- **⚡ The generator.** With its blueprint, he builds a generator, which runs on the tokens Claude
  uses while Survival is on display: every 500 tokens are a second of power, and it holds 15
  minutes' worth. While it runs, an electric fence shocks the zombies at the walls and, at night,
  lights reach 3 tiles either side of the shelter, so the guns see as far as by day. Big turns
  charge it more; tokens used while the adventure is on display don't count.
- **📅 Days.** The stats row counts the days he has been out there (each day with Survival played
  is one), and the 🪧 sign counts the days in a row the shelter has stood. A fall puts the sign back
  to 0; `/vwc:shelter` keeps the best run.
- **He sizes up every fight.** Before he charges, he weighs the zombies in sight (how tough they
  are, how many, how fast) against what he has: his weapon, whether he has bullets for a gun and
  how many, his clothes, and the turrets that reach the fight. A knife against a crowd of brutes is
  a fight he can't win, so when three or more are coming and the turrets can hold the walls, he
  falls back to the shelter (🏃, then 🧱 holed up) and uses the time to build or make bullets. With a
  gun and enough bullets, the same crowd is worth facing. A fresh survivor misjudges, thinking
  fights are easier than they are; the 🧠 Tactics skill, learned from falling back and from getting
  hurt, makes him a better judge. If the walls are failing or the standoff drags on, he goes out
  anyway. `/vwc:shelter` shows his last call.
- **He is an ordinary man.** He can nail boards together for the walls, but he has to find a 📜
  blueprint before he can build, craft or cook anything else. They turn up in crates and when he
  explores, once their time has come, and every find without one makes the next likelier to bring
  one. There are twenty-four: 🗼 Turrets, 🧵 Sewing, 🍳 Cooking, 🏏 Bat, 🪓 Axe, 🔪 Machete, 🏹 Bow,
  🔫 Pistol, 🧨 Bullets, 🍾 Molotovs, 💣 Grenades, 🧥 Leather, 🚧 Barricades, 🪤 Traps, 📌 Spikes,
  🧰 Heavy turrets, ⚡ Generator, 🔭 Rifle, 🦺 Kevlar, 🪚 Chainsaw and, late on, 🔩 Steel plates, 🛻
  Pickup, 🚜 Tank and 🚁 Helicopter. A weapon's blueprint turns up once he holds the rung below it. Until he finds the
  turret blueprint, the waves hold back and he fights with his fists.
- **He explores.** Places turn up along the strip, and when he is healthy, the walls hold and
  nothing is near, he goes to look, at his own risk: a 🏢 abandoned building may hide an ambush, a
  🌊 lake can hurt him (or nearly drown him) but may hold finds, a ⛺ lost shelter is a safe stop
  that heals him, a 🚪 bunker is always guarded but holds the best loot, often a blueprint, a 🏥
  hospital has 💊 medkits (each cuts a rest short), a 🛒 supermarket food and cloth, a ⛽ gas station
  gas and bottles, and 🗻 caves are rich in scrap but full of 🦇 bats, and now and then a passage
  leads to a hidden bunker.
  The search takes a few seconds (🔍) and a bad one can leave him hurt, so he may rest after.
- **🧭 Trips.** Once he has explored a few places and a turret guards the shelter, he sets out
  down the road past one end of the strip (🪧), by day, rested, with the walls nearly whole and
  nothing near them, at most every 4 minutes of work. He searches 2 to 4 places, each further out
  than the last: a 🌾 farm (food and wood), a ⛽ gas station (gas and bottles), a 🏬 town (people and
  books, and ambushes), a 🚢 harbor (fish, and the first time a 🚤 boat that takes every trip on to a
  🌴 island with rich finds) and, from wave 6, a 🪖 army base, guarded like a bunker but with the
  best finds. Their finds grow with the waves, and on the way he siphons the gas left in the 🚗
  cars by the road. Zombies wait along the road and come at him once he is near, and
  while he is away more of them come for the shelter, sometimes a whole horde, so the turrets have
  to hold on their own. He heads home once the places are searched, or sooner if he is hurt, night
  falls, a fight is too big, or the walls drop under half. While he is out, the map follows him past
  🚗 wrecked cars, and a red "🧟 3 at the walls" tells of an attack at home. `/vwc:shelter` shows the
  trip, or what the next one waits for.
- **Nothing is there until he builds it.** He gathers 🔩 scrap (from zombies and 📦 crates), 🪵 wood,
  🧵 cloth and 🥩 food. With enough, he heads home and works inside for a few seconds (shown as 🔨):
  🗼 turrets, one per free slot, then the next weapon, then stronger 🧱 walls, which add turret
  slots and let the shelter grow. He only goes home to build once the zombies are off the doorstep.
- **Defenses.** From inside the shelter, once he has found how, he sets up defenses along the
  approach, in slots that open with the shelter's level: 🚧 barricades close in (a zombie stops to
  chew through one, under the turrets' fire), 🪤 traps further out (the first zombie to step on one
  is caught, hurt and held for a few seconds; the trap is used up, and a standing trap also catches
  game now and then, for food) and 📌 spikes beyond (every zombie that crosses them is hurt). He
  replaces what gets destroyed, with a pause between jobs. The 🪤 Trapping skill makes them last
  and hit harder. A fallen shelter loses its defenses.
- **Weapons:** 👊 fists, a 🏏 bat (shelter level 2), a 🪓 axe (3), a 🔪 machete (4), a 🏹 bow (5,
  reach 3 tiles, shooting arrows he cuts from wood), a 🔫 pistol (6, reach 4), a 🔭 rifle (9, reach
  6), a 🪚 chainsaw (12, for when the guns run dry) and, near the endgame, vehicles he rides on the
  map: a 🛻 pickup (15) that rams the zombies and knocks them back, a 🚜 tank (19, reach 8) and a 🚁
  helicopter (26, reach 10), whose shots hit the zombies around the target too. Each needs its own
  blueprint. Guns need 🧨 bullets, which he makes from scrap (a vehicle uses 3 or 5 a shot), and
  vehicles burn ⛽ gas, found at gas stations, in the cars by the road and in supply drops; when
  something runs out he takes the next weapon down until he has more. A weapon that a save from
  before 1.31.0 already had above its new level (a helicopter at shelter level 21, say) stays his,
  parked until the shelter reaches its level.
- **🍾 Molotovs and 💣 grenades.** With their blueprints he makes them (a bottle, some gas and a rag;
  or scrap) and throws them on his own at groups of three or more: a molotov sets the ground on fire
  for a few seconds, a grenade blasts everything within 2 tiles.
- **Clothes:** four slots (🪖 helmet, 🦺 vest, 🧤 gloves, 🥾 boots). Zombies and the places he
  searches sometimes give a piece (better ones deeper into the waves), and with a sewing blueprint
  he makes his own from cloth and scrap: Cloth, then Leather and Kevlar with their blueprints. A
  better piece always replaces the one worn in that slot, and the worse one is torn up for cloth.
  They stop up to half of every bite.
- **Cooking:** with the blueprint, he turns food into 🍲 meals. Hurt, he eats one on the move: it
  heals him and makes him hit harder for a while (😋).
- While he is away or building, the turrets he has built defend the shelter.
- **🤠 Drifters.** Every subagent Claude runs sends a drifter to the shelter (two at a time at
  most). Drifters stand on the walls and shoot the nearest zombie until their subagent finishes.
- **🪂 Supply drops.** When Claude compacts the conversation while Survival is on display, a supply
  drop comes down somewhere on the strip (on the adventure, the hero makes camp instead). It holds
  more than a crate, bullets once he makes them, and often a blueprint or a piece of clothing. A
  drop still out there survives a fall of the shelter.
- **👷 People move in.** Survivors he meets on his searches (most often at a lost shelter) move in
  while there is a bed for them, one every 3 shelter levels, and each takes the role nobody has yet:
  🔧 a mechanic mends the walls twice as fast, 🩹 a medic makes his rests heal twice as fast and
  knockouts shorter, 🍳 a cook makes meals from the food in the pantry, 🔭 a lookout shoots from the
  roof like another turret, and 🎒 a scavenger goes on runs and comes back with materials, now and
  then a blueprint. They stay inside, so nothing can hurt them.
- **🐕 A dog.** Once he has explored a few places, a search may turn up a dog that follows him from
  then on: it trots behind him, fetches a crate lying close by every so often, and barks before an
  ambush, so fewer of them catch him.
- **🏠 Inside the shelter.** Under it are its rooms: a 🔧 workshop, 📦 storage and bunks from the
  start, a 🍳 kitchen once he (or a cook who moved in) can cook, a 📚 study once he finds a book,
  and the 🧪 lab. He builds and crafts in there, and when he is resting or holed up he keeps busy:
  he builds what he can, reads a book, or tidies the storage, which now and then turns up a few
  forgotten materials. He eats at the kitchen table.
- **📚 Books.** Buildings, bunkers, lost shelters, supply drops and the scavenger's runs sometimes
  turn up a book. With one to read, he takes a reading break every 10 minutes of work when nothing
  is at the walls (the turrets keep watch), and reads when there is nothing else to do. Books are
  hard going: a read takes a minute and a half, and sinks in only about 4 times in 10 at first (the
  📖 Studying skill helps); otherwise he reads it again. What sinks in teaches him to build the
  rooms of a cellar, dug at shelter level 5: a 🌱 Greenhouse (1 book: food), a 🩺 Infirmary (2:
  faster rests, shorter knockouts), a 💣 Armory (3: half again as many bullets a batch), a 📻 Radio
  room (3: a supply drop every 2 hours of work), a 💪 Training room (4: he hits 10% harder), a 📚
  Library (2: books sink in more often), a 💧 Water still (2: meals heal half again as much) and a
  🚘 Garage (4: vehicles use a third fewer bullets and a quarter less gas), in that order. He builds
  each one when he has the materials.
- **🧪 The cure.** Once he flies the helicopter, brutes and spitters now and then carry a sample of
  the virus, a tyrant several, and a bunker may hold one. He builds a lab at the shelter, and it
  studies the samples one stage at a time, each one for good: 🧫 Antibodies (bites hurt him 15%
  less), 🔬 Weak spot (he, the turrets and the drifters hit 15% harder), 🩸 Serum (zombies come with
  10% less life), 🧴 Repellent (hordes and ambushes a third smaller) and 💉 the cure itself. The cure
  puts a ✨ on the shelter, worth 10% more damage and walls, and a new strain follows: every cure
  after that takes more samples and adds another ✨.
- **🪓 What piles up gets used.** From shelter level 15 he puts his surplus to work, on his own:
  - a 🪓 **lumber camp**, whose woodcutters go out every minute of work while the walls want wood,
    paid in food (more as the shelter grows), and come back with wood;
  - 🔩 **steel plates** (a blueprint): scrap stands in for up to half the walls' wood, 3 scrap for
    each;
  - a 🏪 **trading post**, once he has traded: traders come twice as often, stay twice as long and
    swap twice as much;
  - and whatever is spare once the next walls (and the town's next building) are kept back goes to
    the cheapest of: the 🪛 **workbench** (his weapons, or the turrets, 5% harder each time, every
    mod dearer than the last: "🚜 Tank +3", "🗼 6/6 Mk 2"), 🪡 **patches** for his clothes once
    nothing better can be sewn (up to 65% protection), and 💂 **guards**, hired for food and cloth,
    who shoot from the walls like drifters as long as they are paid in food. When he can cook and
    food is spare, he throws a 🍗 **feast**: everyone fights 10% harder for half an hour.
- **🌆 The town.** From shelter level 20 he rebuilds the town around the shelter, one building at a
  time. He pays for each up front, out of what is spare, and the settlers raise it over half an hour
  to two hours of work while he goes on as before: 🛖 Houses (settlers join the woodcutters: half
  again as much wood), 🏭 a Factory (the turrets hit 20% harder), 🏨 an Inn (two more guards), 📡 a
  Radio mast (a supply drop every hour of work), ⛲ a Fountain (he heals twice as fast) and 🎪 a
  Fairground (everyone fights 10% harder, and the shelter is a haven). The stats row shows the one
  going up ("🏭 40%"), then how many stand ("🌆 3/6").
- **He learns by doing.** Each skill has three tiers, earned from what he has done: 🎒 Scavenging
  (crates gathered), 🥊 Combat (zombies killed by hand), 🔧 Engineering (things built), 🧱 Fortifying
  (waves survived), 🩹 First aid (times he had to rest), 🧵 Tailoring (clothes made), 🍳 Cooking (meals
  cooked), 🔍 Scouting (places explored: fewer ambushes, bigger finds), 🏊 Diving (lake dives: less
  damage, more finds), 🧨 Gunsmithing (bullets made: more a batch, harder hits), 🪤 Trapping (defenses set up), 📖 Studying (books read through: they sink in more often) and 🧠 Tactics (hard lessons).
- The stats row counts the zombies the wave still needs ("🧟 Wave 10: 12 left"). Waves hold at the
  shelter's pace: once a wave is done, the next waits until the walls or turrets can take it, and
  the row says "held" (`/vwc:shelter` says what it waits for). If the shelter falls anyway, you lose a quarter of the materials
  and a wave, the zombies thin out for a few minutes, and it is rebuilt in a few seconds.
  Turrets, blueprints, clothes, skills and levels are never lost.
- `/vwc:shelter` shows the inside: what is built, what he is saving for, who lives there, the lab,
  what he does with his surplus and what is spare, the town, what he wears, his blueprints and what
  he has learned. The save is its own file, `survival.json`.
- **Journal, card and achievements.** `/vwc:journal survival` lists the shelter's moments by day
  (blueprints, tyrants, falls and rebuilds, weapons, rooms, people, the town, the cure and achievements),
  `/vwc:card survival` shows the shelter as a card to share, and `/vwc:achievements` has a Shelter
  group. Reaching wave 30 gives your adventure heroes the title 🧟 Survivor on their cards and
  statistics; it changes nothing else.

### Survival window

`/vwc:window true` opens the Survival game in a window of its own, drawn as a pixel-art diorama: the
shelter and its towers, the people and zombies, hills that drift as the camera follows him, the sky
by the hour (and the blood moon), the generator's lights and the campfire glowing at night, the
lumber camp and the trading post by the ends of the road, guards on the walls, flags strung up for
a feast, and further back the town he rebuilds, with a turning big wheel at the end. Under
the ground, the shelter's rooms are cut open, and he is seen in the one he is at: crafting at the
workbench, cooking, reading at the desk, tidying the shelves, asleep in a bunk, with the people who
moved in at work in theirs. The stats row sits above it, and the news under it.

It is seen from a little above, so it has depth: the road recedes, the shelter, walls, towers and
places are solid blocks with lit tops and shaded sides, the zombies spread over the road's width,
the rooms are open like a dollhouse, and by day everything casts a shadow away from the sun. On a
trip, the camera follows him down the road, and a small view of the shelter in the corner shows it
holding out, with the walls' life under it and its frame flashing red while zombies are at them.

```
🪟 Survival is in its window · 📅 Day 9 · 🧟 Wave 12
```

- **The game is the same.** It still runs in the status line's ticks, one step per second of
  Claude's work, so everything works as before; the window only shows it, and eases everything
  between steps. While it is open, the status line shows the single line above.
- **Back to the status line:** `/vwc:window false`, closing the window, or switching to the
  adventure with `/vwc:game adventure`. `/vwc:window true` puts Survival on display if it wasn't.
- **How it opens:** as an Edge or Chrome app window (no tabs or address bar), with a profile of its
  own in your temp folder. Without either browser it opens in a tab of your default browser, and
  stops a few minutes after the tab closes.
- **Private:** a small server on `127.0.0.1` only, with a random key in the address, that reads
  `survival.json` and sends nothing anywhere.

## Skills

Every hero starts with no skills. Reaching levels 5, 15, 25… summons a mini boss and levels 10, 20,
30… a boss; defeating it drops a random skill:

```
🏆 Defeated 🦖 Elder Sand Rex! · 🎁 ⚡ Storm Lance (rare)
🏆 Defeated 🦅 Giant Vulture! · 🎁 💫 Star Ray (epic) ⇄ 🌑
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

Every hero starts with nothing in its six gear slots. A normal enemy drops a piece 4% of the
time (about one every 3 minutes of work, counting the bosses) and every boss drops one, rolling
the rarity twice like a skill from a level 10 boss. Nothing to do on your side:

```
🎁 🧤 Iron Grips (rare)
🎁 🥾 Steel Treads (epic) ⇄
🏆 Defeated 🦍 Ape King! · 🔩 +2 🧣 Steel Spaulders (rare)
🔩 +1 🪖 Steel Hood (common) · 🔩 Reforged 🧤 Iron Grips +1 (+1% damage)
```

The messages are short: 🎁 is a find that was equipped, ⇄ after it that it replaced a piece (or, for a
skill, the 🎁 skill that it replaced), and 🔩 +N a piece salvaged for N shards because yours is better.

- **What's rolled:** the slot, the rarity (same chances as skills), and the stats: `+% damage`,
  `+% critical chance`, `+% XP` or `+% life`, sometimes two of them. Gear found at higher levels rolls
  stronger, and its material shows how deep it was found: Leather, Bronze (level 5), Iron (10),
  Steel (15), Silver (20), Mithril (25), Dragonscale (35).
- **Better or salvaged:** a piece's **power** is the sum of its stats (a +1% critical chance is
  worth +1% damage on average). A piece with more power than the one in its slot is equipped right
  away. Otherwise it's salvaged into 🔩 shards (1 for a common piece, 2 rare, 3 epic, 5 legendary),
  leaving a 🔩 where the enemy fell, and you keep the old one.
- **Reforging:** shards reforge your weakest piece on their own, adding +1 to its biggest stat and
  a +1 to its name ("Iron Grips +2"). A piece's first reforge costs 10 shards, its second 20, its
  third 30 and so on, and of two pieces as weak, the one reforged less goes first. The life row
  shows the shards against the price of the next reforge (`🔩 7/10`). That's about one reforge
  every 45 minutes of work. A reforged piece is replaced like any other once a better one drops.
- **How much it adds:** a full set adds about +30% after an hour of work, +60% after 8 hours and
  +90% after 30 hours, spread over damage, critical chance, XP and life.
- `/vwc:gear` shows what each hero wears, and its shards:

  ```
  ▶ 🧝 Archer Lv 16 · 6 of 6 slots · +24% damage, +6% critical chance, +11% XP · 💗 467 life · 🔩 7/10 shards
      🪖 Helmet     Steel Circlet             epic      power  9   +9% damage
      🥋 Chest      Steel Robe +1             common    power  6   +6% XP
      👖 Pants      Iron Leggings             rare      power  6   +4% damage, +2% critical chance
      ...
  ```

Heroes from before 1.5.0 start with empty slots, like new ones. In 1.11.0, every piece a hero had
left behind became 1 shard, reforged right away; the journal says how many.

## Life and combat

The hero's life bar sits right under its XP bar, with the potions it carries, the rested XP left
(see [Rested XP](#rested-xp)) and its shards toward the next reforge (see [Gear](#gear)):

```
🧝 Archer Lv 16 ▰▱▱▱▱▱▱▱▱▱ 1060/5744 XP · 🪶 Fletched Bow · 💎 Caves II 81% · 👺 Goblin ▰▰▱▱▱▱▱▱▱▱ 50/326 -135
             💗 ▰▰▰▰▰▰▰▰▱▱ 441/467 -26 · 🧪 1 · 💤 +100% XP 12m · 🔩 7/10
```

- **Enemies fight back,** one at a time or as a group: the nearest one, with the rest of its
  group, notices the hero 8 tiles away and walks up to it. The ones that shoot stop 4 tiles away and fire: 🟢 venom (🐍), 🟣 shrieks and curses
  (🦇 👻), 🟤 rocks (👺), 💧 water (🦑 🐙), 🎵 songs (🧜), ⚪ snowballs (⛄) and 🔴 fire (🐲 🐉 🧞). Mini bosses and bosses strike every
  other second, harder. Their damage grows with the zone, like their life.
- **Groups:** 4 in 10 times, enemies come as a group of 2 (20%), 3 (12%) or 4 (8%), standing side
  by side, a mix of the zone's enemies. Each is weaker than one alone (65% of the life, damage and
  XP), but they fight together: the melee ones queue up behind each other, the ones that shoot
  fire over them, and there's no pause to heal until the last one falls. The stats row shows the
  rest of the group as "+2", and an area hit as "x3" after the damage.
- **Elites:** 1 normal enemy in 20, and 1 in 10 at night, is an elite with a trait before its
  name, in gold on the stats row. It has 2.5 times the life and gives 3 times the XP, drops a piece
  of gear 1 time in 4 (with the rarity rolled twice, like a boss's) and potions 3 times as often.
  Its trait:

  | Trait | What it does |
  |-------|--------------|
  | Swift | dodges 1 hit in 4 (the stats row says `miss`) |
  | Armored | takes 40% less damage |
  | Vampiric | heals by half the damage it deals |
  | Explosive | explodes 💥 when defeated, for 15% of the hero's life (it can't knock the hero out) |

  ```
  🤺 Warrior Lv 12 ▰▰▱▱▱▱▱▱▱▱ 512/2429 XP · 🪓 Axe · 🌲 Dark Forest II 64% · 💀 587 · 🐺 Armored Wolf ▰▰▰▰▰▰▰▱▱▱ 590/760 -96
  ```
- **Bounties:** entering a biome sets one bounty, and the hero works on it by itself. It is either
  to defeat a number of one of the biome's enemies (about a third of what shows up), to defeat 2
  elites, or to beat the zone's boss without drinking a potion or being knocked out. The reward is
  12 shards, a potion or a lucky piece of gear. The stats row shows it when set and when done, the
  journal keeps it (`📋 🐺 ×11 · 🔩 12`, then `📋 ✓ …` when done), and `📋 🐺 7/11` follows the kills on the row while it's open. Break a boss
  bounty's rule and it fails right then; a bounty not finished when you leave the biome just ends.
  Nothing is taken away. A trainer's bounties ask for critters (and no elites).
- **Treasure goblins:** about 1 spawn in 80 is a lone 💰 Treasure Goblin with 2 times the life of a
  normal enemy. It never attacks: once the hero is within 8 tiles it runs a tile every 2 seconds,
  and after 24 seconds it's gone. Caught, it drops 🔩 20 shards, a lucky piece of gear (rarity
  rolled twice) and 4 times the XP. About 8 in 10 get caught.
- **Range matters:** the archer gets about 4 free shots at an enemy walking up to it, the mage 2,
  the warrior 1.
- **Life** grows with the level and with gear's `+% life`. It comes back while walking between
  fights, and all of it on a level up.
- **Potions:** 🧪 dropped by 1 enemy in 15 and by every boss, up to 3 at a time. The hero drinks
  one on its own when its life drops below 30%, getting half of it back.
- **Knocked out:** at 0 life the hero shows 😵 and rests for 15 seconds of work while the enemy
  heals. Then it gets back up with full life and +25% damage for every knockout until its next win,
  so it always gets through in the end. Nothing is lost but the time.

For a hero on pace (checked by simulation), that's 3 to 6 potions an hour, more at night when
elites are more common, and a knockout now and then, mostly by Elder bosses, which are the
archer's real danger.

### Enemies keep up with you

Enemy life grows with the zone, and a hero that's ahead of the curve (thanks to tokens, rested XP
or lucky skills) would otherwise kill everything in one or two hits. So enemies also scale with
how far ahead you are:

- **On pace:** the game knows the level a hero on pace has at each point of the world (level 14 at
  the start of 💎 Caves II, 20 at the start of 🌵 Desert III, 26 at 🌴 Coast V…). Up to a level
  above it, nothing changes.
- **Ahead:** for every level beyond that, enemies have 8% more life, damage and XP, up to double.
  A level 23 hero where a hero on pace is level 20.6 meets enemies 11% tougher.
- **Nothing lost:** the extra XP matches the extra life, so a hero ahead of pace levels up just as
  fast as before; its fights just stay fights. A hero behind pace meets normal enemies.

## Allies

When Claude runs a subagent (to explore the code, plan, review…), an ally joins the hero and
fights with it until the subagent finishes:

```
🧝 Archer Lv 12 ▰▰▰▰▱▱▱▱▱▱ 812/2429 XP · 🦊 A fox joins the fight
                                                🦊🦉🧝  . 🔸🪶🐾  🦑      🐚    . .         🌴
```

- **Who comes:** a 🦊 fox, 🦉 owl, 🐕 hound, 🧚 fairy or 🦄 unicorn, at random, walking right behind
  the hero. Up to 2 fight at once; if Claude runs more subagents, the next one steps in when one
  of the first two leaves.
- **What they do:** every second the hero attacks, each ally strikes the same enemy for 30% of the
  hero's basic hit (without skills or critical hits), and its 🐾 🪶 🌸 🌈 flies across the map like
  the hero's shots. Enemies only go after the hero, so allies can't be hurt.
- **How much it helps:** with an ally at its side for a whole work day (checked by simulation), a
  hero ends about a level further along, and drinks fewer potions and gets knocked out less,
  since fights are shorter.
- **When they leave:** when the subagent finishes, when its session ends, or after 10 minutes
  without any news from it (a missed "finished" event).
- **Nothing to do:** subagents never move the hero on their own. A hero waiting for you stays put
  even if a subagent keeps working in the background; it only fights with its allies while Claude
  works.

## Day and night

The world follows your computer's clock. Night runs from 20:00 to 06:00, with an hour of dusk
before it and an hour of dawn after it, when the floor slowly darkens or brightens.

```
🤺 Warrior Lv 14 ▰▰▰▱▱▱▱▱▱▱ 1290/3854 XP · 🔨 War Hammer · 🌴 Coast II 41% 🌙 · 🌙 Night falls, and creatures of the night come out: 🧜 Siren
```

- **What changes:** the floor gets darker and bluer, a 🌙 follows the biome on the stats row, and
  each biome's creature of the night joins its enemies, so about 1 enemy in 4 is one of them.
  They're as strong as the others and give the same XP. [Elite enemies](#life-and-combat) are
  twice as common at night, 1 in 10.
- **Creatures of the night:** 🐺 Wolf in the 🌼 Meadow, 👻 Wisp (🟣) in the 🌲 Dark Forest, 🧟 Ghoul
  in the 💎 Caves, 🧜 Siren (🎵) on the 🌴 Coast, 🪲 Scarab in the 🌵 Desert, 🦇 Vampire Bat (🟣) in
  the 🪦 Graveyard and 🧞 Ifrit (🔴) in the 🌋 Volcano.
- **Nightfall and daybreak** are announced on the stats row when they happen.

## Seasonal events

Two months of the year have an event, from the 1st to the last day, announced on the stats row
and in the journal when it starts. Nothing from an event goes away when it ends.

```
🧙 Mage Lv 2 ▰▰▰▰▰▰▰▱▱▱ 16/21 XP · 🪵 Branch · 🌼 Meadow 7% 🎃 · 💀 7
           💗 ▰▰▰▰▰▰▰▰▰▰ 82/82 +6
             🧙    . . . 🍬   🎃.     👻👻  🌳🌼  .   🌼
```

- **🎃 Halloween (October):** pumpkins among the decor of every biome. 1 enemy in 12 drops a 🍬
  candy where it falls, and the hero eats it as it walks over it, getting 20% of its life back
  (`+6` on the life row). About 1 group in 6 is a wave of 👻 ghosts, whatever the biome.
- **🎄 Winter (December):** trees among the decor, snow on the floor, and ⛄ snowmen that throw ⚪
  snowballs, about 1 enemy in 8. The 🌋 Volcano is too hot for either.
- **Achievements:** Trick or Treat (eat 31 pieces of candy) and Snowball Fight (defeat 100
  snowmen).

## Campfire

When Claude compacts the conversation, by `/compact` or on its own when the context fills up,
the hero makes camp where it stands:

```
🤺 Warrior Lv 3 ▱▱▱▱▱▱▱▱▱▱ 0/48 XP · 🔪 Knife · ⛺ Camp while Claude compacts the conversation: full life, +25% damage for 10m
             💗 ▰▰▰▰▰▰▰▰▰▰ 129/129 · ⛺ +25% damage 10m
               🔥⛺🤺  🌳🌼  🐍  🌼🌼🌳    🐍    🌳. 🐗🐀🐍🐍
```

- **What it gives:** all of the hero's life back (a knocked out hero gets up right away) and
  +25% damage for 10 minutes of work, for its allies too. The life row shows what's left.
- **A short rest:** the hero sits by the fire for 15 seconds of work before moving on, so the camp
  can be seen.
- **How it knows:** from the `PreCompact` hook. Only that it happens counts; the instructions you
  give `/compact` are never read or saved.
- **Achievement:** Happy Camper, for making camp 10 times. The journal notes every camp.

## Rested XP

Coming back from a break, the hero is rested: kills give double XP for a while.

```
🧝 Archer Lv 21 ▰▰▰▰▱▱▱▱▱▱ 5225/12975 XP · 💤 Rested: +100% XP from kills for 28m
             💗 ▰▰▰▰▰▰▰▰▰▰ 709/709 · 🧪 3 · 💤 +100% XP 28m
```

- **What counts as a break:** any time without work: Claude waiting for you, a closed terminal, a
  night away. The first 5 minutes of a break don't count, so reading Claude's answer and typing
  the next message isn't a break.
- **How fast it fills:** every minute of break after the first 5 adds 30 seconds of rested XP, up
  to an hour. A 15-minute coffee is worth 5 minutes, a 1-hour lunch 28 minutes, and a night away
  fills it all.
- **While it lasts:** every second of work spends a second of it, and every kill gives its XP
  twice (with the gear's `+% XP` on both). Token XP isn't doubled. The life row shows what's
  left (`💤 +100% XP 12m`), and while you're away, how much the break has added so far.
- **Per hero:** the active hero gets the break. A hero you switch back to after a while away
  comes back rested too.
- **How much it adds** (checked by simulation): on a full work day, a full pool in the morning and
  part of one after lunch put a hero about a level further along. Someone working an hour a day
  comes back to a full pool every day, so all their kills give double XP.

Heroes from before 1.12.0 start with an empty pool, which fills at the first break after the
update.

## Achievements

94 achievements, shared by all your heroes. When you earn one, the stats row says
`🏅 Achievement: Dragonslayer`. `/vwc:achievements` lists them all, with how close you are:

```
🏅 Achievements · 19 of 75 earned

Combat
  ✅ First Blood        defeat an enemy                                2026-10-02 🧝
  ⬜ Slayer             defeat 1,000 enemies                           778/1,000
  ...
```

| Group | Achievements |
|-------|--------------|
| Combat | defeat 1, 100, 1,000 and 10,000 enemies; land a hit of 250 and of 2,500 damage; a critical hit with a skill; hit 4 enemies with one area skill; defeat 500 groups; defeat 100 elites; defeat 50 creatures of the night; be joined by an ally; defeat 100 enemies with one at your side; finish a bounty, and 25 |
| Bosses | the first zone boss, a mini boss, an Elder boss, 5 Elder bosses, the Dragon of the Volcano, and of Volcano X (the 10th time round) |
| Survival | drink a potion, and 100; win a fight with under 10% life; get knocked out and back up |
| Journey | levels 5, 10, 20, 30, 35 (the star weapon) and 50 (unlocks the Trainer); star weapon +5 and +10; reach all 10 biomes; play all three starting classes; all three to level 10 |
| Skills | find a skill; hold two; replace one; find an epic, and a legendary; hold two legendaries |
| Gear | find a piece; fill all 6 slots; find an epic, and a legendary; salvage 100 pieces; reforge a piece, and 50 times; catch a treasure goblin, and 10 |
| Collection | as the Trainer: catch a critter; have 25, 75 and 150 in the dex, and all 151 (a secret); see a catch evolve; catch a legendary; catch all 14 night critters; have 5 different partners |
| Seasons | eat 31 pieces of Halloween candy; defeat 100 snowmen in December |
| Shelter | in the Survival game: reach waves 10, 30 (your heroes earn the title 🧟 Survivor) and 50; kill a tyrant, and all four kinds; find 15 blueprints; 5 people living there; all 8 cellar rooms; craft the helicopter; cure the outbreak; kill 50 raiders; trade with a trader; reach an island; have the woodcutters cut 10,000 wood; rebuild all 6 buildings of the town; 7 days without a breach; see a blood moon; kill 31 pumpkin heads; a secret |
| Work | 1, 8 and 40 hours of work; 1 million and 10 million tokens; one turn of 30 minutes; come back to a full hour of rested XP; make camp 10 times; work 5, 20 and 100 days in a row; two secrets |

Kills, hours and other totals add up all your heroes, including ones replaced by
`/vwc:createchar`. A save from before 1.5.0 gets credit right away for what it shows: levels,
kills, zones, hours of work, level bosses passed and skills held.

## Statistics

`/vwc:statistics` shows what each hero did, then the totals of all of them:

```
📊 Statistics

▶ 🧝 Archer Lv 20 · 🌙 Moon Bow · 🌋 Volcano II 34%
    Work time     2h50m
    Tokens        1.2M · 21k a turn · most in one 250k
    Turns         57 · longest 15m18s · shortest 6s · average 2m59s
    XP            54k · 19k an hour · 6,120 from rested kills
    Kills         1,011 · 58 groups · 49 elites · 356 an hour
    Bosses        13 zone bosses · 2 mini bosses · 1 Elder boss
    Hits          biggest 450 · 212 critical skill hits
    Mastery       🌟 Star Bow +3 · +6% damage · 120/400 kills to the next rank
    Skills found  3 · 1 legendary · 1 replaced
    Gear found    13 · 1 epic · 1 legendary · 6 salvaged · 1 reforge
    Survival      2 potions drunk · 0 knockouts · 0 close calls
    Allies        14 allies joined · 287 kills together
    Bounties      9 bounties done · 2 Treasure Goblins caught

All heroes · 3h11m of work · 1.5M tokens · 1,141 kills · 61 turns · longest turn 15m18s · 4 days in a row (best 9)
```

- **A streak** counts the days in a row with any work, by your local calendar. The totals line shows
  the one you're on (it stays until the end of the next day) and your best. It starts when you
  update to 1.24.0.
- **Work time** is the time the hero spent adventuring: only while Claude works.
- **A trainer** also gets a Catches row: his catches, how many an hour, how many were new in the
  dex, how many evolved, and his partners.
- **Tokens** are the ones used while that hero was active (input, cache writes and output, not
  cache reads, as for XP).
- **A turn** runs from your message to Claude's answer and counts for the hero that was active
  when you sent it. Turns that ran a `/vwc:` command or were stopped with Esc don't count.
- **Heroes from before 1.10.0** didn't keep their own tokens and turns, so those count from the
  day you updated, and the list says since when. The totals at the bottom count tokens and the
  longest turn for the whole save. Allies, reforges and the kills made with allies count from 1.11.0, and rested XP from 1.12.0.

## Journal

What the stats row says only stays there for a few seconds, and you're busy working.
`/vwc:journal` keeps the moments worth knowing about, by day, oldest first, so the newest end up
right above your prompt:

```
📜 Journal · the last 50 of 214 moments

Friday 2026-10-02
  14:21 🧝 🏆 Defeated 🦖 Sand Rex! · Entered 🪦 Graveyard
  14:25 🧝 🔩 +3 🧤 Iron Grips (epic) · 🎉 Level 11!
  14:31 🧝 🔩 Reforged 🥋 Bronze Robe +1 (+1% damage)
  15:01 🧝 🎉 Level 13! · New weapon: 🪶 Fletched Bow
  15:44 🧝 🏆 Defeated 🦅 Giant Vulture! · 🎁 🔥 Fire Shot (epic) ⇄ 🔥
```

- **What's written down:** level ups, new weapons, new biomes, defeated bosses, skills found, gear
  equipped, epic and legendary gear salvaged, reforges, weapon ranks, knockouts, bounties, treasure goblins,
  achievements and updates.
  Potions, allies joining and common salvages are left out, since they come often.
- **One line a minute:** a hero's moments from the same minute share a line, with its icon, so
  the journal of every hero reads as one.
- **How far back:** each hero keeps its last 100 moments, and the journal shows the last 50 lines.
  Heroes from before 1.11.0 start with an empty journal.
- **One hero, or everything:** `/vwc:journal archer` shows only that hero's moments, and
  `/vwc:journal all` everything kept instead of the last 50 lines. They go together too:
  `/vwc:journal archer all`.
- **The shelter's:** `/vwc:journal survival` is the Survival game's own journal, kept the same
  way: blueprints, tyrants, falls and rebuilds, weapons, rooms, people, the cure and the Shelter
  achievements.

## Card

`/vwc:card` shows the hero you're playing as a short card, ready to copy into Slack, a pull
request or anywhere else. `/vwc:card mage` shows another class's hero, `/vwc:card all` every
hero you have, and `/vwc:card survival` the Survival game's shelter:

```
╭─ 🧝 Archer · Level 22 ───────────────────────────────────────────────────────
│ 🌙 Moon Bow · 🌠 Star Arrow (legendary) · 🦅 Eagle Barrage (rare)
│ 🌵 Desert III 16% · 💀 1,440 kills · 🏆 22 bosses · 💥 biggest hit 474
│ 👖 Steel Trousers (legendary) · 6 of 6 gear slots · +30% damage, +8% critical chance, +2% XP, +7% life
│ ⏳ 3h51m of work · 825k tokens · 🏅 27 of 55 achievements
╰─ VibeWorkCompanion 1.16.0 · github.com/edualves96/VibeWorkingCompanion ──────
```

- **What's on it:** the class and level, the weapon and skills, where the hero is, kills, bosses
  and the biggest hit, the best piece of gear with what all the gear adds, and the hero's work
  time, tokens and achievements. A trainer's card starts with his partner and counts his dex (📕).
  The last line links to the plugin (the `homepage` in
  `.claude-plugin/plugin.json`, so a fork links to itself).
- **Nothing about your work:** only game numbers, plus how long Claude worked and how many tokens
  it used. Nothing is sent anywhere; you copy the card yourself.
- **No right border:** emoji are drawn at different widths in different apps, so a right edge
  would come out jagged. Paste it in a code block (between \`\`\` lines) to keep the left edge
  straight.

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
| A subagent starts or stops (`SubagentStart`, `SubagentStop`) | an [ally](#allies) joins or leaves (in [Survival](#survival), a drifter) |
| Claude compacts the conversation (`PreCompact`) | makes [camp](#campfire) (in [Survival](#survival), a supply drop lands) |

- **One hero for all your windows:** it walks while at least one Claude Code session is working.
- **Subagents don't move the hero:** only the main conversation does. A subagent brings an ally
  instead, and while its session is working, what the subagent does counts as activity (see the
  next points).
- **Sleep doesn't count:** gaps longer than 30 s (a sleeping laptop, a closed terminal) are ignored.
- **A missed "finished" event can't keep it walking:** a session that has sent no hook event,
  written nothing to its transcript and heard nothing from its subagents for 10 minutes counts
  as waiting. One very long silent command (a 15-minute build, say) pauses the hero after 10
  minutes until it finishes.

Enemies have life, which grows with the zone. Each hit does the class's base damage plus its
per-level damage times your level, plus the weapon's bonus, raised by the damage bonuses of
skills and gear; a skill that is off cooldown multiplies it, and a critical hit doubles it. For a hero on pace, a normal enemy takes about 5 hits, a mini boss
about 15, a zone boss about 30 and a level boss about 60, all game long; a hero ahead of the curve
meets tougher enemies (see [Enemies keep up with you](#enemies-keep-up-with-you)).
While you fight, the stats row shows the enemy's life and the damage of each hit, and the life
row under it the damage you take (see [Life and combat](#life-and-combat)):

```
🧝 Archer Lv 13 ▰▱▱▱▱▱▱▱▱▱ 371/3086 XP · 🪶 Fletched Bow · 🌲 Dark Forest II 64% · 💀 587 · 🐺 Wolf ▰▰▰▰▰▱▱▱▱▱ 136/304 -72
```

XP comes from kills (`2.2 * (3 + zone + random(0..zone))`, bosses x10) and from tokens: every 2,750 tokens
Claude uses (input + cache writes + output, not cache reads) is worth one kill. Gear with `+% XP`
raises both. Going from level `L` to `L+1` takes `10 + 1.4 * L^3` XP. Rough pacing, counting
kills only: level 3 after 2 minutes of work, level 10 after an hour, level 16 after 3 hours,
level 25 after 8 hours, the last weapon (level 35) after about 16 hours. Token XP comes on top:
with 300,000 tokens an hour of work, a hero is one to two levels further along. So does
[rested XP](#rested-xp), and [allies](#allies) make fights shorter.

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
| `TOKENS_PER_KILL` | `2750` | Tokens worth one kill's XP. Lower it for more token XP. |
| `ENEMY_HP` | `[30, 95, 0.77]` | Enemy life: `30 + 95 * zone^0.77`, give or take 20%. Raise it for longer fights. |
| `ENEMY_DMG` | `[20, 60, 0.7]` | The curve enemy damage follows: `20 + 60 * zone^0.7`, times `ENEMY_ATK`. |
| `PACE`, `PACE_SLACK` | `[2.95, 3.46, 0.55]`, `1` | The level of a hero on pace at each point of the world (`2.95 + 3.46 * zone^0.55`), and the levels above it that don't count yet. |
| `AHEAD_SCALE`, `AHEAD_MAX` | `0.08`, `1` | For a hero ahead of pace, the extra enemy life, damage and XP per level, and the most of it. |
| `RANKS` | | Life, XP and damage of mini bosses (`2.5`, `5`, `2`), zone bosses (`5`, `10`, `2`) and level bosses (`8`, `16`, `2.6`), as multiples of a normal enemy's, and how often they strike (`every` 2 seconds). |
| `KILL_XP` | `2.2` | Multiplier on the XP of every kill (and of tokens). Raise it to level faster. |
| `MAX_SKILLS` | `2` | How many skills a hero holds. |
| `RARITIES` | | Each rarity's chance, how much it multiplies the strength of a skill or a piece of gear, and the shards a salvaged piece gives. |
| `ENEMY_ATK` | `0.05` | Enemy damage per hit, as a share of `ENEMY_DMG` in that zone (times the rank's `atk` in `RANKS`). Raise it for a harder game. |
| `AGGRO`, `SHOT_RANGE` | `8`, `4` | How far away the nearest enemy notices the hero, and how far the ones that shoot fire from. |
| `HERO_LIFE` | `[40, 12, 1.4]` | Hero life: `40 + 12 * level^1.4`, times the class's `life`. |
| `REGEN` | `0.02` | Share of the hero's life that comes back each second out of combat. |
| `POTION_DROP`, `MAX_POTIONS` | `0.065`, `3` | Chance a normal enemy drops a potion (bosses always do), and how many the hero carries. |
| `POTION_AT`, `POTION_HEAL` | `0.3`, `0.5` | Life below which a potion is drunk, and how much of the life it gives back. |
| `GROUP_SIZES` | `[0.6, 0.2, 0.12, 0.08]` | Chances that enemies come alone, or in a group of 2, 3 or 4. |
| `ELITE_CHANCE`, `ELITE` | `0.05` | The share of normal enemies that are elite (twice that at night), and an elite's life, XP, gear and potion multipliers. |
| `TRAITS` | | The elite traits: name, what it does, and its number (`dodge`, `armor`, `drain`, `blast`). |
| `GOBLIN_CHANCE`, `GOBLIN`, `GOBLIN_SPEED`, `GOBLIN_RUN` | `0.012`, `{ hp: 2, xp: 4, shards: 20 }`, `2`, `24` | The share of spawns that are a treasure goblin, its life and XP multipliers and its shards, the steps per tile it runs and the steps before it gets away. |
| `MASTERY_KILLS`, `MASTERY_DAMAGE` | `100`, `2` | The kills for a star weapon's first rank (each rank takes this many more), and the percent of damage each rank adds. |
| `BOUNTY_SHARDS`, `BOUNTY_KILLS`, `BOUNTY_SHARE`, `BOUNTY_ELITES` | `12`, `90`, `0.35`, `2` | A shard bounty's reward, the kills guessed per zone, the share of one enemy's kills a bounty asks for, and the elites an elite bounty asks for. |
| `GROUP_MEMBER`, `GROUP_GAP` | `0.65`, `3` | A group member's life, damage and XP compared to an enemy alone, and the extra tiles after a group per extra enemy. |
| `AREA`, `AREA_MULT` | `3`, `0.85` | How many tiles behind the target an area skill reaches, and its share of a single-target skill's extra damage. |
| `KO_STEPS`, `RALLY` | `15`, `0.25` | Seconds a knocked out hero rests, and the extra damage per knockout until its next win. |
| `GEAR_DROP` | `0.04` | Chance that a normal enemy drops a piece of gear. Bosses always do. |
| `GEAR_SLOTS` | | The six slots, with their icon and the base names a piece can roll (`Helm`, `Hood`…). |
| `GEAR_MATERIALS` | | The material in a piece's name, by the level it was found at. |
| `REFORGE_COST` | `10` | Shards for a piece's first reforge; each one after that costs this many more. |
| `MAX_ALLIES`, `ALLY_DAMAGE` | `2`, `0.3` | How many allies fight at once, and each one's hit as a share of the hero's basic hit. |
| `ALLY_STALE_MS` | `600000` | An ally whose subagent sent nothing for this long has left. |
| `ALLY_KINDS` | | The allies that can come: icon, name and what they shoot. |
| `NIGHT_FROM`, `NIGHT_TO` | `20`, `6` | The hours when night starts and ends, local time. Dusk and dawn take the hour before and after. |
| `NIGHT_LIGHT` | `0.45` | How bright the floor is at night, compared to the day. |
| `SEASONS` | | The seasonal events by month: icon, decor, announcement, and what each one brings (candy, a ghost `wave`, an `enemy`, `snow`). |
| `CANDY_DROP`, `CANDY_HEAL` | `0.08`, `0.2` | At Halloween, the chance an enemy drops candy, and the share of the hero's life it heals. |
| `GHOST_WAVE`, `SEASON_ENEMY` | `0.15`, `0.12` | At Halloween, the share of groups that are a ghost wave; in Winter, the share of enemies that are snowmen. |
| `CAMP_DAMAGE`, `CAMP_MS`, `CAMP_REST` | `0.25`, `600000`, `15` | A camp's extra damage, how long it lasts (10 minutes of work), and the seconds the hero sits by the fire. |
| `RESTED_AFTER`, `RESTED_RATE` | `300000`, `0.5` | The part of a break that doesn't count (5 minutes), and how much of the rest of it goes into the rested pool. |
| `RESTED_MAX`, `RESTED_XP` | `3600000`, `1` | The most rested XP a hero can hold (an hour of work), and the extra kill XP while rested (+100%). |
| `JOURNAL_SIZE`, `JOURNAL_SHOWN` | `100`, `50` | Moments each hero keeps for `/vwc:journal`, and the lines it shows. |
| `WILD_SHARE` | `0.4` | On the Trainer's map, the share of spawns that are a wild critter (alone) instead of the usual enemies. |
| `CATCH`, `CATCH_BOSS` | `0.08`, `0.5` | Chance a defeated critter is caught (times the ball's `catch`), and a zone or level boss. Legendaries always are. |
| `MISSING_WEIGHT`, `NIGHT_BY_DAY` | `6`, `0.25` | How much more often species not caught yet spawn, and how often night critters come out by day compared to the night. |
| `EVOLVED_FROM` | `{ 2: 3, 3: 8 }` | The zone from which evolved forms (stage 2 and 3) start to spawn. |
| `SECRET_CHANCE` | `0.01` | Once every other species is caught, the share of wild critters that are the secret one. |
| `POWER_EFFECT` | `0.5` | How much a species' power changes a partner's attack and life. |
| `ACHIEVEMENT_GROUPS` | | Every achievement: its name, what to do, the fact it measures (see `achievementFacts()`) and the goal. |
| `WORLD_TILES` | `24` | Width of the world in tiles (each tile is 2 columns). |
| `MSG_MS` | `10000` | How long messages like "🎉 Level 5!" stay visible. |
| `MAX_GAP_MS` | `30000` | Gaps between refreshes longer than this are ignored. |
| `SESSION_STALE_MS` | `60000` | A session silent for this long no longer counts as working. |

Difficulty lives in `xpNeed()` (the level curve), `makeEnemy()` (enemy HP and XP), `attackOf()`
(hero damage, from the class's `atk`), `rollSkill()` (how strong skills roll at each level) and
`rollGear()` (how strong gear rolls). If you make fights longer or shorter, change `KILL_XP` the
opposite way, or levelling slows down or speeds up with them.

The Trainer's critters, their types and evolutions live in `scripts/roster.js`. Run
`node scripts/check-roster.js` after changing it: it checks the numbering, names, evolutions,
bosses and emoji.

### Add a biome

Add an entry to `BIOMES`. Zones cycle through the list in order, so add it at the end to keep
existing saves' achievements right:

```js
{ name: 'Swamp', icon: '🐸', color: '38;2;132;204;22', critters: 'Coast',
  decor: ['🌿', '🍄', '🌱'], enemies: [['🐊', 'Croc'], ['🦟', 'Mosquito', '🟢'], ['🐍', 'Snake']],
  night: ['🐸', 'Giant Toad'], boss: ['🦕', 'Bog Beast'],
  floor: { bg: '48;2;40;60;30', fg: '38;2;132;204;22', marks: ['~', ','] } },
```

`critters` names the biome whose critters (and zone boss) the 🧢 Trainer meets there. The dex has
a fixed 151 species, so the Swamp, Tundra and Sky Islands borrow the Coast's, the Caves' and the
Desert's. A biome without `critters` needs species of its own in `roster.js`.

An enemy with a third icon, like the mosquito's `🟢`, shoots it from a distance instead of
walking up to the hero. `night` is the creature that joins the enemies at night. `color` is an ANSI color (`38;2;R;G;B`) for the zone name. In `floor`, `bg` is the ground color
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
a first weapon at level 1. The class picker draws the classes anyone can start with; a class with
an `unlock` (an achievement, like the trainer's) waits for it before it can be chosen.

### Emoji rules (read this before adding icons)

The layout relies on every icon being exactly 2 columns wide. Use only emoji that show as emoji
by default (Unicode `Emoji_Presentation=Yes`), such as 🐉 🔥 🌲 💎. Avoid:

- **Symbols that need the `U+FE0F` variation selector to look like emoji:** ⚔️ 🗡️ ☠️ ❄️ 🕷️ ⛰️ 🗝️
- **ZWJ sequences** (several emoji glued together): 🧙‍♂️ 🧟‍♀️

If you add an icon below `U+1F000` that is 2 columns wide, add its code point to `displayWidth()`,
as was done for ⚡ ✨ ⏳ ⛄ ⚪.

### Position and size

- **Stats row above or below the map:** `/vwc:stats below` does it without editing anything. The
  order is picked at the end of `render()`.
- **Only the map:** `/vwc:showprogress off` drops the stats and life rows in `render()`. The class
  picker keeps its title, since it says how to start.
- **Right alignment:** `alignRight()` in `render()`. Remove the `.map(...)` there to put the
  companion on the left.
- **Why the padding starts with an escape code:** Claude Code trims every status line row, which
  would remove plain leading spaces. The padding starts with an invisible `\x1b[0m` reset, which
  the trim leaves alone.
- **Width budget:** `scripts/statusline.js` uses `COLUMNS - 6`. Claude Code passes the terminal
  width in `COLUMNS`, pads the status line by 2 columns on each side, and cuts off anything wider.
  If the right edge is cut off in your terminal, increase the `6`.
- **Narrow terminals:** when the stats row doesn't fit, parts are dropped in priority order (skills
  first, then a trainer's 📕 dex count, kills, the biome with its progress, the weapon, and a
  trainer's partner), and a long message is cut short with "…". The life row
  stays under the XP bar, dropping its extras (shards, then rested XP, then the camp, then rally, then potions) if they don't fit. See the numbers in `statsRow()`.

### The info row (row 1)

If you had a status line before `/vwc:setup`, it runs and is shown on top. Otherwise `infoRow()` in
`scripts/statusline.js` draws model, folder, git branch, context usage and rate limits.

## Files

| Path | What it is |
|------|------------|
| `.claude-plugin/plugin.json` | Plugin manifest (name `vwc`, version). |
| `.claude-plugin/marketplace.json` | Makes this repository its own marketplace (`vibeworkcompanion`). |
| `hooks/hooks.json` | The hooks that tell the companion when Claude is working. |
| `skills/` | The `/vwc:` commands: `setup`, `chooseclass`, `createchar`, `hide`, `show`, `stats`, `showprogress`, `skills`, `gear`, `achievements`, `statistics`, `journal`, `card`, `dex`, `game`, `shelter`, `window` and `commands`. |
| `scripts/companion.js` | The engine: save file, classes, biomes, game rules, rendering. |
| `scripts/statusline.js` | What the status line runs: info row plus the three companion rows. |
| `scripts/hook.js` | What the hooks run. Events from subagents go to the allies. |
| `scripts/cli.js` | Class switching, new characters, hide/show, the stats row's place, showing or hiding the progress rows, the skills, gear, achievements and statistics lists, the journal, the hero card, the dex, and the command list. |
| `scripts/survival.js` | The Survival game: its rules, rendering and the `/vwc:game` and `/vwc:shelter` commands. |
| `scripts/window.js` | `/vwc:window`: the local server and the browser window for the Survival game. |
| `scripts/window/` | The window's page: `scene.js` draws the diorama, `sprites.js` holds the pixel art. |
| `scripts/setup.js` | Turns the status line on and off in your `settings.json`. |
| `scripts/roster.js` | The Trainer's critters: the 15 types they fight with and all 151 species. |
| `scripts/check-roster.js` | Checks `roster.js` after a change: numbering, names, evolutions, bosses and emoji. |
| `IDEAS.md` | Ideas for later versions that haven't been built yet. |
| `TRAINER_PLAN.md` | How the Trainer was planned and built, step by step, with what was measured. |

Your saves live in the plugin's data folder, `~/.claude/plugins/data/<plugin id>/`, which survives
plugin updates:

| File | What it is |
|------|------------|
| `state.json` | One hero per class (with its skills, gear, shards, rested XP, camp, journal, and counts for achievements and statistics), which one is active, the allies of the subagents running now, the achievements earned and the totals they need, the dex of the critters seen and caught, what `/vwc:hide` has hidden, where `/vwc:stats` put the stats row, whether `/vwc:showprogress` hid it, and the last plugin version it saw (for the update notice). Delete it to start everything over. |
| `survival.json` | The Survival game's save: shelter, scrap, weapon, wave, the people living there, the lab and totals. |
| `game` | Exists only while the Survival game is the one on display. |
| `window.json` | Exists only while the Survival window is open: its server's process, port and key. |
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
