# Bolt Buddies (working title)

**A 2-player couch co-op puzzle platformer.** Two little lab robots — **Beep** (P1, blue) and **Boop** (P2, orange) — chase through a neon robotics facility to rescue their robo-puppy **Bolt**, who was carried off by **KOBI** (K.O.B.I. — *Keeper Of Building Integrity*), the lab's glitchy, comically overdramatic security AI.

---

## 1. Vision & Pillars

1. **True asymmetric co-op.** Every level requires both skills. Neither player can finish alone — the puzzles are conversations between two powers.
2. **Choose your role.** Both robots start every level identical. Two power-up pedestals stand at the entrance; players read the item cards and decide who takes which. Roles are **locked for the level**, so every level must be solvable with either assignment.
3. **Kid-and-parent friendly.** ~80% thinking, ~20% execution. Generous jumps, slow readable hazards, instant checkpoint respawns, zero punishment. The challenge is coordination, not reflexes.
4. **Enemies are puzzles.** Every enemy type is vulnerable to one specific skill. Combat = figuring out *whose job this is*.

## 2. Format & Tech

| Decision | Choice |
|---|---|
| Platform | Browser (HTML5), deployed to Vercel |
| Engine | Phaser 3, arcade physics, 60fps |
| Co-op | Shared keyboard, same screen |
| Art | Sci-fi neon lab — dark backgrounds, glowing accents, test-chamber vibes |
| Save | localStorage: level unlocks + collected data-cores |
| Session length | 5–10 minutes per level; 12 levels total |

### Controls (3 buttons + movement each)

| | Move | Jump | Action |
|---|---|---|---|
| **P1 Beep** | A / D | W | SPACE (E also works) |
| **P2 Boop** | ← / → | ↑ | L |

The **Action** button is context-sensitive:
- Normally: fire your special skill.
- Standing beside your partner (skill not applicable): **pick up** partner; press again to **throw**.
- Partner-targeting skills (grapple, magnet, bubble) target the partner when aimed at them.

## 3. Structure & Progression

- **4 worlds (wings of the lab) × 3 levels = 12 levels.** Linear unlock; a hub map of the facility shows the 4 wings and 12 chambers.
- Within each world the 3 levels follow **Teach → Twist → Master**: level 1 introduces the skill pair gently, level 2 combines/inverts the mechanics, level 3 demands fluent teamwork and ends with a set-piece.
- **Collectibles:** 3 hidden **data-cores** per level (36 total), each requiring extra co-op cleverness. Optional; shown on the hub map. Collecting all cores in a world unlocks a bonus photo of Bolt for the family album.
- **Level exit:** once the level's objectives (keys, doors, enemies) are resolved, the exit door opens and **both robots must walk through**. No one left behind.
- **Failure:** touch a hazard → pop back to the last checkpoint in ~1s while your partner keeps playing. No lives, no level restarts. Checkpoints roughly every 2 minutes of play.

## 4. The Eight Skills

Each level presents exactly **two pedestals** with that world's pair. Each pedestal shows an **item card** — name, icon, and a one-line kid-readable description (these double as the tutorial).

| Skill | Item card text | Solo use | Partner use |
|---|---|---|---|
| **Grappling Hook** | "Zip across gaps and yank far-away things — including your buddy!" | Swing/zip to anchor points, pull levers & shields from afar | Reel your partner across chasms |
| **Heavyweight** | "Big, strong, and VERY heavy. Smash, stomp, and stand your ground." | Break cracked floors, hold pressure plates, crush enemies, can't be pushed by fans/conveyors | Living anchor for grapple; throws Tiny partner far |
| **Phase-Walk** | "Walk straight through shimmering walls like a ghost!" | Pass through phase-walls, ambush enemies from behind | Hold hands to escort partner through a wall (short range, slow) |
| **Tiny** | "Small, quick, and squeezable — fit where no robot has fit before!" | Crawl through ducts and gaps, ride on partner's head, too small for some enemies to see | Can be carried & thrown across gaps; fits in launch tubes |
| **Magnet Glove** | "Pull metal things to you — or pull yourself to metal things!" | Drag metal crates, cling to steel ceilings/walls, flip magnetic switches | Reel in your partner, or let them ride a dragged crate |
| **Bubble Shield** | "Blow a big safe bubble around you — or around your buddy!" | Float upward on air vents, roll over spikes/electric floors, bounce | Encase partner so they can cross hazards you open the way through |
| **Time-Freeze** | "Stop the world for 5 seconds. Platforms, lasers, enemies — frozen!" | Freeze moving platforms mid-air as stepping stones, pause laser sweeps, stop crushers | Freeze hazards while partner runs the gauntlet |
| **Light-Beam** | "A mighty flashlight! Light the dark, melt the ice, dazzle the baddies." | Reveal dark zones & invisible platforms, melt ice doors, charge solar panels | Spotlight partner's path through darkness; blind enemies chasing them |

## 5. The Four Worlds

### World 1 — Assembly Wing 🔧 (Grapple + Heavyweight)
*Bright-ish intro wing: conveyor belts, cranes, cracked floors, swinging hooks.*
- **Enemies: Scuttlebugs** — armored beetle-bots. Only Heavy's stomp cracks them. **Cranebots** hold key-cages; Grapple yanks the cage down.
- **1-1 "First Day on the Job"** *(teach)* — Grapple crosses a belt gap and pulls a lever lowering a bridge for Heavy; Heavy breaks a cracked floor revealing the key; both must weigh down a see-saw lift to reach the exit.
- **1-2 "The Crusher Line"** *(twist)* — Heavy safely walks under crushers that would flatten Grapple; Grapple zips along the ceiling over Scuttlebug swarms; anchor-swing sequence where Heavy stands as the anchor point.
- **1-3 "Crane Chaos"** *(master)* — KOBI animates the big crane. Grapple disarms its shield-plates one by one while Heavy stomps the exposed cores; ends with Grapple reeling Heavy up the collapsing tower to the exit.

### World 2 — Maintenance Tunnels 🌀 (Phase-Walk + Tiny)
*Ducts, fans, steam pipes, shimmering phase-walls, tight crawlspaces.*
- **Enemies: Patrol Rollers** — see at eye level only; Tiny walks right under their gaze. **Wall-Wardens** guard doors and can only be ambushed from behind — through a phase-wall.
- **2-1 "The Vents"** *(teach)* — Tiny crawls through ducts to open hatches; Phase walks through marked walls to hit switches; each opens the other's path in alternation.
- **2-2 "Steam & Shadows"** *(twist)* — Phase escorts Tiny through a wall into the fan room; Tiny rides the airflow through a duct maze to shut the steam valves that block Phase.
- **2-3 "The Warden's Maze"** *(master)* — A mirrored maze: Tiny's route and Phase's route interlock; timed lever pulls (generous windows) and a finale where Tiny is thrown across the final gap after Phase ambushes the last Warden.

### World 3 — Magnet Works ⚡ (Magnet Glove + Bubble Shield)
*Steel ceilings, electric floors, water tanks, air vents, crate physics.*
- **Enemies: Zap-Jellies** — electric floaters; Bubble bounces them into sockets where they harmlessly power doors. **Junk-Chompers** — magnetic mouths; Magnet yanks their metal teeth out.
- **3-1 "Attract Mode"** *(teach)* — Magnet drags crates into stair-steps and clings across a steel ceiling; Bubble floats over the electric floor to press the far switch that de-electrifies it.
- **3-2 "The Flooded Tank"** *(twist)* — Bubble travels underwater carrying the key; Magnet redirects the current by moving metal baffles from above; partner-reel across the great tank.
- **3-3 "The Scrap Storm"** *(master)* — KOBI reverses the lab's polarity: flying scrap fills the air. Magnet catches scrap as moving shields/platforms while Bubble ferries the three fuse-cores to their sockets.

### World 4 — The Dark Core 🌑 (Time-Freeze + Light-Beam)
*Nearly black, lit only by neon and the Beam. Sweeping lasers, moving platforms, KOBI's inner sanctum. Mild timing pressure debuts here.*
- **Enemies: Gloomies** — shadow-bots that flee from light into trap-pits. **Tickers** — patrol on precise loops; only Freeze lets you slip past.
- **4-1 "Lights Out"** *(teach)* — Beam reveals invisible platforms and scares Gloomies off switches; Freeze stops the rotating bridge so both can cross.
- **4-2 "The Laser Garden"** *(twist)* — Sweeping laser fields: Freeze stops them in safe positions while Beam melts the three ice-locked doors; each door's key is guarded by a Ticker.
- **4-3 "KOBI's Heart"** *(master, finale)* — The confrontation. Beam blinds KOBI's eye to expose its three cooling cores; Freeze stops the defense turbines so the partner can reach each core. No violence — you're *unplugging his tantrum*. Bolt bounds out; KOBI, revealed to be lonely, is adopted by the family. Epilogue playground scene + credits.

## 6. Story Beats

- **Intro (30s, skippable):** Beep, Boop and robo-puppy Bolt play fetch in the lab lobby. A claw snatches Bolt. KOBI's giant eye appears: *"NO PETS ALLOWED. Commencing... CONFISCATION."*
- **Between worlds:** KOBI taunts via marquee screens — dramatic but never scary ("You'll NEVER get past my Maintenance Tunnels. I mopped them MYSELF.") Bolt is glimpsed at each wing's end, always one door ahead.
- **Item cards** are written in KOBI's voice archive — the friendly lab-inventory system — which subtly foreshadows that KOBI isn't evil, just malfunctioning and lonely.
- **Ending:** Bolt rescued, KOBI reformed and adopted. All-ages, reunion over punishment.

## 7. Difficulty Curve

| World | Puzzle complexity | Timing pressure |
|---|---|---|
| 1 | Single-step co-op ("you do X so I can do Y") | None |
| 2 | Two-step chains, light stealth | None |
| 3 | Multi-step with object physics | Occasional slow hazards |
| 4 | Layered puzzles + set-pieces | Mild, always freeze-assisted |

Target: World 1 levels ~5 min, World 4 levels ~10 min for a parent+child pair.

## 8. Build Roadmap

1. **Engine core** — Phaser project, two-player input, physics, camera (single shared screen with soft zoom to keep both players in frame), respawn/checkpoint system.
2. **Vertical slice: Level 1-1** — pedestals + item cards, Grapple & Heavy fully working, doors/keys/plates, one enemy type, exit flow.
3. **World 1 complete** — 3 levels, hub map, data-cores, save/unlock.
4. **Worlds 2–4** — one skill pair at a time; each world reuses the door/key/enemy framework with new mechanics.
5. **Story layer & polish** — intro/outro scenes, KOBI marquee lines, sound, particles, epilogue.
6. **Deploy to Vercel**, playtest with the target audience (i.e., the kids).

### Open questions (decide during build)
- Final title — *Bolt Buddies*, *Beep & Boop*, *Rescue Bolt!*?
- Camera: one shared view with zoom vs. vertical split-screen when players separate far.
- Sound: chiptune vs. synthwave; KOBI voice as text-blips vs. actual TTS.
- Whether a solo mode (one player tab-switching both robots) is worth adding post-launch.
