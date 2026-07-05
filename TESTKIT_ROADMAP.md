# Bolt Buddies — Beatability Test Kit

A test harness that **plays the game like a human** and proves every level can
be beaten. Unlike `tools/playtest*.mjs` (mechanic checks that teleport players
and force states), the beat kit is **input-only**: it may READ game state
(`window.__BB.scene`) to decide when and where to move, but it may only ever
act through real keyboard events — the same SPACE/L/WASD/arrows a player presses (the kit drives P1 via the silent E fallback binding).
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

### INFRA ISSUE — RESOLVED (Beat T2, deliverable 1)

The W2 suite's native "Target crashed" is fixed; the suite is 30/30 green,
verified 3× consecutively. Root cause, established by chunk isolation →
per-await instrumentation → a 3/3-deterministic minimal reproducer:

- **Trigger:** a CDP `page.evaluate` issued ~200–400 ms after the escort-setup
  teleport pair in 2-1 (`tp(0,14,7)` + `tp(1,13,7)`, phase and tiny adjacent
  at the shimmer panel) **permanently wedges the headless renderer** — main
  thread blocks at 0 % CPU, every later evaluate hangs, and the tab eventually
  gets killed as "Target crashed". The same evaluate at +1.2 s is always safe.
- Renderer-independent (canvas and WebGL both wedge), position-specific, and
  a **test-harness interaction bug, not a game bug**: real players never
  teleport mid-frame, idle sessions are stable, and W1's suite drives the
  identical evaluate machinery green 42/42.
- This also explains every earlier mystery: "hand-rolled steps pass" (their
  first evaluate came seconds later), the bisect harness hanging in all
  variants (its probes landed inside the window), and the original crash
  arming "early" (it was the teleport pair, detonating on the next evaluate).

**Fixes in `tools/playtest_w2.mjs`:** (1) the redundant `setVelocity` evaluate
inside the danger window was removed — `tp()` already zeroes velocity — and
the post-teleport wait extended to 1.2 s; (2) as permanent hardening, the
suite now runs **chunked**: each level in its own fresh browser with a hard
per-chunk timeout and one crash-retry, all 30 checks preserved (a chunk that
dies twice contributes one synthetic FAIL so the exit code stays honest).
Kit rule going forward: **never issue a `page.evaluate` within ~1 s of a
teleport that repositions both players.**

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

### FL-004 — 1-3's final tower anchor is LOS-shadowed by the top floor

- **Triage class:** (c) level-design flaw (first one!). Anchor (49,1) hangs
  above the top-floor slab's left edge (slab cols 48-55, row 3). From ledge3 —
  the only place a grappler can stand for the final zip — the sightline to it
  clips tile (48,3): LOS blocked, the anchor is excluded, and the "ahead" hook
  picks the ledge2 anchor below instead, zipping the grappler back DOWN the
  tower. Deterministic in both assignments; my original design math only
  cleared from a single borderline column.
- **Fix:** move the anchor to (47,1) — one column clear of the slab, visible
  from all of ledge3. The grappler hangs beside the floor's edge and releases
  rightward to drift onto it (route: zipRelease "right"). Climb sequence and
  design intent unchanged; two-tile move in `src/levels/level1_3.js`.

### FL-005 — Buddy-chord LOS demands pixel-perfect edge-standing

- **Triage class:** (b) gameplay bug. Reeling a buddy who is below the floor
  you stand on (1-3's final tower reel, and any future same-shape moment)
  only initiated when the reeler stood within ~15px of the lip — the direct
  center-to-center sightline clips the floor's own corner tile anywhere
  farther back. FL-003 already forgives the flight; initiation was the last
  fragile link.
- **Fix:** the DOWN+ACTION chord accepts the direct line OR a head-to-head
  line (reeler head at −44px, buddy head at −24px) — the rope arcs over the
  lip, which is physically sensible for a thrown rope and kid-forgiving.
- **Related (same session):** UP+ACTION added as the third grapple modifier
  (zip to the anchor almost directly above) after near-vertical anchors lost
  plain-ACTION scoring contests by untrustably thin margins (an 11px stance
  shift flipped the tower zip). The modifier language is now complete and
  discrete: plain = ahead, UP = above, DOWN = buddy.

### FL-006 — 1-3 tower ledges too narrow for reliable reel landings

- **Triage class:** (c) level design. With FL-001..005 in place the tower is
  traversable (run B completed it end-to-end), but reel landings on 3-tile
  ledges remain variance-sensitive — a frame-perfect robot player still
  flakes, so kid pairs certainly would. Kid-friendly pillar: "generous,
  forgiving".
- **Fix:** each tower ledge widened by one tile (ledge1 43-46, ledge2 49-52,
  ledge3 44-47). No route coordinates change; every landing/stance/LOS margin
  fattens. Assist-radius raised 110→150 in the same series (the reel measures
  to the reeler's head; a lip-block sat at 114.5px).

### FL-007 — Rope range 360 leaves sub-robot-width margins (1-2 far reel)

- **Triage class:** (b) gameplay tuning. The full-matrix gate caught 1-2's
  far-floor reel failing on a 2.5px range excess: the geometry of that
  crossing leaves ~16px of stance margin at range 360, thinner than a robot's
  body — an unreasonable precision demand (the failed run ended with both
  robots comically stacked on the pillar after chord-race fallout).
- **Fix:** `PHYS.grappleRange` 360 → 380 (kid-forgiving; no unintended new
  targets come into range at +20px on any World-1 sightline). Kit hardening
  in the same pass: reel stance 52.4 with tol 6, chord DOWN-hold 60→120ms
  (a race let act land before DOWN registered → plain zip stranded the
  grappler), and reelPartner now fails fast if the grappler moves/zips
  instead of reeling.

### FL-008 — Fan updraft can't catch a standing Tiny (2-2 walk-in)

- **Triage class:** (a) gameplay bug, found by the first 2-2 beat route. The
  fan zone's bottom edge was `e.y*TILE+24` (mid-tile) — but a standing Tiny's
  small body tops out BELOW that line, so walking into the fan did nothing:
  the route's Tiny stood in the column for 6s, grounded, unlifted (both
  assignments). The W2 mechanics suite never caught it because its check
  teleport-DROPS Tiny through the zone from above. Design intent (roadmap
  2-2 walkthrough): "T walkTo 13.5 (fan column) → floats up" — a kid walking
  Tiny in must lift, no jump required.
- **Fix:** zone height `+24` → `+48` so the column reaches the floor. No
  other fan behavior changes (top edge, tiny-only strength, breeze on others).
- Kit hardening in the same pass: walkTo's auto-hop now ALTERNATES two mount
  techniques — (0) jump-while-holding-direction (lips, lone ledges) and
  (1) standing jump + apex drift-in, which is the only way up staircases of
  2-tile risers with 1-tile treads (2-1/2-3 stair entries defeated the old
  hop: the held direction pinned the jumper into the next riser mid-air).

### FL-009 — Both W2 tunnels were walk-in SEALED (2-1 and 2-3)

- **Triage class:** (c) level design, found by the first W2 beat routes and
  masked until now because the W2 mechanics suite TELEPORTS robots into the
  tunnels. The stair columns at each level's entrance ran floor-to-slab, so
  the under-slab lane could not be entered on foot at all: 2-1's Tiny stalled
  at the stairs (its whole lane unreachable), and 2-3's Phase was auto-hopped
  up the stairs onto the WRONG lane, then stuck at a tiny-only pinch (probe
  artifact: phase airborne at x15.7 on the slab top). Both levels were
  unbeatable by real input.
- **Fix (per each level's documented lane concept):**
  - 2-1: the stair columns' floor tiles become duct tiles (`d`) — Tiny
    crawls in at floor level exactly like the tunnel's interior pinches;
    Phase still climbs the stairs (ducts are solid to big robots).
  - 2-3: the stair columns' lower halves become shimmer (`~`) — Phase
    ghosts through at floor level into its lane; Tiny still climbs them
    (shimmer collides like solid for non-phase robots).
- Kit note in the same pass: 2-2's fan only catches a robot STANDING in the
  one-tile column; the route now nudges Tiny in with pulses and stands still
  instead of walking through at full speed (game behavior is correct — a kid
  who stands on the fan lifts; FL-008 fixed the standing-height zone).

### FL-010 — Fan draft demands frame-perfect zigzag (2-2 ride unstable)

- **Triage class:** (b) gameplay tuning, forced by the T2 final gate (2-2
  assignment A failed identically in both matrix passes; B and isolated runs
  were lucky). Physics: airborne horizontal velocity is either ±full-speed
  (key held) or FROZEN at its entry value — it never decays. Riding the
  one-tile draft therefore requires zigzag corrections faster than even the
  kit's 50ms control loop could reliably deliver (one slow cycle → drift out
  of the ±28px overlap band → fall; one failed run had Tiny fall back out
  LEFT through the escort wall and get stranded on the wrong side). Two kids
  on a couch have no chance. The roadmap walkthrough's own words are the
  spec: "T walkTo 13.5 (fan column) → floats up" — a stable centered rise.
- **Fix:** while a tiny robot is airborne in a fan zone with NEITHER
  direction key held, its vx lerps gently toward the column center
  (clamp((centerX-x)*3, ±120), lerp 0.12/frame). Steering keys always win —
  the pull only applies keyless, so deliberate exits (drifting onto the deck
  at the apex) are unchanged.
- Route simplification: the 2-2 ride is now walk in → release → float up
  (3-attempt retry loop retained as insurance).

## Beat Sprint T3 (stretch) — 100%-core runs + chaos smoke: completion notes

**Route pattern (all six levels).** The base `export default [...]` route is left
VERBATIM — the default 12-run matrix runs it unchanged (provably: `runner.mjs`
without `--full` never imports the core machinery). The 100%-core variant is
built by SPLICING, not editing: each route also `export const coreSteps` — a
list of `{ after: "<base step name>" | "@start", steps: [...] }` detours.
`tools/beat/coremerge.mjs::buildCoreRoute` merges them; the runner then inserts
one `assertCoresStep(exclude)` immediately before the final (exit) step, so every
required core is proven collected before the level can be finished. A route may
also `export const uncollectableCores = [{ index, reason }]` — indices excluded
from the assertion because they are DESIGN FINDINGS, not kit failures (below).

**Runner flags.** `--full` = the 12 core-collecting variants (assert all
non-excluded cores) + the 6 chaos smokes. `--chaos` = chaos only. Default =
the untouched 12-run matrix. `npm run test:beat:full` = `runner.mjs --full`.
`tools/beat/coreprobe.mjs` is the diagnostic used to build the routes (prints
`coresGot` progression per step; `--full`/`--swap` flags).

**Per-level core routes (input-only; cores index by entity order).**
- **1-1** — core0 (9,9): G zips the start-side ledge anchor (LOS-stance x6),
  drops through the core. core2 (50,6): from the terrace G zips anchor (51,4),
  drops onto the core ledge. core1 (28,16): FINDING (FL-T3-A). Auto: none.
- **1-2** — core1 (34,8): G takes the sky-anchor chain (29,7)->(34,7), drops
  through the core into the yard. core2 (56,9): pull lever lv2 FIRST (it
  out-scores the anchor), then zip anchor (56,6) from LOS-stance x53. core0
  (20,16): FINDING (FL-T3-B).
- **1-3** — core0 (6,9) & core1 (39,9): G zips each above-ledge anchor from its
  LOS-stance (x3 / x36; core1 then drops off the ledge's LEFT edge to avoid the
  arena/tower divider). core2 (43,5): after the tower climb, G drops from the
  top floor's left edge onto ledge3 (a full LEFT hold clears the col47 gap),
  hugs the left lip so the 42px collect radius reaches the core, then re-ascends
  via the base's UP+ACTION zip to anchor (47,1) from stance x46.3. All 3 cores.
- **2-1** — core0 (43,12): Tiny hops up into the tunnel-end vent pocket. core1
  (39,7) & core2 (46,9): AUTO-collected by the base traversal.
- **2-2** — core0 (14,2): Tiny re-rides the fan to its top (past the base
  deck-drift height). core2 (48,9): high-toss (below). core1 (32,13): AUTO.
- **2-3** — core0 (43,7) & core1 (44,12): each buddy hops up in its lane pocket.
  core2 (55,12): AUTO (snagged mid-throw by the base finale).

**Kit techniques discovered (reusable lessons).**
- *Above-ledge anchor LOS-stance.* Several data-core anchors sit directly ABOVE
  their own core ledge (1-1/1-3 start ledges, 1-2/1-3 end ledges). The ledge
  blocks the sightline from directly under/right, so the grapple only fires from
  a narrow stance a few tiles to the LEFT where the LOS clears the ledge — AND
  still inside 380px range. Routes scan candidate x's and fire only when
  `grappleTarget` actually returns the anchor.
- *Lever out-scores anchors.* A grounded grappler near a lever picks the lever
  (bias 40) over a data-core anchor every time. 1-2 core2 pulls lv2 first
  (harmless — its door also needs the plate) to drop the lever from the
  candidate list before zipping.
- *Thrown-Tiny toss clamp (2-2 core2).* The toss ledge is 4 rows up; only a high
  toss (`tossY` ≈ -886) reaches it. TWO non-obvious requirements make it work
  input-only: (1) the CARRIER holds jump then throws (highToss fires; the
  carrier keeps the buddy through the jump, 0.92 factor), and (2) the thrown
  TINY must hold HER OWN jump the instant she is released, or
  `Player.update`'s variable-jump-height clamp (`vy<-260 && !jump.isDown` -> set
  -260) cuts the -886 launch down to -260 and she never clears row 9. Launch
  from x47.2 (snug against pillar46's right face) so she rises through the core
  at ~x47.7 before drifting into the solid ledge's left edge. (Kit-legitimate,
  but the clamp cutting a thrown buddy's toss is arguably a gameplay wrinkle
  worth Fable's eye — a kid tossing Tiny "up" without her holding jump would
  fall short.)

### FL-T3-A — 1-1 core1 (28,16) is walled in a Heavy-impassable pocket

- **Triage class:** (c) level-design flaw. The core sits in a LEFT pocket
  (cols 28-29) whose ceiling (r14) is solid, separated from the only opening —
  the lid hole (30-33) — by the step at col30. Drive- and scan-verified: a Heavy
  robot drops in on the right (30-33), but at the step it is hard `blocked.left`
  (can't walk through); hopping over the step launches it straight UP through
  the lid hole (exit); and once balanced ON the step it cannot translate left
  into the pocket — its head collides with the pocket's solid r14 ceiling corner
  at col29 — with no vertical opening above the pocket to drop straight in.
  Grapple has no anchor there. The core is unreachable by real input.
- **Suggested fix (for arbitration):** either carve a 1-tile drop-in above the
  pocket (open r14 at col28), or move the core to col31-32 (right of the step,
  under the existing hole) where the key route already passes.
- **Status:** excluded from the 1-1 core assertion (`uncollectableCores[1]`).
  1-1 `--full` collects cores 0 + 2 and completes.

### FL-T3-B — 1-2 core0 (20,16) softlocks Heavy behind an uncrossable hole

- **Triage class:** (c) level-design flaw. The core is in a 1-tile pocket
  (col20) walled solid on the right (col21, r15-16). The only entry is stomping
  the cracked lid (19-20, r14), which severs the tunnel floor with a 2-tile
  hole. The core IS collectable, but afterwards Heavy is TRAPPED: it can't clear
  r14 jumping from the pocket floor; climbing the col19 step drops it LEFT of
  the hole; and from there it can neither run-jump nor walk back across the
  2-tile hole to the scuttlebug yard (drive-verified — falls back in). Collecting
  core0 softlocks the run.
- **Suggested fix (for arbitration):** narrow the lid to a single cracked tile
  (col20) so the post-stomp gap is 1 tile (Heavy auto-hops it), or add a step on
  the yard side of the hole.
- **Status:** excluded from the 1-2 core assertion (`uncollectableCores[0]`).
  1-2 `--full` collects cores 1 + 2 and completes.

**Chaos smoke.** `tools/beat/chaos.mjs` — per level, 60s of random real input on
BOTH key sets (weighted ~70% direction holds, ~15% jump, ~10% act, ~5% release,
occasional down-taps), asserting: zero page errors, no player permanently out of
world bounds (settled check every 5s; a transient/mid-respawn is retried once),
and fps up. Headless SwiftShader baselines ~53-54 fps (UI Sprint 8), so the
headless bar is **>= 48** (design bar 50, noted in output). Not in the default
matrix — behind `--full`/`--chaos`.

## Maintenance rule (add to both other roadmaps' ground rules)

From T2 onward, **every sprint (UI or sound) must leave the 12-run beat
matrix green**. A sprint that changes level geometry or entity behavior is
out of scope by definition; if a beat run breaks, the sprint broke gameplay.
