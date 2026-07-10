// Bolt Buddies — Softlock prober shared helpers (SL1).
//
// Reuses the beat kit's INPUT-ONLY Driver (tools/beat/driver.mjs). The prober may
// READ window.__BB.scene to time inputs and snapshot state, and it may call the
// scene orchestration helpers (start a level, clear localStorage) that the beat
// runner already uses — but it drives the game ONLY through real Playwright
// keyboard events. It NEVER mutates scene state (no body.reset, no setSkill, no
// teleport). Every softlock is reached by driving the robots there, and every
// recovery is a real key sequence a human could press.
//
// A "recovery" is any move the running game already allows with no restart:
//   retrace, reel (DOWN+ACTION), re-throw, re-pull a lever, phase-escort,
//   self-climb, grapple zip-back, OR a deliberate death that respawns the team
//   at the shared active checkpoint (checkpoints are global — GameScene 3312+).
// A candidate is HARD SOFTLOCK only when NONE of those restore a winnable state
// and the team's only exit is R×2 (restart room) / ESC×2 (map).

import { TILE } from "../beat/driver.mjs";

export { TILE };
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const now = () => Date.now();

// level id -> registry index (mirrors beat runner; tutorial is appended LAST = 12)
export const LEVEL_INDEX = {
  "1-1": 0, "1-2": 1, "1-3": 2, "2-1": 3, "2-2": 4, "2-3": 5, "3-1": 6, "3-2": 7, tut: 12,
};

// Assignment A: P1 takes the first (grapple/phase/magnet) pedestal. Roles are
// abstract; the softlock escapes we test are role-symmetric where it matters
// (the grapple/phase/magnet robot is always the one that must zip/escort/cling),
// so one assignment suffices and each scenario notes if the other assignment
// would change the verdict.
export const ROLES_A = { G: 0, H: 1, P: 0, T: 1, M: 0, B: 1 };

export async function startLevel(page, levelIndex) {
  await page.evaluate((i) => {
    localStorage.clear();
    const m = window.__BB.game.scene;
    ["UI", "Game", "Title", "Hub"].forEach((k) => m.stop(k));
    m.start("Game", { levelIndex: i });
  }, levelIndex);
  await sleep(1600);
}

// Compact, human-readable snapshot of the two robots + level progress. Used both
// to RECORD the stuck state and to CHECK recovery outcomes.
export async function snap(bb) {
  const s = await bb.state();
  if (!s) return null;
  const pj = (p) => ({
    tx: +p.tx.toFixed(2), ty: +p.ty.toFixed(2), dead: p.dead,
    skill: p.skill, grounded: p.grounded, carrying: p.carrying, carriedBy: p.carriedBy,
  });
  return {
    id: s.id, complete: s.complete,
    players: s.players.map(pj),
    doors: s.doors.map((d) => ({ id: d.id, open: d.open })),
    levers: s.levers.map((l) => ({ id: l.id, on: l.on })),
    bridges: s.bridges.map((b) => ({ id: b.id, open: b.open })),
    plates: s.plates.map((p) => ({ id: p.id, active: p.active })),
    wardens: s.wardens.map((w) => ({ id: w.id, defeated: w.defeated })),
  };
}

// True once a role has come back alive (used after a deliberate hazard death).
export async function waitAlive(bb, role, timeout = 6000) {
  const i = bb.idx(role);
  const end = now() + timeout;
  let wasDead = false;
  while (now() < end) {
    const st = await bb.state();
    const p = st.players[i];
    if (p.dead) wasDead = true;
    else if (wasDead) { await sleep(250); return true; }
    await sleep(50);
  }
  return false;
}

// Deliberately walk a role into the nearest reachable hazard (or off a ledge into
// the world floor) to force a respawn. Returns { died, respawnTx, respawnTy }.
// This is the "restart is NOT needed — a death reunites us at the shared
// checkpoint" recovery. hazardTileX/dir steer the walk; we hold toward it until
// the robot dies, then wait for the respawn and report where it landed.
export async function suicideRespawn(bb, role, hazardTileX, opts = {}) {
  const i = bb.idx(role);
  const k = bb.keysFor(role);
  const timeout = opts.timeout ?? 12000;
  const end = now() + timeout;
  const startDeaths = bb.deaths;
  let died = false;
  while (now() < end && !died) {
    const st = await bb.state();
    const p = st.players[i];
    if (p.dead) { died = true; break; }
    const dx = hazardTileX * TILE + 24 - p.x;
    const dir = dx > 0 ? k.right : k.left;
    await bb.up(dx > 0 ? k.left : k.right);
    await bb.down(dir);
    // hop if wedged against a wall on the way to the hazard
    if ((dx > 0 && p.blocked.right) || (dx < 0 && p.blocked.left)) await bb.tap(k.jump, 200);
    await sleep(60);
  }
  await bb.up(k.left); await bb.up(k.right);
  if (!died) return { died: false };
  bb.deaths = startDeaths; // don't pollute the driver's death budget
  const ok = await waitAlive(bb, role, 6000);
  const p = (await bb.state()).players[i];
  return { died: true, respawned: ok, respawnTx: +p.tx.toFixed(2), respawnTy: +p.ty.toFixed(2), dead: p.dead };
}

// Hold a role toward tileX for up to `ms`, then release. A raw, closed-loop
// "press the D-pad" primitive for probing walls the smart walkTo would try to
// hop/retry around (we WANT to see the robot get stuck).
export async function push(bb, role, tileX, ms, opts = {}) {
  const i = bb.idx(role);
  const k = bb.keysFor(role);
  const end = now() + ms;
  const hop = opts.hop ?? false;
  while (now() < end) {
    const st = await bb.state();
    const p = st.players[i];
    if (p.dead) break;
    const dx = tileX * TILE + 24 - p.x;
    if (Math.abs(dx) < 8) break;
    const dir = dx > 0 ? k.right : k.left;
    await bb.up(dx > 0 ? k.left : k.right);
    await bb.down(dir);
    if (hop && ((dx > 0 && p.blocked.right) || (dx < 0 && p.blocked.left))) await bb.tap(k.jump, 220);
    await sleep(50);
  }
  await bb.up(k.left); await bb.up(k.right);
}

// Run a slice of a beat route to STAGE the prober at a deep position. `steps` is a
// route's default export; runs steps whose name is between `from`..`to` inclusive
// (or all up to `to`). Input-only — these are the same primitives the beat matrix
// uses, so staging is as deterministic as the matrix itself.
export async function stage(bb, steps, opts = {}) {
  const names = steps.map((s) => s.name);
  const startAt = opts.from ? names.indexOf(opts.from) : 0;
  const endAt = opts.to ? names.indexOf(opts.to) : steps.length - 1;
  for (let i = Math.max(0, startAt); i <= endAt; i++) {
    bb.stepDeaths = 0;
    await steps[i].fn(bb);
  }
}
