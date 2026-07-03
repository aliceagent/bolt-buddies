# Bolt Buddies 🤖🤖🐶

**A 2-player couch co-op puzzle platformer.** Two little lab robots — **Beep** (P1, blue) and **Boop** (P2, orange) — chase through a neon robotics facility to rescue their robo-puppy **Bolt**, who was carried off by **SPARK**, the lab's glitchy, comically overdramatic security AI.

Built with **Phaser 3 + Vite**, plain JavaScript, zero asset files (all art is generated at boot, all sound is WebAudio blips). Deploys as a static site.

The full design document lives in [`GAME_DESIGN.md`](./GAME_DESIGN.md).

## Controls (one keyboard, two players)

|            | Move  | Jump | Action |
| ---------- | ----- | ---- | ------ |
| **P1 Beep** | A / D | W    | E      |
| **P2 Boop** | ← / → | ↑    | L      |

The **Action** button is context-sensitive: equip a pedestal gadget, fire your skill (zip / stomp), pull a lever, or — next to your buddy — pick them up and throw them. Hold **jump** while throwing for a high toss.

## Current state

- ✅ Engine core: 2-player input, physics, shared camera with soft zoom, checkpoints & instant respawn
- ✅ World 1 — Assembly Wing (Grapple + Heavyweight): levels 1-1, 1-2, 1-3 (crane set-piece)
- ✅ Hub map, hidden data-cores, localStorage save
- 🔜 Worlds 2–4, story scenes, polish (see roadmap in the design doc)

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

`npm run playtest` drives both robots through mechanic checks in headless Chromium (requires the dev server on port 5173, or set `BB_URL`).
