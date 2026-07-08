// Bolt Buddies — Explicit Softlock Detectors (Softlock Recovery Sprint SL3).
//
// A PASSIVE, per-level registry of PRECISE hard-softlock detectors. Where the SL2
// watchdog is the GENERAL stall net (any unenumerated stall, after 25-50s), these
// detectors recognize a SPECIFIC, drive-verified unwinnable configuration the
// INSTANT it forms and raise a HIGH-CONFIDENCE softlock signal immediately — no
// 25-50s wait, and with confident "you're stuck, restart" copy (SL4 renders it).
//
// SL1 proved the game has exactly ONE confirmed HARD SOFTLOCK — the 1-2 core0
// (FL-T3-B) severed-tunnel trap — everything else in the candidate set is
// RECOVERABLE (co-op recoveries exist) and is left to the watchdog's general net.
// So this ships EXACTLY ONE active detector. The framework is extensible (add a
// registry entry per confirmed hard softlock) but deliberately MINIMAL: no
// speculative detectors, which would risk false-firing.
//
// BINDING CONTRACT (identical discipline to SL2's watchdog) — a detector only
// READS scene state (tile-group / grid membership, player position/grounded,
// level metadata) and writes ONLY the shared softlock signal fields:
//   * changes NO physics / logic / timing / level flow / input / entity state,
//   * never blocks or delays input,
//   * ZERO per-frame allocation (scalar reads + explicit for-loops over a tiny
//     preallocated active-list; the only object literal is built ONCE, on the
//     rare FIRE edge — never per frame),
//   * canvas-safe (no DOM, no display list).
// It is driven at the tail of GameScene.update(), immediately AFTER the watchdog
// (so on a confirmed hard softlock its firm tier-2 signal supersedes the
// watchdog's live tier for that frame) — a pure read-only observer of the settled
// frame.
//
// Signals exposed for SL4 (and the headless probes) — REUSES SL2's stuckTier path
// and adds the structured explicit-softlock descriptor beside it, so SL4 consumes
// ONE interface and can tell an explicit hard softlock (confident copy) from a
// watchdog stall (gentle copy):
//   scene.stuckTier          — forced to 2 while a detector is latched (shared with SL2)
//   scene.softlock           — { kind, level, copyHint } while latched, else null
//   game event "bb:softlock" — emitted ONCE, on the fire edge, with the descriptor
//   window.__bbSoftlock      — mirror of scene.softlock (null when clear)
//   window.__bbSoftlockPeak  — 1 once any detector has fired this session, else 0
//                              (the probes read/zero it, like the watchdog peak)
//   window.__bbSoftlockAtMs  — scene time (ms) of the fire edge

import { TILE } from "../constants.js";
import { uxHints } from "../ux.js";

// A detector must observe its exact unwinnable predicate hold continuously for
// this brief window before it LATCHES — long enough to ignore the fall-in / jump-
// attempt transients (the Heavy leaves the ground each time it tries to escape),
// far short of the watchdog's 25s. "Immediate" for a human, robust to a stray
// frame. Latched state persists until a reset (restart re-runs create(); a new
// checkpoint segment) — a confirmed hard softlock does not un-happen mid-segment.
const CONFIRM_MS = 400;

// ---------------------------------------------------------------------------
// The detector REGISTRY. One entry per SL1-confirmed HARD SOFTLOCK. Each entry is
// data-driven: `init(scene)` derives the trap geometry from level metadata + the
// freshly-built scene (returns null if the level doesn't carry this trap), and
// `check(scene, g)` is a pure alloc-free predicate over the live frame.
// ---------------------------------------------------------------------------

// 1-2 core0 (FL-T3-B) — the severed-tunnel trap. The tunnel floor at the col19-20
// pocket is a pair of cracked lids ("%"). Reaching optional core0 (20,16) means
// STOMPING those lids, which removes them and opens a 2-tile hole in the tunnel
// floor. Afterwards the Heavy is TRAPPED down in the pocket: it can't clear the
// row-14 tunnel floor jumping from the pocket, and can't cross the 2-tile hole
// back to the yard (SL1 drive-verified — it falls back in). No in-game recovery
// (no anchor over the pocket to reel from) → the one true hard softlock.
//
// Geometry is derived, not hardcoded: the lid cells come from the "%" crackies
// the scene built for THIS level, and the trap band + floor row fall out of them.
const severedTunnelTrap = {
  kind: "severed-tunnel",
  level: "1-2",
  copyHint: "restart", // SL4: firm, blame-free "Hold R twice to restart this room"

  // Derive the trap geometry from the built scene. The cracked-lid tiles are the
  // scene's "crackies" static group members (each carries its gridX/gridY); the
  // pocket columns and the tunnel-floor row fall straight out of them. Returns a
  // preallocated geometry record (with its own scalar confirm/latch trackers) or
  // null if this level has no cracked lids (then the detector stays inert).
  init(scene) {
    const grp = scene.crackies;
    if (!grp) return null;
    // preallocated fixed store for lid cells (this trap has 2; cap generously)
    const cols = new Int32Array(16);
    const rows = new Int32Array(16);
    let n = 0;
    const kids = grp.getChildren ? grp.getChildren() : null;
    if (kids) {
      for (let i = 0; i < kids.length && n < 16; i++) {
        const t = kids[i];
        if (t && t.gridX !== undefined && t.gridY !== undefined) {
          cols[n] = t.gridX; rows[n] = t.gridY; n++;
        }
      }
    }
    if (n === 0) return null;
    // pocket column band + tunnel-floor row, derived from the lid cells
    let colMin = cols[0], colMax = cols[0], rowMin = rows[0];
    for (let i = 1; i < n; i++) {
      if (cols[i] < colMin) colMin = cols[i];
      if (cols[i] > colMax) colMax = cols[i];
      if (rows[i] < rowMin) rowMin = rows[i];
    }
    return {
      lidCols: cols, lidRows: rows, lidCount: n,
      colMin, colMax,
      floorRow: rowMin,                    // tunnel floor top row (the lid row)
      floorBelowY: (rowMin + 0.5) * TILE,  // feet below this ⇒ down in the pocket
      // per-detector scalar trackers (mutated in place; zero per-frame alloc)
      confirmMs: 0,
      latched: false,
    };
  },

  // Pure predicate: is the run in the exact unwinnable state? True ⇒ a lid over
  // the pocket has been broken AND the Heavy is grounded down in the pocket band
  // (below the tunnel floor, between the pocket columns) — i.e. genuinely trapped,
  // not merely passing the tunnel on the intact floor. Zero allocation.
  check(scene, g) {
    // 1) has a cracked lid actually been broken? (broken ⇒ grid cell no longer "%")
    const grid = scene.grid;
    if (!grid) return false;
    let lidBroken = false;
    for (let i = 0; i < g.lidCount; i++) {
      const row = grid[g.lidRows[i]];
      if (!row || row[g.lidCols[i]] !== "%") { lidBroken = true; break; }
    }
    if (!lidBroken) return false; // lid intact ⇒ normal traversal, never a lock

    // 2) is the Heavy grounded, settled, down in the pocket band?
    const ps = scene.players;
    if (!ps) return false;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (!p || p.skill !== "heavy" || p.dead) continue;
      // exclude scripted transitions (a reel/zip/carry is a move, not a settle)
      if (p.zip || p.reeled || p.carriedBy || p.carrying) continue;
      if (!p.grounded) continue;
      const b = p.body;
      if (!b) continue;
      const tx = (p.x / TILE) | 0;
      if (tx < g.colMin || tx > g.colMax) continue; // outside the pocket columns
      if (b.bottom <= g.floorBelowY) continue;       // feet on/above tunnel floor
      return true; // heavy grounded, in-band, below the severed floor ⇒ trapped
    }
    return false;
  },
};

// The active registry. Only the ONE confirmed hard softlock is present.
const REGISTRY = [severedTunnelTrap];

export class SoftlockDetectors {
  constructor(scene) {
    this.scene = scene;
    this.T_CONFIRM = CONFIRM_MS;
    // preallocated active-detector list for THIS level (built in reset()); each
    // element is { def, geo } — no per-frame allocation.
    this._active = [];
    this._fired = false;   // has any detector latched this segment?
    this._cpX = 0;         // active-checkpoint x (a change ⇒ fresh segment)
    this._hintsOn = true;  // U11 snapshot (read once per level entry)

    if (typeof window !== "undefined") {
      if (window.__bbSoftlockPeak === undefined) window.__bbSoftlockPeak = 0;
      if (window.__bbSoftlock === undefined) window.__bbSoftlock = null;
    }
  }

  _activeCpX() {
    const cp = this.scene.cpPos;
    return cp && cp[0] ? cp[0].x : 0;
  }

  // Build the active detector list for the current (fresh) level and clear any
  // prior signal. Called from create() (fresh entry / R-restart re-runs create())
  // and whenever a new checkpoint segment begins. Snapshots U11 hints ONCE here
  // (localStorage read per level entry — NEVER per frame).
  reset() {
    const scene = this.scene;
    const id = scene.def ? scene.def.id : "";
    // rebuild the active list in place (clear then repopulate — reset is rare)
    this._active.length = 0;
    for (let i = 0; i < REGISTRY.length; i++) {
      const def = REGISTRY[i];
      if (def.level !== id) continue;
      const geo = def.init(scene);
      if (geo) this._active.push({ def, geo });
    }
    this._fired = false;
    this._cpX = this._activeCpX();
    this._hintsOn = uxHints();
    this._clearSignal();
  }

  // One frame — driven AFTER the watchdog, after all game logic + anim. Pure
  // observer: reads only; the sole writes are the shared softlock signal fields.
  update(time, delta) {
    const scene = this.scene;

    // A NEW checkpoint ⇒ a new segment: re-baseline (the old segment's trap can't
    // apply) and clear the signal. Handle first — supersedes everything.
    const cpx = this._activeCpX();
    if (cpx !== this._cpX) {
      this._cpX = cpx;
      this.reset();
      return;
    }

    if (this._active.length === 0) return; // this level carries no explicit trap

    // Evaluate each detector. Latch on a confirmed, dwell-stable predicate.
    let anyLatched = false;
    for (let i = 0; i < this._active.length; i++) {
      const d = this._active[i];
      const g = d.geo;
      if (g.latched) { anyLatched = true; continue; }
      if (d.def.check(scene, g)) {
        g.confirmMs += delta;
        if (g.confirmMs >= this.T_CONFIRM) {
          g.latched = true;
          anyLatched = true;
          this._fire(d.def, time); // object literal ONLY here — the rare fire edge
        }
      } else {
        g.confirmMs = 0; // predicate lapsed pre-latch ⇒ not a lock; reset dwell
      }
    }

    // While a hard softlock is latched, hold the shared firm signal each frame.
    // These are idempotent scalar/ref writes (no alloc, no re-emit) that override
    // the watchdog's live tier for the frame (the detector runs after it).
    if (anyLatched && this._hintsOn) {
      scene.stuckTier = 2;
      if (scene.softlock !== this._lastSoftlock) scene.softlock = this._lastSoftlock;
      if (typeof window !== "undefined") window.__bbSoftlock = this._lastSoftlock;
    }
  }

  // Raise the explicit-softlock signal. Called ONCE per detector, on its fire
  // edge — the only place an object literal is built. U11: honor hints-off (still
  // latch bookkeeping so we don't re-evaluate, but publish NOTHING).
  _fire(def, time) {
    if (!this._hintsOn) return;
    this._fired = true;
    // the structured descriptor SL4 consumes (kind ⇒ which softlock; copyHint ⇒
    // which recovery copy; level ⇒ context). Built once, then held by reference.
    const sig = { kind: def.kind, level: def.level, copyHint: def.copyHint };
    this._lastSoftlock = sig;
    const scene = this.scene;
    scene.softlock = sig;
    scene.stuckTier = 2; // reuse SL2's tier path — firm (t2) = confirmed hard lock
    if (typeof window !== "undefined") {
      window.__bbSoftlock = sig;
      window.__bbSoftlockPeak = 1; // session peak the probes read/zero
      window.__bbSoftlockAtMs = time;
    }
    if (scene.game && scene.game.events) scene.game.events.emit("bb:softlock", sig);
  }

  _clearSignal() {
    this._lastSoftlock = null;
    this.scene.softlock = null;
    if (typeof window !== "undefined") window.__bbSoftlock = null;
  }
}
