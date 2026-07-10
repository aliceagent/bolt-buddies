# Bolt Buddies — Worlds 3 & 4 Build Roadmap (W3W4, sprints M3/L31/L32/L33/M4/L41/L42/L43/X1)

Builds the six designed-but-not-built levels from `GAME_DESIGN.md` §World 3/4 —
replacing the `wip: true` placeholders at registry indices 6–11 — with four new
gadgets, four new enemies, two new world identities, and the game's finale.
Difficulty rises past World 2 (design target: W1 ~5 min → W4 ~10 min per level
for a parent+child pair; teach → twist → master within each world).

## The six levels (from GAME_DESIGN.md — the binding design source)

### World 3 — Magnet Works ⚡ (skills: MAGNET GLOVE + BUBBLE SHIELD)
Visual identity: foundry/scrapyard — steel plate walls, crane rails, hanging
scrap, amber-orange accent, arcing polarity coils; heavier/industrial than W1.
- **3-1 "Attract Mode"** (teach): Magnet drags metal crates into stair-steps and
  clings across a steel ceiling; Bubble floats over the electric floor to press
  the far switch that de-electrifies it.
- **3-2 "The Flooded Tank"** (twist): Bubble travels underwater carrying the key;
  Magnet redirects the current by moving metal baffles from above; partner-reel
  across the great tank. NEW TERRAIN: water volumes (buoyancy + drift current).
- **3-3 "The Scrap Storm"** (master): KOBI reverses the lab's polarity — flying
  scrap fills the air. Magnet catches scrap as moving shields/platforms while
  Bubble ferries the three fuse-cores to their sockets.
- Enemies: **Zap-Jelly** (electric floater; Bubble bounces it into a socket where
  it harmlessly powers a door) · **Junk-Chomper** (magnetic mouth; Magnet yanks
  its metal teeth out to defang it).

### World 4 — The Dark Core 🌑 (skills: TIME-FREEZE + LIGHT-BEAM)
Visual identity: near-black datacenter/void — deep violet-black, thin neon
seams, visible light cones, invisible-until-lit platforms; the darkest world.
- **4-1 "Lights Out"** (teach): Beam reveals invisible platforms and scares
  Gloomies off switches; Freeze stops the rotating bridge so both can cross.
- **4-2 "The Laser Garden"** (twist): sweeping laser fields — Freeze stops them
  in safe positions while Beam melts the three ice-locked doors; each door's key
  is guarded by a Ticker.
- **4-3 "KOBI's Heart"** (master, FINALE): Beam blinds KOBI's eye to expose its
  three cooling cores; Freeze stops the defense turbines so the partner reaches
  each core. No violence — you're *unplugging his tantrum*. Bolt bounds out;
  lonely KOBI is adopted; epilogue playground scene + credits.
- Enemies: **Gloomy** (shadow blob that flees light) · **Ticker** (clockwork
  patroller that only moves when time is NOT frozen).

## New gadget contracts (mirror the four shipped skills)
Each is a pedestal skill with the SAME plumbing as grapple/heavy/tiny/phase:
`p.setSkill(...)`, ACTION semantics via `handleAction`, badge + item card, U9
KOBI blips, anim-rig action overlay (A-series conventions), SFX. Solo use +
buddy use per GAME_DESIGN §gadget table:
- **MAGNET GLOVE**: ACTION near metal crate = drag-latch (crate follows within
  range); ACTION at steel ceiling/rail = cling + traverse; DOWN+ACTION = the
  familiar buddy-reel (reuse the rope/reel path). Metal-only targeting.
- **BUBBLE SHIELD**: ACTION = self-bubble (float on vent updrafts, roll over
  hazard floors, big bounce); DOWN+ACTION = bubble the BUDDY (they become the
  protected one). Timed (~6s) + cooldown; pops on sharp hits.
- **TIME-FREEZE**: ACTION = freeze the WORLD 5s (platforms/lasers/enemies/
  crushers hold; players move) + cooldown ring on the badge. Frozen things get
  the ice-tint overlay. Physics-sacred implementation: freeze = velocity hold +
  timer pause on device state machines, byte-identical resume.
- **LIGHT-BEAM**: hold ACTION = aimed light cone (facing/up via held direction);
  reveals dark-zone geometry + invisible platforms while lit, melts ice doors
  (progress fill), dazzles Gloomies/KOBI-eye. Battery bar + recharge.

## Sprint pipeline (verification protocol identical to U/P/A/SL series)
Every sprint: Opus implements on buddies dev → reviewer verifies (diff scope,
screenshots/contact sheets, independent beat runs incl. the NEW routes, wd/sl
peaks 0, fps A/B) → push buddies main. Level sprints MUST ship their beat route
(`tools/beat/routes/<id>.mjs`) + matrix wiring + a softlock-prober scenario +
per-level music/jingle wiring + KOBI intro/clear blips — a level without its
green driven route does not ship.

1. **M3 — World-3 mechanics foundation** (no level): Magnet Glove + Bubble
   Shield skills end-to-end; metal crates, steel ceiling/rails, magnetic
   switches, electric floors (reuse hazard), vent updrafts, WATER volumes
   (buoyancy/current — 3-2's terrain); Zap-Jelly + Junk-Chomper enemies; W3
   backdrop/terrain identity (backdrop.js world 3 + tile trim) + hub W3 unseal
   plumbing. Probe-tested in a dev sandbox level (not shipped in LEVELS).
2. **L31 — 3-1 "Attract Mode"** (teach): level def + route + softlock scenario +
   music + blips + intro card. Replaces the index-6 placeholder.
3. **L32 — 3-2 "The Flooded Tank"** (twist): + the underwater traversal beat.
4. **L33 — 3-3 "The Scrap Storm"** (master): + scrap-storm set piece (pooled
   flying-scrap field, magnet-catch platforms).
5. **M4 — World-4 mechanics foundation**: Time-Freeze + Light-Beam; dark-zone
   rendering (darkness overlay + light-cone reveal, Canvas-safe), invisible
   platforms, rotating bridge, laser sweepers, ice doors, Gloomy + Ticker; W4
   backdrop/terrain identity; the KOBI-eye boss rig plumbing for 4-3.
6. **L41 — 4-1 "Lights Out"** (teach).
7. **L42 — 4-2 "The Laser Garden"** (twist).
8. **L43 — 4-3 "KOBI's Heart"** (master finale): the confrontation set piece +
   Bolt rescue + adoption epilogue + credits roll; save's campaign-complete
   state; hub/title acknowledge completion.
9. **X1 — W3/W4 close-out audit**: campaign loop extended to all 12 levels + the
   epilogue; full 24-run matrix (both assignments × 12) green twice; softlock
   inventory + prober extended (esp. water, freeze, dark-zone strands); SL
   watchdog false-fire re-verify on the new levels; P12-style visual audit of
   both new worlds; README/roadmap close.

## Difficulty ramp (binding)
W3 > W2: two-gadget interleaving every screen, timed hazards layered on
traversal, enemy defang required (not optional). W4 > W3: visibility and time
as resources (battery + freeze cooldown), compound set pieces, the finale runs
~10 min. Every level still beatable by the input-only driver (that's the bar:
hard but fair, no pixel-perfect demands — FL-005 spirit).

## Narrative spine (binding, from GAME_DESIGN.md)
W3: KOBI panics as the buddies breach his workshop floor — the machines get
meaner, his blips get more defensive ("I BUILT this maze. I am VERY proud.").
W4: the lights go out — KOBI's last resort, and his loneliest ("It is dark
because I LIKE it dark. The dark does not leave."). 4-3 resolves the whole
game: Bolt freed, KOBI unplugged mid-tantrum, then adopted — the family takes
BOTH robots' side lights home. Epilogue + credits.

## Env notes
Same thermally-hot reference box: 2-2 fan / 1-3 reel flakes are environmental;
expect the new heavy set pieces (3-3 storm, 4-2 lasers) to need the same
interleaved-A/B discipline when verifying. Registry indices 6–11 replace in
place (never reorder 0–5 — the beat matrix + hub layout depend on them).
