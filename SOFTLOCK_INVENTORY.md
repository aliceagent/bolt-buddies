# Bolt Buddies — Softlock Inventory (SL1)

The confirmed, per-level softlock audit for the softlock-recovery series (SL1). Every
verdict below comes from an **actual driven run** of the SL1 prober
(`tools/softlock/`, `npm run test:softlock`) — not from reasoning alone. The prober
reuses the beat kit's **input-only** driver: it drives each level into every candidate
softlock state from `SOFTLOCK_ROADMAP.md`'s inventory table, attempts every recovery
the running game allows, and classifies the result from the observed state.

- **RECOVERABLE** — an in-game recovery exists and was driven to work (no restart needed).
- **HARD SOFTLOCK** — no in-game recovery; the only exit is `R×2` (restart room) / `ESC×2` (map). This is SL3/SL4's work to detect + signal.
- **UNVERIFIED** — could not be deterministically driven on this run (env/thermal flake); re-run to confirm. Never asserted as a hard softlock.

## Result — 0 hard softlocks in the SL1 candidate set

**11/11 candidates RECOVERABLE. 0 HARD SOFTLOCK. 0 UNVERIFIED** on the recorded run
(`tools/softlock/report.json`). One *pre-existing, optional-core-path* hard softlock
already documented by the beat kit is recorded separately below (out of base-traversal
scope, flagged for SL3/SL4).

Two engine facts (read from `src/scenes/GameScene.js`, changed by nothing here) explain
why the game is largely softlock-resistant, and were confirmed by driving:

1. **Checkpoints are global/shared** (GameScene ~3312-3338): touching any checkpoint
   deactivates all others and sets BOTH robots' respawn to that one checkpoint, on safe
   ground. So a hazard death **reunites** a separated pair at the last checkpoint.
2. **Hazards kill → respawn; a *hazard* pit is self-correcting** (GameScene 3275-3281).
   The dangerous case is a **safe** pit (floored by the world bottom, no `^`) which can
   *not* kill — the only genuine "no death escape" trap, present at the tutorial's
   Station-4 gap and defused by the shipped U13/U13b grapple zip-up + reel.

| Level | Category | Candidate | Verdict | Recovery that works (driven) |
|-------|----------|-----------|---------|------------------------------|
| tutorial | A | Station-4 grapple pit — **both** robots in (safe pit, no death escape) | **RECOVERABLE** | U13: grapple zips UP to anchor (36,9), lands on a rim, reels the buddy out (DOWN+ACTION) |
| tutorial | A | Station-4 grapple pit — heavy in, grapple free | **RECOVERABLE** | U13b: grapple on the rim reels the stranded buddy out |
| 1-1 | A | x14-19 electric pit — fall in | **RECOVERABLE** | hazard death → respawn at the shared checkpoint on safe ground |
| 1-1 | D | Co-op lift (needs both, threshold 3) death-loop + x50 landing-pit | **RECOVERABLE** | needs-both is a puzzle gate; x50 landing is solid → U4 forward-step; U4 terrace checkpoint is off the shaft |
| 1-2 | B/C | Plate plA holds sky-door b1 — who frees the holder? | **RECOVERABLE** | no strand: b1 is momentary; the heavy just steps off the plate |
| 1-2 | C | Reel-across electric chasm — heavy stranded near side | **RECOVERABLE** | grapple anchor-reel pulls the buddy across (DOWN+ACTION); zip-back retrace available |
| 1-3 | C | Tower reel-up — heavy falls; + crane unwinnable? | **RECOVERABLE** | crane is beatable (not a lock); tower reel-up re-descends/re-reels a fallen buddy |
| 2-1 | C | Roller yard — solo Tiny walled by shimmer pillars | **RECOVERABLE** | U5 Phase hand-hold escort (buddy within 78px passes the shimmer) |
| 2-2 | C | Cross-lane separation; fan-ride required | **RECOVERABLE** (see note) | escort + fan-ride + valve; retrace to the escort wall; shared checkpoints reunite |
| 2-3 | **B** | **Cross-lane 6.5s timed doors — sealed between two closed doors?** | **RECOVERABLE** | **re-pull re-fires the window; each opener is in the partner's free lane** |
| 2-3 | C | Finale throw-across gap — miss strands? | **RECOVERABLE** | a missed throw drops Tiny into the hazard gap → respawn at the near-side x47 checkpoint → re-throw |

---

## The flagged HIGHEST-RISK item — 2-3 cross-lane 6.5 s timed doors

**Definitive answer: NO — a team cannot be permanently sealed between two closed timed
doors. RECOVERABLE.** (`2-3-timed-doors-seal`, drive-confirmed, 24.1 s, 0 deaths.)

Why, grounded in geometry + code + the driven probe:

- The two 6.5 s doors are in **separate lanes**: `tDoorA` (x26, top/Tiny lane) and
  `tDoorB` (x34, bottom/Phase lane). **No single robot is ever between both** — each
  lane holds exactly one timed door (driven: `oneTimedDoorPerLane=true`).
- Each door's opener is the **cross-lane** lever, always reachable by the *free* partner:
  `tDoorA` ← `lvB1` (x24, bottom, Phase's side); `tDoorB` ← `lvA1` (x32, top, Tiny's side).
  The dependency chain is **linear and rooted at `lvB1`**, which Phase can always reach.
- On timer expiry the door **re-arms**: the lever pops back out (`lvB1` `on→false`) and is
  **re-pullable**, re-firing a fresh 6.5 s window (GameScene 3430-3438 + `pullLever`).
- A door **never closes on a robot standing in its zone** (no crush; GameScene 3483).
- Global checkpoints (x7, x47) mean any death **reunites** the team.

**Exact repro (driven):**
1. Equip; Phase ambushes w1 through the x20 shimmer panel and stages at `lvB1` (x24);
   Tiny stages just short of `tDoorA` (x26).
2. Phase pulls `lvB1` → `tDoorA` opens (`lvB1 on-after-pull=true`). **Do NOT cross.**
3. Wait out the 6.5 s timer → `tDoorA` closes and `lvB1` pops back out
   (`tDoorA_closedAfterTimer=true`, `lvB1_poppedOffOnExpiry=true`).
4. Phase **re-pulls** `lvB1` → `tDoorA` re-opens (`tDoorA_reopenedByRepull=true`).
5. Complete the relay: Tiny through `tDoorA` → `lvA1` (x32) → `tDoorB` opens
   (`tDoorB_openedByLvA1=true`) → Phase through (`tinyPastDoorA` & `phasePastDoorB=true`).

A botched window is therefore always retryable; there is no reachable configuration in
which the re-open lever is unreachable *and* the partner is also trapped.

---

## Per-level checklist (driven repro + recovery)

### Tutorial — "Orientation Day"

**A · Station-4 grapple pit, BOTH in — RECOVERABLE** (`tut-station4-both-in`, 27.4 s)
- Repro: equip grapple@x23 / heavy@x26; gate opens; both walk right off the x33 rim into
  the 4-tile pit (x34-38, carved to the world bottom, **no `^`**). Driven stuck state:
  both grounded at **ty≈17.5** — cannot die (safe pit) and cannot jump 4 tiles out.
- Recovery (driven ok): the grapple robot does **UP+ACTION** to zip to anchor (36,9),
  releases onto the right rim, then **DOWN+ACTION** reels the buddy out. Both end ty<14.
  Role-symmetric (the grapple robot always carries the zip); both assignments behave the same.

**A · Station-4 grapple pit, heavy only in — RECOVERABLE** (`tut-station4-heavy-only-in`, 19.6 s)
- Repro: heavy walks off the x33 rim (driven: heavy at ty≈17.4), grapple stays on the rim.
- Recovery (driven ok): grapple on the rim reels the stranded heavy out (DOWN+ACTION) → ty<14.

### 1-1 — "First Day on the Job"

**A · x14-19 electric pit — RECOVERABLE** (`1-1-electric-pit-both`, 7.4 s)
- Repro: equip; grapple zips the belt gap to anchor (17,9) and releases straight DOWN into
  the electric pit ('^' at r16).
- Recovery (driven ok): hazard death → automatic respawn **alive on solid ground**
  (driven: respawned at tx=2.5, ty=13.5, dead=false). "Both fall in" is identical — both
  respawn together (global checkpoints). This is why hazard pits are self-correcting.

**D · Co-op lift (needs both) + x50 landing-pit — RECOVERABLE** (`1-1-lift-deathloop-and-x50`, 48.2 s)
- Repro: full traversal — both weigh the lift (heavy 2 + grapple 1 = threshold 3) to rise;
  grapple carries heavy to the terrace; a short jump lands in the x50-51 strip.
- Recovery (driven ok): route completes (both at ty≈9.4 on the terrace). The lift is a
  **needs-both puzzle gate**, not a lock — it returns home when unweighted (GameScene 3567),
  so it never traps a lone rider. The x50-51 landing is **solid floor** (not a hazard);
  the **U4 forward-step** (x51 2-tile riser) climbs out, lift re-ride is the fallback.
- Respawn-strand: 1-1 checkpoints (x23, x40, terrace x52,8) are all on solid floor; the U4
  note moved the post-lift checkpoint **off** the lift runway so a respawn never drops into
  the open shaft.

### 1-2 — "The Crusher Line"

**B/C · Plate-holder strand — RECOVERABLE** (`1-2-plate-holder-strand`, 13.5 s)
- Repro: heavy holds plate plA (x15-16) → sky-door b1 opens (driven: `plateWasHeld` &
  `b1WasOpen=true`); grapple takes the sky route.
- Recovery (driven ok): the holder frees **itself** — heavy (crusher-immune) simply steps
  off the momentary plate and walks the tunnel (driven: heavy walked to tx=26.5, b1
  auto-closed). No external release needed; nobody is sealed behind the plate.

**C · Reel-across electric chasm — RECOVERABLE** (`1-2-reel-across-chasm`, 41.3 s)
- Repro: full traversal to the chasm (x40-52); the anchor-reel crossing.
- Recovery (driven ok): the grapple **anchor-reel** (DOWN+ACTION) that completes the
  crossing **is** the un-strand — a heavy left on the near side is reeled over the pillar
  (driven: route complete, both across). Anchors straddle the pillar (43/46/52) so grapple
  can also **zip back** to retrace; and a heavy that steps into the electric chasm respawns
  at the shared far-side checkpoint (x54) — death can reunite the team across the gap.

### 1-3 — "Crane Chaos"

**C · Tower reel-up + "is the crane unwinnable?" — RECOVERABLE** (`1-3-tower-reel-and-crane`, 66.5 s)
- Repro: full run — defeat the crane (yank plates + stomp pods), then the tower reel-up.
- Recovery (driven ok): the crane fight **completes** (progressed to "both reach the exit")
  → **not** an unwinnable hard-lock, just hard. The tower reel-up re-ascends ledge by ledge;
  a heavy that falls lands on the **solid tower-base floor** (no hazard) and is reeled again
  (the route's rung retry: grapple zips back down + re-reels). Both ended at ty≈2.5 (top).

### 2-1 — "The Vents"

**C · Solo-Tiny walled by shimmer pillars — RECOVERABLE** (`2-1-solo-tiny-walled`, 37.5 s)
- Repro: both lanes reach the merge zone; Tiny alone tries to push through the x50 shimmer
  pillar. Driven stuck state: Tiny **stalled at tx=49.83** — walled (the shimmer collides
  for non-phase and her jump is a hair short) and she can't die (rollers ignore Tiny).
- Recovery (driven ok): the **U5 Phase hand-hold escort** (buddy within 78px passes the
  shimmer) walks her through; escort to the exit completed. Phase is always free to return;
  if Phase is stuck it can die to a roller and respawn at the shared x46 checkpoint.

### 2-2 — "Steam & Shadows"

**C · Cross-lane / fan-ride required — RECOVERABLE (env-sensitive)** (`2-2-fan-cross-lane`, 40.0 s)
- Repro: full run — Phase escorts Tiny through the entry wall; the fan lifts Tiny to the
  high deck through timed steam jets; the valve shuts Phase's steam wall.
- Recovery (driven ok **this run**): route completed (both finished). Recovery mechanics:
  escort back through the re-crossable wall + shared checkpoints (x8, x17, x40) reunite the
  lanes on any death.
- **Honest caveat:** the 2-2 fan-lift + timed steam is the KNOWN thermal flake on this box
  (per the verification protocol). It drove clean here, but a hot-box run can fail to reach
  the deck; that would be `UNVERIFIED` (env), **never** a hard softlock — no geometry seals
  a lane. Re-run standalone / on a cooler box to reconfirm if a run flakes.

### 2-3 — "The Warden's Maze"

**B · Cross-lane 6.5 s timed doors — RECOVERABLE** — see the dedicated section above
(`2-3-timed-doors-seal`, 24.1 s).

**C · Finale throw-across gap — RECOVERABLE** (`2-3-finale-throw`, 28.4 s)
- Repro: full run — Phase ambushes w3, carries Tiny through panel x49, throws her across the
  electric gap (x52-58).
- Recovery (driven ok): route completed (both at the exit). A **missed** throw drops Tiny
  into the electric gap (hazard) → she respawns at the shared **x47 checkpoint on the near
  side**, where Phase re-picks-up and re-throws. No permanent strand.

---

## Respawn-strand audit (all levels, category D)

Driven + code-grounded. Respawn always lands **both** robots at the single global active
checkpoint on solid ground (GameScene `killPlayer` → `cpPos`, ~2189-2203 / 3312-3338):

- **1-1:** x23, x40, terrace x52,8 — all solid; U4 moved the post-lift checkpoint off the
  open shaft (driven: 1-1 route completes with 0 deaths).
- **1-2:** x27, x54 — solid tunnel/floor.
- **1-3:** x10, x36, x43 — solid arena/tower-base floor.
- **2-1:** x8, x46 — solid.
- **2-2:** x8, x17, x40 — solid.
- **2-3:** x7, x47 — solid; the near-side x47 checkpoint is exactly what makes a finale
  throw-miss recoverable.

No checkpoint respawns into a hazard or a dead spot. **Respawn-strand: none found.**

---

## Additional finding — a pre-existing HARD SOFTLOCK on an OPTIONAL core path (out of SL1 base scope)

Not part of the SL1 candidate table (which covers **base traversal**), but recorded here so
SL3/SL4 have the complete picture. Already **drive-verified and documented by the beat kit**
(`tools/beat/routes/1-2.mjs`, `coreprobe`/`coremerge`):

- **1-2 core0 (20,16) — HARD SOFTLOCK (optional-core-induced), FL-T3-B.** Reaching this
  optional core requires stomping the cracked lid (19-20, r14), which severs the tunnel
  floor into a 2-tile hole. Afterwards the **heavy is trapped** in/left of the pocket: it
  can't clear r14 from the pocket floor, and can't cross the 2-tile hole back to the yard
  (drive-verified — falls back in). Collecting core0 strands the run with **no in-game
  recovery** → `R×2`. It is excluded from the 100%-core assertion pending design arbitration.
  **This is the one confirmed hard softlock in the game.** It is only reachable by the
  optional core-collection action, so it does not affect base completion. **→ SL3/SL4:** add
  a detector (heavy in the col28-33 pocket band with the tunnel severed and no reachable
  exit) that surfaces the tier-2 restart prompt; the real fix (widen the step / add an
  anchor) is SL-series level work, **not** done here (SL1 is tooling + docs only).

- **1-1 core1 (28,16) — NOT a softlock (just unreachable), FL-T3-A.** Walled in a
  heavy-impassable left pocket with a solid r14 ceiling and no drop-in; the core simply
  can't be collected by real input. It strands nobody — you just don't get the core.

## Confirmed HARD SOFTLOCK tally

- **SL1 candidate table (base traversal): 0.**
- **Optional-core paths (pre-existing, beat-kit-documented): 1** — 1-2 core0 (FL-T3-B),
  flagged for SL3/SL4.

---

## Running the prober

```
npm run test:softlock                              # all 11 candidates
node tools/softlock/runner.mjs 2-3                 # one level
node tools/softlock/runner.mjs --only 2-3-timed-doors-seal
node tools/softlock/runner.mjs 1-3 --merge         # fold into an existing report.json
```

Input-only, headless-Chromium, deterministic and repeatable, so it guards future changes.
Writes `tools/softlock/report.json` (per-candidate stuck state + recovery outcomes) and a
failure artifact for any scenario that can't be driven. SL1 changed **zero** game code —
the passing 12-run beat matrix is the drift guard (confirmed 10/10 GREEN on 1-1, 1-2, 1-3,
2-1, 2-3, both role assignments).
