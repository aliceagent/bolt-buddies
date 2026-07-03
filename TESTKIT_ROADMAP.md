# Bolt Buddies — Beatability Test Kit

A test harness that **plays the game like a human** and proves every level can
be beaten. Unlike `tools/playtest*.mjs` (mechanic checks that teleport players
and force states), the beat kit is **input-only**: it may READ game state
(`window.__BB.scene`) to decide when and where to move, but it may only ever
act through real keyboard events — the same E/L/WASD/arrows a player presses.
No `body.reset`, no `setSkill`, no state mutation of any kind.

Because "every level must be solvable with either assignment" is a design
pillar, every walkthrough is **role-parametric**: the route names abstract
roles (G=grapple, H=heavy, P=phase, T=tiny) and the runner executes each level
twice — once with P1 taking the first pedestal, once swapped. 6 levels × 2
assignments = **12 runs, all must complete**.

## Architecture

```
tools/beat/
  driver.mjs      # browser session + input primitives (the hard part)
  runner.mjs      # loads routes, runs the 12-run matrix, reports
  routes/
    1-1.mjs … 2-3.mjs   # declarative step lists, role-parametric
  failures/       # on failure: screenshot + state JSON + step log (gitignored)
```

### Driver primitives (closed-loop control at ~30 Hz)

- `state()` — snapshot of players/doors/levers/bridges/lifts/rollers/jets/
  crane/pods/complete from `__BB.scene`. Read-only.
- `hold(key)/release(key)/tap(key)` — real keyboard via Playwright (min 70ms
  taps — Phaser's JustDown is cleared by keyup, see tools/playtest.mjs).
- `walkTo(role, tileX, opts)` — hold the role's left/right key toward the
  target; **auto-hop**: if `body.blocked.left/right` persists >150ms, tap jump
  (clears steps ≤2 tiles); release within 10px; timeout default 8s.
- `runJump(role, fromTileX, dir)` — position at fromTileX, hold dir, jump at
  the edge, hold until landed. For deliberate gap jumps. Up to 3 retries.
- `act(role)` — tap the role's action key.
- `waitFor(fn, timeout)` — poll `state()` until predicate true.
- `equip(role, pedestalTileX)` — walkTo + act, verify `skill` set.
- `stompBugs(role, n)` — loop: read nearest live bug, walk above it, when
  |dx|<30px jump then act (stomp); verify bug count fell; repeat n times.
  Heavy only.
- `dodgeCrane(role)` — background behavior while in the crane arena: when
  crane state is `telegraph`/`slam` and |crane.x − p.x| < 100px, walk away.
- `waitRollerSafe(role, tileX)` — wait until every roller near tileX is
  facing away or beyond beam reach, then dash (used before leaving a pillar).
- `dashJet(role, jetIndex, toTileX)` — wait for the jet's active window to
  END, then walkTo past it (deck jets in 2-2).
- `escortTogether(toTileX)` — hold both players' "right" (or left)
  simultaneously so the phase-walker escorts the buddy through a `~` wall
  (partner must stay within 78px — release the leader briefly if the gap
  grows; closed-loop on the x-distance).
- `carryThrow(carrier, {face, highToss})` — walk carrier adjacent to partner,
  act (pickup), face direction, optional hold jump, act (throw).
- **Death recovery** (automatic, all primitives): if the acting player dies,
  wait for respawn, then re-approach — closed-loop walkTo makes steps
  self-healing. Each step allows 3 deaths before the run fails.
- **Failure artifact**: on any step timeout/failure — screenshot,
  `state()` JSON, and the executed step log into `tools/beat/failures/`.

### Runner & reporting

- `node tools/beat/runner.mjs [levelId]` — full matrix or one level.
- Per run: PASS/FAIL, wall time, death count, steps executed. Console table +
  `tools/beat/report.json`. Budget: 4 minutes per run; non-zero exit on fail.
- `npm run test:beat` script; `npm run playtest` runs mechanics suites then
  the beat matrix.
- Fresh localStorage per run (levels started via the hub is ideal but the
  runner MAY start levels with `scene.start("Game", {levelIndex})` — scene
  navigation is orchestration, not gameplay; everything after the level
  loads is input-only.)

## Walkthrough routes (authoritative — transcribe into routes/*.mjs)

Tile coordinates refer to the level grids in `src/levels/*.js`.

### 1-1 "First Day on the Job"
1. `equip(G,5)`, `equip(H,8)` → gate opens (both skilled).
2. G `walkTo 13`; `act` (zip to anchor 17,9); at hang, `tap right` to release;
   land ~x20. G `walkTo 21`, `act` (lever lv1) → bridge br1 opens.
3. H `walkTo 21` across the bridge (belts don't push Heavy).
4. H `stompBugs(2)` (patrols 24-29 and 34-37). G waits at x22 until bugs die.
5. H `walkTo 31`, jump, `act` (stomp) → cracked lid breaks, H falls in;
   `walkTo 33` (key auto-collects); exit pocket: `walkTo 30` (step), auto-hop
   out (two 2-tile jumps).
6. Both `walkTo 40` — door1 consumes the key on approach and opens.
7. Both `walkTo 47/48` (onto the lift); `waitFor` lift near top (y≈10·48);
   each `runJump(49, right)` onto the terrace (grace timer holds the lift).
   Recovery if one falls into the x50-51 landing pit: walk left, re-ride.
8. Both `walkTo 58` → complete.

### 1-2 "The Crusher Line"
1. `equip(G,3)`, `equip(H,6)`.
2. H `walkTo 15.5` (plate plA; crushers can't hurt Heavy) → barrier b1 held open.
3. G `walkTo 8`, auto-hop onto the step ledge (8-9,r12); `act` (zip anchor 9,5);
   release right onto the slab top (x10); `walkTo 24` through open b1 (x18).
4. G at slab end x25: `act` (zip 29,7) → `act` (zip 34,7) → `act` (zip 39,7)
   → tap right, land x40 and STOP (chasm starts x41).
5. H leaves the plate, walks the tunnel (immune to crushers) to x26, then
   `stompBugs(4)` across the yard, join G at x40.
6. Chasm: G `act` (zip 43,8), `act` again (zip 46,8), release → drop onto the
   pillar (46-47,r11). G `act` → reels H from the x40 edge to the pillar.
   G `act` (zip 52,8), release right → land x52-53; `walkTo 54`; `act` →
   reel H from the pillar across.
7. Either robot `walkTo 55`, `act` (lever lv2). H `walkTo 57.5` (plate pl2)
   → door d2 opens and latches. Both `walkTo 62` → complete.

### 1-3 "Crane Chaos"
1. `equip(G,3)`, `equip(H,6)`; both enter the arena (dodgeCrane active).
2. ×3: `waitFor crane.state === "rest"`; G `walkTo crane.x/48 ± 2`, `act`
   (yank plate — H stays ≥6 tiles from G so the partner never outranks the
   plate as a target); read pod x from state; H `walkTo pod`, jump, `act`
   (stomp pod). Between rests, both keep clear of slams.
3. `waitFor craneDefeated` → towerDoor opens. Both `walkTo 43`.
4. Tower: both auto-hop onto ledge1 (44-46,r12). G `act` (zip 51,7), drop →
   ledge2; G `act` → reel H up. G `act` (zip 45,4), drop → ledge3; reel H.
   G `act` (zip 49,1), drop → top floor; reel H.
5. Both `walkTo 54` → complete.

### 2-1 "The Vents"
1. `equip(P,3)`, `equip(T,6)`.
2. P: stairs (auto-hop x10, x11) → slab top; `walkTo 18` (through the x15
   shimmer panel — slowed but walks straight through); `act` (lvP1) → dT1
   opens.
3. T: tunnel `walkTo 28` (duct pinch x15 passes Tiny; dT1 now open; pinch
   x25); `act` (lvT1) → dP1 opens.
4. P `walkTo 44` (through dP1 x30 and panel x35), drop at 45.
   T `walkTo 45` (pinches x35, x42, x44 — the core pocket is pass-through).
5. Yard: T `walkTo 57` any time (rollers can't see Tiny). P: `walkTo 50`
   (inside pillar = beam shelter); `waitRollerSafe`, dash `walkTo 54` (second
   pillar); `act` (lvE is inside this pillar) → exit opens; `waitRollerSafe`,
   dash `walkTo 57`.
6. Both at 57-58 → complete.

### 2-2 "Steam & Shadows"
1. `equip(P,3)`, `equip(T,6)`.
2. `escortTogether(14)` — through the x12 shimmer wall (no vent here; this
   wall REQUIRES the hand-hold escort).
3. T `walkTo 13.5` (fan column) → floats up; hold right at apex to land on
   the deck (r4). Deck: `dashJet` past jets at x20, x28, x34; `walkTo 37`;
   `act` (valve lvV1) → corridor steam off. T `walkTo 38.5`, walk off the
   deck end, drop into the reunion yard.
4. P: `walkTo 22` and wait for the valve; then `walkTo 39` (through the x23
   shimmer entry and the now-quiet corridor).
5. Reunion yard roller: `escortTogether` from pillar x42 to pillar x46 to
   x48, using `waitRollerSafe` before each dash (pillars shelter BOTH:
   Phase from the beam, and the escort lets Tiny through the pillar).
6. P stands on plate x50; T `walkTo 52`, `act` (lvF) → exit latches open.
   Both `walkTo 55` → complete.

### 2-3 "The Warden's Maze"
1. `equip(P,3)`, `equip(T,6)`.
2. T: stairs x9-10 → slab top; duct pinch x16; `walkTo 25` (rollers ignore
   Tiny); wait at tDoorA (x26).
   P: tunnel; walk through panel x20 → touches warden w1's back → defeated;
   `walkTo 24`, `act` (lvB1) → tDoorA opens 6.5s.
3. T dashes through tDoorA; pinch x30; `walkTo 32`, `act` (lvA1) → tDoorB
   opens 6.5s; P dashes through tDoorB (x34); panel x37 → w2 back-touch;
   P `walkTo 46` (through the x43/x45 shimmer pocket), out of the tunnel.
   T: pinch x40, slab end, drop, both meet at checkpoint x47.
4. Finale: P `carryThrow` setup — P picks T up (act beside partner), walks
   through panel x49 carrying T (carried buddies pass with the carrier),
   bumps warden w3's back → defeated; P `walkTo 51`, face right, `act` →
   T flies the gap (~lands x60). T `walkTo 61`, `act` (lvF) → bridge br1.
   P `walkTo 62` across the bridge; both in exit zone → complete.

## Sprints

### Beat Sprint T1 — Driver + World 1 matrix
`driver.mjs` with every primitive above, `runner.mjs` with report + failure
artifacts, routes 1-1/1-2/1-3, both role assignments. Acceptance: 6/6 runs
green twice in a row (stability), `npm run test:beat -- 1-1` works, failure
artifacts demonstrated (force one by sabotaging a route locally, then revert).

### Beat Sprint T2 — World 2 matrix + full wiring
Escort/fan/jet/roller/carry-throw primitives proven, routes 2-1/2-2/2-3,
full 12-run matrix green twice in a row, `npm run playtest` = mechanics
suites + beat matrix, README testing section updated. Budget: whole matrix
≤ 35 minutes.

### Beat Sprint T3 (stretch) — 100% runs + chaos smoke
Extend routes with optional `cores: true` variants that also collect all 3
data-cores per level input-only (the throw/toss/zip routes are in the level
notes above); plus a chaos smoke: 60s of random inputs per level asserting
no page errors, no player permanently out of bounds, fps ≥ 50. Runs behind
a flag (`--full`), not part of the default matrix.

## Beatability-failure protocol (binding)

A red beat run is never just reported — it enters a fix loop until green:

1. **Triage.** Read the failure artifacts (screenshot, state dump, step log)
   and replay the step by hand (headless, input-only) to classify:
   - **(a) Kit bug** — the route/driver is wrong (bad tile, missed timing,
     flaky primitive). Fix the kit; the game is innocent.
   - **(b) Gameplay bug** — the game misbehaves against GAME_DESIGN.md intent
     (physics edge case, stuck state, softlock, unreachable objective,
     enemy/device malfunction). GAME_DESIGN.md is the arbiter of intent.
   - **(c) Level-design flaw** — the mechanics work but the level cannot be
     beaten (or not with both skill assignments): impossible jump, dead-end
     after a one-way drop, co-op deadlock (both players stuck where neither
     can act), objective gated on the wrong side of its own door.
2. **For (b) and (c): write a detailed fix plan before any code** — appended
   to this file under "Fix log": symptom, root cause (file/line or level
   coordinates), the minimal change that preserves design intent, what else
   that change could affect, and the verification steps. Kid-friendly rules
   hold: prefer making levels more forgiving over more precise.
3. **Hand the plan to an implementation agent (Opus)** as its full spec, with
   the standard constraints (no unrelated changes, suites must stay green).
4. **Re-run**: the failing run first, then the full 12-run matrix AND both
   mechanic suites (a level fix can shift mechanic-test coordinates — if a
   mechanic test fails only because geometry legitimately moved, update the
   test with justification in the commit message).
5. **Loop** 1-4 until the entire matrix is green twice in a row. Only then
   does the pipeline advance. Every fix loop iteration is committed
   separately so the history shows diagnosis → fix → proof.

## Fix log

(append fix plans here — see protocol above)

## Maintenance rule (add to both other roadmaps' ground rules)

From T2 onward, **every sprint (UI or sound) must leave the 12-run beat
matrix green**. A sprint that changes level geometry or entity behavior is
out of scope by definition; if a beat run breaks, the sprint broke gameplay.
