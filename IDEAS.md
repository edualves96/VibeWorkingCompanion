# Ideas

Ideas for later versions that haven't been built yet. Built so far from this list: the journal,
subagent allies and salvage with reforging (1.11.0), rested XP (1.12.0), day and night
(1.13.0), seasonal events (1.14.0), elite enemies (1.15.0),
`/vwc:card` (1.16.0), `/vwc:journal <class>` (1.17.0), campfires on compaction (1.18.0), for
the endgame the 🧢 Trainer unlocked at level 50 (1.20.0, see `TRAINER_PLAN.md`) and, in 1.21.0,
bounties and the treasure goblin, in 1.22.0 the Swamp, Tundra and Sky Islands in 1.23.0 weapon mastery after level 35 and, in 1.24.0, work streaks. For the Survival game, 1.26.0 added drifters,
supply drops, survivors who move in, the dog and the cure, and 1.27.0 nights with the blood moon,
the generator that runs on tokens and the day count. 1.28.0 drew Survival in a pixel-art window
(`/vwc:window`), and 1.29.0 added the rooms under the shelter, books and studying.

## Rules every idea has to follow

- **No input while working.** Everything resolves on its own: no choices, no buying, no equipping.
  Commands only show information or change settings.
- **Setbacks cost time, never progress.** Nothing is ever taken away from the player.
- **Privacy:** only *when* Claude works (hook events) and *how many tokens* it used. Never prompts,
  answers, code, file names or tool names.
- **Emoji:** exactly 2 columns wide, `Emoji_Presentation=Yes`, no `U+FE0F`, no ZWJ sequences. Anything
  wide below `U+1F000` goes into `WIDE_BELOW_1F000` in `displayWidth()`.

## Tied to what Claude is doing

- **Combo streak.** Tool calls that succeed in a row build a small damage combo, and a
  `PostToolUseFailure` resets it. Only the event type counts, never the tool or what it did. A
  failure must only end the streak, never hurt the hero.

## Loot and progression

- **Unique legendaries.** Named legendary pieces with an effect on top of their stats: boots that walk
  2 tiles per step between fights, a 🪶 feather that cancels one knockout an hour, gloves whose
  critical hits splash to the next enemy.
- **Biome gear sets.** Each biome's boss can drop its set (a Coral set from the Coast, an Ember set
  from the Volcano), with bonuses for wearing 2, 4 or all 6 pieces. Equipping stays automatic, so a
  set piece needs to count its set bonus in its power.
- **Inactive heroes train at camp.** The heroes not being played earn about 10% of the XP the active
  one does, so players with all three classes don't leave two of them behind.

## A second game

- **Survival mode (first version built in 1.25.0).** The switch, the strip, walkers and brutes, fists and an axe,
  gathering, fifteen blueprints to find (sixteen since 1.27.0), barricades, traps and spikes set up from inside the shelter, a survivor that builds, sews and cooks, wears the best clothes, explores buildings, lakes, lost shelters and bunkers, rides a tank and a helicopter near the endgame, more zombie kinds with a tyrant every 10th wave, skills it learns by doing and `/vwc:shelter` are in, and since 1.26.0 drifters, supply drops,
  survivors who move in, a dog and the cure, and since 1.27.0 nights, blood moons, the generator and
  the day count, since 1.28.0 a pixel-art window, and since 1.29.0 the rooms inside, books and a
  cellar he learns to build from them. Still to come: more places and encounters (caves, a
  harbor) and more shelter visuals. A second game you switch to with a command. It only advances while it is the one
  on display, so it ticks on the render, with no offline catch-up.
  - The character patrols back and forth along a wide, short strip and fights zombies, weak ones
    and strong ones. The shelter sits in the center, with some visual upgrades around it.
  - While the character is away, zombies attack the shelter, so the shelter defends itself
    (auto-turrets that improve as it levels).
  - The character gathers resources that upgrade the shelter. A command shows the inside of the
    shelter. Like every other command, it only shows info.
  - Weapon ladder: fists, melee, ranged, tanks, aircraft, and so on.
  - Open questions: keep its progression separate from the main game and the Trainer (easier to
    balance, with at most one small cross-reward). Losing the shelter should be a soft setback (lose
    some resources, restart the wave), never permadeath.
  - First version: the switch command, one strip, 2 zombie types, fists and one melee weapon,
    gathering that levels the shelter, auto-turrets and the inside-shelter command. Ranged, tanks and
    aircraft come in later releases, one per version.

### More for the Survival game

**Tied to what Claude is doing.** Subagents (drifters), compaction (supply drops), the clock
(nights) and tokens (the generator) reach the Survival game since 1.26.0 and 1.27.0; this would tie
it closer still.

- **🎃 Seasons.** The adventure's seasons reach the strip: pumpkin-headed zombies and 🤡 in October,
  and in December ⛄ snow that slows the zombies and frozen lakes he fishes through.

**Places and people.**

- **New places to search.** 🏥 a hospital (medkits that shorten rests), ⛽ a gas station (fuel and
  bottles for molotovs), 🚢 a harbor (fish for food, and a boat to reach farther sites), 🗻 caves
  (rich in scrap, with bats and now and then a hidden bunker), 🛒 a supermarket (food and cloth).
  ⛽ needs adding to `WIDE_BELOW_1F000`.
- **🦹 Raiders.** Now and then a band of raiders comes instead of zombies: they shoot from range and
  step around traps, but drop guns, bullets and Tactical gear. They never take anything.
- **🐫 A passing trader.** Every so often a trader swaps his surplus for what he is short of (wood
  for cloth, say), on his own and at fair rates. No shop and no choices: it resolves like a crate.

**Zombies.**

- **New kinds.** 😱 a screamer that calls runners when it sees him (he and the turrets go for it
  first), 🤮 a bloater that bursts and hurts everything around it, zombies included, 🦏 a juggernaut
  that breaks a barricade in one blow, 🐀 rat swarms, many and weak.
- **Tyrants with a trick.** The 10th-wave boss takes turns: the tyrant, a screamer queen that calls
  runners in, a juggernaut that walks through barricades, a brood that splits into walkers when it
  dies.

**Shelter, weapons and the endgame.**

- **More cellar rooms.** 1.29.0 has five, learned from books. More could follow the same way: a
  water still (meals heal more), a garage (vehicles use fewer bullets), a library (books sink in
  more often).
- **More rungs on the ladder.** Melee from 🏏 a bat to 🔪 a machete and 🪚 a chainsaw; 🏹 a bow that
  shoots wood instead of bullets; 🍾 molotovs and 💣 grenades, thrown on their own at groups of three
  or more; 🛻 a pickup between the rifle and the tank, that rams. Vehicles could need ⛽ fuel the way
  guns need bullets.
- **🏅 Achievements, journal and card.** A category in `/vwc:achievements` (called Shelter, since the
  adventure already has a Survival category), `/vwc:journal survival` for blueprints, tyrants and
  rebuilds, and `/vwc:card survival`.
- **One small cross-reward.** Settles the open question above: reaching wave 30 gives the
  adventure's heroes a title or a cosmetic, nothing that changes their power.

## Turned down

- **Leaderboards:** they need network access, which breaks "nothing leaves your machine".
- **Shops and talent choices:** they need input while working.
- **Reacting to tool names** (more XP for Edit than Read, say): fun, but it reads more than the two
  numbers the Privacy section promises.
