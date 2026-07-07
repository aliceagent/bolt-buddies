// Bolt Buddies — CharRig + PART SYSTEM (Animation Sprint A1).
//
// A CharRig binds ONE physics host (a player robot, a scuttlebug, a roller, a
// warden, the crane body) to a PoseMachine + a preallocated POSE, and hosts a
// pool of named visual PARTS (pupils, tread overlay, antenna, arm glyphs). Each
// frame the rig:
//   1. probes the host's ALREADY-RESOLVED state into a preallocated status bag,
//   2. advances the pose machine (which fills the pose), and
//   3. places every registered part from the current pose.
//
// A1 registers ZERO visible parts on every character, so step 3 is a no-op and
// the game renders identically to today — this sprint only proves the wiring.
// A2+ call `rig.addPart(...)` to hang the real art.
//
// GROUND RULES:
//   * ZERO per-frame allocation — the status bag + pose are made ONCE; parts are
//     pooled Phaser GameObjects created ONCE at addPart(); placement mutates
//     transforms in place.
//   * PHYSICS IS SACRED — the rig only ever reads host geometry and writes to its
//     OWN parts / the host's visual scale via the pose. It never touches a body.
//   * CANCELABLE — the rig runs as an overlay after game logic; input is already
//     applied. cancelFidget() drops any active fidget the frame input is seen.
//   * CANVAS-SAFE — parts are real drawn Images/Graphics at an explicit depth, not
//     tint-only states.

import Phaser from "phaser";
import { makePose, PoseMachine } from "./pose.js";

// A single visual part hung off a rig. Pooled: created once, repositioned each
// frame, never re-created. `place()` is allocation-free.
class Part {
  // host: the sprite the part follows.
  // obj: a Phaser GameObject (Image or Graphics) — the pooled visual.
  // offset: { x, y } base offset in host-local px (x is mirrored by facing).
  constructor(name, host, obj, offset) {
    this.name = name;
    this.host = host;
    this.obj = obj;
    this.ox = offset && offset.x || 0;
    this.oy = offset && offset.y || 0;
    this.visible = true;
  }

  // Place from the current pose. Mirrors x by facing, adds the pose's body
  // offset + per-part look/tread channels (A2+). Allocation-free.
  place(pose) {
    const h = this.host;
    const face = pose.face || 1;
    this.obj.x = h.x + face * (this.ox + pose.lookX) + pose.ox;
    this.obj.y = h.y + this.oy + pose.oy + pose.lookY;
    this.obj.setFlipX && this.obj.setFlipX(face < 0);
    this.obj.setVisible(this.visible && h.visible);
  }

  destroy() {
    if (this.obj) this.obj.destroy();
    this.obj = null;
  }
}

export class CharRig {
  // scene: the GameScene.
  // host: the physics host GameObject (player / enemy img / crane body).
  // opts:
  //   kind   — "player" | "bug" | "roller" | "warden" | "crane" (for the fidget
  //            scheduler's staggering + later per-kind anim sets).
  //   probe  — (host, statusOut) => void : writes the host's resolved state into
  //            the preallocated status bag. Supplied by AnimSystem per kind.
  //   depth  — base depth for parts (defaults to just above the host).
  constructor(scene, host, opts) {
    this.scene = scene;
    this.host = host;
    this.kind = opts.kind || "player";
    this._probe = opts.probe;
    this.depth = typeof opts.depth === "number" ? opts.depth : (host.depth || 0) + 1;

    this.pose = makePose();
    this.machine = new PoseMachine(this.pose);
    this.parts = []; // pooled; EMPTY in A1 (nothing visible added yet)

    // Preallocated status bag — the probe fills this every frame (NO alloc).
    this.status = {
      dead: false, hurt: false, carrying: false,
      airborne: false, vx: 0, vy: 0, face: 1, input: false,
    };

    // --- shared-fidget-scheduler bookkeeping (owned by FidgetScheduler) ------
    this.idleMs = 0; // how long this character has been input-idle
    this.nextFidgetAt = 0; // absolute time the next fidget may fire (staggered)
    this.activeFidget = null; // the fidget currently playing (A3); null in A1
    this.fidgetCount = 0; // how many fidgets have fired (test surface)
  }

  // Add a pooled visual part. `spec` is either a texture key (creates an Image)
  // or a draw function (fn(g) => void, baked once into a Graphics). Called by
  // A2+; A1 never calls this, so `parts` stays empty and the rig is invisible.
  addPart(name, spec, offset) {
    let obj;
    if (typeof spec === "function") {
      obj = this.scene.add.graphics();
      spec(obj); // bake the drawing ONCE (canvas-safe; not redrawn per frame)
    } else {
      obj = this.scene.add.image(this.host.x, this.host.y, spec);
    }
    obj.setDepth(this.depth);
    const part = new Part(name, this.host, obj, offset);
    this.parts.push(part);
    return part;
  }

  getPart(name) {
    for (let i = 0; i < this.parts.length; i++) if (this.parts[i].name === name) return this.parts[i];
    return null;
  }

  // Input-cancel: drop any active fidget/wait immediately and reset the idle
  // clock. Called by the scheduler the frame input is detected — logic already
  // ran; this just clears the overlay so input is never eaten or delayed.
  cancelFidget() {
    this.idleMs = 0;
    if (this.activeFidget) {
      if (this.activeFidget.stop) this.activeFidget.stop();
      this.activeFidget = null;
    }
  }

  // One frame of the rig, run AFTER game logic (motion is a pure overlay).
  // Allocation-free: probe writes into this.status, the machine mutates the
  // shared pose, parts are placed in place.
  update(time, delta) {
    if (!this.host || this.host.scene == null) return; // host destroyed (e.g. squished bug)
    this._probe(this.host, this.status);
    this.machine.update(this.status, delta);
    // place every pooled part from the resolved pose (no-op in A1: parts empty)
    for (let i = 0; i < this.parts.length; i++) this.parts[i].place(this.pose);
  }

  destroy() {
    for (let i = 0; i < this.parts.length; i++) this.parts[i].destroy();
    this.parts.length = 0;
    this.host = null;
  }
}
