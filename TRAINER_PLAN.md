# Plan: the Trainer, a 4th hero unlocked at level 50

Status: every decision is made (2026-10-06). Steps 1 to 9 are done; next is Step 10. Build it one
step at a time; each step leaves the game working.

## The idea

- A 4th hero, the 🧢 **Trainer**, named **Bash** (a parody of a famous anime trainer), unlocks once **any** hero
  reaches **level 50**. Level 35 takes about 16 hours of work and level 50 needs about 4 times the
  XP, so roughly 30 hours by the `PACE` curve. That gives the game something to chase after the 🌟
  weapon (see "Endgame after level 35" in `IDEAS.md`).
- Bash doesn't fight. His **partner** does: the partner's species sets the range, the basic hit,
  the critical chance, life, attack strength and the kind of skills it learns.
- On the trainer's map, **wild critters** from the biome show up among the usual enemies. Only
  critters can be caught: a defeated wild critter is sometimes **caught** automatically and
  registered in the **dex** (151 species).
- Catches can be base forms or evolved forms (evolved forms show up deeper in the world).
- **Skills belong to the partner, gear to Bash.** When a stronger catch replaces the partner, the
  old one leaves with its skills and the new one brings its own; the gear fits whoever fights.
- Filling all 151 entries is the long-term goal.

## Step 0: decisions

### 0.1 Names: parodies, never the real ones (decided)

Every name is a parody: you can tell which original it comes from, but it's never the original.
The famous electric mouse becomes **Clauchu**. The game's own words change the same way: the trainer is Bash, the
creatures are "critters", the collection is the "dex", and the balls get new names (see 0.3).

Rules for every name:

1. **At least 2 letters away from the original.** Swapping, adding or removing a single letter isn't
   enough to make it a parody, while "Blocklax" is.
2. **No real name hidden inside**, not even a short one: "Seabranch" failed because a real name
   hides in the middle of it.
3. **The pun leans on Claude and coding:** Clau-, Opus, Sonnet, Haiku, git, bash, byte, cache,
   token, log, grep, bug and so on.
4. **An evolution line shares its pun**, so it reads as a family: Bytesaur → Kilosaur → Gigasaur,
   Lagly → Hangter → Crashgar.
5. **No real names in anything that ships:** not in code, game text, the README or comments. The
   roster stores only the dex number (#025), which is enough to know which original is meant.
   That includes this plan.
6. **No other products' names** either (Codex, Copilot, Ghostty, Unix…).
7. **Unique**, and not the same as (or 1 letter from) a real critter from a later generation.

**All 151 names are drafted** in the [appendix](#appendix-all-151-critters) at the end. Each one was
checked against these rules by a script that holds the real names, kept out of the repo: all 151
pass, and every icon passes the emoji rules. Approved on 2026-10-06.

### 0.2 The partner swap rule (decided)

What you asked for: a new catch replaces the partner, and the old partner's gear and skills are
lost. Two existing rules affect how this can work:

- **No input while working.** Nobody can pick which critter to keep, so the game has to decide.
- **Setbacks cost time, never progress.** A swap must never leave the hero weaker.

The first rule (approved, then dropped on 2026-10-06): a catch replaces the partner only if the
bare catch beats the partner with its gear and skills. Measured in Step 6, a geared partner is
already 1.3 times as strong as a bare *legendary* by level 8, 3 times by level 20 and over 5 times
by level 40, so nothing would ever have replaced Clauchu after the first half hour.

The rule now (chosen on 2026-10-06, built in Step 6):

- A caught species **stronger than the partner** (a higher `power`) can take its place.
- **The gear stays with Bash** and fits whoever fights. **The old partner leaves with its skills**,
  and the new one **brings its own**: as many as the old one had, rolled for its type at the same
  levels and rarities. The old partner stays registered in the dex.
- The swap only happens if the hero ends up **stronger** (damage per step times life, checked with
  the new skills before swapping), so a swap is always a gain.
- Swaps happen through the whole game: 3 or 4 in 40 hours of work, from the first hour (a rare
  find or a zone boss) to evolved forms and, from Step 8, legendaries.
- **Catches grow to Bash's level** (Step 7): a caught critter evolves on the spot through the
  evolution levels he has passed, and is compared for a swap in its evolved form.

### 0.3 Defaults (decided)

| Topic | Default |
|-------|---------|
| Class key | `trainer`, with `bash` as an alias for `/vwc:chooseclass` |
| Hero | 🧢 Bash, drawn one tile behind the partner. A new one "sets out" instead of "awakens" |
| Starter partner | 🐭 Clauchu (#025), registered in the dex from the start |
| The trainer's "weapon" track | Balls, at the same levels and with the same `atk` as other classes' weapons, each tier also raising the catch chance: 🔴 Clau Ball (1), 🟠 Byte Ball (4), 🟡 Token Ball (8), 🟢 Cache Ball (13), 🔵 Context Ball (19), 🟣 Prompt Ball (26), 🌟 Star Ball (35, the trainer's star weapon) |
| Dex storage | On the save root (`root.dex`), shared by every trainer and never lost, even after `/vwc:createchar trainer` |
| Unlock | Permanent once earned (stored as an achievement) |
| Knockout text | "😵 Clauchu fainted", same rules as a knockout |

### 0.4 Other decisions (2026-10-06)

- **Only critters can be caught.** The usual biome enemies (🐀 Rat, 🐺 Wolf…), elite enemies and
  seasonal enemies (👻 ghost waves, ⛄ snowmen) still show up on the trainer's map and are fought as
  today, but they can't be caught. Critters are never elite.
- **Level bosses are critters.** The mini boss of levels 5, 15, 25… is a "Giant" critter of the
  biome, and the Elder boss of levels 10, 60, 70… is an "Elder" version of the biome's boss species.
  Both can be caught, like zone bosses. Levels 20, 30, 40 and 50 bring the legendaries (Step 8).
- **Night critters.** Each biome has a pair that comes out at night: 14 species, listed in Step 2.
  Catching all of them earns an achievement (Step 10). They also show up by day, a quarter as often
  (a tenth at first, raised in Step 8), so someone who never works after 20:00 can still finish the dex.
- **GitHub releases.** Each release gets a version tag (`v1.20.0`) and a GitHub release, with a
  note about Claude Code windows still running an older version (Step 12).
- **After the dex is complete:** nothing new, for now.

## Working rules (from earlier releases)

- The installed plugin runs live from this folder. Make every edit leave `companion.js` working (add
  functions before their callers), or build in a scratchpad copy and copy it in when it works.
- Test against a throwaway `COMPANION_DIR`, never the real data folder. After risky changes, look
  for new `state.bad-*.json` files.
- For balance checks, use a small script in the scratchpad: it seeds `Math.random` (for example
  with mulberry32), creates heroes with `newHero`, runs `step()` for N simulated hours, and prints
  levels, catches and swaps. The same seed before and after a refactor must give the same result.
- Don't bump the version until the last step. A bump sets off the update notice on the live save.
- Every new emoji must follow the rules in `IDEAS.md` (2 columns wide, `Emoji_Presentation=Yes`,
  no `U+FE0F`, no ZWJ sequences).

## Steps

### Step 1: one place for class stats (refactor, no visible change) ✅ done

The fight code reads `CLASSES[h.cls]` directly in about 15 places (`weaponOf`, `attackOf`,
`maxLife`, `summon`, `rollSkill`, `gainXp`, `targetOf`, `heroTurn`, `statsRow`, `worldRow`,
`render`, and the area-skill check in `migrate`).

- Add `classOf(h)`. It returns `CLASSES[h.cls]` for now; later it builds the trainer's stats from
  the partner.
- Point every fight and render use at it. Change `rollSkill(cls, …)` to take the skill spec (or
  the hero) instead of the class key.
- **Done when:** the seeded simulation gives identical results before and after, and the status
  line looks the same.

### Step 2: all 151 names, then the roster data file ✅ done

1. **Names first.** Done: all 151 are in the [appendix](#appendix-all-151-critters) and pass the
   0.1 rules. Get them approved before writing any code. If a name changes later, check it against
   the real names again with a list kept outside the repo, never committed.
2. **Then the data:** create a new file, `scripts/roster.js`, with data only: `TYPES` and
   `SPECIES`, filled in from the tables and rules below. Nothing is needed from you; change any
   number you don't like.

```js
const TYPES = {
  // like: the class whose range, attack curve, critical chance, life and skill power it uses.
  electric: { like: 'mage', hit: '⚡',
    skills: { parts: [['⚡', 'Overclock'], ['🔋', 'Power']], forms: ['Zap', 'Spark', 'Bolt'], areaForms: ['Surge', 'Storm'] } },
  // ... 15 types
};
const SPECIES = [
  // where: its biome, 'boss' (the biome's zone boss) or 'legend'. night: comes out at night.
  // rare: spawn weight. evolves: what it becomes, at which trainer level.
  { n: 25, name: 'Clauchu', icon: '🐭', type: 'electric', stage: 1, power: 1.0, where: 'Meadow', rare: 1, stays: true },
  { n: 39, name: 'Jsonpuff', icon: '🎤', type: 'normal', stage: 1, power: 0.9, where: 'Meadow', night: true, rare: 1, evolves: { to: 40, at: 28 } },
  // ... all 151
];
```

**Types.** Each type fights like one of the three classes and borrows its numbers from `CLASSES`
(range, attack curve, critical chance, life, skill power). Those three are already balanced against
each other, so the trainer starts out balanced too; the species' power then scales attack and life.
Skill names are "part + form", like the classes' (Core Dump, Null Pointer, Brute Force, Cold Start):

| Type | Fights like | Hit | Skill parts | Forms | Area forms |
|------|-------------|-----|-------------|-------|------------|
| normal | 🤺 Warrior | 💥 | 💥 Force, 🔁 Retry | Tackle, Slam | Stampede, Rumble |
| fighting | 🤺 Warrior | 👊 | 💪 Brute, 👊 Hack | Force, Chop, Kick | Flurry, Combo |
| rock | 🤺 Warrior | 🪨 | 🪨 Bedrock, 🗿 Monolith | Smash, Throw | Slide, Quake |
| ground | 🤺 Warrior | 🟤 | 🌍 Core, 🌋 Kernel | Dump, Dig | Quake, Fissure |
| dragon | 🤺 Warrior | 💢 | 🐉 Sudo, 💢 Raging | Claw, Rage | Breath, Roar |
| fire | 🧙 Mage | 🔥 | 🔥 Burnout, 🌋 Molten | Flame, Blast | Inferno, Wildfire |
| water | 🧙 Mage | 💧 | 🌊 Stream, 💧 Flush | Jet, Pulse | Flood, Wave |
| electric | 🧙 Mage | ⚡ | ⚡ Overclock, 🔋 Power | Zap, Spark, Bolt | Surge, Storm |
| psychic | 🧙 Mage | 💫 | 🔮 Async, 🧠 Neural | Beam, Pulse | Wave, Field |
| ghost | 🧙 Mage | 🌑 | 👻 Zombie, 🌑 Null | Pointer, Touch | Haunt, Fog |
| ice | 🧙 Mage | 🧊 | 🧊 Frozen, 🥶 Cold | Start, Shard | Blizzard, Frost |
| flying | 🧝 Archer | 🪶 | 🪶 Packet, 💨 Cloud | Dive, Peck | Burst, Gust |
| bug | 🧝 Archer | 🟢 | 🐛 Buggy, 🐝 Hive | Sting, Bite | Swarm, Infestation |
| poison | 🧝 Archer | 🟣 | 🦠 Virus, 🐍 Venom | Sting, Spit | Cloud, Spray |
| grass | 🧝 Archer | 🍃 | 🌳 Tree, 🍃 Leaf | Shake, Blade | Storm, Bloom |

**Power** (multiplies attack and life, and is what swaps compare):

| Species | Power |
|---------|-------|
| 3-stage lines | 0.85 → 1.0 → 1.15 |
| 2-stage lines | 0.9 → 1.1 |
| Early bugs (Cacherpie, Testle lines) | 0.75 → 0.8 → 1.0 |
| Logikarp → Gyaralogs | 0.7 → 1.2 (useless until it evolves) |
| Evalee → its three evolutions | 0.9 → 1.1 |
| Dragon line (Dropini) | 0.85 → 1.05 → 1.25, the strongest non-legendary |
| Single species | 1.0; the rare ones 1.1 |
| Zone boss species (Blocklax, Pinsort, Shellix) | 1.15 |
| Clauchu, the starter | 1.0, plus a small bonus for never evolving |
| Haikuno, Sonnetdos, Opustres | 1.25 |
| Clewtwo, Clew | 1.3 |

**Spawn weight (`rare`):** 1 for most species, 0.25 for those marked rare in the appendix. Night
critters have 1 at night and 0.25 by day. Species not caught yet get ×6 on top (Step 5; both raised
in Step 8).

**Evolution levels** (the trainer's level): the early bugs at 7 and 10, the other 3-stage lines at
16 and 36, the dragon line at 30 and 55, 2-stage lines at 28, Logikarp at 20 and Evalee at 25 (one
of its three at random, preferring one not caught yet). Clauchu never evolves, a nod to the anime;
Opuschu is caught in the wild.

**Where critters live** (base forms; their evolved forms live in the same biome but only spawn
deeper in the world, see Step 5). The counts include the evolved forms and the boss:

| Biome | Species | Wild | At night | Zone boss |
|-------|---------|------|----------|-----------|
| 🌼 Meadow | 19 | Cacherpie, Packey, Ramdata, Clauchu, Prefetchd, Tokentung, Goldmaster; Evalee and Restorsey (rare) | 🎤 Jsonpuff → Yamltuff | 🐻 Blocklax |
| 🌲 Dark Forest | 21 | Bytesaur, Testle, Oddhash, Parse, Bellsprint, Eggsecute, Spaghela, Scrypther | 🐜 Vimnat → Vimmoth | 🪲 Pinsort |
| 💎 Caves | 22 | Claufairy, Patchkey, Hackchop, Gitdude, Electabug, Monolyte, Kabug; Clonetto, Codegon, Aerodaemon, Jolteval (rare) | 🦇 Zubash → Golbash | 🐍 Shellix |
| 🌴 Coast | 24 | Scriptle, Rubberduck, Loopwag, Tentaclaude, Sealint, Perlder, Crabbyte, Forksea, Logikarp; Laptops, Vaporeval (rare) | ⭐ Starrepo → Starmerge | 🐲 Gyaralogs |
| 🌵 Desert | 22 | Spamrow, Nohtyp, Sandbox, Stackoran, Heaporan, Diglog, Duocore, Rhyport, Kanbanskhan, Taurest | 💀 Cuberoot → Maroroot | 🦏 Rhydeploy |
| 🪦 Graveyard | 18 | Meowcatch, Algo, Slowquery, Crufter, Idlezee, Clogging, Mr. Mock, Syncx | 👻 Lagly → Hangter | 😈 Crashgar |
| 🌋 Volcano | 20 | Commitmander, Greplithe, Taskpony, Magnebit, Voltboot, Hotfixlee, Hotfixchan, Magmake; Flareval, Dropini (rare) | 🦊 Volpixel → Ninetabs | 🐉 Commizard |
| Legendaries | 5 | Haikuno, Sonnetdos, Opustres and Clewtwo (Elder bosses), Clew (secret) | | |

The 14 night critters are the Night Shift achievement's goal (Step 10). Crashgar is the
Graveyard's boss at any hour, even though the rest of its line comes out at night.

- Add a check script, `scripts/check-roster.js` (development only). It confirms there are 151
  unique numbers and unique names, that every `evolves.to` exists and is one stage higher, that
  every species can be caught somewhere, and that every icon passes the emoji rules. Icons can
  repeat: there are far fewer emoji than species, and the name is what tells them apart.
- **Done when:** the check passes. Nothing loads this file yet.

### Step 3: the Trainer class, locked until level 50 ✅ done

- Add `CLASSES.trainer` (icon 🧢, name, blurb, `partner: true`, the ball track as `weapons`). Its
  `range`, `hit`, `crit`, `life` and `skills` come from the partner through `classOf(h)`.
- `newHero('trainer')` adds `partner: { n: 25, since: now }`. `classOf(h)` combines the partner's
  `TYPES` entry with its `power` (which scales `atk` and `life`).
- **Unlock:** add a "Legend" achievement (reach level 50) to the Journey group. The trainer is
  unlocked when `root.achievements['level-50']` is set, so it stays unlocked for good. The first
  time it's earned, the news reads: `🧢 Bash the Trainer wants to join you: /vwc:chooseclass trainer`.
  Saves that already have a level 50 hero unlock it on their first load.
- **Gates:** while it's locked, `chooseClass` and `createCharacter` answer with
  `🔒 The 🧢 Trainer unlocks when any hero reaches level 50 (best so far: 🧝 Archer Lv 37).`, and
  `status()` shows the same line.
- **Leave the trainer out of:** the class picker (still the 3 base classes), the `everyClass` fact
  behind All-Rounder (otherwise new players could never earn it), and anything else that loops
  over `CLASSES` expecting 3 heroes.
- Update the `cli.js` usage text and the `argument-hint` in `chooseclass`, `createchar`, `card` and
  `journal`. Add the `bash` alias in `classKey`.
- **Done when:** in a test save, a level 49 hero is refused and a level 50 one can pick the trainer.
  The starter fights and levels, and All-Rounder still works with 3 classes.

### Step 4: the partner on screen ✅ done

- **World row:** the partner is drawn on the hero's tile, 🧢 one tile behind it, and subagent allies
  and a camp (`🔥⛺🧢🐭`) one tile further back.
- **Stats row:** `🧢 Trainer Lv 3 … · 🐭 Clauchu · 🔴 Clau Ball · 📕 1/151 · 🌼 Meadow 12% …`.
  Give the dex count a low priority so it's one of the first parts dropped on narrow terminals.
  (Built: the partner, which gives way to the enemy's life bar at 80 columns. The 📕 count comes
  with the dex in Step 5.)
- **Reports:** `describe`, `/vwc:gear` ("worn by 🐭 Clauchu"), `/vwc:skills`, `/vwc:card` and
  `/vwc:statistics` name the partner. A knockout reads "fainted".
- **Done when:** the trainer renders correctly at 80, 120 and 200 columns, including with 2 allies
  at the trainer's side.

### Step 5: wild critters and catching ✅ done

- For the trainer, `WILD_SHARE` of the normal spawns are a wild critter of the biome, picked by
  spawn weight; the rest are the usual enemies. A critter always comes alone, never in a group.
  Life, damage and XP still come from the zone curves, so balance doesn't change.
- Only critters can be caught. The usual enemies can still turn elite, and seasonal enemies (⛄,
  👻 waves) still come; none of them can be caught. Critters never roll an elite trait.
- Evolved forms only spawn from a deeper zone (stage 2 from zone 3 on, stage 3 from zone 8 on), so
  catching evolved forms happens naturally further into the world. Zone bosses are the biome's
  boss species, and level bosses are critters too (see 0.4).
- Night critters spawn with their full weight at night and a quarter of it by day.
- **Favor missing species:** species not caught yet spawn 6 times as often, so the last entries
  don't take forever.
- **Catch on defeat:** the chance is `CATCH` × the ball tier (a rare species already spawns less
  often, so it isn't also harder to catch). Zone and level bosses use `CATCH_BOSS`, and legendaries
  are always caught. The ball's icon flies to the critter (an `fx`, like a shot).
  - Caught: `🔴 Caught 🐢 Scriptle! 📕 12/151`. A new species goes to the journal; a repeat only
    shows on the stats row.
  - Seen but not caught yet: the species is marked "seen" in the dex (no message).
- Store it as `root.dex = { [n]: { seen, caught, at } }`. `migrate()` adds `root.dex = {}` to older
  saves.
- Add the 📕 dex count to the stats row (left over from Step 4), with a low priority.
- New constants with starting values (tune them in Step 11): `WILD_SHARE = 0.4`, `CATCH = 0.08`,
  `CATCH_BOSS = 0.5`, `MISSING_WEIGHT = 3`, `NIGHT_BY_DAY = 0.1` (the last two raised to 6 and 0.25
  in Step 8).
- **Done when:** a simulated hour as the trainer catches a believable number of critters, and the
  dex survives `/vwc:createchar trainer`.
- **Built.** The ball tiers catch ×1, 1.15, 1.3, 1.45, 1.6, 1.8 and 2. Pace measured (3 seeds,
  working 9:00 to 21:00, no allies): 49 species after 5 h, 89 after 10 h, 115 after 15 h, 133 after
  20 h and 141 after 30 h (Lv 49). The last missing ones are night critters, which a day worker meets
  for about an hour a day (`NIGHT_BY_DAY` was raised in Step 8 for that).

### Step 6: partner swaps and type skills ✅ done

- After a catch, apply the rule from 0.2 (`considerSwap`, measured by `strength`).
- On a swap, the new partner rolls its own skills, the gear stays, and the journal says
  `🔄 🐻 Blocklax is your new partner, in place of 🐭 Clauchu · its skills: 🔁 Retry Rumble`, right
  after `🟠 Caught 🐻 Blocklax! 📕 3/151`.
- Type skills: boss drops for the trainer roll from the partner's type through
  `classOf(h).skills`, so a water partner learns 🌊 skills and an electric one learns ⚡ skills.
- Add `tally.partners` (the partners a trainer had, the starter counting as 1).
- Each type now has 3 or 4 skill parts (12 to 20 names), so a duplicate name is rare.
- **Done when:** a simulation shows the trainer is never weaker right after a swap than right
  before it, and that swaps keep happening through the game. **Measured:** 3 runs of 40 hours,
  3 or 4 swaps each (around Lv 6 to 9, 16 to 27 and 42 to 47), none of them leaving the hero weaker.

### Step 7: evolution ✅ done

First plan: the partner evolves when Bash reaches its level. Checked before building it, that
could never happen: every species that evolves has power 1.05 or less, the starter already has
1.05 (and never evolves), and only a stronger species can take its place. So on 2026-10-06 the
user chose instead: **catches grow to Bash's level.**

- A caught critter evolves on the spot through every evolution level Bash has passed (`evolutionOf`),
  and each form goes in the dex: `🟢 Caught 🌰 Kakunit, ✨ it evolved into 🐝 Bugdrill! 📕 29/151`.
  It's then compared for a swap in its evolved form, so a Logikarp caught at level 20 can arrive as
  a Gyaralogs and take over.
- A partner still evolves when Bash reaches its level (`growPartner`), keeping its skills:
  `✨ 🦎 Commitmander evolved into 🦎 Commiteleon!`. With today's numbers no partner has an
  evolution left, so this only matters if Step 11 changes the powers.
- A species with several evolutions (Evalee) picks one at random, preferring one not caught yet.
- The starter never evolves (its `stays: true` flag), a nod to the anime, and has a small power
  bonus instead. Opuschu is only caught in the wild.
- **Measured** (3 runs, 9:00 to 21:00): about 200 evolutions in 30 hours out of about 460 catches;
  the dex fills only a little faster (126 species at 15 h instead of 119, 134 at 20 h instead of
  130, 144 at 40 h instead of 143). Swaps still never leave the hero weaker. A partner forced to
  Commitmander evolves into Commiteleon at level 16, keeping its skill.

### Step 8: legendaries and finishing the dex ✅ done

- The Elder boss of trainer levels 20, 30, 40 and 50 is a legendary: 🦢 Haikuno, 🦅 Sonnetdos,
  🦚 Opustres and 🧬 Clewtwo. It's caught for sure when defeated, and it still drops a skill as
  Elder bosses do.
- The other level bosses are critters too: a "Giant" biome critter at levels 5, 15, 25…, and an
  "Elder" version of the biome's boss species at levels 10, 60, 70…, caught with `CATCH_BOSS`.
- Once 150 species are caught, 🐱 Clew can appear as a very rare wild encounter in any biome. It's
  caught for sure, which completes the dex. After that nothing new happens, for now.
- **Done when:** the simulation shows every species can be reached. Target: most of the dex in
  about 15 to 20 hours of trainer work, and all 151 around trainer level 50.
- **Built.** The legendary's arrival shows as `🌟 A legendary appears: 🦢 Haikuno`, its catch as
  `🔵 Caught the legendary 🦢 Haikuno! 📕 56/151`. Clew is `SECRET_CHANCE` (1%) of the wild critters
  once every other species is caught, announced with `✨ Something rare stirs ahead: 🐱 Clew`; its catch
  adds `📕 The dex is complete: all 151 critters caught!`.
- **Measured and tuned.** With night critters a tenth as often by day and missing species ×3, every
  run completed the dex, but the last few took 41 to 95 hours: night critters for a day worker
  (9:00 to 21:00), rare ones (mostly in the Caves) for an evening worker (12:00 to 24:00). With a
  quarter by day and ×6, all 8 runs (4 per schedule) complete at 30 to 33 hours, Lv 50 to 53, with
  120 species at 10 to 13 h and 140 at 14 to 17 h; the last one in is usually the level 50
  legendary. Swaps still never leave the hero weaker, and Clewtwo ends up as the partner in 2 of 3
  long runs.

### Step 9: the `/vwc:dex` command (information only) ✅ done

- Add a `skills/dex/SKILL.md` (copy `journal`'s), plus `dex` in `cli.js` and `dexReport(arg, now)`.
- `/vwc:dex` shows the count, progress per biome and the last 10 catches. `/vwc:dex all` shows all
  151 rows: caught (with the date), 👀 seen, or `???` (👁 breaks the emoji rules: it needs U+FE0F).

  ```
  📕 Dex · 37 of 151 caught · 52 seen
    🌼 Meadow 9/14 · 🌲 Dark Forest 6/18 · 💎 Caves 7/22 · 🌴 Coast 5/24 · …
    Partner: 🐲 Gyaralogs (since 2026-10-12) · 4 partners so far
    Last caught: #054 🦆 Rubberduck · #129 🐟 Logikarp · …
  ```

- Without an unlocked trainer, the command explains how to unlock it.
- Add it to the `COMMANDS` list in `cli.js` and to the README commands table.
- **Built.** Two lines of progress (the 7 biomes, 🌟 Legendaries, 🌙 At night), the partner (type, since
  when, how many so far), then the last 10 species new in the dex, or with `all` every species:
  `#006 🐉 Commizard  fire  🌋 Volcano  ✅ 2026-10-06 ×4  zone boss`. One not met yet shows only where
  to look, the legendaries their level, and Clew "a secret". Tested locked, unlocked without a
  trainer, with a dex, with `all` (151 rows, 103 columns at most) and with a bad argument. Claude Code
  only lists `/vwc:dex` after `/plugin marketplace update vibeworkcompanion` and `/reload-plugins`.

### Step 10: achievements, statistics, journal and card

- A new achievement group, "Collection": first catch, 25, 75, 150 and 151 caught (151 secret), a
  partner evolves, catch a legendary, 10 different partners, and **Night Shift**: catch all 14
  night critters (Step 2). Use your own names, not slogans from the original series.
- Add `caught`, `species`, `partners` and `evolutions` to `counts()` so lifetime totals keep them.
- `/vwc:statistics` gets a "Catches" row for the trainer: `57 · 37 species · 4 partners · 2 evolutions`.
- `/vwc:card trainer` shows the partner and `📕 37/151`.

### Step 11: balance check

Use the seeded simulation over 30 hours of work:

- The trainer levels within about a level of the other classes (the README promises this for the
  three base classes, so it should hold for the trainer too). Tune `TYPES[*].life`, the `power`
  range and the starter's strength.
- Catch pacing matches the Step 8 targets (already measured and tuned in Step 8; recheck after any
  other change). Tune `WILD_SHARE`, `CATCH`, `MISSING_WEIGHT`, `NIGHT_BY_DAY` and the ball tiers.

### Step 12: docs and release

- README: a Trainer section (unlock, partner, catching, swaps, evolution), a Dex section, the
  commands table, the Classes table, the files table and the save file description. Use only the
  parody names.
- `IDEAS.md`: add the trainer to "Built so far".
- Add a `WHATS_NEW` entry for `1.20.0` (`🧢 reach level 50 to unlock Bash the Trainer: catch all 151 critters`),
  bump `.claude-plugin/plugin.json`, then run `claude plugin validate .`.
- Commit and push to `main` (the repo is its own marketplace).
- **Tag the version** on that commit and push the tag: `git tag -a v1.20.0 -m "1.20.0: Bash the Trainer"`
  then `git push origin v1.20.0`. It's the repo's first tag.
- **Create the GitHub release** from the tag, with the notes below. The `gh` CLI isn't installed on
  this machine: install it (`winget install GitHub.cli`, then `gh auth login`) and run
  `gh release create v1.20.0 --title "1.20.0: Bash the Trainer" --notes-file <notes>`, or paste the
  notes on GitHub (Releases → Draft a new release → choose the tag).
- The release notes say what's new, how to update (`/plugin marketplace update vibeworkcompanion`,
  then `/reload-plugins`), and this note about older windows:

  > **More than one Claude Code window?** Update every window. A window still on an older version
  > doesn't know the Trainer: while Bash is your active hero, its status line shows
  > `companion error: …` instead of the companion, and work done in that window doesn't count until
  > it updates. Your save is safe: a version that can't read it doesn't write to it. With any
  > other hero active, older windows work as before.

If the whole thing feels too big for one release, ship Steps 1 to 6 and 9 as 1.20.0 (trainer,
catching, swaps, `/vwc:dex`), then Steps 7, 8 and 10 as 1.21.0 (evolution, legendaries,
achievements). Each one gets its own tag and GitHub release.

## Checks against the design rules

- **No input while working:** catching, swapping and evolving all happen on their own.
  `/vwc:chooseclass trainer` is a command, like picking any class today.
- **Nothing taken away:** the unlock and the dex are permanent, a swap only happens when it leaves
  the hero stronger, and the gear stays with Bash.
- **Privacy:** nothing new is read. Everything still comes from hook timing and token counts.
- **Emoji:** checked by `check-roster.js` (Step 2). Unicode 15 emoji (🪼 🪽 🩷) are out.
- **Names:** parodies only, checked against the rules in 0.1.

## Left for later

- Type matchups against biomes (water strong in the 🌋 Volcano, weak in the 🌵 Desert).
- Showing past partners, a "box", in `/vwc:dex`.
- Shiny variants: a gold name and a 1-in-500 roll, for bragging on `/vwc:card`.
- Trading between players is out: it needs the network, which breaks "nothing leaves your machine".

## Appendix: all 151 critters

One row per evolution line, in dex order. An arrow means "evolves into"; a comma means separate
species. Each species has one type, the one that best fits how it fights (it picks its `TYPES`
entry in Step 2). Icons repeat on purpose: there are far fewer emoji than species. Evolved forms
live in the same biome as their base form but only spawn deeper in the world (Step 5).

| # | Names | Icons | Type | Where | The pun |
|---|-------|-------|------|-------|---------|
| 001–003 | Bytesaur → Kilosaur → Gigasaur | 🌱 🌿 🌺 | grass | 🌲 Dark Forest | byte, kilobyte, gigabyte |
| 004–006 | Commitmander → Commiteleon → Commizard | 🦎 🦎 🐉 | fire | 🌋 Volcano; Commizard is its boss | git commit |
| 007–009 | Scriptle → Wartscript → Blastscript | 🐢 🐢 🐢 | water | 🌴 Coast | scripts |
| 010–012 | Cacherpie → Metanode → Bufferfree | 🐛 🥚 🦋 | bug | 🌼 Meadow | cache, node, buffer |
| 013–015 | Testle → Kakunit → Bugdrill | 🐛 🌰 🐝 | bug | 🌲 Dark Forest | test, unit test, bug drill |
| 016–018 | Packey → Packeotto → Packeot | 🐦 🐦 🦅 | flying | 🌼 Meadow | packets (IP over carrier pigeon) |
| 019–020 | Ramdata → Rallocate | 🐀 🐀 | normal | 🌼 Meadow | RAM, allocate |
| 021–022 | Spamrow → Errorow | 🐦 🦅 | flying | 🌵 Desert | spam, error |
| 023–024 | Nohtyp → Avaj | 🐍 🐍 | poison | 🌵 Desert | python and java spelled backwards, like the originals |
| 025–026 | Clauchu → Opuschu | 🐭 🐭 | electric | 🌼 Meadow; the starter | Claude, Opus |
| 027–028 | Sandbox → Sandbash | 🦔 🦔 | ground | 🌵 Desert | sandbox, bash |
| 029–031 | Stackoran → Stackorina → Stackqueen | 🐇 🐇 👑 | poison | 🌵 Desert | the stack… |
| 032–034 | Heaporan → Heaporino → Heapking | 🐇 🐇 🦖 | poison | 🌵 Desert | …and the heap |
| 035–036 | Claufairy → Claufable | 🧚 🧚 | normal | 💎 Caves | Claude, and Claude Fable |
| 037–038 | Volpixel → Ninetabs | 🦊 🦊 | fire | 🌋 Volcano, at night | pixel, tabs |
| 039–040 | Jsonpuff → Yamltuff | 🎤 🎤 | normal | 🌼 Meadow, at night | JSON grows up into YAML |
| 041–042 | Zubash → Golbash | 🦇 🦇 | poison | 💎 Caves, at night | bash |
| 043–045 | Oddhash → Glumhash → Hashplume | 🍀 🥀 🌸 | grass | 🌲 Dark Forest | hash |
| 046–047 | Parse → Parsetree | 🍄 🍄 | bug | 🌲 Dark Forest | parse tree |
| 048–049 | Vimnat → Vimmoth | 🐜 🦋 | bug | 🌲 Dark Forest, at night | vim |
| 050–051 | Diglog → Dugtrace | 🐹 🐹 | ground | 🌵 Desert | log, trace |
| 052–053 | Meowcatch → Persistian | 🐈 🐈 | normal | 🪦 Graveyard | try/catch, persist |
| 054–055 | Rubberduck → Goldenduck | 🦆 🦆 | water | 🌴 Coast | rubber duck debugging |
| 056–057 | Patchkey → Primepatch | 🐒 🦍 | fighting | 💎 Caves | monkey patching |
| 058–059 | Greplithe → Awkcanine | 🐕 🦁 | fire | 🌋 Volcano | grep, then awk |
| 060–062 | Loopwag → Loopwhirl → Loopwrath | 🐸 🐸 🐸 | water | 🌴 Coast | the swirl is an infinite loop |
| 063–065 | Algo → Kadalgo → Algokazam | 🔮 🥄 🥄 | psychic | 🪦 Graveyard | algorithms are magic |
| 066–068 | Hackchop → Hackchoke → Hackchamp | 💪 💪 🦾 | fighting | 💎 Caves | hack |
| 069–071 | Bellsprint → Scrumbell → Retrobel | 🔔 🔔 🪴 | grass | 🌲 Dark Forest | sprint, scrum, retro |
| 072–073 | Tentaclaude → Tentasonnet | 🦑 🦑 | water | 🌴 Coast | Claude, Sonnet |
| 074–076 | Gitdude → Gitveler → Gitlem | 🪨 🪨 🗿 | rock | 💎 Caves | git |
| 077–078 | Taskpony → Rapidtask | 🐴 🦄 | fire | 🌋 Volcano | task |
| 079–080 | Slowquery → Slowbuild | 🦛 🦛 | water | 🪦 Graveyard | slow query, slow build |
| 081–082 | Magnebit → Magnebyte | 🧲 🧲 | electric | 🌋 Volcano | a bit grows into a byte |
| 083 | Prefetchd | 🦆 | flying | 🌼 Meadow | prefetch, as a daemon |
| 084–085 | Duocore → Triocore | 🦤 🦤 | flying | 🌵 Desert | two heads, dual core; three heads, tri core |
| 086–087 | Sealint → Dewlint | 🦭 🦭 | water, ice | 🌴 Coast | lint |
| 088–089 | Crufter → Gunkruft | 🦠 🦠 | poison | 🪦 Graveyard | cruft |
| 090–091 | Perlder → Perlyster | 🦪 🦪 | water, ice | 🌴 Coast | Perl, and pearls |
| 092–094 | Lagly → Hangter → Crashgar | 👻 👻 😈 | ghost | 🪦 Graveyard: Lagly and Hangter at night, Crashgar is its boss | lag, hang, crash |
| 095 | Shellix | 🐍 | rock | 💎 Caves boss | shell |
| 096–097 | Idlezee → Hipnotty | 😪 🌀 | psychic | 🪦 Graveyard | idle, tty |
| 098–099 | Crabbyte → Kingclaw | 🦀 🦞 | water | 🌴 Coast | byte, claw (Claude) |
| 100–101 | Voltboot → Electrobrick | 💣 💣 | electric | 🌋 Volcano | a boot loop that bricks (they explode) |
| 102–103 | Eggsecute → Eggsecutor | 🥚 🥥 | grass | 🌲 Dark Forest | execute, executor |
| 104–105 | Cuberoot → Maroroot | 💀 🦴 | ground | 🌵 Desert, at night | cube root, root |
| 106–107 | Hotfixlee, Hotfixchan | 🦵 🥊 | fighting | 🌋 Volcano | hotfix |
| 108 | Tokentung | 👅 | normal | 🌼 Meadow | tokens |
| 109–110 | Clogging → Freezing | 💨 🥶 | poison | 🪦 Graveyard | a clogged app, then a frozen one |
| 111–112 | Rhyport → Rhydeploy | 🦏 🦏 | ground | 🌵 Desert; Rhydeploy is its boss | port, deploy |
| 113 | Restorsey | 🩹 | normal | 🌼 Meadow, rare | the healer restores |
| 114 | Spaghela | 🍝 | grass | 🌲 Dark Forest | spaghetti code |
| 115 | Kanbanskhan | 🦘 | normal | 🌵 Desert | kanban |
| 116–117 | Forksea → Rebasea | 🐠 🐠 | water | 🌴 Coast | fork, then rebase |
| 118–119 | Goldmaster → Mainking | 🐡 🐡 | water | 🌼 Meadow (the pond) | master was renamed to main |
| 120–121 | Starrepo → Starmerge | ⭐ 🌠 | water | 🌴 Coast, at night | a starred repo, merge |
| 122 | Mr. Mock | 🤡 | psychic | 🪦 Graveyard | mocks mimic the real thing |
| 123 | Scrypther | 🦗 | bug | 🌲 Dark Forest | crypt |
| 124 | Syncx | 💋 | ice | 🪦 Graveyard | sync |
| 125 | Electabug | 🐯 | electric | 💎 Caves | bug |
| 126 | Magmake | 🧨 | fire | 🌋 Volcano | make |
| 127 | Pinsort | 🪲 | bug | 🌲 Dark Forest boss | sort |
| 128 | Taurest | 🐂 | normal | 🌵 Desert | REST |
| 129–130 | Logikarp → Gyaralogs | 🐟 🐲 | water | 🌴 Coast; Gyaralogs is its boss | logic, logs |
| 131 | Laptops | 🦕 | water | 🌴 Coast, rare | it carries you across the sea, like a laptop |
| 132 | Clonetto | 🍮 | normal | 💎 Caves, rare | git clone |
| 133–136 | Evalee → Vaporeval, Jolteval, Flareval | 🦊 🐬 🦔 🦊 | normal, water, electric, fire | 🌼 Meadow, rare; each evolution is also a rare find in 🌴 Coast, 💎 Caves and 🌋 Volcano | eval (and vaporware) |
| 137 | Codegon | 🤖 | normal | 💎 Caves, rare | code |
| 138–139 | Monolyte → Monostar | 🐚 🐚 | rock | 💎 Caves (fossils) | monolith, legacy code |
| 140–141 | Kabug → Kadevops | 🦀 🦂 | rock | 💎 Caves (fossils) | a bug grows into DevOps |
| 142 | Aerodaemon | 🦅 | rock | 💎 Caves, rare | daemon |
| 143 | Blocklax | 🐻 | normal | 🌼 Meadow boss | it blocks the path |
| 144–146 | Haikuno, Sonnetdos, Opustres | 🦢 🦅 🦚 | ice, electric, fire | legendaries, Elder bosses at trainer levels 20, 30, 40 | Haiku, Sonnet, Opus |
| 147–149 | Dropini → Dragndrop → Dragonode | 🐍 🐲 🐉 | dragon | 🌋 Volcano, rare | drag and drop, node |
| 150 | Clewtwo | 🧬 | psychic | legendary, Elder boss at trainer level 50 | Claude + clew |
| 151 | Clew | 🐱 | psychic | secret, once the other 150 are caught | Claude + clew |

Types: water 26, normal 16, poison 14, grass, fire and bug 12 each, electric and rock 9, flying,
ground and psychic 8, fighting 7, ice 4, ghost and dragon 3. Some icons match an ally's (🦊 🐕 🧚
🦄), but allies walk behind the trainer and critters come from ahead, so they don't get mixed up.
