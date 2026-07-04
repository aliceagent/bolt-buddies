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

### FL-001 — Grapple targeting pre-empts the buddy-reel near anchors (blocks 1-2, 1-3)

- **Triage class:** (b) gameplay bug. The reel mechanic itself works (proven in
  1-1, where Grapple reels Heavy across the open chasm with no anchors nearby).
  It is *unreachable* wherever an in-range/LOS anchor exists — which is exactly
  where the World-1 co-op crossings need it. SKILL_INFO.grapple states the intent:
  "ACTION: zip to rings, pull levers, **reel your buddy over gaps.**" That third
  use is currently impossible next to rings.
- **Symptom (from beat matrix):** 1-2 [A & B] FAIL at "chasm relay" and 1-3
  [A & B] FAIL at the tower — the exact steps where grounded Grapple must reel
  Heavy across/up. Grapple always crosses fine (zips the anchors); Heavy is
  stranded (can't jump the 4-5-tile gaps, can't be reeled, and can't be
  picked-up/carried/thrown either — pickup is likewise pre-empted by the same
  anchors). Net effect is a **co-op deadlock**: one buddy reaches the far side,
  the other has no legal way to follow. Verified two ways: (1) live — Grapple
  standing on the 1-2 pillar with Heavy at the chasm edge; pressing ACTION zips
  to anchor(46,8) and Heavy never moves; (2) exhaustive scan — for *every*
  grounded Grapple position near the 1-2 chasm and the 1-3 tower, findGrappleTarget
  returns an anchor (or null when anchors are out of range, at which point the
  partner is out of reel range too). No grounded position ever yields "partner".
- **Root cause:** `src/scenes/GameScene.js`, `findGrappleTarget(p)` scoring
  (~L591-602): `score = d - (c.y < p.y - 20 ? 50 : 0) - c.bias`, lower wins.
  Anchors carry `bias: 60`; the partner carries `bias: 0`. So an anchor beats the
  partner by 60 (plus another 50 when the anchor is above the grappler, as it
  always is for a reel-up). Because the levels place anchors right at the reel
  spots (1-2 anchors 43/46/52 flank the pillar; 1-3 anchors 45/51/49 sit on the
  tower ledges), the buddy-reel is never selected. A grounded grappler also can
  never fall under the `d < 30` anchor-exclusion (anchors are 3+ tiles overhead),
  so there is no positional escape.
- **Minimal fix (preserves intent, kid-friendly = more forgiving):** make the
  buddy-reel selectable when the grappler is on the ground and the buddy is a
  genuine reel-across target. Concretely, in the partner candidate push, use a
  grounded boost, e.g. `bias: (p.grounded && !p.zip) ? 100 : 0` (tune 95-130).
  Rationale: an *airborne* grappler is mid-traversal and should still prefer
  anchors (unchanged); a *grounded* grappler standing on solid ground next to a
  gap has no need to zip an anchor — its useful action is pulling the buddy over.
  100 clears the anchor's 60+50 edge only when the buddy is roughly as close as
  the anchor (true in every 1-2/1-3 reel spot) without making far-away buddies
  magnetic.
- **What else this could affect (verify):**
  - **Crane fight (1-3):** grounded Grapple near a shield plate must still yank
    the *plate* (bias 90), not reel Heavy. Keep plate bias > grounded-partner
    boost (90 vs 100 is too close) — either cap the boost at 85, OR keep 100 but
    rely on the route parking Heavy 8+ tiles away (already done in `fightCrane`)
    so the partner is out of range/LOS while yanking. Prefer the explicit cap
    (partner boost 85 still beats an above-anchor's net 110? no — 85 loses to
    110). Cleaner: only apply the boost when there is **no attached crane plate
    in range** and the partner is **grounded** (a real reel-across), so the crane
    case is untouched. Implementer to choose the least-surprising gate.
  - **1-1:** reel already works (no anchors nearby) and pickup uses the adjacent
    (<72px, not a grapple candidate) path — both unaffected.
  - **Lever/plate yanks:** unaffected (levers 40, plates 90 remain below anchors
    only when partner isn't grounded-boosted).
- **Verification steps:** re-run `node tools/beat/runner.mjs 1-2` and `... 1-3`
  (both assignments), then the full matrix twice, then `node tools/playtest.mjs`
  (42) and `node tools/playtest_w2.mjs` (30). The mechanic suites teleport past
  these crossings so they should be unaffected; if a grapple-target mechanic
  check shifts, update it with justification.
- **Status:** PLAN ONLY. Beat Sprint T1's kit-building task was scoped "do not
  change src/ — stop and explain", so this entry is handed to the implementation
  (Opus) pass per protocol step 3. The T1 kit, driver primitives, and the 1-1
  route (green twice, both assignments) are complete and ready to re-prove the
  matrix once FL-001 lands.

- **REVIEWER DECISION (Fable) — the bias boost is replaced by a facing gate.**
  The flat boost cannot work: at the 1-3 tower the grappler stands ~48px under
  the anchor it just descended from (anchor score ≈ 48−50−60 = −62), so any
  partner boost big enough to win there (>400) would make the buddy magnetic
  everywhere and break 1-1 step 2 (grounded grappler at the belt edge with the
  buddy in range behind them must still zip the anchor). GAME_DESIGN.md §2
  already prescribes the disambiguator: "Partner-targeting skills target the
  partner **when aimed at them**." Implement exactly that:
  1. In `findGrappleTarget`, the partner is a candidate ONLY when aimed:
     `Math.sign(q.x - p.x) === p.facing` (in addition to existing range/LOS/
     state checks).
  2. When the grappler is grounded, not zipping, the partner is grounded, and
     the aim gate passes → the partner candidate gets decisive priority
     (bias 500): a grounded grappler pointing at their buddy always throws the
     rope to the buddy. Airborne behavior is untouched (anchors keep priority;
     zip-to-partner unchanged).
  3. Why every known case stays correct: 1-1 belt edge — buddy is BEHIND the
     facing → zip ✓. 1-2 pillar / 1-3 tower reels — grappler faces the buddy →
     reel ✓; after the reel the buddy lands adjacent (<72px, excluded) so the
     next aimed action targets the anchor again ✓. Crane — the route parks the
     partner out of range; even aimed, out-of-range partners are no candidate ✓.
     Remote lever yank while facing a grounded in-range buddy now prefers the
     buddy: acceptable — levers remain reachable by stepping adjacent, and "rope
     goes to the buddy you point at" is the more predictable rule for kids.
  4. Driver gains a `face(role, dir)` primitive (hold the direction key ~40ms);
     routes 1-2 and 1-3 insert `face` toward the buddy before each reel `act`.
  5. Known mechanic-test impact (pre-authorized per protocol step 4): the
     playtest.mjs "grapple reels heavy to them" check teleports P0 in facing
     right while the buddy is left — insert a brief left-tap before the action
     press so P0 aims at the buddy. The "airborne grapple zips to heavy partner"
     check is unaffected (airborne path unchanged).

- **REVISION 2 (Fable, after matrix evidence) — facing gate → DOWN+ACTION chord.**
  The facing gate un-deadlocked the reels but the matrix caught its ambiguity:
  in 1-2, the grappler on the entry ledge aims right at BOTH the sky-route
  anchor and the distant buddy on the plate; the 500-bias reel wins and yanks
  the buddy off the plate (route fails at "sky route", step 2/7, both
  assignments). Any rule that scores world-targets against the buddy on the
  same button will have such collisions somewhere. Final design: give the
  partner-verb its own input — the currently unused DOWN key:
  - **ACTION** = world targets only (anchors, levers, crane plates). Partner is
    never a candidate. Pre-FL-001 behavior for everything except the buddy.
  - **DOWN + ACTION** (S for P1, ↓ for P2) = buddy only: grounded grappler →
    reel buddy in; airborne grappler → zip to buddy. Requires range + LOS as
    before; fizzles otherwise. Kid-teachable: "point the rope DOWN the line to
    your buddy."
  - Adjacent pickup (<72px) stays on plain ACTION (design doc: "standing beside
    your partner: pick up").
  - Kit: reelPartner holds the chord (faceBuddy no longer needed); mechanics
    tests updated: reel check holds S while pressing E; airborne-zip check
    holds S mid-jump. Item-card hint text updated to teach the chord.

### FL-002 — Anchor selection ignores aim (blocks 1-2's far crossing)

- **Triage class:** (b) gameplay bug, found by the matrix after FL-001 rev2.
- **Symptom:** on the 1-2 pillar, plain ACTION always zips to the overhead
  anchor (46,8) (nearest), and from that hang the only nearer anchor is
  (43,8) — backwards. The far-floor anchor (52,8) is unselectable from
  anywhere on the pillar, so the crossing dead-ends for any player.
- **Root cause:** `findGrappleTarget` scores by distance only; facing never
  matters for world targets.
- **Fix (kid-intuitive):** "the hook goes where you're looking" — compute the
  best candidate ahead (sign(dx) === facing, |dx| > 24) and the best overall;
  return the ahead-best when one exists, else the overall best (so overhead/
  behind targets stay reachable when nothing is ahead). Verified against every
  existing zip in Worlds 1 routes (1-1 belt edge, 1-2 entry + sky chain +
  chasm, 1-3 tower including the leftward ledge3 zip, crane plates).
- **Kit techniques added with it:** explicit `face` before direction-critical
  zips, and reels are fired from the ledge's NEAR edge — reeling from mid-ledge
  clips the buddy on the ledge's own lip (LOS-verified standing positions:
  ledge2 x50.3, ledge3 x46.6, top x48.3). If edge-standing proves too finicky
  for real kids, escalate a forgiveness tweak (reel pop-over on block) as
  FL-003; not needed while the matrix is green.

### FL-003 — Reel arrival lacks lip forgiveness (blocks 1-3's tower)

- **Triage class:** (b) gameplay bug, probe-verified (`tools/beat/_reelprobe`):
  reeling Heavy from ledge1 to a grappler standing on ledge2 pulls him to
  exactly the ledge's side face (body right edge = tile edge, `blocked.right`),
  the reel cancels 32px short, and he falls to the shaft floor. The design
  doc's signature 1-3 finale ("Grapple reeling Heavy up the tower") fails for
  any player, every time, with a wide-bodied buddy.
- **Root cause:** GameScene's reel update ends on `blocked.left/right/up` or
  `d < 46` and just restores gravity — no consideration that the buddy is
  hanging beside the reeler's ledge lip.
- **Fix (kid rule: "the rope always gets your buddy to you"):** when a reel
  ends within 110px of the reeler, pop the buddy level with the reeler —
  LOS-checked at that height so the rope can never pull through a wall — then
  arc them toward the reeler onto the ledge. (Rev: a fixed-size nudge+arc only
  worked when the buddy happened to arrive near the lip; impact height varies
  run to run, so the assist is geometric.) Ends farther than 110px keep the
  old gentle-hop behavior.
- **Also fixed in the kit:** 1-2's chasm zips now `face("right")` first —
  post-FL-002 the hook honors facing, and walkTo's final correction can leave
  the grappler facing left (it then picked the yard anchor behind him).

## Maintenance rule (add to both other roadmaps' ground rules)

From T2 onward, **every sprint (UI or sound) must leave the 12-run beat
matrix green**. A sprint that changes level geometry or entity behavior is
out of scope by definition; if a beat run breaks, the sprint broke gameplay.
