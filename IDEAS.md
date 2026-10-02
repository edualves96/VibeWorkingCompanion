# Ideas

Ideas for later versions that haven't been built yet. Built so far from this list: the journal,
subagent allies and salvage with reforging (1.11.0), rested XP (1.12.0), day and night
(1.13.0), seasonal events (1.14.0), elite enemies (1.15.0),
`/vwc:card` (1.16.0) and `/vwc:journal <class>` (1.17.0).

## Rules every idea has to follow

- **No input while working.** Everything resolves on its own: no choices, no buying, no equipping.
  Commands only show information or change settings.
- **Setbacks cost time, never progress.** Nothing is ever taken away from the player.
- **Privacy:** only *when* Claude works (hook events) and *how many tokens* it used. Never prompts,
  answers, code, file names or tool names.
- **Emoji:** exactly 2 columns wide, `Emoji_Presentation=Yes`, no `U+FE0F`, no ZWJ sequences. Anything
  wide below `U+1F000` goes into `WIDE_BELOW_1F000` in `displayWidth()`.

## Tied to what Claude is doing

- **Campfire on compaction.** When the conversation is compacted (`PreCompact` hook), the hero sets
  up camp ⛺, heals fully and gets a short buff. ⛺ is `U+26FA`, so it needs adding to `displayWidth()`.
- **Combo streak.** Tool calls that succeed in a row build a small damage combo, and a
  `PostToolUseFailure` resets it. Only the event type counts, never the tool or what it did. A
  failure must only end the streak, never hurt the hero.

## Time and calendar

- **Work streaks.** Days in a row with work, for achievements only (5, 20, 100 days). Missing a day
  starts a new streak but takes nothing away.

## Loot and progression

- **Treasure goblin.** A rare 💰 enemy that runs away from the hero instead of fighting. Killed
  before it gets out of range, it drops a pile of shards and a lucky gear roll.
- **Unique legendaries.** Named legendary pieces with an effect on top of their stats: boots that walk
  2 tiles per step between fights, a 🪶 feather that cancels one knockout an hour, gloves whose
  critical hits splash to the next enemy.
- **Biome gear sets.** Each biome's boss can drop its set (a Coral set from the Coast, an Ember set
  from the Volcano), with bonuses for wearing 2, 4 or all 6 pieces. Equipping stays automatic, so a
  set piece needs to count its set bonus in its power.
- **Endgame after level 35.** Nothing new unlocks after the 🌟 weapon. Weapon mastery (the weapon
  levels up with kills: Star Bow +1, +2…) or endless small "paragon" bonuses every few levels.
- **Inactive heroes train at camp.** The heroes not being played earn about 10% of the XP the active
  one does, so players with all three classes don't leave two of them behind.
- **Bounties.** Each biome sets an automatic short goal ("defeat 20 🐺 Wolves", "beat the Ape King
  without a potion") with a reward: shards, a potion or a lucky gear roll. Shown on the stats row
  when set and when done, and in the journal.
- **New biomes.** The Swamp from the README example (🐊 🦟 🐸, 🦕 Bog Beast), a Tundra (🐧 🦭, 🦣
  Mammoth) and Sky Islands (🦅 🪽, 🐲 Storm Drake), so the world loops less often. Check each emoji
  against the rules above (🪽 is Unicode 15, which some terminals don't draw yet).

## Turned down

- **Leaderboards:** they need network access, which breaks "nothing leaves your machine".
- **Shops and talent choices:** they need input while working.
- **Reacting to tool names** (more XP for Edit than Read, say): fun, but it reads more than the two
  numbers the Privacy section promises.
