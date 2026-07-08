# Bolt Buddies — "User Stuck" Softlock Recovery Roadmap (SL1–SL6)

A player or team can maneuver themselves into a state where the level is no
longer winnable — a **softlock**. Today the only exit is `R×2` (restart room) or
`ESC×2` (map), and nothing tells a stuck player that. This roadmap systematically
(1) finds every softlock per level, (2) detects them at runtime, (3) communicates
a clear, kind recovery ("you're stuck — press R twice to restart"), and (4)
teaches restart-as-a-tool in the tutorial.

## Design principles (binding)

1. **Restart is the LAST resort, never forced.** The system only ever *offers*
   the existing `R×2` restart (and `ESC×2` map) and makes it discoverable — it
   never seizes control, never auto-restarts, never blocks input.
2. **Safety net BELOW the specific hints.** A stall first tries the existing
   contextual co-op hints (U1 coach, U2 lock/timer, U5 escort, U13/U13b pit
   reel). Only when those don't apply or don't unstick the team does the softlock
   system escalate to the restart offer. Most "stuck" is recoverable once players
   see the co-op move; restart is for the genuinely-unwinnable and the
   truly-lost.
3. **Two detection layers.** (a) A general **progress watchdog** — no meaningful
   progress for escalating windows while both are alive — catches *anything*,
   including softlocks we didn't enumerate. (b) **Explicit detectors** for each
   confirmed hard softlock recognize the unwinnable state immediately (faster,
   more confident copy).
4. **Physics/logic sacred; passive reads only.** Detection never changes
   geometry, physics, entity logic, or timings. Canvas-safe, pooled, zero
   per-frame allocations. The 12-run beat matrix stays green.
5. **Must not false-fire.** The watchdog must NOT trip during the beat/playtest
   suites (which complete levels quickly) or during legitimate slow/exploratory
   play. Thresholds are tuned against real playthroughs + the suites; the suites
   are the regression guard.
6. **Respects U11 comfort/hints settings** (`bolt-buddies-ux-v1`). Session-only
   in-memory state otherwise; never touches save/audio keys.
7. **Kid copy ≤60 chars, KOBI voice.** Getting stuck is framed as normal and
   blame-free ("Try again? Hold R. No shame. ...Some shame.").

## Candidate softlock inventory (initial — SL1 confirms/quantifies each)

| Level | Category | Candidate softlock | Recoverable w/o restart? |
|-------|----------|--------------------|--------------------------|
| tutorial | A | Station-4 grapple gap, both in / one in | YES — U13 (both) + U13b (reel-out) hints |
| 1-1 | A | x50 pit, both fall before learning the step | Forward step (U4) + reel-out; else restart |
| 1-1 | D | Lift (needs both, threshold 3) death-loop | Terrace checkpoint (U4) — audit |
| 1-2 | C | Reel-across electric chasm — Grapple crosses, Heavy respawns far side, separated | Grapple can zip back — AUDIT the retrace |
| 1-2 | B/C | Plate plA holds sky-door b1 (non-latch) — who frees the holder? | b1 is core-only (optional) — AUDIT |
| 1-3 | C | Tower reel-up — Heavy falls, Grapple at top, must re-descend to reel | Grapple zips back down — AUDIT |
| 1-3 | — | Crane fight unwinnable? (just hard, not a softlock) | N/A — confirm it can't hard-lock |
| 2-1 | C | Roller yard — solo Tiny walled without Phase escort | Reunion via U5 escort — AUDIT |
| 2-2 | C | Cross-lane separation; fan-ride required for Tiny | Retrace — AUDIT the lane rejoins |
| 2-3 | **B** | **Cross-lane timed doors (6.5s) — trapped between two closed doors if the re-open lever is unreachable or partner also trapped** | AUDIT: do levers re-fire the timer? is the partner always free to re-open? — **highest risk** |
| 2-3 | C | Finale throw-across gap — Phase must throw Tiny; miss = respawn near side | Re-throw — AUDIT; confirm no permanent strand |
| all | D | Respawn-strand (respawn into a dead/immediate-death spot) | U4 fixed 1-1; AUDIT every checkpoint |

## The sprints

### SL1 — Softlock audit & prober (analysis + permanent test)
Build `tools/softlock/` — a prober (reusing the beat kit's input-only driver)
that drives each level (1-1…2-3 + tutorial) into every candidate softlock state
above: both-into-pit, one-crosses-then-partner-strands, timed-door double-close,
plate-holder-strand, respawn-into-death, lever/key misuse. For each candidate it
attempts EVERY recovery the game allows (retrace, reel, re-throw, re-pull,
escort, self-climb) and classifies the state **RECOVERABLE** vs **HARD SOFTLOCK**.
Output: `SOFTLOCK_INVENTORY.md` — the confirmed per-level list with repro steps.
This is the meticulous per-level checklist, done in code so it's repeatable and
guards future changes. Deliverable: the inventory + `npm run test:softlock`.

### SL2 — Progress watchdog (the general safety net)
A passive per-level progress tracker in GameScene: a cheap "meaningful progress"
metric (max forward reach + cores + doors/bridges opened + checkpoints hit +
recent input/velocity). If NO new progress for an escalating window while BOTH
players are alive and low-activity, raise a `stuck` signal with a tier (t1 gentle
~25s, t2 firm ~50s — tuned in SL6). Zero per-frame alloc; reads existing state.
CRITICAL: prove it never fires during the beat/playtest suites (they progress
fast) — the suites are the guard. No gameplay change.

### SL3 — Explicit softlock detectors (per confirmed softlock)
For each HARD SOFTLOCK from SL1, a precise passive detector that recognizes the
exact unwinnable configuration immediately (e.g. both grounded in a hazard pit
with no reachable exit; a robot sealed between two closed timed doors with the
re-open lever cross-locked). Data-driven off level metadata where possible.
These fire faster and with more confident copy than the watchdog, and feed the
same SL4 communication layer. Each detector proven to fire ONLY in the real
softlock (SL1 repros) and never in normal play.

### SL4 — "Stuck?" communication & restart prompt (the visible deliverable)
The escalating recovery UI, reusing the coach/blip plumbing + the U3 `R×2`
confirm + `ESC×2` map:
- **Tier 1 (soft, watchdog t1 or a detector's "try this")**: a gentle KOBI nudge;
  if a contextual co-op hint applies (reel / escort / throw / re-pull), show THAT
  first (defer to the existing hint systems).
- **Tier 2 (firm: a confirmed hard softlock, or watchdog t2)**: a clear,
  non-blocking prompt — "STUCK? Hold **R** twice to restart this room" with the
  R keycaps (and a quieter "ESC twice = map"). KOBI voice, blame-free.
Pooled, canvas-safe, respects U11 HINTS/comfort, clears the instant progress
resumes or on restart. Never blocks input.

### SL5 — Tutorial: getting-stuck & restart lesson
A dedicated Orientation-Day beat teaching restart as a normal tool: "Stuck? Hold
**R** twice — start the room over. It's FINE. (It's a little sad, but FINE.)" plus
a reinforcement that `ESC` returns to the map. Introduce it after the pit
stations (where the co-op escapes are taught) so restart reads as the universal
fallback. tut_sanity-safe (must not change the driven tutorial path/timing).

### SL6 — Softlock sweep, tuning & audit close
Wire SL2/SL3 to SL4, run the SL1 prober across all levels: assert every HARD
SOFTLOCK now surfaces the tier-2 restart prompt within a reasonable time, and
that NORMAL play + all beat/playtest suites NEVER trip the watchdog (tune the t1/
t2 windows + the progress metric until both hold). fps A/B; full stack + matrix
green (twice for any geometry-adjacent tuning). Findings→fixes table appended
here. Mirrors the U12 / A12 audit-close.

## Pipeline placement

Insert the SL series AFTER the animation series (A1–A12) finishes and BEFORE the
final visual audit + campaign loop, so P12 also audits the new stuck-prompt
visuals and the campaign loop verifies softlock recovery end-to-end:

  … ANIM A8 (in flight) → A9 → A10 → A11 → A12
    → **SL1 → SL2 → SL3 → SL4 → SL5 → SL6**
    → GFX P12 (final visual audit, now incl. the stuck prompt)
    → END-STATE campaign loop (now also asserts: no un-signalled softlock;
      every deliberate softlock surfaces restart)

(Adjustable — if softlock recovery should jump ahead of the remaining ANIM
sprints, SL1–SL6 can move up; they're independent of the animation work.)

## Verification protocol (every SL sprint)
Same as the project standard: Opus implements on buddies dev → reviewer verifies
(screenshots + independent full `npm run playtest` + the new `test:softlock`) →
push buddies main on acceptance. Detection is passive/physics-sacred → the 12-run
beat matrix is the drift guard; the watchdog-doesn't-false-fire check is the
suites themselves. Known env note: this box runs thermally hot — 2-2 fan / 1-3
reel flake is environmental (verify via interleaved anim-on/off or standalone
re-run), never a real regression.

## SL6 audit findings

The audit-close of the whole SL1–SL5 softlock stack — the end-to-end chain
assertion, the comprehensive no-false-fire sweep, threshold finalization, and the
fps A/B. Everything below is from **real foreground runs** on `dev` @ `eae39c2`
(SL5). Mirrors the U12 / A12 audit-close format. **Zero gameplay change this
sprint** — the only diff is sweep/fps tooling + a package script + this section
(`watchdog.js` untouched → the shipped t1=25s / t2=50s stand, justified below).

### What was swept

A new end-to-end **chain sweep** — `tools/softlock/sweep.mjs`
(`npm run test:softlock:sweep`) — drives the FULL pipeline with **real input only**
(no faked `stuckTier`, no teleport, no threshold injection) and asserts the visible
deliverable (the SL4 pooled prompt's own display-list state), not just the upstream
signal:

- **Chain A — hard softlock:** the ONE real hard softlock (1-2 core0 severed-tunnel)
  driven via the real stomp-the-lid repro → **SL3 detector latches → SL4 tier-2
  prompt SHOWS** with the confident "DEAD END" copy + R keycaps.
- **Chain B — general stall:** sit perfectly still at the **real shipped 25s/50s**
  → **SL2 watchdog escalates 0→1→2 → the SL4 prompt escalates gentle→firm in step.**

### End-to-end chain — per-level result

| Trigger | Path exercised | Result (real log) |
|---------|----------------|-------------------|
| **1-2 core0 hard softlock** (SL3) | stomp the cracked lid → Heavy trapped in the severed-tunnel pocket → `this.softlock={severed-tunnel,1-2}` → `stuckTier=2` → SL4 prompt | **PASS** — detector latched **0.3s** after the lid severed; prompt visible, `mode=softlock`, head `"DEAD END — no way through"`, sub `"Hold R twice to restart · ESC twice = map"`, R keycaps shown. |
| **general stall** (SL2 watchdog) | both robots idle on solid ground, press nothing, live t1=25000/t2=50000 | **PASS** — tier 0→1 @ **24.1s** (`stallMs≈25406`), 1→2 @ **49.8s** (`stallMs≈50265`). SL4 prompt: gentle nudge `"Stuck? No shame in a fresh start."` @24.1s → firm `"STUCK? Time for a fresh start"` + R keycaps @49.8s. Escalated gentle→firm in step. |

The tier-2 restart prompt is reliably surfaced for **every** hard softlock: the one
enumerated hard lock fires the explicit detector instantly (0.3s), and any
UNKNOWN stall is caught by the watchdog's general net at 25/50s. Result:
`ALL SL6 CHAIN CHECKS PASSED`, 0 page errors.

### No-false-fire sweep (comprehensive) — all peaks 0

The suites are the regression guard: a correct passive stack raises **no** tier
during fast, legitimate play. Confirmed on real runs — **wd-peak 0 AND sl-peak 0
everywhere**, so the SL4 prompt (which only shows when a tier > 0) **never shows in
normal play**:

| Suite | Result | SL2 wd-peak | SL3 sl-peak |
|-------|--------|-------------|-------------|
| Beat matrix — 1-1 A/B | 2/2 GREEN | 0 | 0 |
| Beat matrix — 1-2 A/B | A env-flaked (see note), B GREEN; standalone re-run **2/2 GREEN** | **0** (both runs) | **0** (both runs) |
| Beat matrix — 1-3 A/B | 2/2 GREEN | 0 | 0 |
| Beat matrix — 2-1 A/B | 2/2 GREEN | 0 | 0 |
| Beat matrix — 2-2 A/B | 2/2 GREEN | 0 | 0 |
| Beat matrix — 2-3 A/B | 2/2 GREEN | 0 | 0 |
| `playtest.mjs` (world 1) | 42/42 checks | 0 | 0 |
| `playtest_w2.mjs` (world 2) | 30/30 checks | 0 | 0 |
| `playtest_audio.mjs` | 29/29 checks | 0 | 0 |
| `tut_sanity.mjs` | 21/21 checks | 0 | 0 |

**Matrix tally:** 11/12 GREEN on the hot-box run; **wd-peak 0 + sl-peak 0 on all 12
runs** (including the one flaked run). The single non-green — `1-2 [A:P1=G]`,
"G zip arrived" timeout on the grapple sky-route — is the **known thermal env
flake** (this box ran ~25 fps during the sweep), **NOT** a wd/sl false-fire: it
carried wd-peak 0 / sl-peak 0, and a **standalone re-run passed 2/2 GREEN**. Env,
not regression, exactly per the verification protocol.

### Final thresholds — kept t1=25000ms / t2=50000ms

**Kept the SL2 starting values; no change.** Justification (evidence-backed):
SL3's explicit detector fires the ONE known hard softlock **instantly** (0.3s), so
the watchdog is only the general net for **unknown** stalls — err toward NOT
nagging. The comprehensive suites (12-run matrix + all 4 playtests) trip **neither**
layer at 25/50 (peaks 0 = the guard holds), so the windows are not too tight for
legitimate slow/exploratory play; and the chain-B run confirms a genuinely-stuck
team still sees a gentle nudge at ~25s and the firm restart offer at ~50s — not an
absurd wait. Any future tuning would be a threshold-only edit to `watchdog.js` (no
logic change); none was needed.

### fps A/B — softlock stack ON vs neutralized

`tools/softlock/fps_ab.mjs` (`npm run test:softlock:fps`) — matched ~18s passes of
identical deterministic random input; the "OFF" pass stubs the three tail update
methods (`watchdog.update` / `detectors.update` / `updateStuckPrompt`) to no-ops
**at runtime** (test-only monkeypatch, no source edit):

| Level | stack ON (avg/min) | neutralized (avg/min) | Δavg | Δmin |
|-------|--------------------|-----------------------|------|------|
| 1-3 | 25.0 / 23.7 | 25.5 / 25.2 | **-0.5** | -1.5 |
| 2-2 | 25.7 / 24.3 | 26.2 / 24.8 | **-0.5** | -0.5 |

Worst |Δavg| = **0.5 fps**, within the ±2 fps SwiftShader jitter this hot box
shows (absolute fps was depressed by concurrent load; the DELTA is the signal). The
passive stack's per-frame cost is thermal noise — consistent with its design (scalar
reads + explicit for-loops, zero per-frame allocation).

### Recommendation (NOT implemented — level files untouched)

The 1-2 core0 hard softlock is **satisfied** for SL6: it now reliably surfaces the
tier-2 "DEAD END — hold R twice to restart" prompt, which meets the roadmap goal
(communicate that the player must restart). It is an **optional-core** action the
player chose, so it does not affect base completion. **If** a future design decision
wants it made recoverable rather than restart-only, the clean fix is a **grapple
anchor over the pocket** (col 19-20, ~row 12) so the trapped Heavy can be reeled out
(DOWN+ACTION) the same way every other separation in the game recovers — no geometry
widening, no risk to the beat/core routes. **This is a recommendation for future
arbitration; SL6 changed no level geometry.**

### Diff scope

`tools/softlock/sweep.mjs` (new), `tools/softlock/fps_ab.mjs` (new), `package.json`
(added `test:softlock:sweep` + `test:softlock:fps`), `SOFTLOCK_ROADMAP.md` (this
section). **No** level/scene/anim/save/audio edits; `src/softlock/watchdog.js` and
`detectors.js` untouched; SL4's prompt unweakened. report.json churn reverted.
