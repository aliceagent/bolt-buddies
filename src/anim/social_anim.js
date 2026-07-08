// Bolt Buddies — SOCIAL & CO-OP MOMENTS (Animation Sprint A10 — "Social & co-op moments").
//
// A10 gives the TWO player robots a set of relationship beats. Like A9's device
// controller (and unlike the per-host CharRig sprints), this is ONE lightweight
// controller the AnimSystem owns and updates LAST — after every rig + all game
// logic — so every beat is a pure VISUAL OVERLAY on the SACRED co-op LOGIC
// (carry/detach, reel/zip, escort/shimmer, respawn, exit-zone detection +
// finishLevel — ALL byte-identical). It only ever READS that state + robot
// positions and writes to host ROTATION / pooled PUPIL+ANTENNA part offsets /
// its OWN pooled spark — never a position/velocity/timer/threshold any co-op
// logic reads:
//
//   * EXIT HIGH-FIVE (moved from U9) — when both robots reach the exit and the
//     level COMPLETES, they turn toward each other, lean in, and spark-slap. This
//     is a fire-and-forget REACTION started off the completion STATE (scene.complete
//     rising edge, which AnimSystem.update sees on the SAME frame finishLevel fires):
//     finishLevel runs exactly as today — the high-five never gates `bothIn`, adds
//     no pre-completion delay, and the clear overlay still fires on finishLevel's own
//     ~500ms delayedCall. The reaction is one TweenManager counter (<=900ms) that
//     rides THROUGH the finish gap (tweens tick while physics is paused + while the
//     scene's update() early-returns on `complete`), driving host rotation in its
//     onUpdate (which runs AFTER present()) + a pooled, budgeted spark-slap.
//   * REEL ARRIVAL — when a reeled buddy arrives at the reeler (p.reeled goes
//     non-null -> null while both are alive, i.e. NOT a death cancel), the reeler
//     plays a "caught you" brace (host rotation lean-back) + a catch glance (pupils
//     toward the caught buddy) + one pooled catch spark. Cosmetic pose only.
//   * ESCORT HAND-HOLD SPARK — while a phase buddy + its non-phase partner are within
//     escort range (78px) and at least one is inside a shimmer wall (escorting through
//     the field), a soft spark/light drifts between them. POOLED + budgeted (routed
//     through the shared ~120 fxBudget), throttled — no per-frame allocation.
//   * CARRIED BUDDY WAVE — a buddy carried (carriedBy) for >2s waves at the camera:
//     a cosmetic antenna sway + a look toward the viewer (pooled antenna/pupil part
//     offsets). Never touches the carry logic.
//   * RESPAWN PARTNER-NOTICES — when one player respawns (dead -> alive edge), the
//     surviving partner's pupils track the respawn beam ("they notice each other").
//     Cosmetic pupil transform only.
//
// GROUND RULES honoured: CO-OP LOGIC SACRED (only READS co-op state + robot
// positions; writes host rotation + pooled part offsets + the OWN pooled escort spark
// — never a co-op position/velocity/timer/threshold/detection); ZERO per-frame
// allocation (all scratch preallocated once; the one high-five tween is a one-shot on
// the completion EVENT, not per frame); pooled + budgeted; CANVAS-SAFE (drawn spark +
// texture-free transforms, no tint-only states); frame-rate-independent where it lerps
// (t = 1 - (1-k)^(dt*60)). Gated by the rig A/B switch (AnimSystem.update returns early
// when disabled), so ?animoff=1 renders byte-identically (no state reads, no parts).

import Phaser from "phaser";
import { MOTION } from "./motion.js";
import { DEPTH, PARTICLES } from "../constants.js";

export function installSocialAnim(scene, anim) {
  return new SocialAnim(scene, anim);
}

class SocialAnim {
  constructor(scene, anim) {
    this.scene = scene;
    this.anim = anim;
    const webgl = scene.game.renderer.type === Phaser.WEBGL;

    // resolve the two player rigs ONCE (players were registered before this).
    const players = scene.players || [];
    this._rigs = players.map((p) => anim.rigFor(p));

    // --- pooled escort HAND-HOLD spark (soft warm light; routed through fxBudget) ---
    // WebGL-ONLY additive glow, exactly like the game's own shimmer-wall sparkles
    // (GameScene builds `shimmerSparks` under `if (webgl ...)`; the baked shimmer art
    // carries the read on the software-Canvas tier). This keeps the ONLY continuous
    // A10 emitter off the fps-sensitive Canvas beat path entirely — zero Canvas cost,
    // so social.update stays byte-cheap on Canvas (the cheaper-path-on-Canvas rule).
    // Budgeted + capped: a gentle drifting spark between escorting buddies. Registered
    // in scene._budgetEmitters by GameScene (mirrors the A9 crusher-sigh wiring).
    const E = MOTION.ESCORT_SPARK;
    this.escortSpark = webgl ? scene.add.particles(0, 0, "px", {
      speed: { min: 6, max: 26 }, angle: { min: 0, max: 360 },
      scale: { start: 0.6, end: 0 }, alpha: { start: 0.55, end: 0 },
      lifespan: { min: 360, max: E.life }, tint: PARTICLES.celebration.core,
      emitting: false, maxAliveParticles: E.maxAlive,
    }).setDepth(DEPTH.player + 1).setBlendMode(Phaser.BlendModes.ADD) : null;
    this._escortT = 0; // emit throttle accumulator (ms)

    // --- pooled high-five spark-slap FLASH (created ONCE) ---------------------
    this._slapFlash = scene.add.image(0, 0, "equipflash")
      .setDepth(DEPTH.player + 3).setVisible(false);
    if (webgl) this._slapFlash.setBlendMode(Phaser.BlendModes.ADD);

    // --- preallocated per-player scratch (ZERO per-frame allocation) ----------
    const n = players.length;
    this._prevComplete = false;         // exit high-five: completion rising-edge latch
    this._hiFired = false;              // one-shot per completion

    this._prevReeler = new Array(n).fill(null); // reel-arrival edge detector (prev reeler ref)
    this._catchT = new Float32Array(n);         // reeler catch-pose envelope (ms remaining), by REELER idx
    this._catchBuddy = new Array(n).fill(null); // the arrived buddy the reeler looks at

    this._carryT = new Float32Array(n);         // ms a buddy has been carried (wave after >2s)
    this._waveLook = new Float32Array(n);       // smoothed wave look-offset (fps-independent lerp)

    this._prevDead = players.map((p) => !!p.dead); // respawn dead->alive edge detector
    this._noticeT = new Float32Array(n);           // surviving-partner notice envelope (ms), by SURVIVOR idx
    this._noticeTarget = new Array(n).fill(null);  // the respawn beam (the respawning partner) to track
    this._noticeLook = new Float32Array(n * 2);    // smoothed pupil offset (x,y) toward the beam
  }

  // One frame. Called by AnimSystem.update() LAST (after every rig + all game logic)
  // and ONLY when the rig is enabled — so ?animoff=1 never runs this and the two
  // robots render byte-identically. The reel/carry/respawn writers run AFTER the rig
  // placed the pupil/antenna parts this frame, so their offsets ride on top cleanly
  // and never accumulate (the rig re-places from scratch next frame).
  update(time, delta) {
    this._updateHighFive();
    this._updateReelCatch(delta);
    this._updateEscortSpark(delta, time);
    this._updateCarryWave(delta, time);
    this._updateRespawnNotice(delta);
  }

  // EXIT HIGH-FIVE — fired off the completion STATE (never intercepts finishLevel).
  _updateHighFive() {
    const s = this.scene;
    const complete = !!s.complete;
    // rising edge of completion: finishLevel just ran this frame. Fire the reaction
    // ONCE. (update() early-returns next frame; the tween carries it from here.)
    if (complete && !this._prevComplete && !this._hiFired) {
      this._hiFired = true;
      this._fireHighFive();
    }
    if (!complete) this._hiFired = false; // re-arm (harmless; a restart rebuilds anyway)
    this._prevComplete = complete;
  }

  _fireHighFive() {
    const s = this.scene, players = s.players;
    if (!players || players.length < 2) return;
    const a = players[0], b = players[1];
    if (!a || !b || a.dead || b.dead) return; // both must be present (they are, at the exit)
    const H = MOTION.HIFIVE;
    // turn toward each other (cosmetic facing/flip; present() preserves it).
    const dAB = Math.sign(b.x - a.x) || 1;
    a.facing = dAB; if (a.setFlipX) a.setFlipX(dAB < 0);
    b.facing = -dAB; if (b.setFlipX) b.setFlipX(-dAB < 0);
    // the spark-slap contact point: between their upper bodies.
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2 - 14;
    let slapped = false;
    // one TweenManager counter drives the whole reaction (<=900ms) THROUGH the finish
    // gap. onUpdate runs on the scene UPDATE event — AFTER present() sets the sprite
    // angle — so the lean wins the frame. Rotation is purely visual (physics paused;
    // _syncBody, which reads scale not rotation, is not running post-complete).
    s.tweens.addCounter({
      from: 0, to: 1, duration: H.dur, ease: "sine.inOut",
      onUpdate: (tw) => {
        const p = tw.getValue();
        const env = Math.sin(Math.min(1, Math.max(0, p)) * Math.PI); // 0 -> 1 -> 0 lean
        if (a.scene) a.setAngle(dAB * H.lean * env);   // A leans toward B
        if (b.scene) b.setAngle(-dAB * H.lean * env);  // B leans toward A
        if (!slapped && p >= H.slapAt) {
          slapped = true;
          if (s.sparks) s.sparks.emitParticleAt(mx, my, s.fxBudget(H.sparks));
          const fl = this._slapFlash;
          if (fl && fl.scene) {
            s.tweens.killTweensOf(fl);
            fl.setVisible(true).setPosition(mx, my).setScale(0.4).setAlpha(0.95);
            s.tweens.add({
              targets: fl, scale: 1.5, alpha: 0, duration: H.flashDur, ease: "cubic.out",
              onComplete: () => fl.setVisible(false),
            });
          }
        }
      },
      onComplete: () => {
        if (a.scene) a.setAngle(0);
        if (b.scene) b.setAngle(0);
      },
    });
  }

  // REEL ARRIVAL — reeler "caught you" brace + catch glance when a reeled buddy lands.
  _updateReelCatch(dt) {
    const players = this.scene.players;
    if (!players) return;
    const C = MOTION.REEL_CATCH;
    // 1) edge-detect arrivals: p.reeled non-null last frame, null now, both alive.
    for (let i = 0; i < players.length; i++) {
      const p = players[i], prev = this._prevReeler[i];
      if (prev && !p.reeled && !prev.dead && !p.dead) {
        // arrival (not a death cancel): brace the REELER (prev), looking at p.
        const ri = prev.idx;
        this._catchT[ri] = C.dur;
        this._catchBuddy[ri] = p;
        if (this.scene.sparks) {
          this.scene.sparks.emitParticleAt(prev.x, prev.y - 6, this.scene.fxBudget(C.sparks));
        }
      }
      this._prevReeler[i] = p.reeled || null;
    }
    // 2) play the catch pose on any reeler with a live envelope (cosmetic; runs AFTER
    //    the rig, so the rotation + pupil offset ride on top and clear with no residue).
    for (let i = 0; i < players.length; i++) {
      if (this._catchT[i] <= 0) continue;
      this._catchT[i] -= dt;
      const t = this._catchT[i] > 0 ? this._catchT[i] : 0;
      const prog = 1 - t / C.dur;                 // 0..1 over the brace
      const env = Math.sin(prog * Math.PI);       // 0 -> 1 -> 0 recoil
      const reeler = players[i], buddy = this._catchBuddy[i];
      if (!reeler || reeler.dead || !reeler.scene) { this._catchT[i] = 0; continue; }
      const rig = this._rigs[i];
      const dir = buddy ? (Math.sign(buddy.x - reeler.x) || 1) : 1;
      // brace: lean back AWAY from the incoming buddy (host rotation — visual only).
      reeler.setAngle((reeler.angle || 0) - dir * C.lean * env);
      // catch glance: pupils toward the caught buddy (pooled part offset, post-rig).
      this._offsetPupils(rig, dir * C.look * env, -0.6 * env);
      if (this._catchT[i] <= 0) { this._catchT[i] = 0; this._catchBuddy[i] = null; }
    }
  }

  // ESCORT HAND-HOLD SPARK — soft light drifts between a phase buddy + its non-phase
  // partner while escorting inside a shimmer wall. Pooled + budgeted; throttled emit.
  _updateEscortSpark(dt, time) {
    if (!this.escortSpark) return; // WebGL-only (Canvas: zero cost, like shimmerSparks)
    const players = this.scene.players;
    if (!players || players.length < 2) return;
    const E = MOTION.ESCORT_SPARK;
    // find the phase robot + its partner (passive reads of the SAME escort state the
    // phase-wall collider uses: skill === "phase", within range, inside the shimmer).
    let phase = null, other = null;
    for (let i = 0; i < players.length; i++) {
      if (players[i].skill === "phase") { phase = players[i]; other = players[i].partner; break; }
    }
    let escorting = false, px = 0, py = 0, ox = 0, oy = 0;
    if (phase && other && !phase.dead && !other.dead) {
      const dx = other.x - phase.x, dy = other.y - phase.y;
      if (dx * dx + dy * dy < E.range * E.range && (phase.inPhaseWall || other.inPhaseWall)) {
        escorting = true; px = phase.x; py = phase.y; ox = other.x; oy = other.y;
      }
    }
    if (!escorting) { this._escortT = 0; return; }
    this._escortT += dt;
    if (this._escortT >= E.gap) {
      this._escortT = 0;
      // a point drifting along the hand-hold line between them.
      const f = 0.5 + 0.32 * Math.sin(time / 190);
      const sx = px + (ox - px) * f, sy = py + (oy - py) * f - 8;
      const n = this.scene.fxBudget(E.count);
      if (n > 0) this.escortSpark.emitParticleAt(sx, sy, n);
    }
  }

  // CARRIED BUDDY WAVE — a buddy carried for >2s waves at the camera (cosmetic
  // antenna sway + a look toward the viewer; pooled part offsets, post-rig).
  _updateCarryWave(dt, time) {
    const players = this.scene.players;
    if (!players) return;
    const W = MOTION.CARRY_WAVE;
    // frame-rate-independent smoothing (FL-013): k is the per-60fps-frame fraction.
    const lerp = 1 - Math.pow(1 - W.ease / 60, (dt / 1000) * 60);
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      const carried = !!p.carriedBy && !p.dead;
      if (carried) this._carryT[i] += dt; else this._carryT[i] = 0;
      const rig = this._rigs[i];
      let want = 0, waving = false;
      if (carried && this._carryT[i] > W.after) {
        waving = true;
        const ph = (time / W.period) * Math.PI * 2;
        want = Math.sin(ph); // -1..1 side-to-side wave
        // antenna waves side to side (pooled antenna part offset, post-rig).
        this._offsetAntenna(rig, want * W.antAmp, -Math.abs(want) * 1.2);
      }
      // smooth the look toward the camera so it eases in/out with the wave.
      this._waveLook[i] += ((waving ? want : 0) - this._waveLook[i]) * lerp;
      if (waving || Math.abs(this._waveLook[i]) > 0.01) {
        this._offsetPupils(rig, this._waveLook[i] * W.lookAmp, 1.0 * (waving ? 1 : 0));
      }
    }
  }

  // RESPAWN PARTNER-NOTICES — the surviving partner's pupils track the respawn beam.
  _updateRespawnNotice(dt) {
    const players = this.scene.players;
    if (!players) return;
    const R = MOTION.RESPAWN_NOTICE;
    // edge-detect respawn (dead -> alive): arm the SURVIVING partner to notice the beam.
    for (let i = 0; i < players.length; i++) {
      const p = players[i], wasDead = this._prevDead[i];
      if (wasDead && !p.dead) {
        const q = p.partner;
        if (q && !q.dead) { this._noticeT[q.idx] = R.dur; this._noticeTarget[q.idx] = p; }
      }
      this._prevDead[i] = !!p.dead;
    }
    // frame-rate-independent smoothing (FL-013): k is the per-60fps-frame fraction.
    const lerp = 1 - Math.pow(1 - R.ease / 60, (dt / 1000) * 60);
    for (let i = 0; i < players.length; i++) {
      const q = players[i];
      let tx = 0, ty = 0;
      if (this._noticeT[i] > 0) {
        this._noticeT[i] -= dt;
        const t = this._noticeT[i] > 0 ? this._noticeT[i] : 0;
        const env = Math.sin((1 - t / R.dur) * Math.PI); // 0 -> 1 -> 0 glance
        const beam = this._noticeTarget[i];
        if (beam && !q.dead) {
          const dx = beam.x - q.x, dy = beam.y - q.y, d = Math.hypot(dx, dy) || 1;
          tx = (dx / d) * R.range * env;
          ty = (dy / d) * R.range * env;
        }
        if (this._noticeT[i] <= 0) { this._noticeT[i] = 0; this._noticeTarget[i] = null; }
      }
      // smooth the pupil offset toward the beam (fps-independent lerp) — clean return.
      const kx = i * 2, ky = i * 2 + 1;
      this._noticeLook[kx] += (tx - this._noticeLook[kx]) * lerp;
      this._noticeLook[ky] += (ty - this._noticeLook[ky]) * lerp;
      if (Math.abs(this._noticeLook[kx]) > 0.01 || Math.abs(this._noticeLook[ky]) > 0.01) {
        this._offsetPupils(this._rigs[i], this._noticeLook[kx], this._noticeLook[ky]);
      }
    }
  }

  // --- pooled-part offset helpers -------------------------------------------
  // Add a cosmetic offset to the rig's PUPIL part AFTER the rig placed it this frame
  // (the rig re-places from scratch next frame, so nothing accumulates). Scaled by the
  // host's live display scale so it tracks heavy/tiny forms; only while the part is
  // actually visible (respects the blink hide). Writes NOTHING to the body.
  _offsetPupils(rig, dx, dy) {
    if (!rig || !rig._pupils) return;
    const part = rig._pupils, obj = part.obj, host = rig.host;
    if (!obj || !obj.visible || !host) return;
    const sc = host.scaleX < 0 ? -host.scaleX : host.scaleX;
    obj.x += dx * sc;
    obj.y += dy * sc;
  }

  _offsetAntenna(rig, dx, dy) {
    if (!rig || !rig._ant) return;
    const part = rig._ant, obj = part.obj, host = rig.host;
    if (!obj || !obj.visible || !host) return;
    const sc = host.scaleX < 0 ? -host.scaleX : host.scaleX;
    obj.x += dx * sc;
    obj.y += dy * sc;
  }

  destroy() {
    if (this.escortSpark) {
      const es = this.scene._budgetEmitters;
      if (es) { const k = es.indexOf(this.escortSpark); if (k >= 0) es.splice(k, 1); }
      this.escortSpark.destroy();
      this.escortSpark = null;
    }
    if (this._slapFlash) { this._slapFlash.destroy(); this._slapFlash = null; }
  }
}
