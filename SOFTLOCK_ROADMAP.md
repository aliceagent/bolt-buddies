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
