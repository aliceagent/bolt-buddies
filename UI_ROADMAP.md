# Bolt Buddies — UI Improvement Roadmap

Eleven sprints to take the game's visuals from "programmer art that works" to
"polished neon-lab charm", plus a proper main menu and a playable tutorial.
Each sprint is self-contained, reviewable, and must leave both playtest suites
green (`npm run playtest`, 72 checks).

**Character note:** the security AI is **K.O.B.I. — Keeper Of Building Integrity**
(renamed from SPARK). All new UI copy uses "KOBI"; his acronym appears on the
title screen and may be gagged about in blips (he chose it himself, he is very
proud of it, the K is silent about what it stands for on Tuesdays, etc.).

## Ground rules (apply to every sprint)

1. **All art stays procedural.** Everything is generated in `BootScene` with Graphics
   (or built from `px`-particle effects). No binary assets, no external fonts/CDNs.
2. **Gameplay is frozen.** Physics values, level geometry, entity logic, input, save
   format and scene flow must not change. Purely presentational refactors only.
3. **Playtests are the contract.** `node tools/playtest.mjs` and
   `node tools/playtest_w2.mjs` (dev server on :5173) must pass 42/42 and 30/30.
   The tests poke internals (`window.__BB.scene`, `players`, `doors`, `pedestals`,
   `levers`, `bridges`, `crane`, `rollers`, `wardens`, `jets`, `fans`, `lifts`,
   `pods`, `coresGot`, `keysHeld`, `cpPos`, `complete`) — keep those names/shapes.
4. **60 fps.** No per-frame allocations in `update()` hot paths (no `new Graphics`,
   no `add.text` per frame). Reuse Graphics objects, pool particles, prefer tweens.
5. **Palette discipline.** Colors come from `COLORS` / `WORLD_THEMES` in
   `src/constants.js`. If you need a new color, add a named token.
6. **Verify visually.** Take screenshots (headless chromium at
   `/opt/pw-browsers/chromium`, load `http://localhost:5173/?canvas=1`) of every
   screen you touched into `tools/shots/` before finishing.

## Visual element inventory

| Area | Elements (file) |
|---|---|
| Boot textures | tile, crack, belt, hazard, bridgetile, liftplat, bggrid, robot_b/o, anchor, lever, key, core, door, plate, pedestal, checkpoint, bug, crusher, crane, crane_plate, pod, rail, phasewall, duct, fan, roller, warden, nozzle, reticle, px, icon_* (`src/scenes/BootScene.js`) |
| Title | logo text, subtitle, robot images, Bolt graphic, story text, controls panel, start prompt, footer (`src/scenes/TitleScene.js`) |
| Hub | header, core tally, help line, 4 world panels, 12 chamber nodes + core pips, selection ring, level name, toast, KOBI marquee (`src/scenes/HubScene.js`) |
| HUD | P1/P2 skill labels, level title, core pips, key icon, KOBI blip bar, clear overlay, hint line (`src/scenes/UIScene.js`) |
| Game world | layered bg (flat grid today), terrain runs, cracked tiles, belts, hazards, phase-walls, ducts; doors/exit + EXIT label, bridges, lifts + label, plates, levers, keys, cores, checkpoints, pedestals + item cards, anchors + reticles; bugs, crushers, rollers + vision beams, wardens, steam jets, fans; crane + rail + plates + pods + hpText; rope/beam Graphics, `boom` particle emitter, camera zoom/shake (`src/scenes/GameScene.js`) |
| Players | robot sprites, heavy/tiny scaling, phase transparency, skill badge above head (`src/objects/Player.js`) |

---

## Sprint 1 — Background depth & world theming

**Goal:** the world stops being a flat grid on black; each world gets its own mood.

- Add `WORLD_THEMES` to `src/constants.js`: for worlds 1–4 define `{ accent, accent2,
  bgTop, bgBottom, glow }` (world 1 warm amber/cyan on deep blue; world 2 teal/purple
  on deep green-black; pick tasteful values for 3/4 now so later worlds inherit).
- BootScene: generate `bgGradient` (a 64×720 vertical gradient strip, `bgTop→bgBottom`,
  via `fillGradientStyle`) and `glowBlob` (radial soft blob via concentric
  decreasing-alpha circles, ~256px).
- GameScene `create`: replace the single `bggrid` tileSprite with layers (all behind
  `DEPTH.terrain`): (1) camera-sized gradient tileSprite fixed with
  `setScrollFactor(0)` and tinted per world; (2) far `bggrid` tileSprite at
  `scrollFactor 0.4`, alpha ~0.25; (3) near `bggrid` at `scrollFactor 0.75`, alpha
  ~0.4; (4) 4–6 `glowBlob` images tinted with the world glow color scattered around
  the level at `scrollFactor 0.85`, additive blend, alpha ≤0.2; (5) a slow ambient
  drift of dust-mote particles (one pooled emitter, ≤40 alive, tiny alpha).
  Note: scrollFactor(0) layers are still scaled by camera zoom — size the gradient
  layer generously (e.g. 2× viewport) and center it so zoom-out never shows edges.
- Title & Hub: reuse gradient + motes so menus match the game.
- Acceptance: screenshots of 1-1, 2-2, title, hub show clear depth layering and
  distinct world moods; both playtests green.

## Sprint 2 — Terrain & tile art pass

**Goal:** surfaces read instantly; walkable edges glow; hazards feel dangerous.

- Redraw `tile`: subtle two-tone bevel (lighter top-left edge, darker bottom-right),
  faint inner panel line, corner rivets. Keep it quiet — it tiles everywhere.
- In `buildTerrain`, after each solid run, draw a 3px accent strip along the run's
  top edge (one thin tileSprite/rectangle, world accent color, alpha ~0.5) and a dark
  drop-shadow strip just below the run's bottom edge — top edges pop as walkable.
- `crack`: keep the dark cracked look but add hairline glow inside cracks (world
  accent at low alpha) so kids notice it's special.
- `belt`: chevrons brighter + end rollers (circles at tile edges); keep scroll anim.
- `hazard`: add a pulsing glow — overlay a soft rectangle above the zigzag tinted
  `COLORS.hazard`, tween alpha 0.15↔0.45. One tween per hazard run, not per tile.
- `bridgetile`: holo look — scanline stripes, brighter border; ghost state alpha 0.13
  stays, add slow alpha shimmer tween on ghost tiles.
- `phasewall`: add a second drifting inner pattern (tileSprite with `tilePositionY`
  scrolled in update via a single shared counter) so shimmer visibly flows.
- `duct`: darker interior slot under the lip + tiny fan-slit lines.
- Acceptance: side-by-side screenshots of 1-1 and 2-1 show edge highlights, pulsing
  hazards, flowing shimmer; playtests green.

## Sprint 3 — Robot character art & animation

**Goal:** Beep & Boop feel alive.

- Redraw `robot_b`/`robot_o` with a vertical two-tone body gradient, glossy visor
  (white specular dot), colored rim-light on one side, chunkier treads. Generate a
  matching `_blink` variant (visor eyes closed). Player blinks every 3–5s for 120ms
  (timer per player, swap texture; respect current flip/scale).
- Squash & stretch: on jump start `scaleY*1.12/scaleX*0.9` tween back to normal;
  on landing (existing `land`/impact hooks) squash `scaleY*0.85` 90ms yoyo. IMPORTANT:
  heavy/tiny already rescale the sprite — express squash as a multiplier on a stored
  `baseScale` so skills and squash compose (never hardcode 1.0).
- Walk feel: slight sprite tilt (±4°) toward movement direction, lerped; run dust —
  small puffs at feet while grounded and |vx|>100 (pooled emitter, low frequency).
- Skill dress-up: heavy gets a darker plate tint overlay + the existing scale; phase
  robot gets alpha shimmer + faint afterimage trail while `inPhaseWall`; badge above
  head becomes a small rounded chip (icon on dark pill, skill-colored border).
- Carried pose: carried partner tilts 10° and wiggles slightly.
- Acceptance: screenshot mid-jump + video-substitute burst (3 screenshots over a
  second) showing blink/squash; playtests green (body sizes untouched — visual scale
  tweaks must not touch `body.setSize` or physics scale used by gameplay: apply squash
  via `scaleX/scaleY` multipliers around the skill base scale, restore exactly).

## Sprint 4 — Gadget & device art

**Goal:** every interactive prop looks like a lovingly built lab gadget.

- Pedestal: holo-pillar — column with light beam up from the base, the floating skill
  icon orbited by 2 sparkle particles; item card redesigned as a proper panel
  (rounded rect Graphics behind the text, skill-colored border + title, dark body);
  after equip the card shrinks to a small tag; keep the stagger so cards never overlap.
- Doors: draw a frame (side rails + top light bar). Closed: red lamp; opening: lamp
  flips green + dust puff at floor; exit door keeps green tint plus an "EXIT" light
  panel above with soft glow pulse.
- Lever: bigger handle knob with glow; on flip, tween the stick rotation (swap from
  flipX to a rotation tween on a drawn handle) + spark burst.
- Key: gold with animated glint (small white diagonal streak sweeping every ~2s).
- Core: rotating slowly + orbiting sparkle + soft glow blob behind (additive, small);
  keep bobbing tween.
- Checkpoint: lamp housing; inactive = dim grey, active = green lamp + expanding ring
  burst on activation + short light-cone fan below the lamp.
- Plate: LED strip across the top face that lights (accent color) when active.
- Anchor: keep rotating ring, add inner slow pulse + faint radius hint circle when a
  grapple player's reticle targets it.
- Lift: engine glow strip underneath when moving; replace the "needs N weight" text
  with icon pips (N small robot silhouettes that light up as weight accumulates —
  reuse `icon_heavy`-style mini shapes); keep `lifts[i].label` object existing (tests
  don't check it, but keep a `label` property to be safe — it may be the pip container).
- Acceptance: screenshots of the 1-1 start (pedestals+gate), key door area, lift, a
  checkpoint before/after activation; playtests green.

## Sprint 5 — Enemy & crane boss visuals

**Goal:** enemies are characterful, threats are readable.

- Scuttlebug: leg wiggle (tween a tiny y-offset or 2-frame texture swap), shell
  sheen highlight, eyes glow brighter when a player is within ~200px; squish keeps
  purple pop but add shell-shard particles.
- Roller: pupil slides toward patrol direction; wheels get spoke dots (drawn) —
  rotate wheel sprites or fake with texture offset; beam becomes a gradient wedge
  (bright at eye, fading out) — draw with 3 stacked alpha rects if needed; alert
  state: red flash + a small "!" popup above (pooled text/image, not per-frame).
- Warden: idle sway (±2° tween), visor glow; shove adds an impact star at contact;
  defeat keeps the comic topple + add dizzy-stars circling the fallen body for 1s.
- Crane: draw a trolley clamped to the rail with a cable line down to the body
  (redraw a 1-segment cable in the existing update — it may use a shared Graphics);
  plates pulse magenta while yankable (`rest` state); telegraph projects a warning
  stripe zone on the floor under the crane (alpha stripes rect); slam impact ring +
  dust; pods get concentric pulse rings; defeat: grey-out + smoke puffs + sparks
  (existing tween stays).
- Acceptance: screenshots of bug yard (1-2), roller yard with beam (2-1), warden
  (2-3), crane mid-fight + telegraph (1-3); playtests green (keep `crane.state`
  machine, `plates[].attached`, `rollers[].state`, `wardens[].defeated` semantics).

## Sprint 6 — HUD redesign (UIScene)

**Goal:** the HUD looks designed, not typed.

- Top bar: two rounded translucent panels (left P1, right P2) each holding the skill
  icon chip + player name + key hint, border in player color; center plate for
  "1-2 · THE CRUSHER LINE" with world accent underline.
- Core pips: hexagon pips in a small tray under the level plate; when a core is
  collected the pip pops (scale tween) and fills; key chip appears beside with count.
- KOBI blip bar: add a drawn KOBI avatar (round eye with red iris) at the left,
  a "KOBI" name tag, magenta border glow pulse while typing; keep the typewriter +
  queue behavior and the existing `bb:*` event names.
- Bottom hints: restyle "ESC map · R restart" as small key-cap chips (rounded rect +
  letter) in the corner, subtle.
- Exit feedback: replace GameScene's `EXIT`/"WAITING FOR BUDDY..." label with a
  cleaner floating bubble above the door: icon of the missing buddy + pulsing arrow
  when one player waits (still driven by the same logic — keep `exitLabel` non-null,
  it may be the container).
- Acceptance: screenshots of HUD in 1-1 (no skills), after equips, with a blip
  showing, and exit-waiting state; playtests green (UIScene listens to the same
  events; do not rename `bb:skill/cores/keys/blip/complete/toast`).

## Sprint 7 — Main menu & hub map glow-up

**Goal:** first impressions — and a real menu with Continue and Tutorial.

**Main menu (TitleScene becomes a menu):**
- Keep the neon logo treatment — layered glow copies behind the text, a flicker-on
  animation on load (letters blink in over ~1s), slow hue shimmer on the subtitle;
  robots + Bolt keep their idle animations and gain a floor shadow ellipse; add a
  tiny KOBI eye peeking from a corner that blinks occasionally (cute, not scary),
  and a small "K.O.B.I. — Keeper Of Building Integrity" caption gag near it.
- Replace "press E or L to start" with a **vertical button stack**, keyboard-driven
  (W/S or ↑/↓ to move, SPACE/E/L/Enter to select — either player can drive):
  1. **CONTINUE** — shown only when a save exists (`loadSave().unlocked > 1` or any
     cores collected); goes to the Hub. When present it is the default selection.
  2. **NEW GAME** — always present. If a save exists, selecting it swaps the label
     to "erase everything? press again!" for 3s (second press wipes the save via
     `storeSave({unlocked:1, cores:{}})` and goes to Hub); if no save, goes straight
     to Hub. Kid-proof: timeout restores the label.
  3. **TUTORIAL** — starts the tutorial chamber (Sprint 10). Until Sprint 10 lands,
     wire it to a KOBI toast: "Orientation is still being MOPPED. Come back soon."
     (Sprint 10 replaces the toast with the real level start.)
- Button style: rounded panels with world-1 accent border; selected button glows,
  scales 1.05, and gets a chevron; unselected dim. Controls card shrinks to a
  compact two-column footer (full teaching lives in the Tutorial).
- Selection state must be reachable by playtests: expose the menu API as
  `window.__BB.menu = { items: [...], select(i), activate() }` from TitleScene.
- IMPORTANT test compatibility: `tools/playtest.mjs` presses E on the title and
  expects to reach the Hub. Ensure the default selection with a fresh save (NEW
  GAME, no save present) activates on the FIRST SPACE/E/L/Enter press and lands in Hub.

**Hub glow-up:**
- Draw corridor connection lines between consecutive chamber nodes (lit for
  unlocked segments, dark for locked); world panels get an accent-colored header
  bar + big emoji badge; nodes: completed chambers get a small checkmark and lit
  ring, current selection gets an animated double-ring + slight scale pulse; core
  pips under nodes brighten; entering a level plays a quick fade transition;
  marquee becomes a scrolling ticker with a small KOBI eye prefix; add a footer
  hint "ESC — main menu".
- Acceptance: menu screenshots (fresh save: NEW GAME default + TUTORIAL visible;
  seeded save: CONTINUE default), hub screenshots fresh + progressed; both
  playtests green.

## Sprint 8 — Game-feel FX

**Goal:** every action has juice.

- Grapple: rope rendered with a slight catenary sag (quadratic curve via
  `Graphics.lineBetween` segments or `strokePoints`), small hook head at the target
  end, brief speed-line particles while zipping; reel gets the same rope + pull dust.
- Stomp: expanding shockwave ring (scale+fade a ring texture), floor dust burst,
  brief zoom-punch (camera zoom +0.03 for 80ms — implement as a additive offset the
  camera code respects, do NOT fight `updateCamera`'s lerp: add a `zoomKick` value
  consumed/decayed inside `updateCamera`).
- Core collect: radial star burst + a star that flies to the HUD pip (emit a
  `bb:coreFly` event with world→screen coords; UIScene animates a star into the pip,
  then pops the pip).
- Death/respawn: death keeps the boom + adds a few bolt/gear particles; respawn gets
  a beam-in column (vertical light rect scaling down) + materialize blink.
- Doors: dust jets when opening; levers: spark burst on pull; throws: small poof at
  release + landing dust for the thrown buddy.
- Steam jets: soft-edge gradient plume + drip particles at the nozzle; fans keep
  puffs but add a wobble of the column alpha; phase-wall enter/exit: a brief ripple
  ring at the crossing point.
- All emitters pooled and created in `create()`; nothing allocated per frame.
- Acceptance: burst screenshots during zip, stomp, core collect, respawn; playtests
  green; a 5-second FPS probe via evaluate (`game.loop.actualFps`) stays ≥55 in 1-3.

## Sprint 9 — Transitions, intro cards & clear overlay

**Goal:** moving between screens feels intentional.

- Add fade transitions: `cameras.main.fadeOut/fadeIn` (250ms) on every scene change
  (title→hub, hub→game, game→hub, restart). Ensure input during fade doesn't
  double-trigger (guard flags).
- Level intro card: on GameScene start, a world-accent banner slides in over the
  top third: "CHAMBER 1-2 — THE CRUSHER LINE" + skill pair subtitle, holds ~1.6s,
  slides out; KOBI's start blip fires after the banner leaves (delay the existing
  `bb:blip` call).
- Chamber-clear overlay redesign: dark iris-in, panel with world accent border,
  "CHAMBER CLEAR!" headline with pop animation, cores reveal one-by-one (pop +
  chime via existing sfx.core), uncollected slots shown dim with "?", a "progress
  saved" tag, pulsing continue prompt. Keep keyboard continue behavior + event names.
- Hub: after returning from a clear, the newly unlocked node plays an unlock
  animation (ring burst + lock fade).
- Acceptance: screenshots of intro banner, clear overlay, hub unlock moment;
  playtests green — NOTE the playtests wait ~600-1000ms after scene switches; keep
  fades ≤300ms and never block input longer than that, and keep `complete` set at
  the same moment as today (before the overlay animation).
- If a fade/banner would break a test's timing, prefer shortening the animation.

## Sprint 10 — Tutorial chamber: "Orientation Day"

**Goal:** a playable, KOBI-narrated tutorial reachable from the menu's TUTORIAL
button. Teaches every shared mechanic in ~3–4 minutes, ends back at the menu.
This is the one sprint that adds content, not just polish — but it must reuse the
existing engine (grid chars, entity types, blips) with only two small additions.

**Engine additions (keep them this small):**
1. `trigger` entity: `{ t:'trigger', x, y, w, h, blip?, glyphs?, once:true }` —
   a rectangle in tile coords; when any player enters: fire its KOBI blip (via the
   existing `bb:blip` event) and/or reveal a floating key-glyph cluster at a world
   position. One-shot. Implement in GameScene: array `this.triggers`, checked in
   the per-player update loop (cheap AABB, skip when fired).
2. Key-glyph prompts: BootScene texture `keycap` (36px rounded key-cap); GameScene
   helper `addGlyphs(x, y, caps)` where caps is e.g.
   `[{k:'A'},{k:'D'},{gap:8},{k:'←'},{k:'→'}]` — renders key-cap images + letter
   texts into a container that gently bobs; used by triggers and placed statically
   in the tutorial level def. P1 caps tinted beep-blue, P2 caps boop-orange.
3. Tutorial completion: when `def.tutorial === true`, `finishLevel()` must NOT call
   `completeLevel()` (no unlock changes) and the clear overlay says
   "ORIENTATION COMPLETE!" with continue returning to the **Title** menu, not Hub.

**Level def** (`src/levels/tutorial.js`, appended to LEVELS with `tutorial:true,
hidden:true`; HubScene must skip `hidden` defs when laying out nodes — keep the
12 hub nodes exactly as they are; the menu starts it via
`scene.start("Game", { levelIndex: LEVELS.findIndex(l => l.tutorial) })`).

Layout (56×18, flat and friendly, checkpoint before every station):
1. **Station 1 — Move & Jump (x0–12):** spawn both robots; glyphs above spawn:
   P1 `A D` + `W`, P2 `← →` + `↑`. A 2-tile step and a 3-tile gap to hop.
   KOBI (on entry): "Welcome to MANDATORY orientation. I am K.O.B.I. — Keeper Of
   Building Integrity. The building's integrity is currently: annoyed."
2. **Station 2 — Hazards & respawn (x13–20):** a short electric strip `^` with a
   generous platform over it; checkpoint right before. KOBI: "Touch the sparky
   floor and we simply rebuild you at the last checkpoint. It is PAINLESS.
   Mostly. It is MOSTLY painless."
3. **Station 3 — Action & pedestals (x21–28):** two pedestals (grapple + heavy)
   with the standard item cards; a `skills` gate exactly like real levels.
   Trigger blip explains: walk up, press your ACTION key (SPACE / L) to equip.
4. **Station 4 — Use your gadget (x29–40):** split mini-course mirroring 1-1:
   an anchor over a 5-tile gap for the grapple robot, and a cracked floor pocket
   (with a lever inside) for the heavy robot's stomp; the lever lowers a bridge
   over the gap so BOTH can cross (teaches "your gadget helps your buddy").
   Glyphs: `E`/`L` near the anchor sightline and above the cracked tiles.
5. **Station 5 — Carry & throw (x41–47):** a 4-tile-high ledge with a data-core
   on it (tutorial core is just for joy — not saved); glyphs show ACTION near
   buddy = pick up, ACTION again = throw, hold JUMP while throwing = high toss.
   KOBI: "Robot stacking is FORBIDDEN. ...Oh, you already did it. Fine."
6. **Station 6 — Plates & teamwork (x48–52):** a weight-2 pressure plate holding
   a door open — one robot stands, the other walks through, then the door-holder
   is let out via a lever on the far side (mini "you first, then me" lesson).
7. **Exit (x53–55):** standard exit door, open from the start of station 7;
   teaches "BOTH robots must walk through — no one left behind" via trigger blip
   when the first robot enters alone. On complete: "ORIENTATION COMPLETE!"
   overlay; KOBI: "You pass. Statistically improbable. Now GET OUT of my lobby."

**Copy tone:** KOBI is reluctant, dramatic, secretly delighted someone is
listening to his safety briefing. Keep every blip ≤ 120 chars so the typewriter
stays snappy.

**Testing:** extend `tools/playtest_w2.mjs` (or add `tools/playtest_tut.mjs` and
wire it into `npm run playtest`) with ~8 checks: tutorial loads from the menu
button, glyph containers exist, hazard respawn works, pedestals equip, bridge
lever opens, throw reaches the ledge, both-exit completes, completion does NOT
change `unlocked`, and continue returns to Title.
- Acceptance: screenshots of each station + the completion overlay; all suites
  green including the new tutorial checks.

## Sprint 11 — Consistency audit & final polish

**Goal:** one coherent visual language, verified everywhere.

- Typography: hoist the `FONT` constant into `src/constants.js` (export) and use it
  everywhere; define size tokens (e.g. `FS.h1/h2/body/small`) and sweep all
  `add.text` calls onto them; consistent letter-spacing where supported.
- Color sweep: grep for hex literals outside constants; move recurring ones into
  `COLORS`/`WORLD_THEMES`; ensure world accents are used consistently (terrain
  strips, HUD underline, hub headers, intro banners).
- Depth audit: verify DEPTH ordering (cards over entities, blips over everything,
  reticles under HUD…); fix any overlap bugs found (screenshot every level start to
  check card/HUD collisions).
- Perf audit: confirm no Graphics leak (rope/beam/jets cleared each frame), destroy
  timers/tweens on scene shutdown, `actualFps ≥ 55` probe in 1-3 and 2-2.
- Gallery: capture a full screenshot set — title, hub (fresh + progressed), all six
  levels at start + one mid-action shot each — into `tools/shots/gallery/`.
- Fix every visual defect found during the audit (list them in the final report).
- Acceptance: gallery reviewed, both playtests green, README "Current state" gains a
  one-line note about the UI polish pass.
