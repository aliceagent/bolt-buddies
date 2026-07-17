// WALKTHROUGHS probe — drives the title-menu item, the manifest-driven level
// grid, and the DOM video player end-to-end with real input, asserting the
// whole surface and dropping screenshots into tools/shots/wt/.
//
//   node tools/snap_walkthrough.mjs        (npm run dev first, or set BB_URL)
//
// CODEC NOTE: the walkthrough mp4s are H.264+AAC — every real browser (incl.
// iOS Safari) plays them natively, but Playwright's Chromium build ships
// WITHOUT proprietary codecs. When the harness browser reports no H.264
// support, this probe transparently serves the SAME player a VP8/Opus webm
// transcode of 1-1 via route interception (ffmpeg, cached in the OS tmpdir),
// so playback/seek/rate/mute mechanics are still exercised for real. On a
// codec-full Chrome it plays the actual mp4s untouched.
//
// Also proves manifest-drivenness with ZERO code change: a route-intercepted
// 8-entry manifest renders 8 cards, and an aborted manifest fetch renders the
// NO SIGNAL card.
import { chromium } from "playwright";
import { mkdirSync, existsSync, readFileSync } from "fs";
import { execFileSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";

const URL = process.env.BB_URL || "http://localhost:5173/?canvas=1";
const CHROMIUM = process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium";
const SHOTS = process.env.BB_SHOTS || "tools/shots/wt";
mkdirSync(SHOTS, { recursive: true });

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// autoplay flag: headless Chromium blocks audible play() even on a trusted
// click; in production the player's opening selection tap IS the gesture.
const browser = await chromium.launch({
  executablePath: CHROMIUM,
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

// count the player's window-capture keydown listeners (leak assertion: every
// add must be matched by a remove across repeated player entries)
await page.addInitScript(() => {
  window.__wtListeners = { add: 0, rem: 0 };
  const a = window.addEventListener.bind(window);
  const r = window.removeEventListener.bind(window);
  window.addEventListener = (t, f, o) => { if (t === "keydown" && o === true) window.__wtListeners.add++; return a(t, f, o); };
  window.removeEventListener = (t, f, o) => { if (t === "keydown" && o === true) window.__wtListeners.rem++; return r(t, f, o); };
});

// the REAL manifest is the expectation — the probe stays valid as entries grow
const realManifest = JSON.parse(readFileSync("public/walkthroughs/manifest.json", "utf8"));
const N = realManifest.videos.length;

await page.goto(URL, { waitUntil: "networkidle" });
await sleep(1200);

const shot = (n) => page.screenshot({ path: `${SHOTS}/${n}.png` });
const ev = (fn, ...a) => page.evaluate(fn, ...a);
const active = (k) => ev((k) => window.__BB.game.scene.isActive(k), k);
const hold = async (key, ms) => { await page.keyboard.down(key); await sleep(ms); await page.keyboard.up(key); };
const tap = (key) => hold(key, 70);
const vid = (fn) => ev((src) => {
  const v = document.getElementById("bb-wt-video");
  if (!v) return null;
  // eslint-disable-next-line no-new-func
  return new Function("v", "return " + src)(v);
}, fn);
const engine = () => ev(() => window.__BB.audio.engine());

// --- codec capability: serve a webm transcode when H.264 is unavailable ------
const h264 = await ev(() => document.createElement("video").canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"'));
if (!h264) {
  const fixture = process.env.BB_WT_FIXTURE || join(tmpdir(), "bbwt-fixture.webm");
  if (!existsSync(fixture)) {
    console.log("transcoding VP8/Opus fixture (harness Chromium has no H.264)…");
    execFileSync("ffmpeg", ["-y", "-loglevel", "error",
      "-i", "public/walkthroughs/bolt-buddies-1-1-walkthrough.mp4", "-t", "15",
      "-vf", "scale=640:360", "-c:v", "libvpx", "-b:v", "500k",
      "-deadline", "realtime", "-cpu-used", "8", "-c:a", "libopus", "-b:a", "64k", fixture]);
  }
  const body = readFileSync(fixture);
  // serve with real Range support — Chromium's media stack needs it for seeking
  await page.route("**/walkthroughs/*.mp4", (route) => {
    const range = route.request().headers()["range"];
    const m = range && /bytes=(\d+)-(\d*)/.exec(range);
    if (m) {
      const start = +m[1];
      const end = m[2] ? +m[2] : body.length - 1;
      return route.fulfill({
        status: 206,
        headers: {
          "Content-Type": "video/webm",
          "Accept-Ranges": "bytes",
          "Content-Range": `bytes ${start}-${end}/${body.length}`,
          "Content-Length": String(end - start + 1),
        },
        body: body.subarray(start, end + 1),
      });
    }
    return route.fulfill({
      status: 200,
      headers: { "Content-Type": "video/webm", "Accept-Ranges": "bytes", "Content-Length": String(body.length) },
      body,
    });
  });
  console.log(`NOTE: harness Chromium lacks H.264 — serving VP8/Opus fixture through the same <video> path (production browsers play the real mp4s).`);
} else {
  console.log(`browser reports H.264 support ("${h264}") — playing the real mp4s.`);
}

// === 1. title menu ============================================================
await ev(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await sleep(1100);
check("title scene active", await active("Title"));
const menu = await ev(() => window.__BB.menu.items.map((i) => i.id));
check("WALKTHROUGHS appended LAST after existing items", menu.join(",") === "new,tutorial,walkthroughs", menu.join(","));
check("default cursor still index 0 (NEW GAME)", (await ev(() => window.__BB.menu.sel)) === 0);
await tap("ArrowDown"); // NEW GAME -> TUTORIAL (tut_sanity's step stays valid)
check("one ArrowDown still lands on TUTORIAL", (await ev(() => window.__BB.menu.items[window.__BB.menu.sel].id)) === "tutorial");
await tap("ArrowDown"); // TUTORIAL -> WALKTHROUGHS
check("second ArrowDown selects WALKTHROUGHS", (await ev(() => window.__BB.menu.items[window.__BB.menu.sel].id)) === "walkthroughs");
await sleep(250);
await shot("01-title-walkthroughs-selected");

// === 2. grid ==================================================================
await tap("Space");
await sleep(900);
check("Walkthroughs scene active", await active("Walkthroughs"));
check(`grid shows ${N} cards (one per manifest entry)`, (await ev(() => window.__BB.wt.count)) === N, `count=${await ev(() => window.__BB.wt.count)}`);
await shot("02-grid");

// keyboard nav
await tap("ArrowRight");
check("ArrowRight moves selection 0 -> 1", (await ev(() => window.__BB.wt.sel)) === 1);
await tap("ArrowDown");
check("ArrowDown moves selection 1 -> 4", (await ev(() => window.__BB.wt.sel)) === 4);
await tap("ArrowUp");
await tap("ArrowLeft");
check("ArrowUp+ArrowLeft return to 0", (await ev(() => window.__BB.wt.sel)) === 0);

// pointer nav: hover selects
const card1 = await ev(() => ({ x: window.__BB.wt._scene.cards[1].cont.x, y: window.__BB.wt._scene.cards[1].cont.y }));
await page.mouse.move(card1.x, card1.y);
await sleep(250);
check("pointer hover selects card 1", (await ev(() => window.__BB.wt.sel)) === 1);

// mute dropdown works from within the grid
await page.mouse.click(864, 26);
await sleep(250);
check("mute dropdown opens in grid", await ev(() => window.__BB.mute.open));
await page.mouse.click(274, 323); // outside-click lands ON card 0 — must ONLY close the dropdown
await sleep(400);
check("mute dropdown closes in grid", !(await ev(() => window.__BB.mute.open)));
check("dropdown-closing click did NOT open a card under it", await ev(() => !window.__BB.wtPlayer));

// === 3. player ================================================================
const musicBefore = (await engine()).musicBus;
const card0 = await ev(() => ({ x: window.__BB.wt._scene.cards[0].cont.x, y: window.__BB.wt._scene.cards[0].cont.y }));
await page.mouse.click(card0.x, card0.y); // click-to-open (pointer path)
await sleep(500);
check("click on card 1-1 opens the player", await ev(() => !!window.__BB.wtPlayer && window.__BB.wtPlayer.id === "1-1"));
check("scene paused behind the overlay", await ev(() => window.__BB.game.scene.isPaused("Walkthroughs")));
await sleep(1600);
const t1 = await vid("v.currentTime");
check("video PLAYS (currentTime advances)", t1 > 0.4 && !(await vid("v.paused")), `t=${t1?.toFixed(2)}`);

// music duck (engine pauseDuck plumbing: bus drops to 0.5x while the video owns audio)
const musicDuring = (await engine()).musicBus;
check("title music ducked while video plays", musicDuring < musicBefore * 0.7, `bus ${musicBefore.toFixed(3)} -> ${musicDuring.toFixed(3)}`);

await page.mouse.move(640, 500); // activity: make sure the control bar is shown
await sleep(200);
await shot("03-player-playing");

// speed cycle 1 -> 1.5 -> 2 -> 0.5 -> 1
const rates = [];
for (let i = 0; i < 4; i++) { await tap("KeyS"); rates.push(await vid("v.playbackRate")); }
check("speed cycles 1.5/2/0.5/1", rates.join(",") === "1.5,2,0.5,1", rates.join(","));

// 2x + muted screenshot
await tap("KeyS"); await tap("KeyS"); // 1 -> 1.5 -> 2
check("speed set to 2x", (await vid("v.playbackRate")) === 2);
await tap("KeyM");
check("M mutes the video", await vid("v.muted"));
await page.mouse.move(640, 640);
await sleep(200);
await shot("04-player-2x-muted");

// seek with arrows (±5s)
const s0 = await vid("v.currentTime");
await tap("ArrowRight");
const s1 = await vid("v.currentTime");
check("ArrowRight seeks +5s", s1 >= s0 + 4, `${s0.toFixed(1)} -> ${s1.toFixed(1)}`);
await tap("ArrowLeft");
const s2 = await vid("v.currentTime");
check("ArrowLeft seeks -5s", s2 <= s1 - 4, `${s1.toFixed(1)} -> ${s2.toFixed(1)}`);

// click the seek bar to scrub
const seekBox = await ev(() => { const r = document.getElementById("bb-wt-seek").getBoundingClientRect(); return { x: r.left, y: r.top + r.height / 2, w: r.width }; });
await page.mouse.click(seekBox.x + seekBox.w * 0.5, seekBox.y);
await sleep(200);
const sMid = await vid("v.currentTime");
const dur = await vid("v.duration");
check("seek-bar click scrubs to ~50%", Math.abs(sMid - dur / 2) < dur * 0.1, `t=${sMid.toFixed(1)} dur=${dur.toFixed(1)}`);

// settle back to 1x + rewind a bit so the clip can't end mid-assertion
await tap("KeyS"); await tap("KeyS"); // 2 -> 0.5 -> 1
await tap("ArrowLeft");

// volume keys
await tap("ArrowDown"); await tap("ArrowDown");
const vol1 = await vid("v.volume");
check("ArrowDown lowers volume", vol1 <= 0.81, `vol=${vol1.toFixed(2)}`);
check("volume keys unmute (M was on)", !(await vid("v.muted")));
await tap("ArrowUp");
check("ArrowUp raises volume", (await vid("v.volume")) > vol1);

// SPACE pauses / resumes
await tap("Space");
check("SPACE pauses", await vid("v.paused"));
await tap("Space");
check("SPACE resumes", !(await vid("v.paused")));

// mute dropdown still works OVER the player (glyph band left clear)
await page.mouse.click(864, 26);
await sleep(250);
check("mute dropdown opens over the player", await ev(() => window.__BB.mute.open));
await page.mouse.click(834, 202); // MUTE ALL row (dropdown is now sliders + this toggle)
await sleep(200);
check("MUTE ALL toggles muted from over the player", await ev(() => window.__BB.mute.state().muted));
await page.mouse.click(834, 202);
await sleep(200);
check("MUTE ALL toggles back", !(await ev(() => window.__BB.mute.state().muted)));
await page.mouse.click(140, 650); // outside-click passthrough closes it
await sleep(250);
check("dropdown closes from over the player", !(await ev(() => window.__BB.mute.open)));

// ESC returns to the grid; DOM gone; music restored; scene resumed
await tap("Escape");
await sleep(400);
check("ESC closes the player (overlay removed)", await ev(() => !document.getElementById("bb-wt-overlay") && !document.getElementById("bb-wt-video")));
check("player probe cleared", await ev(() => !window.__BB.wtPlayer));
check("scene resumed", await ev(() => !window.__BB.game.scene.isPaused("Walkthroughs")));
await sleep(400);
const musicAfter = (await engine()).musicBus;
check("title music restored after close", musicAfter > musicBefore * 0.85, `bus ${musicDuring.toFixed(3)} -> ${musicAfter.toFixed(3)}`);
await tap("ArrowRight");
check("grid keys live again after close", (await ev(() => window.__BB.wt.sel)) === 1);

// === 4. enter/exit x5 — no leaked nodes/listeners =============================
for (let i = 0; i < 5; i++) {
  await tap("KeyE");
  await sleep(600);
  if (!(await ev(() => !!document.getElementById("bb-wt-video")))) { check(`re-entry ${i + 1} opened`, false); break; }
  await tap("Escape");
  await sleep(300);
}
const leak = await ev(() => ({
  overlays: document.querySelectorAll("#bb-wt-overlay").length,
  videos: document.querySelectorAll("video").length,
  l: window.__wtListeners,
}));
check("enter/exit x5: zero leftover DOM nodes", leak.overlays === 0 && leak.videos === 0, JSON.stringify(leak));
check("enter/exit x5: every keydown listener removed", leak.l.add > 0 && leak.l.add === leak.l.rem, `add=${leak.l.add} rem=${leak.l.rem}`);

// === 5. grid ESC -> Title =====================================================
await tap("Escape");
await sleep(700);
check("grid ESC returns to Title", await active("Title"));

// === 6. manifest-drivenness: real manifest + 2 fake entries, ZERO code change =
const grown = {
  videos: [
    ...realManifest.videos,
    { id: "4-1", name: "Lights Out", world: 4, file: "bolt-buddies-4-1-walkthrough.mp4" },
    { id: "4-2", name: "The Dark Core", world: 4, file: "bolt-buddies-4-2-walkthrough.mp4" },
  ],
};
await page.route("**/walkthroughs/manifest.json", (route) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(grown) }));
await page.reload({ waitUntil: "networkidle" });
await sleep(1100);
await tap("ArrowDown"); await tap("ArrowDown"); await tap("Space");
await sleep(900);
check(`${N + 2}-entry manifest renders ${N + 2} cards (no code change)`, (await ev(() => window.__BB.wt.count)) === N + 2, `count=${await ev(() => window.__BB.wt.count)}`);
await shot("05-grid-grown-manifest");
await page.unroute("**/walkthroughs/manifest.json");

// === 7. manifest fetch failure -> NO SIGNAL card (no crash) ===================
await page.route("**/walkthroughs/manifest.json", (route) => route.abort());
await page.reload({ waitUntil: "networkidle" });
await sleep(1100);
await tap("ArrowDown"); await tap("ArrowDown"); await tap("Space");
await sleep(900);
check("manifest failure shows NO SIGNAL card", await ev(() => window.__BB.wt.noSignal));
await shot("06-no-signal");
await tap("Escape");
await sleep(600);
check("ESC still returns to Title from NO SIGNAL", await active("Title"));
await page.unroute("**/walkthroughs/manifest.json");

// ------------------------------------------------------------------------------
await browser.close();
const fails = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - fails}/${results.length} checks passed`);
if (pageErrors.length) console.log(`page errors: ${pageErrors.length} (first: ${pageErrors[0]})`);
process.exit(fails || pageErrors.length ? 1 : 0);
