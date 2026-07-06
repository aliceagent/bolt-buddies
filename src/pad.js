// src/pad.js — U7 Gamepad support (fixes F13). ADDITIVE INPUT ONLY.
//
// This module owns ALL gamepad reading for the game. It polls
// navigator.getGamepads() directly once per frame and synthesizes a parallel
// "virtual key" object per player that game code ORs into its EXISTING keyboard
// read sites. The keyboard path is never rewritten, so with no pad connected the
// game behaves byte-for-byte as before (the automated suites — keyboard only —
// therefore prove non-regression).
//
// Why read navigator directly rather than lean on Phaser's Gamepad plugin:
//   * it keeps every pad concern in this one file, so scene/game code only ever
//     sees the virtual keys, and
//   * it makes the headless Gamepad-API mock used by the U7 acceptance probe
//     deterministic — Phaser's plugin latches pad references off its own
//     'connected' DOM event, which a scripted mock cannot reliably fire.
// input.gamepad is still enabled in the game config (main.js) so a REAL browser
// emits connect/disconnect events, but nothing here depends on it. This is the
// documented fallback the U7 spec sanctions.
//
// Zero per-frame allocation: every virtual-key object and prev-state buffer is
// built once at module load and mutated in place. poll() is idempotent within a
// frame (guarded by the game clock) so multiple active scenes can each call
// pads.poll(time) without eating one another's one-frame edge flags.

import { FONT, FS, TEXT } from "./constants.js";

const DEAD = 0.3; // left-stick deadzone (both axes)

// Standard-mapping button indices (mapping:'standard').
const B_A = 0;      // cross  — jump / menu confirm
const B_B = 1;      // circle — menu back
const B_X = 2;      // square — action (SPACE / L semantics)
const B_START = 9;  // start  — pause
const B_DUP = 12, B_DDOWN = 13, B_DLEFT = 14, B_DRIGHT = 15; // d-pad

function makeVK() {
  return {
    connected: false,
    // held states (isDown) — for the analog-style reads: movement, DOWN chord,
    // jump hold. Shaped like a Phaser Key so read sites just OR `.isDown`.
    left: { isDown: false },
    right: { isDown: false },
    up: { isDown: false },
    down: { isDown: false },
    jump: { isDown: false },
    act: { isDown: false },
    // one-frame edges (JustDown-compatible booleans, true for exactly one poll)
    leftJust: false, rightJust: false, upJust: false, downJust: false,
    jumpJust: false, actJust: false, pauseJust: false,
    confirmJust: false, backJust: false,
    anyJust: false, // any button newly pressed this frame — audio-unlock gesture
  };
}

function makePrev() {
  return {
    connected: false,
    left: false, right: false, up: false, down: false,
    jump: false, act: false, pause: false, back: false, any: false,
  };
}

// Module-level (no per-frame closure allocation).
function btnDown(buttons, n) {
  const b = buttons[n];
  return !!(b && (b.pressed || b.value > 0.5));
}

class PadManager {
  constructor() {
    this.vks = [makeVK(), makeVK()];
    this._prev = [makePrev(), makePrev()];
    this._lastPoll = -1;
    // once-per-session-per-pad toast latch + a small queue of newly-connected
    // pad indices for whichever scene drains it.
    this._toasted = [false, false];
    this._connectedQ = [];
  }

  _pads() {
    if (typeof navigator === "undefined" || !navigator.getGamepads) return null;
    try { return navigator.getGamepads(); } catch (e) { return null; }
  }

  // Poll both pads. Idempotent within a frame: the first caller does the real
  // work, later callers in the same frame no-op so every reader sees the same
  // one-frame edges. Pass the scene/game `time`; call with no arg to force.
  poll(time) {
    if (typeof time === "number") {
      if (time === this._lastPoll) return;
      this._lastPoll = time;
    }
    const pads = this._pads();
    this._pollPad(0, pads ? pads[0] : null);
    this._pollPad(1, pads ? pads[1] : null);
  }

  _pollPad(i, gp) {
    const vk = this.vks[i];
    const prev = this._prev[i];
    const connected = !!(gp && gp.connected);

    // connection edge -> queue a detection toast (once per session per pad)
    if (connected && !prev.connected && !this._toasted[i]) {
      this._toasted[i] = true;
      this._connectedQ.push(i);
    }
    prev.connected = connected;
    vk.connected = connected;

    if (!connected) {
      // release everything so a disconnect can't strand a key as held
      vk.left.isDown = false; vk.right.isDown = false; vk.up.isDown = false;
      vk.down.isDown = false; vk.jump.isDown = false; vk.act.isDown = false;
      vk.leftJust = false; vk.rightJust = false; vk.upJust = false; vk.downJust = false;
      vk.jumpJust = false; vk.actJust = false; vk.pauseJust = false;
      vk.confirmJust = false; vk.backJust = false; vk.anyJust = false;
      prev.left = false; prev.right = false; prev.up = false; prev.down = false;
      prev.jump = false; prev.act = false; prev.pause = false; prev.back = false; prev.any = false;
      return;
    }

    const ax = gp.axes || [];
    const bt = gp.buttons || [];
    const axX = ax.length > 0 ? ax[0] : 0;
    const axY = ax.length > 1 ? ax[1] : 0;

    // held: stick past deadzone OR the matching d-pad button
    const l = axX < -DEAD || btnDown(bt, B_DLEFT);
    const r = axX > DEAD || btnDown(bt, B_DRIGHT);
    const u = axY < -DEAD || btnDown(bt, B_DUP);
    const d = axY > DEAD || btnDown(bt, B_DDOWN);
    const jump = btnDown(bt, B_A);
    const act = btnDown(bt, B_X);
    const pause = btnDown(bt, B_START);
    const back = btnDown(bt, B_B);

    // any button held at all (audio-unlock gesture edge)
    let any = false;
    for (let n = 0; n < bt.length; n++) {
      if (btnDown(bt, n)) { any = true; break; }
    }

    vk.left.isDown = l; vk.right.isDown = r; vk.up.isDown = u; vk.down.isDown = d;
    vk.jump.isDown = jump; vk.act.isDown = act;

    vk.leftJust = l && !prev.left;
    vk.rightJust = r && !prev.right;
    vk.upJust = u && !prev.up;
    vk.downJust = d && !prev.down;
    vk.jumpJust = jump && !prev.jump;
    vk.actJust = act && !prev.act;
    vk.pauseJust = pause && !prev.pause;
    vk.backJust = back && !prev.back;
    vk.confirmJust = vk.jumpJust; // A confirms in menus (same button as jump)
    vk.anyJust = any && !prev.any;

    prev.left = l; prev.right = r; prev.up = u; prev.down = d;
    prev.jump = jump; prev.act = act; prev.pause = pause; prev.back = back; prev.any = any;
  }

  // Stable virtual-key object for player index 0/1 (same ref every frame).
  p(i) { return this.vks[i] || this.vks[0]; }

  // Any pad reported a fresh button press this frame — used to fold gamepads into
  // the initAudio() unlock gesture alongside keys/pointer.
  anyButtonJust() { return this.vks[0].anyJust || this.vks[1].anyJust; }

  // Drain newly-connected pad indices for the detection toast (once per session
  // per pad). Returns null on the vast majority of frames.
  consumeConnected() {
    if (!this._connectedQ.length) return null;
    const out = this._connectedQ.slice();
    this._connectedQ.length = 0;
    return out;
  }
}

export const pads = new PadManager();

// Shared pooled detection toast. Any scene can call showPadToast(scene, idx);
// the text object is created once per scene and reused. Screen-fixed + high depth
// so it rides above HUD/menus. Kid copy, 25 chars (<=60). Uses shared tokens.
export function showPadToast(scene, idx) {
  if (!scene || !scene.add) return;
  let t = scene._padToast;
  if (!t) {
    t = scene.add.text(scene.scale.width / 2, 96, "", {
      fontFamily: FONT, fontSize: FS.body, fontStyle: "bold", color: TEXT.good,
    }).setOrigin(0.5).setDepth(300).setScrollFactor(0);
    scene._padToast = t;
  }
  t.setText(`${idx === 0 ? "P1" : "P2"} controller connected!`).setAlpha(1).setVisible(true);
  if (scene._padToastTween) scene._padToastTween.remove();
  scene._padToastTween = scene.tweens.add({ targets: t, alpha: 0, delay: 2200, duration: 600 });
}
