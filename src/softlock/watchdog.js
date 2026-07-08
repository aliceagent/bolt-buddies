// Bolt Buddies — Progress Watchdog (Softlock Recovery Sprint SL2).
//
// A PASSIVE per-level stall safety net. Each frame it composes a cheap
// "meaningful progress" metric out of state GameScene has ALREADY resolved this
// frame (max forward reach, cores/doors/bridges/levers opened, the active
// checkpoint, plus live velocity/traversal), and — while BOTH robots are alive,
// grounded, low-activity and NOT mid-traversal — counts how long the team has
// made no new progress. Past escalating windows it raises `stuck` tiers:
//   t1 (gentle, ~25s of stall) → t2 (firm, ~50s).
//
// SL2 ONLY DETECTS. It renders nothing (SL4 builds the visible "Stuck?" UI; SL3
// adds the precise per-softlock detectors). It is the GENERAL net that catches
// ANY stall, including softlocks nobody enumerated.
//
// BINDING CONTRACT — it only READS scene state and writes its OWN private
// tracking fields + the `stuckTier` signal:
//   * changes NO physics / logic / timing / level flow / input / entity state,
//   * never blocks or delays input,
//   * ZERO per-frame allocation (scalar reads + explicit for-loops; the only
//     object literal is built on a tier RISE, which is rare, never per-frame),
//   * canvas-safe (no DOM, no display list).
//
// It is driven ONCE at the tail of GameScene.update(), AFTER all game logic and
// after anim.update() — a pure read-only observer of the settled frame.
//
// Signals exposed for SL3/SL4 (and the headless probes):
//   scene.stuckTier            — current tier 0/1/2/3 (authoritative field; SL7 adds t3)
//   game event "bb:stuck"      — emitted (tier) only when the tier CHANGES
//   window.__bbStuckTier       — mirror of the current tier
//   window.__bbWatchdogPeakTier— session-max tier ever raised (probe reads/zeroes)
//   window.__bbWatchdogPeak    — {tier, level, atMs} stamped on each tier RISE

import { uxHints } from "../ux.js";

// --- starting thresholds (SL6 finalizes) -------------------------------------
const T1_MS = 25000; // gentle nudge after ~25s of genuine stall
const T2_MS = 50000; // firm restart-offer after ~50s
const T3_MS = 75000; // SL7: "cold hard truth" grey-fade after ~75s (~25s past t2) —
                     //  the persistent player who ignored the firm restart offer.

// A frame counts as "progress / activity" (and RESETS the stall window) when any
// of these hold, so the watchdog only ever accumulates during a true settled
// stall — never during movement, exploration, fighting, or scripted traversal:
const REACH_EPS = 8;   // px of NEW forward ground that counts as progress
const WANDER_PX = 80;  // px a robot may drift from the window anchor before it
                       // reads as exploration (re-anchors the window)
const VEL_EPS = 25;    // px/s below which a robot is "still" (grounded idle ~0)

export class ProgressWatchdog {
  constructor(scene) {
    this.scene = scene;
    this.T1 = T1_MS;
    this.T2 = T2_MS;
    this.T3 = T3_MS;

    // private tracking (all scalars; reset() seeds them from the fresh level)
    this._stallMs = 0;
    this._tier = 0;
    this._maxReach = -Infinity; // monotonic max forward x seen this segment
    this._bestDiscrete = 0;     // monotonic max of the discrete opened-count
    this._cpX = 0;              // active-checkpoint x (change => new segment)
    this._ax0 = 0;              // window anchor x, player 0
    this._ax1 = 0;              // window anchor x, player 1
    this._hintsOn = true;       // U11 snapshot (read once per level entry)

    if (typeof window !== "undefined" && window.__bbWatchdogPeakTier === undefined) {
      window.__bbWatchdogPeakTier = 0; // session peak; the probe zeroes it per run
    }
  }

  // --- cheap, alloc-free metric reads ----------------------------------------
  // max forward x among the ALIVE robots (a dead robot's respawn x is noise).
  _reach() {
    const ps = this.scene.players;
    let r = -Infinity;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (!p.dead && p.x > r) r = p.x;
    }
    return r;
  }

  // count of discrete "things opened / collected" — cores + doors + bridges +
  // levers. Explicit for-loops (no .filter/.map closures) => zero allocation.
  _discrete() {
    const s = this.scene;
    let n = 0;
    const cg = s.coresGot;
    if (cg) for (let i = 0; i < cg.length; i++) if (cg[i]) n++;
    const dz = s.doors;
    if (dz) for (let i = 0; i < dz.length; i++) if (dz[i].open) n++;
    const bz = s.bridges;
    if (bz) for (let i = 0; i < bz.length; i++) if (bz[i].open) n++;
    const lz = s.levers;
    if (lz) for (let i = 0; i < lz.length; i++) if (lz[i].on) n++;
    return n;
  }

  _activeCpX() {
    const cp = this.scene.cpPos;
    return cp && cp[0] ? cp[0].x : 0;
  }

  // Seed the trackers from the current (fresh) level state. Called from create()
  // and whenever a NEW checkpoint segment begins. Snapshots the U11 hints setting
  // (reading localStorage once per level entry — NEVER per frame).
  reset() {
    this._stallMs = 0;
    this._maxReach = this._reach();
    this._bestDiscrete = this._discrete();
    this._cpX = this._activeCpX();
    const ps = this.scene.players;
    this._ax0 = ps && ps[0] ? ps[0].x : 0;
    this._ax1 = ps && ps[1] ? ps[1].x : 0;
    this._hintsOn = uxHints();
    this._setTier(0, 0);
  }

  // One frame — AFTER all game logic. Pure observer. Reads only; the only writes
  // are this watchdog's own scalar fields + the stuckTier signal.
  update(time, delta) {
    const s = this.scene;
    const ps = s.players;
    if (!ps || ps.length < 2) return;
    const p0 = ps[0], p1 = ps[1];
    const b0 = p0.body, b1 = p1.body;
    if (!b0 || !b1) return;

    // A NEW checkpoint => a new segment: re-baseline reach/discrete/anchors so
    // old-segment territory doesn't count, and clear the stall (respawn-to-new-cp
    // reset, per the roadmap). Handle first — it supersedes everything.
    const cpx = this._activeCpX();
    if (cpx !== this._cpX) {
      this._cpX = cpx;
      this._maxReach = this._reach();
      this._bestDiscrete = this._discrete();
      this._ax0 = p0.x; this._ax1 = p1.x;
      this._stallMs = 0;
      this._setTier(0, time);
      return;
    }

    // --- progress metric (monotonic bests) ---
    let progressed = false;
    const reach = this._reach();
    if (reach > this._maxReach + REACH_EPS) progressed = true;
    if (reach > this._maxReach) this._maxReach = reach; // keep monotonic
    const disc = this._discrete();
    if (disc > this._bestDiscrete) { progressed = true; this._bestDiscrete = disc; }

    // --- ineligible / transient states (never accumulate; re-anchor) ---
    // A dead robot, or either robot mid-scripted-traversal (zip / reel / carry /
    // being-carried i.e. thrown) is NOT a stall — it is a transition.
    const anyDead = p0.dead || p1.dead;
    const traversal =
      p0.zip || p0.reeled || p0.carrying || p0.carriedBy ||
      p1.zip || p1.reeled || p1.carrying || p1.carriedBy;

    // --- live activity: real movement, a jump/fall, or exploration ---
    // A wall-blocked robot mashing into a wall has ~0 velocity (blocked), so it
    // still reads as "still" and CAN trip — desired. Genuine motion resets.
    const active =
      !p0.grounded || !p1.grounded ||
      Math.abs(b0.velocity.x) > VEL_EPS || Math.abs(b0.velocity.y) > VEL_EPS ||
      Math.abs(b1.velocity.x) > VEL_EPS || Math.abs(b1.velocity.y) > VEL_EPS;
    const wander =
      Math.abs(p0.x - this._ax0) > WANDER_PX ||
      Math.abs(p1.x - this._ax1) > WANDER_PX;

    if (progressed || anyDead || traversal || active || wander) {
      // any of these = the team is progressing/moving/transitioning: reset the
      // stall window and re-anchor the wander baseline to here.
      this._stallMs = 0;
      this._ax0 = p0.x; this._ax1 = p1.x;
      this._setTier(0, time);
      return;
    }

    // Settled stall: both alive, grounded, still, not exploring, no new progress.
    this._stallMs += delta;
    if (!this._hintsOn) return; // U11: honor hints-off — bookkeep, never signal.
    const tier = this._stallMs >= this.T3 ? 3
      : this._stallMs >= this.T2 ? 2
      : this._stallMs >= this.T1 ? 1 : 0;
    this._setTier(tier, time);
  }

  // Publish the tier. Emits/stamps ONLY on a change (no per-frame event/alloc).
  _setTier(tier, time) {
    if (tier === this._tier) return;
    this._tier = tier;
    this.scene.stuckTier = tier;
    if (typeof window !== "undefined") {
      window.__bbStuckTier = tier;
      if (tier > 0 && tier > (window.__bbWatchdogPeakTier || 0)) {
        window.__bbWatchdogPeakTier = tier;
        // object literal ONLY on a tier RISE (rare) — never in the per-frame path.
        window.__bbWatchdogPeak = { tier, level: this.scene.def ? this.scene.def.id : "", atMs: time };
      }
    }
    if (this.scene.game && this.scene.game.events) this.scene.game.events.emit("bb:stuck", tier);
  }
}
