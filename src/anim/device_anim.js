// Bolt Buddies — DEVICE PERSONALITY SET (Animation Sprint A9 — "Living lab").
//
// A9 gives the level DEVICES personality. Unlike A2–A8 (which hang off per-host
// CharRigs), the devices are plain GameScene records (scene.crushers / pedestals /
// checkpoints / lifts / exitDoor), so this is ONE lightweight controller that the
// AnimSystem owns and updates LAST — after all game logic — so every beat is a pure
// VISUAL OVERLAY on the SACRED device LOGIC (logic first, motion after). It reads that
// state and writes ONLY to host ROTATION / body-invariant SCALE / cosmetic overlays /
// its OWN pooled particles — never a position/timer/threshold any device logic reads:
//
//   * CRUSHER — a servo QUIVER anticipation ramps across the wind-up (the tail of the
//     hold phase, read from cr.timer) then a relieved steam SIGH puffs after impact
//     (the slam->rest edge). The quiver is host ROTATION only (the slam hitbox reads
//     img.x/img.y and img.body — never rotation; the AABB ignores it), reset to 0 the
//     instant the slam starts; the sigh is a POOLED emitter routed through the shared
//     fxBudget (the ~120 cap). The slam timing/hitbox is byte-identical.
//   * PEDESTAL — the skill icon ORBIT speeds up (orbit-tween timeScale) and LEANS toward
//     an APPROACHING unskilled robot ("pick me!"). Reads robot proximity + ped.taken
//     (only while it still holds a skill to give). Cosmetic: writes the icon CONTAINER's
//     x/angle + the orbit tween's timeScale — the equip reads ped.x/ped.y, never the icon.
//   * CHECKPOINT — the lamp does a wake-up stretch BLINK the first time a robot approaches
//     (a one-shot on approach, before/at activation). Body-invariant SCALE on the lamp img
//     (origin-centred: img.x/img.y unmoved) — the activation reads cp.x/cp.y, never img.
//   * EXIT DOOR — the P5 marquee chase speeds up IMPATIENTLY while EXACTLY ONE buddy waits
//     (read from the U1/U2 waiting bubble's waitIdx). Only bumps the marquee PHASE (the
//     dots are cosmetic); the finishLevel trigger reads zone containment, never the phase.
//   * LIFT — settles with a small suspension BOUNCE at each end of travel (the moving->
//     stopped edge at a travel end). Body-invariant SCALE on the platform (origin-centred:
//     img.y — the resting-y robots stand on — and the arcade body are unmoved).
//
// GROUND RULES honoured: DEVICE LOGIC SACRED (only READS state + robot positions; writes
// host rotation + body-invariant scale + cosmetic overlays + the OWN pooled sigh — never a
// device position/timer/threshold/hitbox); ZERO per-frame allocation (all scratch
// preallocated once; the nearest-robot scans are bare loops); pooled + budgeted; CANVAS-SAFE
// (drawn particle sigh + texture-free transforms, no tint-only states). Gated by the rig
// A/B switch (AnimSystem.update returns early when disabled), so ?animoff=1 renders every
// device byte-identically to P4/P5/P8.

import { MOTION } from "./motion.js";
import { DEPTH, PARTICLES } from "../constants.js";

export function installDeviceAnim(scene) {
  return new DeviceAnim(scene);
}

class DeviceAnim {
  constructor(scene) {
    this.scene = scene;

    // --- pooled crusher steam SIGH (P11 steam palette; routed through fxBudget) ---
    this.sigh = scene.add.particles(0, 0, "px", {
      speed: { min: 18, max: 70 }, angle: { min: 205, max: 335 },
      scale: { start: 1.9, end: 0 }, alpha: { start: 0.5, end: 0 },
      lifespan: { min: 340, max: MOTION.CRUSH_SIGH.life }, gravityY: -42,
      tint: PARTICLES.steam.body, emitting: false,
    }).setDepth(DEPTH.fx - 1);
    // count the sigh against the shared ~120 alive-particle budget guard.
    if (scene._budgetEmitters && scene._budgetEmitters.indexOf(this.sigh) < 0) {
      scene._budgetEmitters.push(this.sigh);
    }

    // --- preallocated per-device scratch (ZERO per-frame allocation) ----------
    const crs = scene.crushers || [];
    this._crQuiverPhase = new Float32Array(crs.length); // wind-up oscillator phase (ms)
    this._crPrevState = crs.map((c) => c.state);        // slam->rest edge detector

    const peds = scene.pedestals || [];
    this._pedTween = peds.map((p) => {
      // find the orbit's angle tween ONCE (never per frame) so we can drive its speed.
      if (!p.orbit) return null;
      const tws = scene.tweens.getTweensOf(p.orbit);
      return tws && tws.length ? tws[0] : null;
    });
    this._pedBaseX = peds.map((p) => (p.icon ? p.icon.x : 0)); // resting icon world-x (== px)
    this._pedLean = new Float32Array(peds.length);  // eased lean offset (px)
    this._pedTilt = new Float32Array(peds.length);  // eased lean tilt (deg)
    this._pedScale = new Float32Array(peds.length).fill(1); // eased orbit timeScale

    const cps = scene.checkpoints || [];
    this._cpWoke = cps.map(() => false);           // one-shot wake latch
    this._cpBlinkT = new Float32Array(cps.length); // wake-blink envelope (ms remaining)

    const lfs = scene.lifts || [];
    this._lfPrevMoving = lfs.map(() => false);      // moving->stopped edge detector
    this._lfBounceT = new Float32Array(lfs.length); // suspension-bounce envelope (ms remaining)
    // The lift platform OWNS the arcade body, and (verified) the body tracks the sprite's
    // display SCALE in BOTH axes — so scaling the platform would move body.top (the resting-y
    // robots stand on). Instead the bounce plays on a pooled OVERLAY tileSprite (same texture/
    // size, rendered just over the rigid platform); the body-owning platform NEVER scales, so
    // its y-positions + body.top stay byte-identical. The overlay is invisible until a bounce.
    this._lfOverlay = lfs.map((lf) => {
      if (!lf.img) return null;
      const o = scene.add.tileSprite(lf.img.x, lf.img.y, lf.img.width, lf.img.height, "liftplat")
        .setDepth(lf.img.depth).setVisible(false);
      return o;
    });

    this._exitUrg = 0; // eased marquee impatience factor (0..1)
  }

  // One frame. Called by AnimSystem.update() LAST (after all game logic) and ONLY when
  // the rig is enabled — so ?animoff=1 never runs this and devices render byte-identically.
  update(time, delta) {
    this._updateCrushers(delta);
    this._updatePedestals(delta);
    this._updateCheckpoints(delta);
    this._updateExit(delta);
    this._updateLifts(delta);
  }

  // CRUSHER — wind-up quiver (rotation) + relieved steam sigh (pooled) after impact.
  _updateCrushers(dt) {
    const crs = this.scene.crushers;
    if (!crs) return;
    const Q = MOTION.CRUSH_QUIVER, S = MOTION.CRUSH_SIGH;
    for (let i = 0; i < crs.length; i++) {
      const cr = crs[i], img = cr.img;
      if (!img || img.scene == null) continue;
      // servo QUIVER: only during the tail of the hold phase (the wind-up), amplitude
      // ramps as cr.timer counts down toward the slam. ROTATION only (slam hitbox reads
      // img.x/img.y — never rotation), snapped to 0 the moment the slam begins.
      let rot = 0;
      if (cr.state === "hold" && cr.timer <= Q.dur) {
        this._crQuiverPhase[i] += dt;
        const ramp = 1 - cr.timer / Q.dur; // 0 -> 1 as the slam nears
        rot = Q.amp * ramp * Math.sin((this._crQuiverPhase[i] * Q.freq) / 1000 * Math.PI * 2);
      } else {
        this._crQuiverPhase[i] = 0;
      }
      if (img.rotation !== rot) img.rotation = rot;
      // relieved SIGH: one pooled, budgeted steam puff on the slam->rest impact edge.
      if (this._crPrevState[i] === "slam" && cr.state === "rest") {
        const n = this.scene.fxBudget(S.count);
        if (n > 0) this.sigh.explode(n, img.x, img.y + 22);
      }
      this._crPrevState[i] = cr.state;
    }
  }

  // PEDESTAL — orbit speed-up + lean toward an approaching unskilled robot ("pick me!").
  _updatePedestals(dt) {
    const peds = this.scene.pedestals;
    if (!peds) return;
    const P = MOTION.PED_ORBIT, players = this.scene.players;
    const e = Math.min(1, (dt / 1000) * P.ease);
    for (let i = 0; i < peds.length; i++) {
      const ped = peds[i];
      if (!ped.icon || ped.icon.scene == null) continue;
      let eager = 0, dir = 0;
      // only eager while it still holds a skill to give (not taken).
      if (!ped.taken) {
        let best = Infinity, bx = 0;
        for (let j = 0; j < players.length; j++) {
          const p = players[j];
          if (!p || p.dead || p.skill) continue; // an UNSKILLED robot it can equip
          const dx = p.x - ped.x, dy = p.y - ped.y, d2 = dx * dx + dy * dy;
          if (d2 < best) { best = d2; bx = p.x; }
        }
        if (best < P.range * P.range) {
          eager = 1 - Math.sqrt(best) / P.range; // closer => more eager (0..1)
          dir = Math.sign(bx - ped.x) || 0;
        }
      }
      const leanTarget = eager * P.lean * dir;   // px toward the robot
      const tiltTarget = eager * P.tilt * dir;   // deg lean
      const scaleTarget = 1 + eager * (P.maxScale - 1); // orbit timeScale
      this._pedLean[i] += (leanTarget - this._pedLean[i]) * e;
      this._pedTilt[i] += (tiltTarget - this._pedTilt[i]) * e;
      this._pedScale[i] += (scaleTarget - this._pedScale[i]) * e;
      // cosmetic ONLY: the icon container's transform (the equip reads ped.x/ped.y).
      ped.icon.x = this._pedBaseX[i] + this._pedLean[i];
      ped.icon.angle = this._pedTilt[i];
      const tw = this._pedTween[i];
      if (tw) tw.timeScale = this._pedScale[i];
    }
  }

  // CHECKPOINT — wake-up stretch blink the first time a robot approaches (body-invariant scale).
  _updateCheckpoints(dt) {
    const cps = this.scene.checkpoints;
    if (!cps) return;
    const C = MOTION.CHECK_WAKE, players = this.scene.players;
    for (let i = 0; i < cps.length; i++) {
      const cp = cps[i], img = cp.img;
      if (!img || img.scene == null) continue;
      if (!this._cpWoke[i]) {
        for (let j = 0; j < players.length; j++) {
          const p = players[j];
          if (!p || p.dead) continue;
          if (Math.abs(cp.x - p.x) < C.range && Math.abs(cp.y - p.y) < C.range) {
            this._cpWoke[i] = true;
            this._cpBlinkT[i] = C.dur;
            break;
          }
        }
      }
      if (this._cpBlinkT[i] > 0) {
        this._cpBlinkT[i] -= dt;
        let t = this._cpBlinkT[i]; if (t < 0) t = 0;
        const prog = 1 - t / C.dur;           // 0..1 over the blink
        const env = Math.sin(prog * Math.PI); // 0 -> 1 -> 0 single wake pulse
        // stretch tall + narrow then settle to exactly (1,1) — origin-centred, img.x/y fixed.
        img.setScale(1 - C.sx * env, 1 + C.sy * env);
        if (this._cpBlinkT[i] <= 0) {
          this._cpBlinkT[i] = 0;
          if (img.scaleX !== 1 || img.scaleY !== 1) img.setScale(1, 1);
        }
      }
    }
  }

  // EXIT DOOR — the P5 marquee chase speeds up impatiently while exactly one buddy waits.
  _updateExit(dt) {
    const d = this.scene.exitDoor;
    if (!d || !d.open || !d.marquee) return;
    const label = this.scene.exitLabel;
    // waitIdx >= 0 iff EXACTLY ONE buddy is in the exit zone (set by show/hideExitWaiting,
    // which run this frame BEFORE the rig) — the same occupancy the U1/U2 bubble pairs with.
    const waiting = !!(label && label.waitIdx >= 0);
    const E = MOTION.EXIT_IMPATIENCE;
    this._exitUrg += ((waiting ? 1 : 0) - this._exitUrg) * Math.min(1, (dt / 1000) * E.ease);
    if (this._exitUrg > 0.001) {
      const N = d.marquee.dots.length;
      // bump ONLY the cosmetic phase; the door loop re-renders the dots next frame from it.
      d.marquee.phase = (d.marquee.phase + dt * E.boost * this._exitUrg) % N;
    }
  }

  // LIFT — suspension settle bounce at each end of travel, played on a pooled OVERLAY
  // tileSprite so the body-owning platform (its img.y + arcade body.top) never moves.
  _updateLifts(dt) {
    const lfs = this.scene.lifts;
    if (!lfs) return;
    const L = MOTION.LIFT_BOUNCE;
    for (let i = 0; i < lfs.length; i++) {
      const lf = lfs[i], img = lf.img, ov = this._lfOverlay[i];
      if (!img || img.scene == null || !img.body) continue;
      const moving = Math.abs(img.body.velocity.y) > 1;
      // arrival = the moving->stopped edge AT a travel end (the lift only stops at ends).
      if (this._lfPrevMoving[i] && !moving) {
        const atEnd = Math.abs(img.y - lf.topY) < 3 || Math.abs(img.y - lf.botY) < 3;
        if (atEnd) this._lfBounceT[i] = L.dur;
      }
      this._lfPrevMoving[i] = moving;
      if (this._lfBounceT[i] > 0 && ov) {
        this._lfBounceT[i] -= dt;
        let t = this._lfBounceT[i]; if (t < 0) t = 0;
        const prog = 1 - t / L.dur;
        const env = Math.sin(prog * Math.PI * 3) * (1 - prog); // decaying settle oscillation
        // OVERLAY-only scale (origin-centred over the platform); the real platform is untouched.
        ov.x = img.x; ov.y = img.y;
        ov.setScale(1 + L.sx * env, 1 - L.sy * env);
        if (!ov.visible) ov.setVisible(true);
        if (this._lfBounceT[i] <= 0) {
          this._lfBounceT[i] = 0;
          ov.setScale(1, 1);
          ov.setVisible(false);
        }
      } else if (this._lfBounceT[i] <= 0 && ov && ov.visible) {
        ov.setVisible(false);
      }
    }
  }

  destroy() {
    if (this.sigh) {
      const es = this.scene._budgetEmitters;
      if (es) { const k = es.indexOf(this.sigh); if (k >= 0) es.splice(k, 1); }
      this.sigh.destroy();
      this.sigh = null;
    }
    if (this._lfOverlay) {
      for (let i = 0; i < this._lfOverlay.length; i++) if (this._lfOverlay[i]) this._lfOverlay[i].destroy();
      this._lfOverlay = null;
    }
  }
}
