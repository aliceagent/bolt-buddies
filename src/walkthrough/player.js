// WALKTHROUGHS — DOM <video> overlay player.
//
// The per-level walkthrough mp4s stream through a real DOM <video> element
// positioned OVER the Phaser canvas (position:fixed) — the reliable streaming
// path in every browser incl. iOS Safari (`playsinline`; never routed through
// Phaser textures). The scene that opens it pauses itself behind the overlay.
//
// LAYOUT / MUTE-OVERLAY CONTRACT: the dim backdrop is pointer-events:none (it
// only paints), and the video stage is placed BELOW game-y ~206px (mapped
// through the live canvas rect), so the global MuteScene glyph + dropdown in
// the canvas' top band stay clickable while a video plays. Only the stage
// (video + control bar) captures the pointer.
//
// CONTROLS (game-styled, FONT/COLORS tokens as CSS): play/pause, drag/click
// seek bar, speed cycle 0.5×/1×/1.5×/2×, mute toggle + volume slider,
// elapsed/total time, BACK. Keyboard: SPACE play/pause, ←/→ ±5s, ↑/↓ volume,
// M mute, S or +/- speed, ESC back. The bar auto-hides after ~2.5s of idle
// while playing and reappears on any pointer/key activity.
//
// AUDIO: the walkthrough videos carry real game audio, so opening the player
// ducks the game's music bus via the engine's existing pauseDuck plumbing
// (same knob the in-game pause overlay uses) and restores it on close. No
// parallel audio state is invented.
//
// CLEANUP IS SACRED: close() (BACK/ESC/scene shutdown) pauses + releases the
// video (src reset + load()), removes every DOM node (one root — the <style>
// rides inside it), detaches the window listeners, cancels the auto-hide
// timer, and un-ducks. Idempotent, so re-entries never stack nodes/listeners.

import { COLORS, WORLD_THEMES, FONT, TEXT } from "../constants.js";
import { hexStr } from "../ui/kit.js";
import { pauseDuck } from "../audio.js";

const SPEEDS = [0.5, 1, 1.5, 2];
const SEEK_STEP = 5; // seconds per ←/→ tap
const HIDE_MS = 2500; // control-bar idle timeout
const TOP_BAND = 206 / 720; // keep clear of the MuteScene dropdown (game px)

const fmt = (s) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return m + ":" + String(ss).padStart(2, "0");
};

const el = (tag, cls, parent) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (parent) parent.appendChild(n);
  return n;
};

// entry: a manifest row ({ id, name, world, file }).
// opts: { canvas, accent (0xRRGGBB), onClose }.
export function openWalkthroughPlayer(entry, opts = {}) {
  const accent = hexStr(opts.accent ?? WORLD_THEMES[1].accent);
  const panel = hexStr(COLORS.panel);
  const edge = hexStr(COLORS.panelEdge);
  const hudBg = hexStr(COLORS.hudBg);
  const canvas = opts.canvas || null;

  pauseDuck(true); // duck the title music under the video's own audio

  // --- DOM ------------------------------------------------------------------
  const root = el("div", "bbwt-root");
  root.id = "bb-wt-overlay";

  const style = el("style", null, root);
  style.textContent = `
    .bbwt-root{position:fixed;inset:0;z-index:5000;background:rgba(4,6,20,0.72);pointer-events:none;}
    .bbwt-stage{position:absolute;pointer-events:auto;display:flex;flex-direction:column;align-items:stretch;font-family:${FONT};}
    .bbwt-cap{color:${TEXT.dim};font-size:13px;font-weight:bold;letter-spacing:1px;text-align:center;padding:0 0 6px;}
    .bbwt-cap b{color:${accent};}
    .bbwt-video{display:block;width:100%;background:#000;border:2px solid ${edge};border-top:5px solid ${accent};border-radius:10px 10px 0 0;box-sizing:border-box;outline:none;}
    .bbwt-bar{display:flex;align-items:center;gap:8px;padding:9px 12px;background:${hudBg};border:2px solid ${edge};border-top:none;border-radius:0 0 10px 10px;transition:opacity .3s;box-sizing:border-box;}
    .bbwt-bar.bbwt-hidden{opacity:0;pointer-events:none;}
    .bbwt-btn{background:${panel};color:${TEXT.bright};border:2px solid ${edge};border-radius:8px;font-family:${FONT};font-size:13px;font-weight:bold;padding:5px 9px;cursor:pointer;line-height:1;white-space:nowrap;}
    .bbwt-btn:hover{border-color:${accent};color:${accent};}
    .bbwt-time{color:${TEXT.body};font-size:12px;font-weight:bold;white-space:nowrap;min-width:86px;text-align:center;}
    .bbwt-track{position:relative;height:10px;background:${panel};border:1px solid ${edge};border-radius:5px;cursor:pointer;touch-action:none;}
    .bbwt-seek{flex:1;}
    .bbwt-vol{width:64px;}
    .bbwt-fill{position:absolute;left:0;top:0;bottom:0;background:${accent};border-radius:5px;width:0%;}
    .bbwt-back{border-color:${accent};color:${accent};}
  `;

  const stage = el("div", "bbwt-stage", root);
  const cap = el("div", "bbwt-cap", stage);
  cap.textContent = ""; // set via nodes to keep the accent on the id
  const capId = el("b", null, cap);
  capId.textContent = "CHAMBER " + entry.id;
  cap.appendChild(document.createTextNode(" · " + entry.name + " · WALKTHROUGH"));

  const video = el("video", "bbwt-video", stage);
  video.id = "bb-wt-video";
  // iOS Safari: inline playback (never force fullscreen), and the src is set
  // during the selection key/tap — that user gesture licenses play-with-sound.
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.preload = "auto";
  video.src = "walkthroughs/" + entry.file;

  const bar = el("div", "bbwt-bar", stage);
  bar.id = "bb-wt-bar";
  const btnPlay = el("button", "bbwt-btn", bar);
  btnPlay.id = "bb-wt-play";
  const time = el("div", "bbwt-time", bar);
  time.id = "bb-wt-time";
  const seek = el("div", "bbwt-track bbwt-seek", bar);
  seek.id = "bb-wt-seek";
  const seekFill = el("div", "bbwt-fill", seek);
  const btnSpeed = el("button", "bbwt-btn", bar);
  btnSpeed.id = "bb-wt-speed";
  const btnMute = el("button", "bbwt-btn", bar);
  btnMute.id = "bb-wt-mute";
  const vol = el("div", "bbwt-track bbwt-vol", bar);
  vol.id = "bb-wt-vol";
  const volFill = el("div", "bbwt-fill", vol);
  const btnBack = el("button", "bbwt-btn bbwt-back", bar);
  btnBack.id = "bb-wt-back";
  btnBack.textContent = "◀ BACK";

  document.body.appendChild(root);

  // --- layout: sit under the mute band, sized to the live canvas rect --------
  function layout() {
    let r = canvas ? canvas.getBoundingClientRect() : null;
    if (!r || !r.width || !r.height) {
      r = { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    }
    const top = r.top + r.height * TOP_BAND;
    const availH = r.top + r.height - top - 14;
    const vh = Math.max(120, availH - 52 - 26); // bar ≈52, caption ≈26
    const vw = Math.min(r.width * 0.92, (vh * 16) / 9);
    stage.style.top = top + "px";
    stage.style.width = vw + "px";
    stage.style.left = r.left + (r.width - vw) / 2 + "px";
    video.style.height = (vw * 9) / 16 + "px";
  }
  layout();

  // --- state / rendering ------------------------------------------------------
  let closed = false;
  let hideTimer = null;
  let dragging = null; // "seek" | "vol" | null

  const renderPlay = () => { btnPlay.textContent = video.paused ? "▶ PLAY" : "▮▮"; };
  const renderSpeed = () => { btnSpeed.textContent = video.playbackRate.toFixed(1).replace(".0", "") + "×"; };
  const renderVol = () => {
    btnMute.textContent = video.muted ? "MUTED" : "SND";
    btnMute.style.color = video.muted ? "#ff8a99" : "";
    btnMute.style.borderColor = video.muted ? "#ff8a99" : "";
    volFill.style.width = Math.round((video.muted ? 0 : video.volume) * 100) + "%";
  };
  const renderTime = () => {
    time.textContent = fmt(video.currentTime) + " / " + fmt(video.duration);
    const d = video.duration;
    seekFill.style.width = d > 0 ? (video.currentTime / d) * 100 + "%" : "0%";
  };

  const showBar = () => bar.classList.remove("bbwt-hidden");
  const scheduleHide = () => {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      hideTimer = null;
      if (!closed && !video.paused && !dragging) bar.classList.add("bbwt-hidden");
    }, HIDE_MS);
  };
  // any pointer/key activity: reveal the bar and restart the idle countdown
  const poke = () => { if (!closed) { showBar(); scheduleHide(); } };

  // --- actions ----------------------------------------------------------------
  const toggle = () => { if (video.paused) video.play().catch(() => {}); else video.pause(); };
  const seekBy = (d) => {
    if (isFinite(video.duration)) {
      video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + d));
      renderTime();
    }
  };
  const setVolume = (v) => {
    video.volume = Math.max(0, Math.min(1, v));
    if (video.volume > 0 && video.muted) video.muted = false;
  };
  const cycleSpeed = (dir) => {
    const i = SPEEDS.indexOf(video.playbackRate);
    video.playbackRate = SPEEDS[((i < 0 ? 1 : i) + dir + SPEEDS.length) % SPEEDS.length];
  };

  function close() {
    if (closed) return;
    closed = true;
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("resize", layout);
    video.pause();
    video.removeAttribute("src"); // release the stream/decoder
    video.load();
    root.remove(); // stage/video/bar/style all ride inside the one root
    if (window.__BB && window.__BB.wtPlayer && window.__BB.wtPlayer.video === video) {
      window.__BB.wtPlayer = null;
    }
    pauseDuck(false); // restore the game's music level
    if (opts.onClose) opts.onClose();
  }

  // --- keyboard (window capture; the Phaser scene behind is paused) -----------
  function onKey(ev) {
    const c = ev.code;
    let handled = true;
    if (c === "Escape") close();
    else if (c === "Space") toggle();
    else if (c === "ArrowLeft") seekBy(-SEEK_STEP);
    else if (c === "ArrowRight") seekBy(SEEK_STEP);
    else if (c === "ArrowUp") setVolume((video.muted ? 0 : video.volume) + 0.1);
    else if (c === "ArrowDown") setVolume(video.volume - 0.1);
    else if (c === "KeyM") video.muted = !video.muted;
    else if (c === "KeyS" || c === "Equal" || c === "NumpadAdd") cycleSpeed(1);
    else if (c === "Minus" || c === "NumpadSubtract") cycleSpeed(-1);
    else handled = false;
    if (handled) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      poke();
    }
  }
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("resize", layout);

  // --- pointer wiring ----------------------------------------------------------
  btnPlay.addEventListener("click", toggle);
  btnSpeed.addEventListener("click", () => cycleSpeed(1));
  btnMute.addEventListener("click", () => { video.muted = !video.muted; });
  btnBack.addEventListener("click", close);
  video.addEventListener("click", toggle); // tap the picture to play/pause
  stage.addEventListener("pointermove", poke);
  stage.addEventListener("pointerdown", poke);

  // click/drag scrubbing on the seek + volume tracks (pointer capture)
  const bindTrack = (track, apply) => {
    const at = (ev) => {
      const r = track.getBoundingClientRect();
      apply(Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)));
    };
    track.addEventListener("pointerdown", (ev) => {
      dragging = track === seek ? "seek" : "vol";
      track.setPointerCapture(ev.pointerId);
      at(ev);
    });
    track.addEventListener("pointermove", (ev) => { if (dragging && ev.buttons) at(ev); });
    const done = () => { dragging = null; poke(); };
    track.addEventListener("pointerup", done);
    track.addEventListener("pointercancel", done);
  };
  bindTrack(seek, (t) => { if (isFinite(video.duration)) { video.currentTime = t * video.duration; renderTime(); } });
  bindTrack(vol, (t) => setVolume(t));

  // --- video events (no rAF/update loop — timeupdate drives the readouts) -----
  video.addEventListener("timeupdate", renderTime);
  video.addEventListener("durationchange", renderTime);
  video.addEventListener("play", () => { renderPlay(); poke(); });
  video.addEventListener("pause", () => { renderPlay(); showBar(); });
  video.addEventListener("ended", () => { renderPlay(); showBar(); });
  video.addEventListener("volumechange", renderVol);
  video.addEventListener("ratechange", renderSpeed);
  video.addEventListener("error", () => {
    // stream missing/undecodable: keep the frame, say so in the caption
    cap.appendChild(document.createTextNode(" — NO SIGNAL"));
    cap.style.color = "#ff8a99";
    renderPlay();
    showBar();
  });

  renderPlay(); renderSpeed(); renderVol(); renderTime();
  showBar();
  scheduleHide();

  // the opening selection key/tap is the user gesture — play with sound now
  video.play().catch(() => { renderPlay(); showBar(); });

  // probe surface (tools/snap_walkthrough.mjs)
  window.__BB = window.__BB || {};
  window.__BB.wtPlayer = { id: entry.id, video, close };

  return { close, video };
}
