# Text-Box UX Overhaul — Audit & Plan of Record

Director's complaint: text boxes are awkwardly placed, stay too long, or can't
be dismissed. Audit confirmed all three, with code-proof (file:line) and visual
evidence (tools/shots/tbaudit/). This doc is the fix plan.

## The rulebook (design principles)
Every transient text surface must have, uniformly:
1. **A dismiss path** — ENTER (and pad START) becomes the universal "next text"
   key game-wide: press once → typewriter completes instantly; press again (or
   when fully typed) → line/panel dismisses. Never a gameplay key (SPACE/E/L
   fire skills), never blocks input, kid-obvious affordance ("↵" chip on the bar).
2. **A lifetime** — nothing transient lives forever; holds scale with text length.
3. **Placement that respects gameplay** — bubbles never sit ON the robot they
   describe, never bury each other, and permanent world labels recede when idle.
4. Reading is never punished (stuck-panel escalation pauses while it's shown).

## Confirmed defects (evidence: audit 2026-07-19)
D1  Blip lines: NO skip/dismiss input exists; fixed 2600ms hold regardless of
    TEXT SPEED; ~4.2s per line (UIScene:710-757).
D2  Blip queue unbounded+serial: one event can enqueue 2-3 lines → ~12s forced
    KOBI; barks pile into the same queue (GameScene:4003,4024,4624).
D3  Music stays ducked for the WHOLE queue, not per line (UIScene:718,748-753).
D4  "SPACE/L = ACTION" spawn hints track the robots FOREVER until first action
    press — no timer (GameScene:459-473, 2259-2262, 4720).
D5  Item cards never disappear: unclaimed = full card forever; claimed = dims
    to 0.55 alpha forever; fixed py-150 offset can overlap the action bubble
    (GameScene:1310, 2199-2254).
D6  Tutorial/trigger glyph clusters are permanent world text (GameScene:296,4837).
D7  Hub locked/WIP toast has no lifetime — stays until cursor moves (HubScene:551,536).
D8  Coach bubbles clamp DOWN onto the robot near the top of the screen; no
    mutual avoidance vs the other bubble or item cards (GameScene:3843-3845).
D9  SL4 stuck panel: sitting still to read it escalates T1→T2→T3 (25/50/75s)
    into grey-out + sad music; no acknowledge input (watchdog.js:36-38).
D10 Intro banner: ~2.08s un-skippable, then the un-skippable start blip
    (GameScene:772-786).
D11 GATE/EXIT/door labels + warden badges: permanent full-brightness world text.

## Sprints

### T1 — Blip bar 2.0 (core dismissal + pacing)
- ENTER/pad-START skip: 1st press completes typing, 2nd dismisses (UIScene
  update loop gains the input path; "↵" affordance chip on the bar's right edge).
- Hold scales with length: hold = clamp(1200, 28ms/char × uxTextSpeed, 2600).
  TEXT SPEED now also scales the hold.
- Queue discipline: cap 3; BARKS are droppable — if a line is active, a bark is
  discarded, never queued (scripted lines still queue). Coalesce per-event
  multi-line emits with a 150ms merge window where feasible.
- Music duck released between lines (150ms grace), not at queue-empty only.
- Bar fits its text: 1-line lines get a slimmer bar (h 56 vs 80).
- Couplings: keep bar top reference y=H-92 for clamps (slim variant floats
  lower edge-aligned); keep __BB probe; update tut_sanity/audio suites if they
  time blips.

### T2 — Item cards & spawn hints (lifetimes)
- Item cards auto-MINIMIZE after 6s to the existing icon+name tag (reuse
  equipItemCard's shrink); expand back when a robot is within ~2.5 tiles of the
  pedestal; destroy the tag 6s after equip (today it lingers at 0.55 forever).
- "SPACE/L = ACTION" spawn hints: 9s lifetime then fade; the existing coach
  reshow logic (idle-near-actionable >20s) already covers relearning.
- Card/bubble overlap: with cards minimized by default the window shrinks to
  spawn-time only; add a one-shot AABB nudge (bubble flips to the robot's other
  side) for that window.

### T3 — Placement & world-label polish
- Coach bubble top-clamp: when clamping would cover the robot, flip BESIDE it
  (choose the freer side) instead of pushing down onto it.
- Two-player bubble collision: offset the second bubble vertically by its height.
- GATE/EXIT/door plates + warden badges: proximity alpha (1.0 within ~6 tiles,
  0.35 beyond) — permanent text recedes when not relevant.
- Tutorial/trigger glyphs: same proximity-alpha treatment (never destroyed —
  they are teaching aids — but they stop shouting across the room).
- Hub toast: 3.5s auto-clear. Intro banner: any-key fast-out (120ms) on top of
  the auto timeline; start blip unchanged (skippable per T1).
### T4 — Stuck-panel kindness
- Escalation grace: while a stuck panel is freshly shown, the watchdog baseline
  gets +10s so READING it never tips the next tier.
- ENTER acknowledges: hides the panel and suppresses re-show for 30s (watchdog
  itself unchanged — safety net intact; SL suites must stay green).

### T5 — QA cycle (gates the whole overhaul)
- New probe: __BB.textbox {active, queueLen, skip()} for tests.
- New targeted test: blip skip/dismiss/queue-cap/duck-release checks (extend
  playtest_audio or a new tools/playtest_textbox.mjs).
- Full existing kit: playtest suite, beat matrix, softlock all (esp. SL4/SL5
  scenarios — T4 touches their subject), campaign smoke. Screenshot set of the
  entry moment before/after (tools/shots/tbaudit/).
- Visual: bar/bubbles/cards keep the Lumen glass language; coach bubbles gain a
  small tail pointer at the anchored robot.

## Notes
- Epilogue/Reward/clear-overlay already meet the rulebook (any-key advance,
  timers) — no changes.
- Beat/campaign drivers never wait on blips (input-only) — timing changes are
  test-safe by design; SL4 scenarios WILL need re-verification after T4.
