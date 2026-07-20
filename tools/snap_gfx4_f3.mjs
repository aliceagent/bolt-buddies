// GFX4 F3 verification — KOBI portrait 2.0 (3a) + in-world lab-sign signage (3b).
//
// 3a: drives a bb:blip with every catalogued mood through the REAL pipeline
//     (window.__BB game events), screenshots each expression mid-type (mouth open)
//     and settled, and asserts the mouth flutter stops when typing ends and after
//     an ENTER-skip. Confirms the mood -> baked-expression texture map.
// 3b: on level 1-1 (door id "GATE"), probes the restyled sign container's recede
//     alpha with a robot NEAR (-> full 1.0) and FAR (-> 0.35), on BOTH tiers, and
//     screenshots each. The recede is byte-identical to T3 (D11): near<=288px=>1.0,
//     far>=480px=>0.35.
//
//   node tools/snap_gfx4_f3.mjs
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE = process.env.BB_BASE || "http://localhost:5173";
const CHROMIUM = process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium";
const SHOTS = "tools/shots/gfx4";
mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const ok = (cond, msg, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}${extra ? " — " + extra : ""}`);
  if (!cond) fails.push(msg);
};

const browser = await chromium.launch({ executablePath: CHROMIUM });

const startLevel = async (page, idx) => {
  await page.evaluate((i) => {
    const m = window.__BB.game.scene;
    m.stop("UI"); m.stop("Game"); m.stop("Title"); m.stop("Onboard"); m.stop("Hub");
    m.start("Game", { levelIndex: i });
  }, idx);
  await page.waitForFunction(() => {
    const g = window.__BB.game.scene.getScene("Game");
    return !!(g && g.def && g.players && g.players.length === 2 && window.__BB.game.scene.isActive("Game"));
  }, null, { timeout: 8000 });
  await sleep(1400);
};

// ---------- 3a: PORTRAITS (canvas reference tier) ----------------------------
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  let errs = 0;
  page.on("pageerror", (e) => { console.log("PAGE ERROR:", e.message); errs++; });
  await page.goto(`${BASE}/?canvas=1`, { waitUntil: "networkidle" });
  await sleep(900);
  await startLevel(page, 0);
  const shot = (n) => page.screenshot({ path: `${SHOTS}/${n}.png` });

  const LONG = "KOBI: " + "This is a long calibration line so the typewriter keeps running while we capture the flutter. ".repeat(2);
  const drive = async (mood) => {
    await page.evaluate(({ m, text }) => {
      const UI = window.__BB.game.scene.getScene("UI");
      UI.blipActive = null; UI.blipQueue.length = 0;
      window.__BB.game.events.emit("bb:blip", { text, mood: m });
    }, { m: mood, text: LONG });
  };
  const EXPECT = {
    gloating: "kobi_face_smug", angry: "kobi_face_alarmed", scared: "kobi_face_alarmed",
    happy: "kobi_face_glee", defeated: "kobi_face_defeated", bewildered: "kobi_face_neutral",
  };
  for (const mood of Object.keys(EXPECT)) {
    await drive(mood);
    // wait until typing AND mouth overlay open, then shoot fast (mid-type, mouth open)
    await page.waitForFunction(() => {
      const UI = window.__BB.game.scene.getScene("UI");
      const b = UI.blipActive;
      return b && b.shown < b.text.length && UI.avMouth.visible;
    }, null, { timeout: 4000 }).catch(() => {});
    const midState = await page.evaluate(() => {
      const UI = window.__BB.game.scene.getScene("UI");
      return { tex: UI.avPortrait.texture.key, mouth: UI.avMouth.visible, typing: UI.blipActive && UI.blipActive.shown < UI.blipActive.text.length };
    });
    await shot(`f3-kobi-${mood}`);
    ok(midState.tex === EXPECT[mood], `mood '${mood}' -> ${EXPECT[mood]}`, `got ${midState.tex}`);
    ok(midState.mouth === true, `mood '${mood}' mouth OPEN mid-type`, `mouth=${midState.mouth} typing=${midState.typing}`);

    // let typing finish naturally, confirm mouth settles CLOSED, screenshot settled
    await page.waitForFunction(() => {
      const UI = window.__BB.game.scene.getScene("UI");
      const b = UI.blipActive;
      return b && b.shown >= b.text.length;
    }, null, { timeout: 8000 }).catch(() => {});
    await sleep(80);
    const settled = await page.evaluate(() => window.__BB.game.scene.getScene("UI").avMouth.visible);
    await shot(`f3-kobi-${mood}-settled`);
    ok(settled === false, `mood '${mood}' mouth CLOSED after typing ends`, `mouth=${settled}`);
  }

  // ENTER-skip: emit, complete typewriter via skip, confirm mouth settles closed
  await page.evaluate(() => {
    const UI = window.__BB.game.scene.getScene("UI");
    UI.blipActive = null; UI.blipQueue.length = 0;
    window.__BB.game.events.emit("bb:blip", { text: "KOBI: " + "skip flutter probe line. ".repeat(6), mood: "angry" });
  });
  await sleep(200);
  await page.keyboard.press("Enter"); // skip-to-full
  await sleep(150);
  const afterSkip = await page.evaluate(() => {
    const UI = window.__BB.game.scene.getScene("UI");
    const b = UI.blipActive;
    return { mouth: UI.avMouth.visible, full: b ? b.shown >= b.text.length : null };
  });
  ok(afterSkip.mouth === false, "mouth CLOSED after ENTER-skip", `mouth=${afterSkip.mouth} full=${afterSkip.full}`);
  ok(errs === 0, "3a: zero page errors", `errs=${errs}`);
  await page.close();
}

// ---------- 3b: SIGNAGE (both tiers) -----------------------------------------
const probeSign = async (tier) => {
  const q = tier === "canvas" ? "/?canvas=1" : "/";
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  let errs = 0;
  page.on("pageerror", (e) => { console.log("PAGE ERROR:", e.message); errs++; });
  await page.goto(`${BASE}${q}`, { waitUntil: "networkidle" });
  await sleep(900);
  await startLevel(page, 0);
  const shot = (n) => page.screenshot({ path: `${SHOTS}/${n}.png` });

  // find the restyled door sign (the only Container registered for T3 recede) +
  // center the (non-following) camera on it for a clean capture.
  const info = await page.evaluate(() => {
    const G = window.__BB.game.scene.getScene("Game");
    const e = G.proxLabels.find((p) => p.obj && p.obj.type === "Container");
    if (!e) return null;
    let label = null, kids = 0;
    if (e.obj.list) { kids = e.obj.list.length; const t = e.obj.list.find((c) => c.type === "Text"); if (t) label = t.text; }
    G.cameras.main.stopFollow();
    G.cameras.main.centerOn(e.x, e.y);
    return { x: e.x, y: e.y, label, kids, tier: G.game.renderer.type === 2 ? "WEBGL" : "CANVAS" };
  });
  if (!info) { ok(false, `${tier}: door sign container found`); await page.close(); return; }

  // FAR: move both robots way off -> recede toward 0.35
  const farA = await page.evaluate(() => {
    const G = window.__BB.game.scene.getScene("Game");
    const e = G.proxLabels.find((p) => p.obj && p.obj.type === "Container");
    G.players.forEach((p) => { p.x = e.x + 3000; p.y = e.y; });
    for (let i = 0; i < 40; i++) G.updateProxLabels();
    return e.obj.alpha;
  });
  await sleep(120);
  await shot(`f3-sign-far-${tier}`);

  // NEAR: put a robot on the sign -> alpha toward 1.0
  const nearA = await page.evaluate(() => {
    const G = window.__BB.game.scene.getScene("Game");
    const e = G.proxLabels.find((p) => p.obj && p.obj.type === "Container");
    G.players[0].x = e.x; G.players[0].y = e.y;
    G.cameras.main.centerOn(e.x, e.y);
    for (let i = 0; i < 40; i++) G.updateProxLabels();
    return e.obj.alpha;
  });
  await sleep(120);
  await shot(`f3-sign-near-${tier}`);

  ok(info.label === "GATE", `${tier}: sign label is mono "GATE"`, `label=${info.label} kids=${info.kids}`);
  ok(Math.abs(farA - 0.35) < 0.02, `${tier}: FAR recede alpha == 0.35 (T3)`, `alpha=${farA.toFixed(4)}`);
  ok(Math.abs(nearA - 1.0) < 0.02, `${tier}: NEAR full alpha == 1.0 (T3)`, `alpha=${nearA.toFixed(4)}`);
  ok(errs === 0, `${tier}: zero page errors`, `errs=${errs}`);
  console.log(`  [${tier}] renderer=${info.tier} sign@(${Math.round(info.x)},${Math.round(info.y)}) far=${farA.toFixed(4)} near=${nearA.toFixed(4)} kids=${info.kids}`);
  await page.close();
};

await probeSign("canvas");
await probeSign("webgl");

await browser.close();
console.log(`\n${fails.length === 0 ? "ALL PASS" : fails.length + " FAIL"}`);
process.exit(fails.length ? 1 : 0);
