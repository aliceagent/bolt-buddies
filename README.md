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

## Current state

- ✅ Engine core: 2-player input, physics, shared camera with soft zoom, checkpoints & instant respawn
- ✅ World 1 — Assembly Wing (Grapple + Heavyweight): levels 1-1, 1-2, 1-3 (crane set-piece)
- ✅ World 2 — Maintenance Tunnels (Phase-Walk + Tiny): vents, shimmer-walls & hand-hold escorting, fans, steam jets, Patrol Rollers, Wall-Wardens, throw finale
- ✅ Hub map, hidden data-cores, localStorage save
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
3. **Beat matrix** (`tools/beat/runner.mjs`, 12 runs) — plays every level of
   Worlds 1-2 start-to-finish with real keyboard input only, in BOTH role
   assignments, proving each level is beatable like a human would play it.

`npm run test:beat -- 1-3 2-2` runs the beat matrix for a subset of levels.
Failures write artifacts (screenshot + state dump + step log) to
`tools/beat/failures/`.
