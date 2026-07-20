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
- F1-D1: type system shipped. index.html carries the @font-face (Fredoka,
  /fonts/fredoka-latin.woff2, weight 600 700, display swap). main.js wraps the
  whole boot in `boot()` and calls `warmDisplayFont().finally(boot)` — a
  best-effort `document.fonts.load('700 32px Fredoka')` raced against a 1500ms
  timeout, swallowing any error; the game boots regardless (verified: woff2
  route-blocked → Title boots in ~1.6s, mono fallback, zero page errors).
  constants.js keeps FONT and adds FONT_DISPLAY = '"Fredoka","Courier New",
  monospace'. Weight per site: bold(700) on headers/buttons, "600" on the two
  subtitle/eyebrow captions.
- F1-D2: FONT_DISPLAY switched at these HEADING/BUTTON sites (file:line):
  TitleScene.js:242 subtitle, :456 menu button labels. HubScene.js:49 map
  title, :93 world-panel titles, :165 level-name footer. SettingsScene.js:55
  SETTINGS header, :59 "AUDIO & COMFORT" eyebrow, :73 row labels.
  PauseScene.js:48 PAUSED header, :61 menu items. MuteScene.js:60 "AUDIO"
  title, :68 row labels. GameScene.js:817 intro-banner level title (`head`).
  UIScene.js:141 clear-overlay winTitle. WalkthroughScene.js:39 scene header,
  :214 grid-card CHAMBER titles. RewardScene.js:468 MEDAL CEREMONY eyebrow,
  :471 medal title, :537 THE FAMILY ALBUM, :603 WING N, :635 THE NUMBERS,
  :711/:714 share-card WE BEAT / BOLT BUDDIES! headline.
- F1-D3: deliberately LEFT MONO (R9 mono-forever + not-a-heading), with reason:
  the drawn "BOLT BUDDIES" title wordmark (custom-drawn, untouched); Title
  chevron glyph + "new!" pip + story prose + P1/P2 legend + KOBI corner caption;
  intro-banner skill-pair subline (SKILL names, in-world voice); UIScene blip
  bar, gadget/skill cards, "X = ACTION" chips, key-caps, stats row, and the KOBI
  grade line (spec: grade stays mono); Settings/Mute value readouts (bars use
  █/░ box glyphs — mono alignment is load-bearing); Hub node ids, "SIGNAL LOST",
  skills subtext, DATA-CORES counter, help line, KOBI bark; Walkthrough subtitle,
  "◀ TITLE" button, per-card level NAME, "NO SIGNAL" error; Reward engravings,
  facts, stats lines, sticky-notes, tagline, footer, stamp, crayon caption, and
  all credits (credits are R9 mono-forever).
- F1-D4: EpilogueScene switched NOTHING. Its 7 storybook pages are drawn scenes
  whose only text is the caption plate (story PROSE — mono by spec) + speaker
  tag + hint; the only large-title text in the scene is the credits roll
  (R9 mono-forever) and in-world signs ("NIGHT-LIGHT ON DUTY"). There is no
  distinct "page-title" text object to switch, so the plan's "Epilogue page
  TITLES" line has no applicable call site — logged rather than forcing a switch
  onto prose/credits.
- F1-D5: fit discipline (R9) — NO new fontSize changes were needed. Fredoka is
  wider than Courier but every switched string clears its panel at 1280x720
  (screenshot-verified, both tiers). The clear-overlay winTitle already had a
  per-variant size (tutorial "ORIENTATION COMPLETE!" 38px, others 44px,
  UIScene.js:275); the widest tutorial title fits the 620px panel comfortably in
  Fredoka, so that pre-existing sizing was kept untouched. Auto-sizing panels
  (intro banner `bw`) grow to the wider head as designed; no test-probed
  geometry was resized. QA: playtest 42/42, playtest_audio 29/29, tut_sanity
  21/21; both-tier shots at tools/shots/gfx4/f1-*.png; zero page errors.
- F1-D6 (QA): "missing wordmark letters" in QA shots investigated to root cause —
  NOT an F1 regression (pre-F1 baseline reproduces identically). The container's
  SwiftShader WebGL runs the Title in slow motion (fps decays ~36→7), stretching
  the flicker-on timers; letters converge lit by ~8s wall time, and the Canvas
  tier lights 0-dark on schedule. Hardened anyway (QA follow-up commit): flicker
  tweens settle on complete AND stop, plus absolute relight backstops — the
  wordmark now self-heals from any skipped tween callback.
- F2-D1: loading splash (2a) shipped — a CSS-only `#bb-splash` in index.html
  (dark #070b14 bg, "BOLT BUDDIES" wordmark in Fredoka doubling as the font
  warm-up, "a 2-player rescue mission" mono sub, and a pulsing KOBI eye built
  from nested radial-gradients + a `bb-eye-pulse` keyframe on scale/glow; NO JS
  anim, NO images, `prefers-reduced-motion` respected — R2). REMOVAL MECHANISM
  (main.js:36 removeSplash, :100 attachTitleSplashHook): faded out over 250ms and
  removed on the TITLE SCENE'S CREATE event (`title.sys.events.once("create",…)`,
  with an isActive("Title") short-circuit for hot reloads), after a 300ms MINIMUM
  display so a fast load never flashes. removeSplash() is idempotent and reached
  UNCONDITIONALLY on every failure mode: window `error` + `unhandledrejection`
  listeners, an explicit try/catch around the boot() call in the warmDisplayFont
  `.finally`, and a 6000ms hard backstop timeout — a stranded splash over a black
  game is the worst outcome, so it always clears. The game boot never waits on
  the splash (removal only runs after Title renders). Verified: splash present in
  Fredoka during load, absent (DOM-gone) after Title, both tiers, zero page
  errors.
- F2-D2: themed cursor (2b) shipped — a hand-baked 22x22 teal-arrow PNG (dark
  rounded outline, Lumen palette) stored as a data-URI constant in
  src/ui/cursor.js (CURSOR_URI, 1398 chars; CURSOR_HOTSPOT "4 2"). It was baked
  ONCE at build time by the throwaway tools/_gen_cursor.mjs (Playwright draws the
  arrow to a <canvas>, dumps toDataURL) and hard-coded — ZERO runtime texture
  work. Applied once at boot via
  `this.input.setDefaultCursor("url("+CURSOR_URI+") 4 2, auto")`
  (BootScene.js:1724). HOVER-STATE DECISION: Phaser hard-codes the `useHandCursor`
  hover cursor to the CSS keyword 'pointer' and exposes NO global override for the
  pointer/hover state (only setDefaultCursor for the idle state). Per the plan's
  fallback ("else leave hand cursor as-is and log the decision — do not hack
  per-widget"), interactive widgets keep the OS hand on hover; the themed arrow is
  the resting cursor everywhere else. Verified: the live canvas `style.cursor`
  contains the data-URI + "4 2" hotspot; the URI decodes to the art at
  tools/shots/gfx4/f2-cursor.png.
- F2-D3: HUD gadget icons (2c) — the P1/P2 panels ALREADY show the equipped
  gadget's baked skill-icon chip (icon_grapple/heavy/phase/tiny) beside the name:
  buildPlayerPanel bakes a 30px recessed chip with a "?" placeholder, and the
  `bb:skill` handler (UIScene.js:203 — the exact event that updates the name text,
  emitted by GameScene.js:2578) already does
  `info.icon.setTexture(tex).setVisible(true); info.qmark.setVisible(false)`. This
  predates GFX4 (UI Sprint 6 + GFX2 V5/V6 icons); the plan's "TEXT only" verified
  fact was stale. Confirmed working both tiers via a live equip (icon shows on
  equip; "no gadget yet" state unchanged) — so 2c needed NO code change, only
  verification. Logged rather than duplicating the chip.
- F2-D4: collision 1 — intro banner vs top-center level pill (2d). The UIScene
  pill (glass bg + text + accent underline) is grouped into `this.levelPillParts`
  (UIScene.js:78) and faded via a 200ms tween on a new `introbanner` handler
  (UIScene.js:337) bound to `bb:introbanner`. GameScene emits it TRUE when the
  banner is built (GameScene.js:861) and FALSE from the banner's single guarded
  finish() (GameScene.js:876) — so BOTH the normal slide-out AND the any-key skip
  restore the pill through the SAME existing lifecycle (no new timers; T3 banner-
  skip contract untouched). Because UIScene.create runs AFTER GameScene.create
  (the TRUE emit is missed), UIScene ALSO self-seeds: if the banner is still up at
  create it starts the pill hidden (UIScene.js:349) — belt AND suspenders.
  Verified: pill alpha→0 while banner up, →1 after finish/skip, both tiers.
- F2-D5: collision 2 — spawn stack (2d). Root cause: the P2 action-hint chip,
  raised 34px by the `- idx*34` stagger, rode up into the lowest gadget card at
  spawn (1-2 reference shot). Fix: (a) a shared `_actionHintYoff(idx)=54+idx*34`
  helper (GameScene.js:903) replacing the four inline `p.y - 64 - idx*34` chip-
  placement sites (create + 3 per-frame/coach followers) — lowers the whole hint
  by 10px while KEEPING the 34px stagger so the two chips never overlap each other
  during a carry; (b) card base lifted `-150`→`-162` (GameScene.js:1475). Result
  is a clean top-down column at 1280x720 — HEAVYWEIGHT card → GRAPPLING HOOK card
  → L=ACTION chip → SPACE=ACTION chip, no overlap — with the topmost card still
  tucked under the banner rest position. T2 card minimize/expand + card contents
  unchanged (only the base Y moved). Verified on 1-1 and 1-2, canvas tier.
- F2-D6 (QA): full-round verification — playtest 42/42, playtest_textbox 13/13,
  both green; zero page errors across splash/cursor/HUD/collision runs. The one
  non-fatal console line ("Failed to load resource: 404") is the pre-existing
  favicon.ico request (no <link rel=icon> in index.html; present on main, not an
  F2 regression, and not a pageerror). Splash/cursor are DOM/CSS only (no renderer
  coupling); UIScene/GameScene changes are visual-only (blip-bar/stuck/banner-skip
  contracts untouched, no per-frame allocation — the hint helper is a scalar
  return). Shots at tools/shots/gfx4/f2-*.png.
- F3-D1: KOBI portrait 2.0 (3a) shipped. BootScene bakes a 6-texture family ONCE
  (R3/R4) in KOBI's pink/magenta language: kobi_face_neutral / _smug / _alarmed /
  _defeated / _glee (each 48x48 — a round housing socket + magenta ring-glow, a
  glassy sclera with mood-shaped lids, a magenta iris, a tiny baked rest-mouth) and
  a SINGLE kobi_mouth (18x14) open-mouth overlay that composes over ANY expression
  (fewer textures per spec). INTEGRATION (key decision): rather than rip out the
  P9/A11 avatar machinery (avBase/avRing/avIris/avLid/avSquint/avFlare/avBlink +
  kobiMood/irisPos + their tweens + snap_p2_p9/a11 probes), the baked portrait Image
  (UIScene.buildBlipBar, `this.avPortrait` at the socket centre ax,ay) rides ON TOP
  of that (now-occluded) stack inside `avatarGroup` — so the PORTRAIT is what the
  player sees while every existing mood/geometry contract + probe stays byte-
  identical (P9 4/4 + A11 all-pass reconfirmed). Portrait swap is a pure texture
  swap in applyKobiMood (`this.avPortrait.setTexture(kobiFace(mood))`). The mouth
  overlay `this.avMouth` sits at (ax, ay+11) over the baked rest-mouth. Both were
  added to avatarGroup so the T1 slim-bar `avatarGroup.y` shift moves them too; bar
  geometry/hold/queue/skip/slim contracts all untouched.
- F3-D2: mood→expression map (UIScene KOBI_FACE) — catalogued from EVERY mood that
  flows through the bb:blip queue (barks.js emits tagless→queue default "gloating";
  GameScene emits + level4_3 + the queue default at UIScene.js `item.mood ||
  "gloating"`): the full set is gloating, angry, scared, happy, defeated. Mapping:
  gloating→smug, angry→alarmed, scared→alarmed, happy→glee, defeated→defeated; any
  unknown/absent tag → neutral (`kobiFace()` fallback). The queue's existing
  `|| "gloating"` default is UNCHANGED (contract), so tagless/bark lines show the
  smug face. Verified through the real pipeline: all 6 mappings correct on screen.
- F3-D3: mouth-flutter integration point = UIScene.js update()'s typewriter branch
  (`if (b.shown < b.text.length)`, ~UIScene.js:907) — it piggybacks the SAME typing
  step: `b._mouthAcc += delta; if (b._mouthAcc >= 120) { b._mouthAcc -= 120;
  this.avMouth.setVisible(!visible); }`. No new timer/loop/alloc (R3): the counter
  lives on the active-blip object and only advances while that branch runs (i.e.
  while typing). The else (typing-done) branch settles `avMouth` hidden, and a fresh
  blip hides it at start — so the mouth is closed the instant typing ends by ANY
  path (natural finish, auto-hold, or ENTER skip-to-full). Verified: mouth open
  mid-type, closed after typing end AND after ENTER-skip, for every mood.
- F3-D4: in-world signage (3b) — the door id plate ("GATE"/"DOOR" etc.,
  GameScene.js door-build) is restyled as a small lab sign: a glassPanel pill base
  (world-accent border, glow:false), the mono label (R9 — in-world text stays mono,
  FONT + setResolution(2) kept), a tiny world-accent icon dot (halo+core+catchlight),
  and a WebGL-ONLY additive edge-glow graphics gated behind isWebGL(this) — so on
  Canvas NOTHING WebGL-only is even created (probed: Canvas sign container has 2
  children [pill,text]; WebGL has 3 [glow,pill,text]) and the base sign is fully
  readable both tiers (R1). The plate+text (formerly TWO separate proxLabels) are
  now ONE container registered via addProxLabel(sign, cx, ply); T3 (D11) recede is
  byte-identical — container.alpha lerps on the SAME 150ms cadence toward the SAME
  targets. Probed both tiers: robot NEAR → alpha 1.0000, robot FAR → 0.3500 (exact
  T3 constants: 1.0 within 288px, 0.35 beyond 480px). Right edge (prx) + centre
  (ply) unchanged so the tag still clears the leaf/rail.
- F3-D5 (QA): full F3 verification — playtest 42/42, playtest_textbox 13/13 (the
  critical T1 skip/queue/hold suite), snap_gfx4_f3 30/30, plus snap_p2_p9 + a11
  reconfirmed no-regression; zero page errors everywhere (only the pre-existing
  favicon 404 console line, per F2-D6). Shots at tools/shots/gfx4/f3-kobi-<mood>{,-settled}.png
  and f3-sign-{far,near}-{canvas,webgl}.png. New QA script tools/snap_gfx4_f3.mjs
  (tools/ originals untouched — R6).
- F4-D1: hub world-panel PREVIEW art (4a) shipped. BootScene bakes 8 textures ONCE
  (R3/R4) in the backdrop drawing language at ~1/4 scale: worldPreview1..4 (LIT) +
  worldPreviewDim1..4 (DIM) — each 280x110 (== panel-interior aspect). Recipe per
  world: a stepped vertical world gradient (theme.bgTop->bgBottom, de-banded with
  the shared ditherRect speckle) + a deterministic seeded silhouette skyline along
  the bottom (accent-darkened) + 3 soft accent/accent2 glow dots (window/antenna
  lights, baked via layered alpha). The DIM variant is baked DARK+MUTED (each colour
  pulled 60% toward its own luminance then ×0.5) — NOT a runtime tint (Canvas can't
  tint; R1). PLACEMENT (HubScene panel loop): the strip Image is added BEFORE the
  panel Graphics `g` (so the glass renders OVER it), inset by the panel radius (12px)
  so its square corners stay under the rounded glass fill (no corner poke-out),
  displaySize (panelW-24 x panelH-24 = 536x211), alpha 0.42; LIT variant for online
  wings, baked DIM variant for sealed wings. To make the poster READ THROUGH the
  glass, the online-panel glass fill was dialled 0.85->0.66 (now genuinely frosted)
  and the sealed-panel body dark 0.5->0.34; the glass treatment (sheen/lip/border/
  glow/header bar) still reads over the poster. Panel geometry, node layout, and
  selection behaviour are unchanged. Verified both tiers: strips visible, locked
  wings dim (tools/shots/gfx4/f4-hub-panels-{canvas,webgl}.png).
- F4-D2: iris cost MEASURED on Canvas (tools/qa_f4_iris.mjs — a SUSTAINED 2.5s
  oscillating drawIris redraw = worst case, far heavier than a real 250ms wipe).
  Numbers (avg fps, ?canvas=1): Hub baseline 58.9 -> iris 59.6 (min 59.3); 2-2
  (heaviest W2 level) baseline 43.9 -> iris 41.9 (min 41.0). Both hold >=40fps
  average AND minimum — the gate is MET. DECISION: widen the iris to BOTH tiers for
  all three transitions.
- F4-D3: iris ROUTING (4b) — every transition below is VISUAL-only: SAME 250ms
  duration and the SAME scene.start hand-off as the fade it replaces (fired on the
  iris close's onComplete), so beat/campaign kits (which poll scene.isActive / read
  the `complete` flag — neither depends on camerafadeoutcomplete) observe identical
  timing. * title->hub (TitleScene.gotoHub): iris CLOSE on screen centre -> Hub.
  * hub->level (HubScene.enter): iris CLOSE on the selected node, drawn with
  fill = the TARGET world's `fade` tint (drawIris gained an optional `fill`), so the
  GFX3 G1 world-tint is PRESERVED on level entry — the iris closes to the world tint
  and the Game scene's own world-tinted fadeIn opens from that same colour
  ("iris-in-tinted", the logged judgment). * level->hub CLEAR (UIScene.
  continueFromClear -> irisCloseToDoor): the WebGL-only gate REMOVED so the
  close-on-exit-door iris now runs BOTH tiers (drawn in UIScene, which renders above
  Game, so it covers the HUD). * Hub ARRIVAL: irisOpenFromNode now runs on EVERY hub
  entry (both tiers), replacing the plain fadeIn. All iris durations are 250ms (==
  the fades) so Canvas-observable timing is UNCHANGED from pre-F4; the only durations
  that changed are the pre-existing WebGL iris close/open (300->250ms, visual-only,
  no kit observes it). SECONDARY level->hub ABORT paths (GameScene.doExit ESC×2,
  PauseScene.exitToMap) keep their existing OUT behaviour (doExit 250ms navy fade,
  exitToMap instant) and now land on the iris-opening hub — logged rather than
  converting those user-abort paths. CLEANUP MECHANISM: new kit.js `runIris(scene,
  {cx,cy,from,to,duration,ease,fill,onComplete})` creates the overlay Graphics PER
  TRANSITION, redraws the ring each frame (accepted transient cost, matches the old
  hub iris — R3), and DESTROYS it on the tween's onComplete (before the scene.start
  hand-off, same frame — no flash); it ALSO registers scene `shutdown`+`destroy`
  hooks that kill the tween and destroy the overlay, so a mid-wipe death / scene
  swap can never strand a black overlay. Mid-wipe capture: f4-iris-mid.png.
- F4-D4: small-text crispness audit (4c). (1) PIXEL-SNAP (Math.round on fractional
  creation x): kit.js chipRow FS.mini menu-footer caption (mid); UIScene.buildHints
  FS.mini ESC/R/P hint row (both key + label x, which accumulate fractional label
  widths); HubScene.drawClockChip records-row time x (x0+22). (2) STROKE reduction:
  audited every strokeThickness/setStroke site — the ONLY stroked text is the Title
  wordmark (84px hero), Walkthrough header (h2) and Settings header (h1); NO FS.mini/
  FS.tiny (<=11px) site carries a stroke, so there is nothing to thin — NO-OP,
  logged. (3) setResolution(2) TRIAL on the top-center level pill (UIScene.plateText,
  its position already integer) + the hub records row (HubScene clock-chip text).
  MEASURED Canvas fps cost of the pill's setResolution via an interleaved on-page A/B
  on 2-2 (tools/qa_f4_setres.mjs): res=2 avg 38.42 vs res=1 avg 37.40 -> cost
  -1.02fps (within noise, well under the 2fps gate) — KEPT. Shipped pill width = 235
  (== the res-2 metrics the glass bg is sized against; no overflow, R9 fit preserved).
  The hub records row is hub-only text (zero level-fps impact) — kept. Per the spec,
  text inside the blip bar, stuck prompts, and item cards was NOT touched. Crops:
  f4-crisp-{before,after}.png.
- F4-D5 (build verify): playtest 42/42, playtest_w2 30/30 (hub transitions
  exercised), tut_sanity 21/21, beat 1-1 matrix 2/2 GREEN (both assignments; SL2/SL3
  peak 0) — transition timing unchanged for the driver. Zero page errors across all
  F4 captures. New QA scripts tools/qa_f4_{iris,setres,shots}.mjs (tools/ originals
  untouched — R6).
