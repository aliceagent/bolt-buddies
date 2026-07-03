import Phaser from "phaser";
import { PHYS, DEPTH } from "../constants.js";
import { sfx } from "../audio.js";

export default class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, idx) {
    super(scene, x, y, idx === 0 ? "robot_b" : "robot_o");
    this.idx = idx;
    this.pname = idx === 0 ? "BEEP" : "BOOP";
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(DEPTH.player);
    this.body.setSize(30, 42).setOffset(7, 6);
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
      // would embed it in the floor beyond what arcade separation can resolve
      const feet = this.body.bottom;
      this.setScale(skill === "heavy" ? 1.22 : 0.55);
      this.body.reset(this.x, feet - this.displayHeight / 2);
    }
    if (this.badge) this.badge.destroy();
    this.badge = this.scene.add.image(this.x, this.y - 40, `icon_${skill}`).setDepth(DEPTH.badge).setScale(0.8);
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
      if (Phaser.Input.Keyboard.JustDown(K.jump)) this.scene.detachCarry(c, this, true);
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
      else if (this.lastVy > 480) sfx.land();
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
    }
    // variable jump height
    if (!K.jump.isDown && body.velocity.y < -260) body.velocity.y = -260;
    if (this.stomping) body.velocity.y = 980;
  }
}
