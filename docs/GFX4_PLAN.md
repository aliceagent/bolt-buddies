# GFX4 "Marquee" — UI chrome & character round: plan of record

Round goal: the UI-specific list the user approved in full — a real type system,
first-impression chrome (splash/cursor), HUD icons, placement-collision fixes,
in-world signage, KOBI's face, hub poster panels, the signature iris wipe, and a
small-text crispness pass. Pure look-and-feel: zero gameplay, physics, or input
changes.

Protocol: identical to GFX2/GFX3. Opus builds each sprint from the spec below;
Fable QAs (diff review + both-tier screenshots + targeted suites) and pushes
fixes; full kit at F5 gates promotion to main. Sprint agents commit AND push on
landing (recycle protocol). Decisions appended here, append-only.

## Verified facts (probed 2026-07-20)

- Every text object in the game uses `FONT` = 'Courier New' (constants.js).
- The staged font: `public/fonts/fredoka-latin.woff2` (29 KB, VARIABLE weight —
  one file serves 600 and 700; latin subset) + `public/fonts/OFL.txt`. Served
  same-origin by vite/Vercel; no runtime CDN fetch.
- index.html has rich OG/social meta and a dark body, but NO loading splash —
  the page is blank-dark until Phaser boots the Title.
- No custom cursor anywhere (OS arrow over mouse-enabled menus).
- UIScene P1/P2 panels show the equipped gadget as TEXT only ("no gadget yet" →
  name); polished per-skill icon textures already exist from the icon sprint.
- Door id plates (e.g. "GATE") are plain mono text on a plate; T3 already makes
  them recede near robots (that behavior is a contract — keep).
- Screenshot-caught collisions: the intro banner slides OVER the top-center
  level pill (4-3 shots); at spawn, gadget cards can clip the "SPACE = ACTION" /
  "L = ACTION" chips (1-2 shot).
- KOBI's blip-bar avatar is a minimal circle+line-eyes; barks already carry
  mood tags (e.g. `mood: "defeated"`).
- Hub world panels are flat glass; locked = padlock + "SIGNAL LOST" text.
- kit.js has the maskless iris wipe (thick-ring trick); used ONLY by HubScene
  and gated `_webglIris` (WebGL) — the gating precedent suggests Canvas cost;
  F4 must MEASURE before widening it.
- Comfort/testing contracts in force: blip-bar skip/queue (T1), stuck-prompt
  (T4), intro-banner any-key skip, beat-kit probes, uxShakeScale/uxFlashScale,
  Canvas tier = test tier (R-rules below).

## Global rules (binding; carried from GFX3)

R1. Canvas (?canvas=1) is the test/reference tier: always-on additions must be
    cheap + deterministic there; expensive ambience goes behind `isWebGL`
    (shared helper in ui/paint.js). MEASURE before gating decisions.
R2. Comfort settings respected for any new motion/flash.
R3. No per-frame allocation; no new update loops.
R4. Procedural art only (the ONE sanctioned binary asset this round is the
    licensed font file already staged).
R5. Depth via DEPTH constants.
R6. Don't touch: tools/ originals (new QA scripts fine), physics, existing
    timings, blip-bar/stuck-UX/banner-skip contracts, beat-kit probes.
R7. Commit AND push on landing; message prefix "GFX4 Fn:".
R8. Deviations logged here (Fn-Dm).
R9 (NEW, this round): TEXT-FIT discipline. Any call site switched to the
    display font must be re-fit-checked: no overflow/clipping of its panel at
    720p, and the SL7 bubble-fit + T-round card-fit audits must not regress.
    When in doubt, keep the mono font at that site.

## F1 — The type system (display font)

- index.html: `@font-face { font-family: "Fredoka"; src: url(/fonts/fredoka-latin.woff2) format("woff2"); font-weight: 600 700; font-display: swap; }`
- main.js (before `new Phaser.Game`): `await document.fonts.load('700 32px Fredoka')`
  with a ~1500ms timeout race — on timeout or failure boot anyway (fallback
  stack renders mono; NEVER block the game on the font).
- constants.js: keep `FONT` (mono, body/terminal voice — KOBI speaks mono on
  purpose). Add `FONT_DISPLAY = '"Fredoka", "Courier New", monospace'`.
- Switch to FONT_DISPLAY (weight 600/700 via fontStyle) at HEADING/BUTTON sites
  only: Title menu buttons + subtitle; Hub panel titles ("WORLD 1 — ASSEMBLY
  WING"), the map title, level-name footer; Settings/Pause/Mute headers + row
  labels; intro-banner level title; clear-overlay title ("CHAMBER CLEAR!" etc.)
  + KOBI grade line stays mono; Walkthrough grid titles; Epilogue page TITLES
  only (story prose stays mono); Reward scene headers.
- Explicitly mono-forever (R9): blip bar, item/gadget cards, stuck prompts,
  key-cap glyphs, stats/records rows, all in-world labels, credits.
- Per-site fit check at 720p (screenshot each changed scene). Fredoka is
  WIDER than Courier at same px — expect size or padding tweaks; keep panel
  geometry unchanged where tests probe it.
- QA: playtest + playtest_audio + tut_sanity green; screenshot sweep of every
  changed scene, both tiers; verify first-paint-after-slow-font renders (throttle
  test optional — the load-race makes it safe by construction).

## F2 — First impressions & HUD chrome

**2a. Loading splash (index.html, CSS-only).**
- A #bb-splash div: dark bg matching theme-color, the wordmark "BOLT BUDDIES"
  in Fredoka (same @font-face — it doubles as the font warm-up), "a 2-player
  rescue mission" sub in mono, and a pulsing KOBI eye built from pure CSS
  (radial gradients + keyframe pulse). No JS animation, no images.
- main.js: fade + remove the splash when the Title scene is actually rendering
  (scene ready event), min-display 300ms so fast loads don't flash.
- The game boot must NOT wait on the splash; splash removal must be
  unconditionally reached (try/finally) so a boot error never strands it.
**2b. Themed cursor.**
- One baked cursor PNG as a data-URI (drawn at build-a-texture time is
  overkill — hand-write a tiny 24x24 PNG data-URI in one place): a small
  rounded glove/pointer in the Lumen teal with dark outline. Applied via
  Phaser `this.input.setDefaultCursor('url(...) 4 2, auto')` once at boot;
  interactive widgets that already set cursor:pointer keep a hover variant
  (same art, slight tilt or glow) via their existing `useHandCursor` flow —
  override Phaser's hand with the variant globally.
**2c. HUD gadget icons.**
- UIScene P1/P2 panels: when a gadget is equipped, show its existing baked
  skill-icon chip (small, ~18px) beside the name text; "no gadget yet" state
  unchanged. Wire on the same event that updates the text today.
**2d. The two placement collisions.**
- Intro banner: hide/fade the top-center level pill while the banner is on
  screen; restore after (the banner's existing lifecycle has clean in/out
  hooks — use them, don't add timers).
- Spawn layout: align the gadget cards and the "X = ACTION" chips into one
  non-overlapping column stack (cards first, chips below, consistent gap).
  Card minimize/expand behavior (T2) unchanged.
- QA: playtest, textbox suite, screenshots (splash mid-load via CDP screenshot
  before ready if possible — else DOM-inspect), title/level/spawn shots.

## F3 — Character & signage

**3a. KOBI portrait 2.0 (blip bar).**
- Bake a portrait family at boot: neutral, smug, alarmed, defeated, glee
  (~5 textures, drawn — round eye, lid shapes, tiny mouth states in the
  existing KOBI pink/magenta language).
- Blip bar: map bark/blip mood tags → expression (default neutral; the mood
  strings already flowing through the queue decide — inspect what tags exist
  and map them all, unknown → neutral). While the typewriter is running, a
  2-state mouth flutter (swap texture or a tiny overlay toggle on a ~120ms
  timer tied to the EXISTING typing loop — no new timers after typing ends).
- The bar's layout/skip/queue contracts (T1) untouched; portrait swap is
  visual-only.
**3b. In-world signage pass.**
- Door/device id plates ("GATE" etc.): restyle as small lab signs — glass
  pill (glassPanel recipe), mono label, tiny icon dot, world-accent edge glow
  (WebGL enhance only for the glow — base sign readable both tiers).
- Keep the T3 proximity-recede behavior byte-identical (same alpha targets +
  cadence; only the drawn look changes).
- QA: playtest + textbox suite; screenshot a level with signs near/far; drive
  a blip with each mood via __BB (or a scripted level moment) and screenshot
  each expression.

## F4 — Scene dressing: hub posters, iris, crispness

**4a. Hub world-panel preview art.**
- Bake one low-res per-world preview strip at boot (gradient + silhouette
  skyline + 2-3 glow dots — reuse the backdrop recipes at ~1/4 scale), placed
  behind each world panel's header at low alpha (≈0.35), under the glass.
  Locked worlds: same strip darker + desaturated-looking (bake a dim variant;
  no runtime tint dependence on Canvas).
**4b. Iris wipe everywhere — measured.**
- First MEASURE the maskless iris cost on Canvas (fps sample during a wipe).
  If it holds 40+ on the container: use it for title→hub, hub→level,
  level→hub transitions on BOTH tiers (replacing the plain fades' VISUAL only
  — same durations, same completion events, so beat/campaign kits see
  identical timing). If Canvas can't hold it: WebGL-only iris, Canvas keeps
  fades (log decision).
- The G1 world-tint fades stay for level entry (iris composes with, or
  replaces, per your measured judgment — log it).
**4c. Small-text crispness audit.**
- Sweep FS.mini/label-size text: pixel-snap positions (Math.round on x/y at
  creation), stroke thickness at these sizes (4+ px strokes on 10px text mud —
  reduce to 2-3), and test setResolution(2) on the top-center pill + records
  rows ONLY (measure Canvas fps before/after; revert if it moves >2fps).
- QA: hub screenshots (locked+unlocked), transition captures (iris mid-wipe),
  before/after crops of small text, fps numbers logged.

## F5 — Full gate & promote (Fable)

- Full kit: playtest, w2, audio, vo, tut_sanity, textbox, beat 24-run matrix,
  softlock full suite, campaign 2-clean. Known-flake ledger applies (1-2
  chasm reel, 2-2 fan — re-run singles before judging).
- Canvas fps guardrail A/B vs pre-GFX4 main on 2-2 + 4-3.
- Both-tier contact sheet of every scene (title, hub, settings, pause, level
  per world, clear, epilogue page, walkthroughs, reward).
- Promote dev → main (fast-forward), final report, close decisions.
- NOTE: this round changes menus/HUD look — the walkthrough VIDEOS' menu-free
  in-level footage mostly survives, but the F1 banner/pill and F3 signage DO
  appear in-level. Regenerate the 11 videos at F5 (the pipeline is
  one command per level) so the set stays current.

## Decision appendix (append-only)

- F0-D1: font = Fredoka variable (OFL 1.1), latin subset, single 29 KB woff2,
  staged pre-round at public/fonts/ with license; body text keeps mono as the
  deliberate "KOBI terminal" voice (two-voice type system).
