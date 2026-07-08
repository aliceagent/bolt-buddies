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
//
// A2 gave each part an explicit set of POSE CHANNELS it subscribes to (via the
// `opts` flags) so a pupil follows the eye-look channel, a tread follows the
// scroll channel, and an antenna follows the bend channel — instead of A1's
// one-size placement that fed every channel into every part. The part also
// tracks the host's visual scale so overlays stay glued on heavy/tiny forms.
class Part {
  // host: the sprite the part follows.
  // obj: a Phaser GameObject (Image / TileSprite) — the pooled visual.
  // offset: { x, y } base offset in host-LOCAL texture px (x mirrored by facing,
  //         both scaled by the host's live display scale so parts track the form).
  // opts: { look, antenna, tread } — which pose channels this part subscribes to.
  constructor(name, host, obj, offset, opts) {
    this.name = name;
    this.host = host;
    this.obj = obj;
    this.ox = offset && offset.x || 0;
    this.oy = offset && offset.y || 0;
    this.useLook = !!(opts && opts.look);
    this.useAntenna = !!(opts && opts.antenna);
    // A3: a free-spinning glyph part (grapple's twirled hook) reads its rotation +
    // alpha from the pose's glyph channels instead of inheriting the host transform.
    this.useGlyph = !!(opts && opts.glyph);
    // A4: a reach-out ARM glyph (zip). Like the glyph it reads its OWN world-aimed
    // rotation + reach length + alpha from the pose, not the host transform.
    this.useArm = !!(opts && opts.arm);
    // A5: an antenna FEELER (scuttlebug). Sits at a facing-mirrored offset but reads
    // its OWN rotation = base V-splay + pose.feelerBend*side, mirrored by facing —
    // so the two feelers scissor on a twitch and flare apart on the alarm rear-up.
    this.useFeeler = !!(opts && opts.feeler);
    if (this.useFeeler) { this.feelerBase = opts.feeler.base || 0; this.feelerSide = opts.feeler.side || 1; }
    this.treadKeys = (opts && opts.treadKeys) || null; // frame-swap tread cycle
    this._tf = -1; // last tread frame index shown (avoid redundant setTexture)
    this._sc = -1; this._flip = null; // cached scale/flip (skip redundant writes)
    this.visible = true;
  }

  // Place from the current pose. Mirrors x by facing, tracks the host's live
  // display scale (so heavy/tiny overlays stay attached), and adds only the pose
  // channels this part subscribes to. Body bob rides on the host transform, so
  // parts inherit it for free through h.x/h.y. Allocation-free.
  place(pose) {
    const h = this.host;
    const face = pose.face || 1;
    // magnitude of the host's live scale (squash + skill form); flip is separate
    const sc = h.scaleX < 0 ? -h.scaleX : h.scaleX;
    // Glyph part: hangs at its facing-mirrored offset but spins + fades on its OWN
    // channels (the resting alpha is 0, so it's invisible until a twirl wait plays).
    if (this.useGlyph) {
      const gx = face * this.ox * sc, gy = this.oy * sc;
      this.obj.x = h.x + gx;
      this.obj.y = h.y + gy;
      this.obj.rotation = pose.glyphSpin || 0;
      if (sc !== this._sc) { this.obj.setScale(sc); this._sc = sc; }
      const a = pose.glyphA || 0;
      this.obj.setAlpha(a);
      this.obj.setVisible(this.visible && a > 0.01 && h.visible && !h.dead);
      return;
    }
    // A4 ARM glyph: pivots from the shoulder, aimed in WORLD space at the reach
    // target (zip anchor). Reach length stretches its scaleX; alpha 0 => hidden.
    if (this.useArm) {
      const a = pose.armA || 0;
      const sc = h.scaleX < 0 ? -h.scaleX : h.scaleX;
      this.obj.x = h.x + this.ox * sc; // shoulder-ish anchor (facing-neutral; aim is world)
      this.obj.y = h.y + this.oy * sc;
      this.obj.rotation = pose.armAng || 0;
      this.obj.setScale((pose.armLen || 1) * sc, sc);
      this.obj.setAlpha(a);
      this.obj.setVisible(this.visible && a > 0.01 && h.visible && !h.dead);
      return;
    }
    // A5 FEELER: facing-mirrored offset, own rotation from base splay + shared bend.
    // Rotation is visual-only (the host body is never touched — physics is sacred).
    if (this.useFeeler) {
      const lx = face * this.ox * sc, ly = this.oy * sc;
      this.obj.x = h.x + lx;
      this.obj.y = h.y + ly;
      this.obj.rotation = (this.feelerBase + (pose.feelerBend || 0) * this.feelerSide) * face;
      if (sc !== this._sc) { this.obj.setScale(sc); this._sc = sc; }
      this.obj.setVisible(this.visible && h.visible && !h.dead);
      return;
    }
    let ox = this.ox, oy = this.oy;
    if (this.useLook) { ox += pose.lookX; oy += pose.lookY; }
    if (this.useAntenna) { ox += pose.antenna; oy += pose.antennaY || 0; }
    // scaled, facing-mirrored local offset, then rotated by the host's lean so the
    // overlay stays glued to the body (matters most for the tread during a skid).
    const lx = face * ox * sc, ly = oy * sc;
    const r = h.rotation || 0;
    if (r) {
      const c = Math.cos(r), s = Math.sin(r);
      this.obj.x = h.x + lx * c - ly * s;
      this.obj.y = h.y + lx * s + ly * c;
    } else {
      this.obj.x = h.x + lx;
      this.obj.y = h.y + ly;
    }
    this.obj.rotation = r;
    if (sc !== this._sc) { this.obj.setScale(sc); this._sc = sc; } // skip redundant scale writes
    // tread cycle: advance a frame every ~2.5 px of accumulated vx travel. A plain
    // texture swap (only when the index actually changes) — cheap on Canvas.
    if (this.treadKeys) {
      const n = this.treadKeys.length;
      let idx = Math.floor(pose.tread / 2.5) % n;
      if (idx < 0) idx += n;
      if (idx !== this._tf) { this.obj.setTexture(this.treadKeys[idx]); this._tf = idx; }
    }
    const flip = face < 0;
    if (this.obj.setFlipX && flip !== this._flip) { this.obj.setFlipX(flip); this._flip = flip; }
    this.obj.setVisible(this.visible && h.visible && !h.dead);
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
  addPart(name, spec, offset, opts) {
    let obj;
    if (typeof spec === "function") {
      obj = this.scene.add.graphics();
      spec(obj); // bake the drawing ONCE (canvas-safe; not redrawn per frame)
    } else {
      obj = this.scene.add.image(this.host.x, this.host.y, spec);
    }
    obj.setDepth(this.depth);
    const part = new Part(name, this.host, obj, offset, opts);
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
