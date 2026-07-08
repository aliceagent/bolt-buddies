// Bolt Buddies — SHARED FIDGET SCHEDULER (Animation Sprint A1).
//
// ONE timer serving EVERY character. Instead of a Phaser TimerEvent per robot +
// enemy (which would fire in lockstep and multiply per-frame work), a single
// accumulator ticks every TIMING.FIDGET_TICK ms and considers the registered
// rigs round-robin. Each rig carries a per-character phase STAGGER so fidgets
// desync — the buddies never blink-and-twitch on the same frame.
//
// A1 wires the scheduler up and registers players + all enemies, but schedules
// NO visible fidget: when a rig becomes eligible the scheduler calls the rig's
// (empty in A1) fidget path, which only advances a counter. A3 hangs the real
// tier-1/tier-2 fidget motion off `pickFidget()`.
//
// GROUND RULES:
//   * ONE shared timer (this accumulator) — never a timer-per-character.
//   * ZERO per-frame allocation — a fixed rig list, primitive counters only.
//   * CANCELABLE — a rig whose host received input this frame has its idle clock
//     zeroed and any active fidget dropped BEFORE eligibility is considered, so a
//     fidget can never eat or delay input.

import { TIMING } from "./motion.js";

export class FidgetScheduler {
  constructor(scene) {
    this.scene = scene;
    this.rigs = []; // every registered rig shares THIS one scheduler
    this._acc = 0; // single shared tick accumulator (ms)
    this._cursor = 0; // round-robin pointer across rigs
    this.enabled = true;
  }

  // Register a rig and give it a stable stagger offset so its fidget windows
  // never align with its siblings'. Idempotent-ish: caller registers once.
  register(rig, now = 0) {
    const stagger = this.rigs.length * TIMING.FIDGET_STAGGER;
    rig.nextFidgetAt = now + TIMING.IDLE_TIER1 + stagger;
    this.rigs.push(rig);
  }

  unregister(rig) {
    const i = this.rigs.indexOf(rig);
    if (i >= 0) this.rigs.splice(i, 1);
  }

  // Advance the single shared timer. Called once per frame by AnimSystem.
  update(time, delta) {
    if (!this.enabled) return;
    // Per-rig idle bookkeeping + input-cancel. Cheap: a handful of characters,
    // primitive reads from the status the rig already probed this frame.
    for (let i = 0; i < this.rigs.length; i++) {
      const rig = this.rigs[i];
      const s = rig.status;
      // A5: scuttlebugs NEVER stop patrolling, so the player idle-gate would starve
      // their feeler twitches. Accrue "alive" time instead (movement does not cancel);
      // only death clears it. The staggered scheduler then fires the twitch at random.
      if (rig.kind === "bug") {
        if (s.dead) rig.cancelFidget(); else rig.idleMs += delta;
        continue;
      }
      // input OR any real motion resets the idle clock and cancels a fidget —
      // the fidget/wait tiers only build up while the character is truly still.
      if (s.input || s.airborne || Math.abs(s.vx) > 6 || s.carrying || s.dead || s.hurt) {
        rig.cancelFidget();
      } else {
        rig.idleMs += delta;
      }
    }

    // Single tick loop — poll one candidate per tick (round-robin), so at most
    // one fidget is even CONSIDERED per tick and the load is spread across frames.
    this._acc += delta;
    while (this._acc >= TIMING.FIDGET_TICK) {
      this._acc -= TIMING.FIDGET_TICK;
      if (this.rigs.length === 0) break;
      const rig = this.rigs[this._cursor % this.rigs.length];
      this._cursor = (this._cursor + 1) % this.rigs.length;
      this._consider(rig, time);
    }
  }

  // Consider firing a fidget on one rig. A1: if eligible, only record it (no
  // visible motion). A3 overrides pickFidget() to attach a real tier-1/tier-2
  // fidget tween. Never blocks; never allocates on the not-eligible path.
  _consider(rig, time) {
    if (rig.activeFidget) return; // already fidgeting
    if (rig.idleMs < TIMING.IDLE_TIER1) return; // not idle long enough
    if (time < rig.nextFidgetAt) return; // still inside its staggered gap
    const tier = rig.idleMs >= TIMING.IDLE_TIER2 ? 2 : 1;
    // schedule the next allowed fidget (gap + jitter keeps them desynced)
    rig.nextFidgetAt = time + TIMING.FIDGET_GAP + Math.random() * TIMING.FIDGET_JITTER;
    rig.fidgetCount++;
    this.pickFidget(rig, tier, time); // A3 hook — no-op body in A1
  }

  // Extension point: A3 replaces/wraps this to play the real fidget for the
  // rig's kind + tier. A1 leaves it empty so nothing shows on screen.
  pickFidget(/* rig, tier, time */) {}
}
