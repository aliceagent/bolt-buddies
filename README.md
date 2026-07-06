# Bolt Buddies 🤖🤖🐶

**A 2-player couch co-op puzzle platformer.** Two little lab robots — **Beep** (P1, blue) and **Boop** (P2, orange) — chase through a neon robotics facility to rescue their robo-puppy **Bolt**, who was carried off by **K.O.B.I.** — *Keeper Of Building Integrity* — the lab's glitchy, comically overdramatic security AI.

Built with **Phaser 3 + Vite**, plain JavaScript, zero asset files (all art is generated at boot, all sound is WebAudio blips). Deploys as a static site.

The full design document lives in [`GAME_DESIGN.md`](./GAME_DESIGN.md).

## Controls (one keyboard, two players)

|            | Move  | Jump | Action |
| ---------- | ----- | ---- | ------ |
| **P1 Beep** | A / D | W    | SPACE (E also works) |
| **P2 Boop** | ← / → | ↑    | L      |

The **Action** button is context-sensitive: equip a pedestal gadget, fire your skill (zip / stomp), pull a lever, or — next to your buddy — pick them up and throw them. Hold **jump** while throwing for a high toss.

## Gamepad support 🎮

Plug in one or two controllers for comfy couch co-op — **pad 1 drives P1 Beep, pad 2 drives P2 Boop**. Gamepads are fully additive: the keyboard keeps working exactly as above, and you can mix a pad and the keyboard freely.

|          | Move | Jump | Action | Down chord | Pause |
| -------- | ---- | ---- | ------ | ---------- | ----- |
| Each pad | Left stick / D-pad | **A** (cross) | **X** (square) | Stick / D-pad down | **Start** |

- **Menus** (Title, Hub, Settings, Pause) are navigable with pad 1: D-pad / stick to move the selection, **A** to confirm, **B** to go back.
- The **down chord** (hold *down* + Action) works the same as the keyboard: e.g. grapple's DOWN+Action ropes your buddy; hold **A** (jump) + **X** (action) for the straight-up zip / high toss.
- A small **"P1/P2 controller connected!"** toast pops the first time each pad is seen. Any button also unlocks audio, just like a keypress.

Implementation is a single polling module (`src/pad.js`) that reads the browser Gamepad API and synthesises virtual keys OR-ed into the existing input reads — so with no pad connected the game is byte-for-byte unchanged (the keyboard-only test suites prove it).

## Sound & music

Every screen and level has its own **unique background track** — all of it
synthesised live in WebAudio, zero audio files. A warm title theme, a quiet
map-room groove in the hub, and a distinct chiptune/synthwave piece per level
(bright and bouncy in 1-1, industrial in 1-2, a driving boss groove in 1-3,
sneaky vents in 2-1, and so on), each a long, sectioned composition that never
loops in an obvious 4-bar rut. On top of that, every action, device, enemy and
reward has its own sound effect, positioned in the stereo field by where it
happens on screen and fading with distance from the action.

Controls & options:

- **M** — mute / unmute, from anywhere (a small speaker-off icon shows while
  muted).
- **S** — open the **sound settings** page from the Title or Hub: separate
  **music** and **SFX** volume sliders and a master mute, adjusted with the
  arrow keys, saved to your browser.
- **P** — pause mid-level; the pause menu also has a **Settings** shortcut, and
  the music ducks softly while you're paused.

Mix notes: music sits deliberately under the game (default music volume 0.45),
the master output is capped at 0.8 with a limiter safeguard so nothing clips
even when many sounds fire at once, and repeatable effects are rate-limited so
crowds of enemies never turn into a wall of noise.

## Current state

- ✅ Engine core: 2-player input, physics, shared camera with soft zoom, checkpoints & instant respawn
- ✅ World 1 — Assembly Wing (Grapple + Heavyweight): levels 1-1, 1-2, 1-3 (crane set-piece)
- ✅ World 2 — Maintenance Tunnels (Phase-Walk + Tiny): vents, shimmer-walls & hand-hold escorting, fans, steam jets, Patrol Rollers, Wall-Wardens, throw finale
- ✅ Hub map, hidden data-cores, localStorage save
- ✅ "Orientation Day" tutorial chamber (KOBI-narrated, reachable from the main menu)
- ✅ UI polish pass: one shared typography scale (`FONT`/`FS`) and colour palette (`TEXT`), audited depth ordering, and a consistent world-accent language across HUD, hubs and intro banners
- 🔜 Worlds 3–4, story scenes, polish (see roadmap in the design doc)

## Run locally

Requires Node.js 18+ (20 recommended).

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

Production build / preview:

```bash
npm run build
npm run preview
```

## Deploy to Vercel

The repo works out of the box: framework **Vite**, build `npm run build`, output `dist/`. `vercel.json` is already configured — just import the repo in Vercel or run `vercel`.

## Automated playtest

`npm run playtest` runs the full verification stack in headless Chromium
(requires the dev server on port 5173, or set `BB_URL`):

1. **World 1 mechanics suite** (`tools/playtest.mjs`, 42 checks) — scene flow,
   movement, every W1 gadget/enemy/device interaction.
2. **World 2 mechanics suite** (`tools/playtest_w2.mjs`, 30 checks) — phase
   walls & escort, ducts, rollers, wardens, jets, fans, the throw finale.
   Runs chunked: each level in its own browser (see TESTKIT_ROADMAP.md).
3. **Audio suite** (`tools/playtest_audio.mjs`, 29 checks) — asserts engine
   STATE (not sound): autoplay-safety, per-scene/per-level music, jingles, the
   1-3 tension layer, mute + the 0.8 master ceiling, settings persistence, the
   pause overlay, the SFX rate-limiter, KOBI moods, and the ±0.3 stereo pan.
4. **Tutorial sanity pass** (`tools/tut_sanity.mjs`, 21 checks) — launches
   "Orientation Day" from the TITLE menu's TUTORIAL button with real keys, drives
   both robots through all 7 stations, and confirms hazard respawn, pedestal
   equips, the bridge lever, the throw-to-ledge, the both-robots exit, that the
   run writes NO save, and that continue returns to the Title menu (not the Hub).
5. **Beat matrix** (`tools/beat/runner.mjs`, 12 runs) — plays every level of
   Worlds 1-2 start-to-finish with real keyboard input only, in BOTH role
   assignments, proving each level is beatable like a human would play it.

`npm run test:beat -- 1-3 2-2` runs the beat matrix for a subset of levels.
Failures write artifacts (screenshot + state dump + step log) to
`tools/beat/failures/`.

`npm run test:beat:full` (`runner.mjs --full`) runs the stretch pass: the 12
runs use each level's **100%-core variant** (input-only detours that also
collect all 3 data-cores, asserting `coresGot` all-true before the exit), then
a **chaos smoke** per level — 60s of random input on both key sets asserting no
page errors, no player permanently out of bounds, and fps up (headless
SwiftShader bar 48; design bar 50 — see TESTKIT_ROADMAP.md "Beat Sprint T3").
