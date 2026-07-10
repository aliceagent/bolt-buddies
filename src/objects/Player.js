import Phaser from "phaser";
import { PHYS, DEPTH, SKILL_INFO, TILE } from "../constants.js";
import { sfx } from "../audio.js";
import { MOTION } from "../anim/motion.js";

// The one true collision box, in unscaled texture pixels: 30x42 at offset
// (7,6). Gameplay was tuned around this box (at the skill base scale) — it
// must NEVER drift. Arcade derives body width/height from sourceWidth*scale
// and body position from offset*scale, so the visual squash multipliers are
// divided back out of both in _syncBody() every frame.
const BODY = { w: 30, h: 42, ox: 7, oy: 6 };

export default class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, idx) {
    super(scene, x, y, idx === 0 ? "robot_b" : "robot_o");
    this.idx = idx;
    this.pname = idx === 0 ? "BEEP" : "BOOP";
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(DEPTH.player);
    this.body.setSize(BODY.w, BODY.h).setOffset(BODY.ox, BODY.oy);
    this.setMaxVelocity(1000, PHYS.maxFall);

    this.skill = null;
    this.facing = 1;
    this.carrying = null; // partner we hold overhead
    this.carriedBy = null; // partner holding us
    this.zip = null; // {x, y, hang, arrived, t}
    this.reeled = null; // player pulling us
    this.stomping = false;
    this.dead = false;
    this.invuln = 0;
    this.coyote = 0;
    this.jumpBuf = 0;
    this.pickupCd = 0;
    this.wasGround = false;
    this.lastVy = 0;
    this.standingOn = null;
    this.badge = null;

    // --- W3W4 M3: World-3 skill/terrain state -------------------------------
    // ALL of these rest at 0/null in shipped levels (only W3 skills/ents set
    // them), so every branch that reads them is inert outside World 3.
    this.bubbleT = 0;      // ms of bubble-shield remaining (0 = not bubbled)
    this.bubbleCd = 0;     // ms until the bubble may be blown again
    this.bubbleShell = null; // pooled shell image, created by GameScene on W3 levels
    this.magCrate = null;  // metal crate currently drag-latched to this magnet
    this.magCling = null;  // { railY } while hanging from a steel rail
    this.inWater = null;   // the water volume overlapping this robot (set per frame)
    this.airMs = 0;        // un-bubbled submerged time toward PHYS.waterAirMs

    // --- presentation state (Sprint 3) -------------------------------------
    this.baseKey = idx === 0 ? "robot_b" : "robot_o";
    // squash & stretch is a MULTIPLIER on the skill base scale so heavy/tiny and
    // squash compose without ever hardcoding 1.0 or touching the physics body
    this.baseScaleX = 1;
    this.baseScaleY = 1;
    this.sqX = 1; // live squash multipliers, animated by tweens
    this.sqY = 1;
    this._sqTween = null;
    this.tilt = 0; // lerped sprite lean (degrees)
    // --- ANIM A2 locomotion channels (driven by the rig, applied physics-safe) --
    // The rig writes these each frame; applyLocomotion composes them onto the
    // visual transform and _syncBody counter-corrects the body so geometry never
    // drifts (same guarantee the squash multipliers already have). animBobY is a
    // VISUAL vertical offset: the sprite is translated by it and the body offset
    // cancels it exactly, so the collision box (size + world position) is unchanged.
    this.animLeanDeg = 0; // extra lean from the rig (skid back-lean, air tilt)
    this.animSX = 1; // rig scale-X multiplier (tiny step-crest micro-squash)
    this.animSY = 1; // rig scale-Y multiplier
    this._appliedBobY = 0; // the visual bob currently added to this.y (undo-tracked)
    this.blinkTimer = Phaser.Math.Between(3000, 5000); // next blink
    this.blinking = 0; // ms remaining of the current blink
    this.dustCd = 0; // throttles run-dust puffs

    // --- P6 static-art attachments (all pooled, created ONCE) --------------
    // Shadow blob: soft ellipse pinned to the ground under the robot, shrunk with
    // height and hidden while carried. `_groundY` tracks the last grounded feet Y.
    this._groundY = y;
    this.shadow = scene.add.image(x, y, "shadow").setDepth(DEPTH.shadow).setAlpha(0.35);
    // Phase afterimage: a fixed-length ring buffer of recent poses (NO per-frame
    // allocation — slots are overwritten in place) feeding 3 lagged ghost copies.
    this._poseRing = [];
    for (let i = 0; i < 18; i++) this._poseRing.push({ x, y, flipX: false, sx: 1, sy: 1, angle: 0 });
    this._poseHead = 0;
    this._poseCount = 0;
    this.phaseGhosts = [];
    for (let i = 0; i < 3; i++) {
      this.phaseGhosts.push(scene.add.image(x, y, this.baseKey).setDepth(DEPTH.player - 1).setVisible(false));
    }
    // Edge shimmer overlay: violet silhouette outline over the robot while phasing;
    // additive glow gated to WebGL (baked-violet art carries the read on Canvas).
    this.phaseEdge = scene.add.image(x, y, "phaseedge").setDepth(DEPTH.player + 1).setVisible(false);
    if (scene.game.renderer.type === Phaser.WEBGL) this.phaseEdge.setBlendMode(Phaser.BlendModes.ADD);
  }

  get partner() {
    return this.scene.players[1 - this.idx];
  }

  // Heavy counts double on pressure plates; a carried buddy adds their weight too.
  get weight() {
    return (this.skill === "heavy" ? 2 : 1) + (this.carrying ? (this.carrying.skill === "heavy" ? 2 : 1) : 0);
  }

  get grounded() {
    return this.body.blocked.down || this.body.touching.down;
  }

  setSkill(skill) {
    this.skill = skill;
    if (skill === "heavy" || skill === "tiny") {
      // keep the feet planted: rescaling the body around the sprite centre
      // would embed it in the floor beyond what arcade separation can resolve.
      // The skill scale becomes the stored baseScale that squash multiplies.
      // Kill any in-flight squash first so the reset sees clean geometry.
      if (this._sqTween) this._sqTween.stop();
      this.sqX = this.sqY = 1;
      const feet = this.body.bottom;
      this.baseScaleX = this.baseScaleY = skill === "heavy" ? 1.22 : 0.55;
      this.setScale(this.baseScaleX, this.baseScaleY);
      this._syncBody();
      this.body.reset(this.x, feet - this.displayHeight / 2);
    }
    // heavy dress-up: darker plate tint over the existing scale (WebGL renderer)
    if (skill === "heavy") this.setTint(0xc59a63);
    else this.clearTint();
    // skill badge above head: a rounded chip — icon on a dark pill with a
    // skill-coloured border (rebuilt on equip only, never per frame)
    if (this.badge) this.badge.destroy();
    const color = (SKILL_INFO[skill] && SKILL_INFO[skill].color) || 0xffffff;
    const pill = this.scene.add.graphics();
    pill.fillStyle(0x0a0f1e, 0.92).fillRoundedRect(-16, -13, 32, 26, 8);
    pill.lineStyle(2, color).strokeRoundedRect(-16, -13, 32, 26, 8);
    const ic = this.scene.add.image(0, 0, `icon_${skill}`).setScale(0.68);
    this.badge = this.scene.add.container(this.x, this.y - 40, [pill, ic]).setDepth(DEPTH.badge);
  }

  // Jump-start stretch: tall & thin, tweened back to the skill base scale.
  jumpStretch() {
    if (this._sqTween) this._sqTween.stop();
    this.sqX = 0.9;
    this.sqY = 1.12;
    this._sqTween = this.scene.tweens.add({
      targets: this, sqX: 1, sqY: 1, duration: 220, ease: "back.out",
    });
  }

  // Landing squash: short & wide, 90ms yoyo back to the base scale.
  landSquash() {
    if (this._sqTween) this._sqTween.stop();
    this.sqX = 1;
    this.sqY = 1;
    this._sqTween = this.scene.tweens.add({
      targets: this, sqX: 1.1, sqY: 0.85, duration: 90, yoyo: true, ease: "quad.out",
      onComplete: () => { this.sqX = 1; this.sqY = 1; },
    });
  }

  // CRITICAL physics-drift guard: the squash multipliers are visual-only. The
  // sprite's scale includes them, but Arcade computes the body's width/height
  // as sourceWidth*scale and its position as x + scale*(offset-displayOrigin),
  // so both are counter-scaled here — the collision box stays exactly BODY at
  // the skill baseScale no matter what the squash tweens do. Runs in preUpdate
  // (scene PRE_UPDATE), i.e. before the physics world steps this frame, and
  // always in the same frame as the scale write so the pair is never split.
  _syncBody() {
    const b = this.body;
    if (!b) return;
    // total visual scale = squash (tween) * rig anim multiplier. Both are divided
    // back out so body width/height stay exactly BODY at the skill baseScale.
    const sX = this.sqX * this.animSX;
    const sY = this.sqY * this.animSY;
    b.setSize(BODY.w / sX, BODY.h / sY, false);
    // The bob translate added to this.y is cancelled here: body worldY =
    // spriteY + scaleY*(offsetY - originY); subtracting animBobY/scaleY from the
    // offset removes exactly the +animBobY on the sprite, so the body never moves.
    b.setOffset(
      this.displayOriginX + (BODY.ox - this.displayOriginX) / sX,
      this.displayOriginY + (BODY.oy - this.displayOriginY) / sY
        - this._appliedBobY / (this.baseScaleY * sY)
    );
  }

  // ANIM A2: apply one frame of rig-driven locomotion — a VISUAL vertical bob, an
  // extra lean, and scale multipliers — on top of the base scale + squash tweens.
  // Called by the rig AFTER Player.present() each frame (rig runs at end of the
  // scene update). Everything here is counter-corrected in _syncBody so the
  // physics body's size and world position are byte-identical to the un-animated
  // frame — the bob/lean/micro-squash never leak into collision (physics sacred).
  applyLocomotion(bobY, leanDeg, sxMul, syMul) {
    // undo last frame's visual bob before re-applying, so the sprite offset never
    // accumulates (the body position is authoritative; the bob is pure overlay)
    this.y -= this._appliedBobY;
    this.y += bobY;
    this._appliedBobY = bobY;
    this.animLeanDeg = leanDeg;
    this.animSX = sxMul;
    this.animSY = syMul;
    this.scaleX = this.baseScaleX * this.sqX * sxMul;
    this.scaleY = this.baseScaleY * this.sqY * syMul;
    this.setAngle(this.tilt + leanDeg);
    this._syncBody();
  }

  // Drop any rig-applied visual offset back to neutral (called when the anim
  // system is disabled — the A/B switch — so toggling it off leaves the body and
  // sprite exactly where the un-animated game would have them).
  clearLocomotion() {
    if (this._appliedBobY) this.y -= this._appliedBobY;
    this._appliedBobY = 0;
    this.animLeanDeg = 0;
    this.animSX = 1;
    this.animSY = 1;
  }

  // Blink, sprite lean, carried wiggle, and the squash/skill scale compose here —
  // called every frame regardless of movement state. The physics body is
  // re-asserted via _syncBody so none of it leaks into collision geometry.
  present(time, delta) {
    // texture state: a dead robot rests on the base pose; a carried buddy shows
    // the arms-up carry pose (P6 static art); otherwise it blinks. All are simple
    // texture swaps (Canvas-safe), keeping the current flip/scale.
    if (this.dead) {
      if (this.texture.key !== this.baseKey) this.setTexture(this.baseKey);
    } else if (this.carriedBy) {
      const ck = `${this.baseKey}_carry`;
      if (this.texture.key !== ck) this.setTexture(ck);
    } else {
      // returning from a carry: drop the arms-up pose before blinking resumes
      if (this.texture.key === `${this.baseKey}_carry`) this.setTexture(this.baseKey);
      // blink: swap to the eyes-closed texture for 120ms every 3-5s.
      if (this.blinking > 0) {
        this.blinking -= delta;
        if (this.blinking <= 0) {
          this.setTexture(this.baseKey);
          this.blinkTimer = Phaser.Math.Between(3000, 5000);
        }
      } else {
        this.blinkTimer -= delta;
        if (this.blinkTimer <= 0) {
          // A3: blink retimed onto the MOTION token (the rig hides the pupil
          // overlay for this window so the blink reads on the baked eyes).
          this.blinking = MOTION.BLINK.dur;
          this.setTexture(`${this.baseKey}_blink`);
        }
      }
    }

    // sprite lean: carried buddies tilt 10deg and wiggle; walkers lean toward
    // travel; everyone else lerps back upright
    let target = 0;
    if (this.carriedBy) target = 10 + Math.sin(time / 110) * 4;
    else if (this.grounded && Math.abs(this.body.velocity.x) > 40) target = this.facing * 4;
    this.tilt = Phaser.Math.Linear(this.tilt, target, Math.min(1, (delta / 1000) * 10));
    this.setAngle(this.tilt);

    // Body transform ownership: when the anim system is ON, the rig's
    // applyLocomotion() (run at the END of the scene update) is the SOLE writer of
    // scale + body sync each frame — it composes the squash tweens, the skill base
    // scale AND the rig multipliers/bob in one pass, so _syncBody runs exactly once
    // per frame (no A2 cost regression, no 1-frame compensation lag). When the anim
    // system is OFF (the A/B switch, or non-Game contexts), present() owns it and
    // restores the un-animated transform.
    if (!this.scene.anim || !this.scene.anim.enabled) {
      if (this._appliedBobY) this.clearLocomotion();
      this.scaleX = this.baseScaleX * this.sqX;
      this.scaleY = this.baseScaleY * this.sqY;
      this._syncBody();
    }

    // P6 shadow blob: parked on the last-grounded feet line, shrinking as the
    // robot lifts off it and hidden while carried/dead. Visual-only — reads the
    // body geometry, never writes it.
    const feet = this.body.bottom;
    if (this.grounded) this._groundY = feet;
    const lift = Math.max(0, this._groundY - feet); // px off the ground
    const sc = Phaser.Math.Clamp(1 - lift / 320, 0.34, 1);
    this.shadow.setPosition(this.x, this._groundY - 2);
    this.shadow.setScale(sc * this.baseScaleX, sc);
    this.shadow.setAlpha(0.35 * sc);
    this.shadow.setVisible(this.visible && !this.dead && !this.carriedBy);

    // Phase art is painted by the scene only for a live, un-carried robot; make
    // sure a dead/carried phase-walker's ghosts + edge don't freeze on screen.
    if (this.dead || this.carriedBy) {
      for (const gh of this.phaseGhosts) if (gh.visible) gh.setVisible(false);
      if (this.phaseEdge.visible) this.phaseEdge.setVisible(false);
    }
  }

  beginZip(x, y, hang) {
    this.clearStates();
    this.zip = { x, y, hang, arrived: false, t: 0 };
    this.body.setAllowGravity(false);
    sfx.zip();
  }

  endZip(vx = 0, vy = 0) {
    if (!this.zip) return;
    this.zip = null;
    this.body.setAllowGravity(true);
    this.setVelocity(vx, vy);
  }

  startReeled(by) {
    this.clearStates();
    this.reeled = by;
    this.body.setAllowGravity(false);
    this.setVelocity(0, 0);
    sfx.reel();
  }

  endReeled() {
    if (!this.reeled) return;
    this.reeled = null;
    this.body.setAllowGravity(true);
  }

  startStomp() {
    this.stomping = true;
    this.setVelocity(this.body.velocity.x * 0.3, 980);
  }

  // --- W3W4 M3: steel-rail cling (MAGNET GLOVE) ------------------------------
  // Mirrors the zip-hang state pattern: gravity off + a scripted movement branch
  // in preUpdate, released by fresh jump input. The body is snapped just under
  // the rail underside; traverse is plain velocity (collisions still apply).
  startMagCling(railRow) {
    this.clearStates();
    const undersideY = (railRow + 1) * TILE;
    this.magCling = { railY: railRow * TILE + 24 }; // probe y inside the rail row
    this.body.setAllowGravity(false);
    this.setVelocity(0, 0);
    this.body.reset(this.x, undersideY + this.displayHeight / 2 - 2);
    sfx.railCling();
  }

  endMagCling() {
    if (!this.magCling) return;
    this.magCling = null;
    this.body.setAllowGravity(true);
  }

  updateMagCling(delta) {
    const K = this.keys;
    const P = this.pad;
    const body = this.body;
    body.velocity.y = 0;
    let vx = 0;
    if (K.left.isDown || (P && P.left.isDown)) {
      vx = -PHYS.clingSpeed;
      this.facing = -1;
      this.setFlipX(true);
    } else if (K.right.isDown || (P && P.right.isDown)) {
      vx = PHYS.clingSpeed;
      this.facing = 1;
      this.setFlipX(false);
    }
    // edge stop: only traverse while a rail tile continues overhead ahead
    if (vx !== 0 && this.scene.tileAt) {
      const ahead = this.scene.tileAt(this.x + Math.sign(vx) * (body.halfWidth + 8), this.magCling.railY);
      if (ahead !== "=") vx = 0;
    }
    body.velocity.x = vx;
    // drop on jump (fresh input releases — mirrors the zip-hang release chord)
    if (Phaser.Input.Keyboard.JustDown(K.jump) || (P && P.jumpJust)) {
      this.endMagCling();
      sfx.railDrop();
    }
  }

  clearStates() {
    this.endZip();
    this.endReeled();
    this.endMagCling(); // W3: a rail-clinger grabbed/killed/reeled lets go
    this.stomping = false;
    this.standingOn = null;
  }

  updateZip(delta) {
    const z = this.zip;
    z.t += delta;
    const K = this.keys;
    if (!z.arrived) {
      const dx = z.x - this.x;
      const dy = z.y + 44 - this.y;
      const d = Math.hypot(dx, dy);
      if (d < 28 || z.t > 1400) {
        if (!z.hang) {
          this.endZip(this.body.velocity.x * 0.25, -260);
          return;
        }
        z.arrived = true;
        sfx.hangLatch(); // clicked onto the hang-anchor
        this.setPosition(z.x, z.y + 44);
        this.setVelocity(0, 0);
      } else {
        this.setVelocity((dx / d) * PHYS.zipSpeed, (dy / d) * PHYS.zipSpeed);
      }
      return;
    }
    // hanging under the anchor — any fresh input releases
    this.setVelocity(0, 0);
    this.setPosition(z.x, z.y + 44);
    const J = Phaser.Input.Keyboard.JustDown;
    const P = this.pad;
    if (J(K.jump) || (P && P.jumpJust)) this.endZip(0, -380);
    else if (J(K.left) || (P && P.leftJust)) this.endZip(-270, -140);
    else if (J(K.right) || (P && P.rightJust)) this.endZip(270, -140);
  }

  preUpdate(time, delta) {
    super.preUpdate(time, delta);
    if (this.invuln > 0) {
      this.invuln -= delta;
      this.setAlpha(this.invuln > 0 ? (Math.floor(time / 80) % 2 ? 0.35 : 0.9) : 1);
    }
    this.present(time, delta);
    if (this.badge) {
      this.badge.setPosition(this.x, this.y - this.displayHeight / 2 - 12);
      this.badge.setVisible(this.visible && !this.dead && !this.carriedBy);
    }
    if (this.dead) return;
    if (this.pickupCd > 0) this.pickupCd -= delta;

    const K = this.keys;
    if (this.carriedBy) {
      const c = this.carriedBy;
      this.setPosition(c.x, c.y - c.displayHeight / 2 - this.displayHeight / 2 + 10);
      if (Phaser.Input.Keyboard.JustDown(K.jump) || (this.pad && this.pad.jumpJust)) {
        sfx.hopOff(); // carried buddy springs off
        this.scene.detachCarry(c, this, true);
      }
      return;
    }
    if (this.zip) {
      this.updateZip(delta);
      return;
    }
    if (this.reeled) return; // GameScene drives us toward the reeler
    if (this.magCling) {
      // W3: hanging from a steel rail — scripted traverse branch (like zip)
      this.updateMagCling(delta);
      return;
    }

    const body = this.body;
    let speed = (this.skill === "heavy" ? PHYS.heavySpeed : this.skill === "tiny" ? 285 : PHYS.speed) * (this.carrying ? 0.85 : 1);
    if (this.inPhaseWall) speed = Math.min(speed, 115); // ghosting through walls is slow going
    // U7: pad virtual keys OR into the keyboard reads (p.pad is a stable object
    // from src/pad.js; absent => keyboard-only, byte-identical behavior).
    const P = this.pad;
    let target = 0;
    if (K.left.isDown || (P && P.left.isDown)) {
      target = -speed;
      this.facing = -1;
      this.setFlipX(true);
    } else if (K.right.isDown || (P && P.right.isDown)) {
      target = speed;
      this.facing = 1;
      this.setFlipX(false);
    }
    const onGround = this.grounded;
    // full control on the ground; in the air, steer if a key is held but keep
    // momentum (throws, zip releases) when no key is pressed
    const k = onGround ? 14 : target !== 0 ? 8 : 0.4;
    body.velocity.x = Phaser.Math.Linear(body.velocity.x, target, Math.min(1, (delta / 1000) * k));
    if (onGround && !this.wasGround) {
      if (this.skill === "heavy" && (this.stomping || this.lastVy > 700)) this.scene.heavyImpact(this, this.stomping);
      else if (this.lastVy > 480) sfx.land(this.x, this.y);
      if (this.lastVy > 260) this.landSquash(); // squash on any real landing
      // W3 bubble: bouncy landings — inert unless bubbled (bubbleT is only ever
      // set by the BUBBLE SHIELD skill, which no shipped level spawns).
      if (this.bubbleT > 0 && this.lastVy > 300 && !this.inWater) {
        body.velocity.y = -Math.min(540, this.lastVy * 0.62);
        sfx.bubbleBounce(this.x, this.y);
      }
      this.stomping = false;
    }
    this.wasGround = onGround;
    this.lastVy = body.velocity.y;

    if (onGround) this.coyote = 120;
    else this.coyote -= delta;
    if (Phaser.Input.Keyboard.JustDown(K.jump) || (P && P.jumpJust)) this.jumpBuf = 130;
    else this.jumpBuf -= delta;
    if (this.jumpBuf > 0 && this.coyote > 0 && !this.stomping) {
      const jv = (this.skill === "heavy" ? PHYS.heavyJump : PHYS.jump) * (this.carrying ? 0.92 : 1);
      body.velocity.y = -jv;
      this.jumpBuf = 0;
      this.coyote = 0;
      sfx.jump();
      this.jumpStretch();
    }
    // variable jump height (cut only when NEITHER keyboard nor pad jump is held)
    if (!K.jump.isDown && !(P && P.jump.isDown) && body.velocity.y < -260) body.velocity.y = -260;

    // --- W3 water volumes: buoyant slow-sink / bubbled free-swim -------------
    // `inWater` is only ever set by a W3 water volume (updateWorld3), so this
    // whole branch is inert in shipped levels. Frame-rate independent eases
    // (1-Math.pow(1-k, dt*60) — the FL-013 pattern).
    if (this.inWater) {
      // cancel this frame's gravity while immersed (the physics step adds
      // grav*dt right after preUpdate; pre-subtracting it here makes the eases
      // below the sole vertical authority — true buoyancy, not a gravity fight)
      body.velocity.y -= PHYS.grav * (delta / 1000);
      if (this.bubbleT > 0) {
        // bubbled: free 4-direction swim — vertical from jump/down, damped idle
        const f = 1 - Math.pow(1 - 0.28, (delta / 1000) * 60);
        let vt = 0;
        if (K.jump.isDown || (P && P.jump.isDown)) vt = -PHYS.swimSpeed;
        else if (K.down.isDown || (P && P.down.isDown)) vt = PHYS.swimSpeed;
        body.velocity.y = Phaser.Math.Linear(body.velocity.y, vt, f);
      } else {
        // normal robot: buoyancy eases vy toward a slow sink (gentle rate so a
        // swim kick still rises ~a tile); a fresh jump press is that kick.
        const fy = 1 - Math.pow(1 - 0.08, (delta / 1000) * 60);
        const fx = 1 - Math.pow(1 - 0.2, (delta / 1000) * 60);
        body.velocity.y = Phaser.Math.Linear(body.velocity.y, PHYS.waterSink, fy);
        if (this.jumpBuf > 0) {
          body.velocity.y = -260;
          this.jumpBuf = 0;
        }
        // water drag caps horizontal speed
        const cap = 130;
        if (body.velocity.x > cap) body.velocity.x = Phaser.Math.Linear(body.velocity.x, cap, fx);
        else if (body.velocity.x < -cap) body.velocity.x = Phaser.Math.Linear(body.velocity.x, -cap, fx);
      }
    }

    if (this.stomping) body.velocity.y = 980;
  }
}
