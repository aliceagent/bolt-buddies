// Bolt Buddies — walkthrough-video CAPTURE pipeline.
//
// Records a clean, input-only level playthrough to an H.264 mp4 that matches the
// shipped walkthrough spec (1280x720 / 30fps / H.264 + AAC stereo), WITH the
// game's REAL synced audio (music + SFX), then transcodes with ffmpeg.
//
// Approach A (self-contained, no system audio device):
//   * launch Chromium (headless) at 1280x720 with autoplay unlocked;
//   * boot the game on its NORMAL WebGL renderer (NOT ?canvas=1 — these are
//     showcase videos), unlock the AudioContext, warm the browser up;
//   * start the target level, then IN-PAGE build a MediaStream from the game
//     canvas' captureStream(30) (video) + a MediaStreamAudioDestinationNode fed
//     by the live masterGain (audio, via the dev-only window.__BB.audio._captureTap
//     published by src/audio/engine.js) and feed it to a MediaRecorder
//     (video/webm; vp8/vp9 + opus);
//   * drive the level's beat route (tools/beat/routes/<id>.mjs) to completion
//     with REAL Playwright keys via the shared Driver;
//   * stop the recorder, stream the webm bytes back to Node, transcode to mp4.
//
//   node tools/capture_walkthrough.mjs 3-1 --out tools/shots/wt-cap/3-1-check.mp4
//   node tools/capture_walkthrough.mjs 3-3                 # -> public/walkthroughs/bolt-buddies-3-3-walkthrough.mp4
//   node tools/capture_walkthrough.mjs 4-1 --assign B      # force the swapped role assignment
//
// Env: BB_URL (default http://localhost:5173/ — no ?canvas=1), BB_CHROMIUM.
import { chromium } from "playwright";
import { Driver } from "./beat/driver.mjs";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { execFileSync } from "child_process";
import { dirname, join } from "path";
import { tmpdir } from "os";

// NOTE on renderer: these are showcase videos, but this capture host has NO GPU —
// SwiftShader software WebGL renders the 1280x720 scene at ~4-9 fps (unplayable
// slow-motion, routes can't beat, audio desyncs). Phaser's CANVAS renderer draws
// the IDENTICAL scene (same textures/sprites/HUD/lighting — verified frame-for-
// frame against the shipped WebGL mp4) at ~44 fps, i.e. real time. So we capture
// via ?canvas=1: pixel-equivalent output at a usable, in-sync frame rate. On a
// GPU host, drop ?canvas=1 (set BB_URL) to record the WebGL path instead.
const URL = process.env.BB_URL || "http://localhost:5173/?canvas=1";
const CHROMIUM = process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium";
const RUN_BUDGET_MS = 5 * 60 * 1000;

const LEVEL_INDEX = { "1-1": 0, "1-2": 1, "1-3": 2, "2-1": 3, "2-2": 4, "2-3": 5, "3-1": 6, "3-2": 7, "3-3": 8, "4-1": 9, "4-2": 10, "4-3": 11 };
// Same role-assignment shape the beat runner uses (first-listed role -> first pedestal).
const ASSIGNMENTS = {
  A: { name: "A:P1=G", roles: { G: 0, H: 1, P: 0, T: 1, M: 0, B: 1, F: 0 } },
  B: { name: "B:P1=H", roles: { G: 1, H: 0, P: 1, T: 0, M: 1, B: 0, F: 1 } },
};

const argv = process.argv.slice(2);
const id = argv.find((a) => LEVEL_INDEX[a] !== undefined);
if (!id) { console.error("usage: node tools/capture_walkthrough.mjs <level-id> [--out path.mp4] [--assign A|B]"); process.exit(2); }
const outArg = (() => { const i = argv.indexOf("--out"); return i >= 0 ? argv[i + 1] : null; })();
const assignKey = (() => { const i = argv.indexOf("--assign"); return i >= 0 ? argv[i + 1] : "A"; })();
const assignment = ASSIGNMENTS[assignKey] || ASSIGNMENTS.A;
const outMp4 = outArg || `public/walkthroughs/bolt-buddies-${id}-walkthrough.mp4`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function startLevel(page, levelIndex) {
  await page.evaluate((i) => {
    localStorage.clear();
    const m = window.__BB.game.scene;
    ["UI", "Game", "Title", "Hub", "Epilogue"].forEach((k) => m.stop(k));
    m.start("Game", { levelIndex: i });
  }, levelIndex);
  await sleep(1600);
}

async function main() {
  const rawWebm = join(tmpdir(), `bbwt-${id}-${Date.now()}.webm`);
  mkdirSync(dirname(outMp4), { recursive: true });

  const browser = await chromium.launch({
    executablePath: CHROMIUM,
    args: [
      "--autoplay-policy=no-user-gesture-required",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  // Stream recorder chunks back to Node as base64 (avoids one giant return blob).
  const chunks = [];
  await page.exposeFunction("__bbSaveChunk", (b64) => { chunks.push(Buffer.from(b64, "base64")); });
  let recStopResolve;
  const recStopped = new Promise((r) => { recStopResolve = r; });
  await page.exposeFunction("__bbRecStopped", () => recStopResolve());

  console.log(`capture ${id} [${assignment.name}] -> ${outMp4}`);
  await page.goto(URL, { waitUntil: "networkidle" });
  await sleep(1500);

  // unlock the AudioContext on the Title (KeyZ hits the title keydown->initAudio,
  // which builds the graph and publishes window.__BB.audio._captureTap).
  await page.keyboard.press("KeyZ");
  await sleep(400);
  const tapReady = await page.evaluate(() => !!(window.__BB.audio && window.__BB.audio._captureTap && window.__BB.audio._captureTap.ctx));
  if (!tapReady) throw new Error("audio capture tap not published — engine._captureTap missing");
  console.log("audio capture tap ready");

  // warmup: a fresh headless WebGL context is slow for its first seconds (JIT,
  // audio spin-up) AND each world bakes its texture set on first entry, which
  // re-triggers slow-motion. Warm 1-1 (JIT) then the TARGET level (texture bake)
  // with a little input, and discard — so the recorded start runs at full speed.
  process.stdout.write("warmup 1-1 ... ");
  await startLevel(page, LEVEL_INDEX["1-1"]);
  for (let i = 0; i < 4; i++) {
    await page.keyboard.down("KeyD"); await sleep(600); await page.keyboard.up("KeyD");
    await page.keyboard.down("KeyA"); await sleep(600); await page.keyboard.up("KeyA");
    await sleep(250);
  }
  process.stdout.write(`+ ${id} textures ... `);
  await startLevel(page, LEVEL_INDEX[id]);
  for (let i = 0; i < 5; i++) {
    await page.keyboard.down("KeyD"); await sleep(600); await page.keyboard.up("KeyD");
    await page.keyboard.down("KeyA"); await sleep(600); await page.keyboard.up("KeyA");
    await sleep(250);
  }
  process.stdout.write("done\n");

  // start the target level fresh for the recorded run (textures already baked)
  await startLevel(page, LEVEL_INDEX[id]);
  await page.evaluate(() => { window.__bbWatchdogPeakTier = 0; window.__bbSoftlockPeak = 0; window.__bbSoftlock = null; }).catch(() => {});
  await sleep(600); // let the opening frame settle

  // build the recorder in-page: canvas video track + master-tapped audio track
  const recInfo = await page.evaluate(() => {
    const canvas = window.__BB.game.canvas;
    const tap = window.__BB.audio._captureTap;
    const vStream = canvas.captureStream(30);
    const dest = tap.ctx.createMediaStreamDestination();
    tap.masterGain.connect(dest); // ADDITIVE — normal destination stays connected
    const combined = new MediaStream([
      ...vStream.getVideoTracks(),
      ...dest.stream.getAudioTracks(),
    ]);
    const pick = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]
      .find((t) => window.MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(combined, { mimeType: pick, videoBitsPerSecond: 4_000_000, audioBitsPerSecond: 128_000 });
    window.__bbRec = rec;
    rec.ondataavailable = (e) => {
      if (!e.data || !e.data.size) return;
      // data URL is `data:<mime>;base64,<DATA>` and <mime> itself contains a comma
      // (codecs=vp8,opus) — split on the ";base64," marker, never the first comma.
      const fr = new FileReader();
      fr.onload = () => window.__bbSaveChunk(String(fr.result).split(";base64,")[1]);
      fr.readAsDataURL(e.data);
    };
    rec.onstop = () => setTimeout(() => window.__bbRecStopped(), 400);
    rec.start(1000); // 1s timeslice -> streamed chunks
    return { mimeType: pick, hasAudio: combined.getAudioTracks().length, hasVideo: combined.getVideoTracks().length };
  });
  console.log(`recording (${recInfo.mimeType}, v=${recInfo.hasVideo} a=${recInfo.hasAudio})`);
  const recStart = Date.now();

  // drive the beat route to completion
  const mod = await import(`./beat/routes/${id}.mjs`);
  const steps = mod.default;
  const bb = new Driver(page);
  bb.setRoles(assignment.roles);
  let failure = null;
  for (const step of steps) {
    bb.stepDeaths = 0;
    if (Date.now() - recStart > RUN_BUDGET_MS) { failure = { step: step.name, error: "budget" }; break; }
    try {
      await Promise.race([
        step.fn(bb),
        sleep(RUN_BUDGET_MS - (Date.now() - recStart)).then(() => { throw new Error("run budget elapsed mid-step"); }),
      ]);
      process.stdout.write(`  ✓ ${step.name}\n`);
    } catch (e) {
      failure = { step: step.name, error: e?.message || String(e) };
      process.stdout.write(`  ✗ ${step.name}: ${failure.error}\n`);
      break;
    }
  }
  await bb.releaseAll().catch(() => {});
  for (const c of ["KeyA", "KeyD", "KeyW", "KeyS", "KeyE", "Space", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyL"]) {
    await page.keyboard.up(c).catch(() => {});
  }
  let complete = false;
  try { complete = await page.evaluate(() => window.__BB.scene && window.__BB.scene.complete === true); } catch { /* gone */ }

  // let the clear/celebration play a beat on camera, then stop the recorder
  await sleep(complete ? 2200 : 600);
  await page.evaluate(() => { if (window.__bbRec && window.__bbRec.state !== "inactive") window.__bbRec.stop(); });
  await Promise.race([recStopped, sleep(8000)]);
  await sleep(300);

  const durationMs = Date.now() - recStart;
  await browser.close();

  const webm = Buffer.concat(chunks);
  writeFileSync(rawWebm, webm);
  console.log(`webm ${(webm.length / 1e6).toFixed(2)} MB, run ${(durationMs / 1000).toFixed(1)}s, deaths ${bb.deaths}, complete=${complete}`);

  // transcode -> H.264 mp4 matching the shipped spec
  execFileSync("ffmpeg", ["-y", "-loglevel", "error",
    "-i", rawWebm,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "30",
    "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2",
    "-b:v", "700k", "-maxrate", "900k", "-bufsize", "1800k",
    // The game mix (master 0.8 x music 0.45) records at a low RMS (~-41 dB mean);
    // loudnorm brings it to the shipped catalogue's loudness (I=-16 -> mean_volume
    // ~-18.6 dB, matching bolt-buddies-3-1's -18.6). Same REAL synced audio, leveled.
    "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2",
    "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
    "-movflags", "+faststart", outMp4]);
  rmSync(rawWebm, { force: true });

  const probe = execFileSync("ffprobe", ["-v", "error",
    "-show_entries", "stream=codec_name,width,height,r_frame_rate,channels",
    "-show_entries", "format=duration,bit_rate", "-of", "default=noprint_wrappers=1", outMp4]).toString();
  console.log("--- ffprobe ---\n" + probe);

  if (pageErrors.length) console.log(`page errors: ${pageErrors.length} (first: ${pageErrors[0]})`);
  if (failure) { console.log(`ROUTE FAILED at "${failure.step}": ${failure.error}`); process.exit(1); }
  if (!complete) { console.log("LEVEL DID NOT COMPLETE"); process.exit(1); }
  console.log(`OK ${outMp4} (deaths ${bb.deaths})`);
}

main().catch((e) => { console.error("capture crashed:", e); process.exit(1); });
