# Bolt Buddies — UX & Fun Roadmap ("make it kinder, clearer, funnier")

A meticulous user-experience audit + 12 sprints. Sources of evidence: the beat
kit's fix log (places even a frame-perfect robot player struggled are places
kids will suffer), every screenshot in the galleries, and a naive-player walk
of each mechanic. The bar: **no confusing moment survives 5 seconds without
the game itself explaining it, no accident destroys progress, and every
interaction has a little joy in it.**

## Ground rules (every sprint)

1. Full stack green on every sprint (`npm run playtest`: 42/30/29/21 checks +
   12-run matrix). Sprints U4/U5 change level geometry — the beat-failure
   protocol applies in full (matrix green TWICE, routes updated if stances
   move, Fix-log entries for any behavior change).
2. Additive input only: existing keyboard behavior never changes meaning.
   The ONE sanctioned exception is U3 (destructive-input confirms), which may
   change ESC/R semantics — it must update the suites in the same commit and
   keep every check green.
3. Canvas-safe drawing, procedural art, FONT/FS/TEXT/COLORS tokens, pooled
   objects — same regime as GFX_ROADMAP.
4. Kid-first copy: every new prompt ≤ 60 chars, KOBI-voiced where possible.
5. New persisted UX options go in localStorage `bolt-buddies-ux-v1`
   (never touch the save or audio keys).

## UX audit — findings (what hurts or confuses TODAY)

**Discovery & teaching**
- F1. The buddy-rope (DOWN+ACTION) and straight-up zip (UP+ACTION) chords are
  taught once, in a 3-line card at the pedestal, then never again. They are
  the two most-missed mechanics (the kit itself needed FL-001/002/005 to get
  them right). Nothing in the world ever says "you could rope your buddy
  RIGHT NOW."
- F2. Escort is taught in 2-2, but 2-1's roller-yard shimmer pillars ALSO
  require it for Tiny — after a whole level teaching "rollers ignore Tiny,"
  the pillars silently block solo Tiny (the original walkthrough itself got
  this wrong — see FL notes). Nothing explains it in-world.
- F3. Locked doors give zero feedback on bump: kids can't tell a
  needs-a-lever door from a wall from a timed door that closed on them.
- F4. Timed doors (2-3, 6.5s) show NO countdown — you learn the timer exists
  by being crushed out mid-dash.
- F5. Throw direction/strength is invisible until the buddy is airborne;
  high-toss (hold jump) is a hidden modifier. Kids will throw each other
  into the electric gap in 2-3 learning this.
- F6. Nothing suggests the tutorial to a first-time player standing on the
  menu; NEW GAME drops them straight into 1-1.
- F7. The floating action-key hints vanish after the first press forever —
  a kid who forgets mid-level gets no reminder.

**Fairness & friction (level design)**
- F8. 1-1's terrace crossing is EXPERT for a first level: heavy cannot make
  the jump solo (documented kit deviation — carry-jump is mandatory), a
  missed jump lands in a pit whose ONLY exit is walking back left and
  re-riding the whole lift cycle (~7s), and even the kit needed a 3-cycle
  recovery loop here (FL series). First-level frustration hotspot.
- F9. 1-1 has no checkpoint after the lift — a death on the terrace replays
  the lift wait.
- F10. 2-3's timed relay: when a door re-arms mid-dash you're just... stuck,
  with no cue about what happened or that the lever re-armed (the lever
  handle resets visually but nobody is looking at the lever).
- F11. 2-2: after Tiny throws the valve, Phase (waiting below at x22) gets
  no positive cue that the corridor is now safe except silence — an
  "all clear" moment is missing.

**Destructive inputs**
- F12. R restarts the chamber INSTANTLY. ESC exits to the map INSTANTLY.
  Two kids on one keyboard WILL hit these by accident and lose the run.
  (NEW GAME already has press-again protection — be consistent.)

**Couch-co-op comfort**
- F13. No gamepad support. Two kids sharing one keyboard is cramped, and
  cheap keyboards ghost with 4+ simultaneous keys (two players moving +
  jumping is 4-6 keys).
- F14. No screen-shake/flash comfort option.

**Fun & reward**
- F15. Level clear shows cores only — no time, no deaths, nothing to brag
  about or retry for.
- F16. Zero celebration between the buddies themselves (no high-five!);
  robots have no idle personality; KOBI never reacts to how you're actually
  playing (deaths, speed, hoarding cores).
- F17. Repeated deaths get the same silent respawn — a kind, funny KOBI
  line at 3+ deaths on the same section would defuse frustration.

## The sprints (U1–U12)

### U1 — Contextual teaching prompts (fixes F1, F5, F7)
A tiny "coach" system in GameScene: condition-driven, once-per-level,
auto-dismissing glyph bubbles (reuse tutorial keycap + addGlyphs).
Triggers: (a) buddy grounded+reelable and grapple idle >2s → rope chord
hint over the buddy; (b) anchor almost straight above + player under it
>2s → UP+ACTION hint; (c) first pickup of a buddy → throw + high-toss
hint; (d) action hints re-show (30% alpha) after 20s of a player not using
their action key while adjacent to something actionable. All bubbles
pooled, ≤1 visible per player, never overlap the KOBI bar.

### U2 — Lock & timer feedback (fixes F3, F4, F10)
Bumping a closed door pops a small bubble: needs-lever → lever icon +
direction arrow toward it; needs-key → key icon; needs-plate → plate icon
+ weight pips; timed & closed → "too slow!" clock icon. Timed doors get a
visible countdown: a ring that drains around the door's lamp + last-1.5s
blink, and the driving lever shows the same draining ring (F10). Plates
stepped with insufficient weight flash their pips (needs 2, have 1).

### U3 — Kid-proof destructive inputs (fixes F12)
R and ESC in-level become press-again-to-confirm (2.5s window): first
press shows a centered toast "press R again to restart" / "press ESC
again for the map" with a shrinking bar; second press acts. Pause menu
EXIT TO MAP stays one-press (it's already deliberate). SANCTIONED SUITE
EDIT: update every suite/driver ESC/R usage to double-press in the same
commit; all counts stay green. Tutorial exempt from confirm (short level).

### U4 — World 1 fairness pass (fixes F8, F9) [level geometry — full protocol]
1-1 terrace: (a) add a 1-tile step in the landing pit's RIGHT wall so the
pit is escapable forward onto the terrace with a double-hop (heavy can) —
the pit becomes a detour, not a trap; (b) add a checkpoint on the lift-top
runway (post-door1 section keeps its checkpoint for the lift approach);
(c) KOBI blip trigger on first pit entry: "The pit is NOT a feature. The
step is. Climb." Beat routes: base route unchanged (jump still works),
pit-recovery branch updated to prefer the new step; matrix green TWICE.

### U5 — World 2 fairness pass (fixes F2, F11) [level geometry — full protocol]
2-1: KOBI blip trigger at the yard entrance: "Shimmer pillars are a TEAM
exercise. Hold hands."; add a faint hand-hold icon on yard pillars while
a solo non-phase robot pushes against them. 2-2: valve throw fires an
"ALL CLEAR" moment — corridor jets visibly vent one last puff, the
corridor light pools shift green (GFX P8 hooks), and KOBI: "Steam's off.
Probably. It's PROBABLY off."; Phase's waiting spot gets a small green
lamp wired (GFX P5 conduit) to the valve. Matrix green TWICE.

### U6 — Throw arc & rope tether preview (fixes F5, F1-adjacent)
While carrying: a dotted arc preview of the throw (reads PHYS throw
constants + facing; second, higher arc while jump is held — both faint,
kid-readable, hidden during the tutorial's station 5 first-discovery
moment so it doesn't spoil the lesson before the glyphs teach it).
While a grapple player's buddy is in rope range with LOS: a barely-there
tether shimmer between them (2px dashed, alpha 0.25, only when grounded
and idle — the "you could rope me" affordance). Both strictly read-only
visuals over existing physics.

### U7 — Gamepad support (fixes F13) [additive input]
Phaser gamepad: pad1→P1, pad2→P2 (left stick/dpad = move, A/cross =
jump, X/square = action, down on stick/dpad = the DOWN chord modifier,
Start = pause, any = initAudio unlock). Menus/hub/settings/pause navigable
with pad1. Keyboard remains fully functional and unchanged — suites
untouched. Title footer + README gain a gamepad line. Detection toast
("P2 controller connected!") once per session.

### U8 — Clear-screen stats & records (fixes F15)
Track per-run time and deaths (display-only counters in GameScene).
Clear overlay adds a stats row: time, deaths, cores — with playful
KOBI grades (deaths 0 = "SUSPICIOUSLY competent"). Best time/fewest
deaths persist in `bolt-buddies-ux-v1` (NOT the save key); a small "new
record!" starburst when beaten. Hub nodes show a tiny clock chip when a
best time exists.

### U9 — Buddy & KOBI personality (fixes F16, F17)
High-five: when both robots enter the exit zone within 1.5s, they turn,
lean in, and spark a little high-five before the overlay (≤900ms, then
finishLevel exactly as today — timing-guarded for suites). Idle emotes:
after 8s of no input, robots look at each other / shrug / beep (pooled
animations, cancel on input). KOBI reactivity: 3 deaths on one checkpoint
segment → one kind-funny line ("I have seen toasters do better. The
toasters also exploded. You're fine."); finishing with all cores → greedy
respect line; rate-limited, never repeats within a session.

### U10 — First-run onboarding (fixes F6)
Fresh save + NEW GAME → before the hub, a single KOBI interstitial:
"First shift? Orientation is MANDATORY." [ORIENTATION] / [SKIP — I'm
BRAVE] (keyboard/pad selectable, 1 press). Choosing orientation runs the
tutorial then returns to the Hub (not Title) in this flow. TUTORIAL menu
button gains a small "new!" pip until first completion (ux-v1 flag).
Suites: the fresh-save first-press path in playtest.mjs must still reach
the Hub — the interstitial must therefore NOT appear when the save
already exists, and the suite's programmatic path gets one extra
scripted press in the same commit (sanctioned, like U3).

### U11 — Comfort & readability options (fixes F14, F7-adjacent)
Settings gains a second page (or extended rows): SCREEN SHAKE
[full/soft/off], FLASH EFFECTS [full/soft], HINTS [on/off] (controls U1
coach bubbles + re-showing action hints), TEXT SPEED [normal/fast]
(KOBI typewriter). All persisted in ux-v1; all default to current
behavior. Camera shake/zoomKick and hazard/neon flicker tweens read the
options via a small `ux.js` module.

### U12 — Naive-player sweep & final UX audit
A scripted "confusion sweep": for each level, walk a fresh-eyes checklist
— every gate/mechanic/hazard must have visible teaching or feedback
within 5s of first contact (using only what's on screen). Log every miss,
fix every miss. Verify no new overlap/occlusion (coach bubbles vs cards
vs KOBI bar at every spawn). Re-run EVERYTHING (full stack + matrix
twice + tutorial). Append the findings→fixes table to this file.

## Execution order
In-flight GFX P1 (title cinematic) finishes first; then U1–U12 run as the
priority series (fun/clarity first), then GFX P2–P12 resume. Every sprint:
Opus implements on buddies dev → Fable reviews (screenshots + independent
full stack) → buddies main on acceptance.

## U12 audit results

Sweep tool: `node tools/ux_sweep.mjs` (fresh-profile naive player, per-level
first-contact checks + spawn overlap audit; report in
`tools/ux_sweep_report.json`, screenshots in `tools/shots/p2/u12-*.png`).
Final run: **70/70 checks PASS, 0 unfixed misses, 0 overlaps, 0 page errors.**
All fixes use established vocabulary only (U2 bump-bubble pool, U5 push-hint
pattern, coach icons); no level geometry was touched.

| # | level | finding | fix |
|---|-------|---------|-----|
| 1 | all + tut | Skills gate gives ZERO feedback on bump — a kid pushing the first door before equipping learns nothing (F3's last hole) | `bumpContent` skills case: arrow toward the nearest waiting pedestal + "GRAB YOUR GADGETS" (U2 bubble pool; anchored at the pusher's height so it can't sit on the item cards it points at) |
| 2 | 1-1 | Exit door (needs `opened: door1`) is a silent wall if bumped before the key door opens | `bumpContent` resolves `needs.opened` one level deep: teaches the referenced door's own first unmet need — here the key icon + "FIND THE KEY"/"USE YOUR KEY" |
| 3 | 1-2 | Exit (needs `opened: d2`) silent before the latch door | same transitive fix → lever icon + arrow toward lv2 + "PULL THE LEVER" |
| 4 | 1-3 | Tower door (needs `crane`) is a dead wall while the crane lives — nothing says the crane is the lock | `bumpContent`/`needContent` crane case: arrow back toward the live crane + "STOP THE CRANE FIRST" |
| 5 | 1-3 | Exit (needs `opened: towerDoor`) silent on the tower top | transitive fix resolves towerDoor → crane case (same bubble) |
| 6 | 2-1 | Vent pinch silently walls the WRONG robot (Phase pushes the duct lip forever; only Tiny fits — F2's sibling) | duct branch added to the U5 push-hint detector: pinch icon (duct lip + mint Tiny bot) + "ONLY TINY FITS" (new `pinch` coach icon, same bubble pool, 3s cooldown, HINTS-gated) |
| 7 | 2-3 | Same silent pinch wall on the top lane (x16/30/40) | same duct hint (generalizes to every `d` tile) |
| 8 | 2-3 | Exit (needs `opened: br1`) silent when Tiny is thrown across before lvF is pulled (F10-adjacent stranding) | transitive fix → lever icon + arrow toward lvF + "PULL THE LEVER" |
| 9 | 1-1 | sweep coverage: 14/14 checks PASS (cards+hints, gate, equip, rope/up-zip/throw hints, lever→bridge, key door+chip, pit blip, lift pips, exit, bug glow, checkpoint) | none needed beyond #1/#2 |
| 10 | 1-2 | sweep coverage: 9/9 PASS (crusher self-demo, plate pips, plate/latch doors, exit, bug glow, checkpoint) | none needed beyond #1/#3 |
| 11 | 1-3 | sweep coverage: 7/7 PASS (crane telegraph + "YANK A PLATE!", tower door, exit, bug glow, checkpoint) | none needed beyond #1/#4/#5 |
| 12 | 2-1 | sweep coverage: 10/10 PASS (duct, cross-lane doors, yard blip, hand-hold, exit, roller beam+alert, checkpoint) | none needed beyond #1/#6 |
| 13 | 2-2 | sweep coverage: 11/11 PASS (hand-hold, fan column, timed jets, corridor jets + red lamp, valve all-clear, plate, exit, roller, checkpoint) | none needed beyond #1 |
| 14 | 2-3 | sweep coverage: 11/11 PASS (hand-hold, duct, timed ring, TOO SLOW, cross-lane door, warden shove, exit, roller, checkpoint) | none needed beyond #1/#7/#8 |
| 15 | tut | sweep coverage: 8/8 PASS (glyphs+hints, station blips, gate, plate pips, plate door, checkpoint, exit-waiting bubble) | none needed beyond #1 |
| 16 | all + tut | Spawn overlap audit: item cards × gate bump bubble × KOBI blip bar × HUD plates × U8 stats-row region — pairwise clean at every spawn (8 visible elements each; stats row hidden at spawn as designed) | none needed (the known U7 controller-toast × intro-card overlap is GFX P9's and stays out of scope) |
