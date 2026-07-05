import Phaser from "phaser";
import { PHYS, DEPTH, SKILL_INFO } from "../constants.js";
import { sfx } from "../audio.js";

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
    this.blinkTimer = Phaser.Math.Between(3000, 5000); // next blink
    this.blinking = 0; // ms remaining of the current blink
    this.dustCd = 0; // throttles run-dust puffs
    this.ghostCd = 0; // throttles phase afterimages
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
    b.setSize(BODY.w / this.sqX, BODY.h / this.sqY, false);
    b.setOffset(
      this.displayOriginX + (BODY.ox - this.displayOriginX) / this.sqX,
      this.displayOriginY + (BODY.oy - this.displayOriginY) / this.sqY
    );
  }

  // Blink, sprite lean, carried wiggle, and the squash/skill scale compose here —
  // called every frame regardless of movement state. The physics body is
  // re-asserted via _syncBody so none of it leaks into collision geometry.
  present(time, delta) {
    // blink: swap to the eyes-closed texture for 120ms every 3-5s, respecting
    // the current flip/scale (setTexture keeps both). Frozen while dead.
    if (!this.dead && !this.carriedBy) {
      if (this.blinking > 0) {
        this.blinking -= delta;
        if (this.blinking <= 0) {
          this.setTexture(this.baseKey);
          this.blinkTimer = Phaser.Math.Between(3000, 5000);
        }
      } else {
        this.blinkTimer -= delta;
        if (this.blinkTimer <= 0) {
          this.blinking = 120;
          this.setTexture(`${this.baseKey}_blink`);
        }
      }
    } else if (this.texture.key !== this.baseKey) {
      this.setTexture(this.baseKey);
    }

    // sprite lean: carried buddies tilt 10deg and wiggle; walkers lean toward
    // travel; everyone else lerps back upright
    let target = 0;
    if (this.carriedBy) target = 10 + Math.sin(time / 110) * 4;
    else if (this.grounded && Math.abs(this.body.velocity.x) > 40) target = this.facing * 4;
    this.tilt = Phaser.Math.Linear(this.tilt, target, Math.min(1, (delta / 1000) * 10));
    this.setAngle(this.tilt);

    // compose squash onto the skill base scale (flip is independent of scale)
    // and immediately counter-scale the body so collision geometry never moves
    this.scaleX = this.baseScaleX * this.sqX;
    this.scaleY = this.baseScaleY * this.sqY;
    this._syncBody();
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

  clearStates() {
    this.endZip();
    this.endReeled();
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
    if (J(K.jump)) this.endZip(0, -380);
    else if (J(K.left)) this.endZip(-270, -140);
    else if (J(K.right)) this.endZip(270, -140);
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
      if (Phaser.Input.Keyboard.JustDown(K.jump)) {
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

    const body = this.body;
    let speed = (this.skill === "heavy" ? PHYS.heavySpeed : this.skill === "tiny" ? 285 : PHYS.speed) * (this.carrying ? 0.85 : 1);
    if (this.inPhaseWall) speed = Math.min(speed, 115); // ghosting through walls is slow going
    let target = 0;
    if (K.left.isDown) {
      target = -speed;
      this.facing = -1;
      this.setFlipX(true);
    } else if (K.right.isDown) {
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
      this.stomping = false;
    }
    this.wasGround = onGround;
    this.lastVy = body.velocity.y;

    if (onGround) this.coyote = 120;
    else this.coyote -= delta;
    if (Phaser.Input.Keyboard.JustDown(K.jump)) this.jumpBuf = 130;
    else this.jumpBuf -= delta;
    if (this.jumpBuf > 0 && this.coyote > 0 && !this.stomping) {
      const jv = (this.skill === "heavy" ? PHYS.heavyJump : PHYS.jump) * (this.carrying ? 0.92 : 1);
      body.velocity.y = -jv;
      this.jumpBuf = 0;
      this.coyote = 0;
      sfx.jump();
      this.jumpStretch();
    }
    // variable jump height
    if (!K.jump.isDown && body.velocity.y < -260) body.velocity.y = -260;
    if (this.stomping) body.velocity.y = 980;
  }
}
