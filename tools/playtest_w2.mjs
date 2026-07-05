// World 2 playtest: phase-walls & escort, ducts, rollers, wardens, jets, fans,
// timed doors, and the tiny-throw finale. Run with the dev server on :5173.
//
// CHUNKED SESSIONS (see TESTKIT_ROADMAP.md "KNOWN INFRA ISSUE"): the original
// single-browser run reliably died with a native "Target crashed" that arms
// early in the title->hub->2-1 path and detonates tens of checks later —
// identical steps hand-rolled in fresh sessions pass. Mitigation: each level
// runs in its OWN browser with a hard per-chunk timeout and one crash-retry.
// All 30 checks are preserved verbatim; a chunk that dies twice contributes a
// single synthetic FAIL so the exit code stays honest.
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const URL = process.env.BB_URL || "http://localhost:5173/?canvas=1";
const WARMUP_MS = Number(process.env.BB_WARMUP_MS || 0);
const SHOTS = process.env.BB_SHOTS || "tools/shots";
const CHUNK_TIMEOUT_MS = 180000;
mkdirSync(SHOTS, { recursive: true });

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

// Per-chunk browser + helper bundle (fresh everything, no shared state).
async function makeCtx() {
  const browser = await chromium.launch({
    executablePath: process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium",
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500 + WARMUP_MS); // WebGL warmup: first seconds run slow-motion

  const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png` });
  const scene = (fn, ...args) => page.evaluate(fn, ...args);
  const hold = async (key, ms) => {
    await page.keyboard.down(key);
    await page.waitForTimeout(ms);
    await page.keyboard.up(key);
  };
  const tap = (key) => hold(key, 70);
  const startLevel = async (idx) => {
    await scene((i) => {
      const m = window.__BB.game.scene;
      m.stop("UI");
      m.stop("Game");
      m.stop("Title");
      m.stop("Hub");
      m.start("Game", { levelIndex: i });
    }, idx);
    await page.waitForTimeout(1000);
  };
  const st = () => scene(() => {
    const s = window.__BB.scene;
    return {
      id: s.def.id,
      p: s.players.map((p) => ({
        x: Math.round(p.x), y: Math.round(p.y), skill: p.skill, dead: p.dead, grounded: p.grounded,
      })),
      cores: s.coresGot,
      complete: s.complete,
      doors: s.doors.map((d) => ({ id: d.id, open: d.open })),
      wardens: s.wardens.map((w) => ({ id: w.id, defeated: w.defeated })),
    };
  });
  const tp = (i, tx, ty) => scene(([i, tx, ty]) => {
    const s = window.__BB.scene;
    const p = s.players[i];
    if (p.carriedBy) s.detachCarry(p.carriedBy, p, false);
    if (p.carrying) s.detachCarry(p, p.carrying, false);
    p.clearStates();
    p.body.reset(tx * 48 + 24, ty * 48 + 24 - 8);
    p.setVelocity(0, 0);
  }, [i, tx, ty]);
  const skills = () => scene(() => {
    const s = window.__BB.scene;
    s.players[0].setSkill("phase");
    s.players[1].setSkill("tiny");
  });
  const settle = () => page.waitForTimeout(1100); // let pending respawns land

  return { browser, page, shot, scene, hold, tap, startLevel, st, tp, skills, settle };
}

// Run one chunk in a fresh browser; on a native crash / hang, retry once with
// another fresh browser (dropping the dead attempt's partial results).
async function runChunk(name, fn) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const before = results.length;
    let ctx = null;
    try {
      ctx = await makeCtx();
      let tId;
      await Promise.race([
        fn(ctx),
        new Promise((_, rej) => { tId = setTimeout(() => rej(new Error("chunk timeout")), CHUNK_TIMEOUT_MS); }),
      ]).finally(() => clearTimeout(tId));
      await ctx.browser.close();
      return;
    } catch (e) {
      results.length = before; // drop partial results from the dead attempt
      console.log(`\nCHUNK ${name} attempt ${attempt} died: ${e?.message || e}` +
        (attempt === 1 ? " — retrying in a fresh browser\n" : "\n"));
      if (ctx) await ctx.browser.close().catch(() => {});
      if (attempt === 2) check(`${name} chunk completed`, false, e?.message || String(e));
    }
  }
}

// ================= 2-1 =================
await runChunk("2-1", async ({ shot, scene, hold, tap, startLevel, st, tp, skills, settle, page }) => {
  await startLevel(3);
  check("2-1 loads", (await st()).id === "2-1");
  await skills();
  await shot("w2-01-level21");

  // duct: tiny crawls through the pinch, phase is blocked
  await tp(1, 14, 13);
  await hold("ArrowRight", 900);
  check("tiny crawls through vent pinch", (await st()).p[1].x > 16 * 48, `x=${(await st()).p[1].x}`);
  await tp(0, 14, 13);
  await hold("KeyD", 900);
  check("phase blocked by vent pinch", (await st()).p[0].x < 16 * 48, `x=${(await st()).p[0].x}`);

  // phase-wall: phase passes the slab panel, tiny alone is blocked
  await tp(0, 13, 7); // slab top before panel at x15
  await hold("KeyD", 1200);
  check("phase walks through shimmer panel", (await st()).p[0].x > 16 * 48, `x=${(await st()).p[0].x}`);
  await tp(1, 22, 13); // tunnel, far from phase
  await tp(0, 40, 7); // keep phase away (no escort)
  await settle();
  await tp(1, 13, 7);
  await hold("ArrowRight", 1200);
  check("tiny alone blocked by shimmer panel", (await st()).p[1].x < 15 * 48 + 40, `x=${(await st()).p[1].x}`);

  // escort: tiny passes the panel while phase stands close.
  // DANGER WINDOW (root cause of the old "Target crashed"/hang): a page.evaluate
  // issued ~200-400ms after this teleport pair PERMANENTLY wedges the headless
  // renderer (deterministic 3/3, both renderers; fine at +1.2s). tp() already
  // zeroes velocity, so the old setVelocity evaluate here was redundant — keep
  // ALL evaluates out of the window and just wait it out before the walk.
  await tp(0, 14, 7);
  await tp(1, 13, 7);
  await page.waitForTimeout(1200);
  await hold("ArrowRight", 1500);
  check("escorted tiny passes shimmer panel", (await st()).p[1].x > 15 * 48 + 20, `x=${(await st()).p[1].x}`);

  // alternation doors
  await tp(0, 18, 7);
  await page.waitForTimeout(200);
  await tap("KeyE"); // phase pulls lvP1
  await page.waitForTimeout(300);
  check("phase lever opens tunnel door dT1", (await st()).doors.find((d) => d.id === "dT1")?.open === true);
  await tp(1, 28, 13);
  await page.waitForTimeout(200);
  await tap("KeyL"); // tiny pulls lvT1
  await page.waitForTimeout(300);
  check("tiny lever opens slab door dP1", (await st()).doors.find((d) => d.id === "dP1")?.open === true);

  // roller: kills phase in the beam, ignores tiny
  await tp(1, 51, 13); // tiny strolls the yard
  await tp(0, 0, 0); // phase far away for now
  await page.waitForTimeout(1500);
  check("roller ignores tiny", (await st()).p[1].dead === false);
  const rollerX = await scene(() => Math.round(window.__BB.scene.rollers[0].img.x / 48));
  await tp(1, 46, 13);
  await tp(0, rollerX + 2, 13); // phase right in front of the roller
  let zapped = false;
  for (let i = 0; i < 10 && !zapped; i++) {
    await page.waitForTimeout(300);
    zapped = (await st()).p[0].dead;
  }
  check("roller zaps phase in its beam", zapped);
  await shot("w2-02-roller");
  await settle();

  // finish 2-1
  await tp(0, 54, 13);
  await page.waitForTimeout(200);
  await tap("KeyE"); // lvE inside the pillar
  await page.waitForTimeout(300);
  check("exit lever opens 2-1 exit", (await st()).doors.find((d) => d.id === "exit")?.open === true);
  await tp(0, 57, 12);
  await tp(1, 57, 12);
  await page.waitForTimeout(600);
  check("2-1 completes", (await st()).complete === true);
  await shot("w2-03-clear21");
});

// ================= 2-2 =================
await runChunk("2-2", async ({ shot, scene, tap, startLevel, st, tp, skills, settle, page }) => {
  await startLevel(4);
  check("2-2 loads", (await st()).id === "2-2");
  await skills();
  await shot("w2-04-level22");

  // fan lifts tiny, not phase
  await tp(1, 14, 13);
  await page.waitForTimeout(1200);
  const tinyY = (await st()).p[1].y;
  check("fan lifts tiny", tinyY < 10 * 48, `y=${tinyY}`);
  await tp(1, 30, 13);
  await settle();
  await tp(0, 14, 13);
  await page.waitForTimeout(1200);
  check("fan does not lift phase", (await st()).p[0].y > 12 * 48, `y=${(await st()).p[0].y}`);

  // steam corridor: constant jets kill, valve shuts them down
  await tp(1, 0, 0);
  await settle();
  await tp(0, 26, 12); // under a corridor jet
  let steamed = false;
  for (let i = 0; i < 6 && !steamed; i++) {
    await page.waitForTimeout(250);
    steamed = (await st()).p[0].dead;
  }
  check("steam jet cooks phase", steamed);
  await settle();
  await scene(() => {
    const s = window.__BB.scene;
    const l = s.levers.find((v) => v.id === "lvV1");
    s.pullLever(l);
  });
  await page.waitForTimeout(400);
  const jetsOff = await scene(() => window.__BB.scene.jets.filter((j) => j.disabledBy === "lvV1").every((j) => !j.active));
  check("valve shuts corridor steam", jetsOff);
  await tp(0, 26, 12);
  await page.waitForTimeout(900);
  check("phase survives the quiet corridor", (await st()).p[0].dead === false);
  await shot("w2-05-steam-off");

  // finish 2-2
  await tp(0, 50, 13); // phase on the plate
  await tp(1, 52, 13);
  await page.waitForTimeout(300);
  await tap("KeyL"); // tiny pulls lvF
  await page.waitForTimeout(400);
  check("2-2 exit opens", (await st()).doors.find((d) => d.id === "exit")?.open === true);
  await tp(0, 55, 12);
  await tp(1, 55, 12);
  await page.waitForTimeout(600);
  check("2-2 completes", (await st()).complete === true);
});

// ================= 2-3 =================
await runChunk("2-3", async ({ shot, scene, hold, tap, startLevel, st, tp, skills, page }) => {
  await startLevel(5);
  check("2-3 loads", (await st()).id === "2-3");
  await skills();
  await shot("w2-06-level23");

  // warden: shoves from the front, defeated from behind
  await tp(0, 24, 13); // in front of w1 (faces right)
  await page.waitForTimeout(400);
  const shoved = await st();
  check("warden shoves from the front", shoved.p[0].x > 24 * 48 && shoved.wardens.find((w) => w.id === "w1").defeated === false, `x=${shoved.p[0].x}`);
  await tp(0, 19, 12); // behind the shimmer panel
  await hold("KeyD", 900); // phase walks through panel into w1's back
  check("warden ambushed through the wall", (await st()).wardens.find((w) => w.id === "w1").defeated === true);
  await shot("w2-07-warden");

  // timed door: opens on the partner's lever, then re-arms
  await scene(() => {
    const s = window.__BB.scene;
    s.pullLever(s.levers.find((v) => v.id === "lvB1"));
  });
  await page.waitForTimeout(300);
  check("timed door tDoorA opens", (await st()).doors.find((d) => d.id === "tDoorA")?.open === true);
  await page.waitForTimeout(7200);
  const rearmed = await scene(() => {
    const s = window.__BB.scene;
    return {
      open: s.doors.find((d) => d.id === "tDoorA").open,
      lever: s.levers.find((v) => v.id === "lvB1").on,
    };
  });
  check("timed door closes and lever re-arms", rearmed.open === false && rearmed.lever === false, JSON.stringify(rearmed));

  // finale: defeat w3 through the wall, throw tiny across the gap
  await scene(() => {
    const s = window.__BB.scene;
    ["w2", "w3"].forEach((id) => {
      const w = s.wardens.find((v) => v.id === id);
      w.defeated = true;
      w.img.body.enable = false;
      w.img.setAlpha(0.2);
    });
  });
  await tp(0, 50, 13);
  await tp(1, 50, 13);
  await page.waitForTimeout(300);
  await tap("KeyE"); // phase picks up tiny
  await page.waitForTimeout(200);
  check("phase picked up tiny", await scene(() => !!window.__BB.scene.players[0].carrying));
  await scene(() => (window.__BB.scene.players[0].facing = 1));
  await tap("KeyE"); // throw!
  await page.waitForTimeout(1400);
  const flight = await st();
  check("tiny thrown across the gap", flight.p[1].x > 58 * 48 && !flight.p[1].dead, `x=${flight.p[1].x} dead=${flight.p[1].dead}`);
  check("mid-air core collected during the throw", (await st()).cores[2] === true, JSON.stringify(flight.cores));
  await shot("w2-08-throw");

  await tp(1, 61, 13);
  await page.waitForTimeout(200);
  await tap("KeyL"); // tiny pulls lvF -> bridge
  await page.waitForTimeout(600);
  check("bridge lowers for phase", await scene(() => window.__BB.scene.bridges[0].open));
  await tp(0, 62, 12);
  await tp(1, 62, 12);
  await page.waitForTimeout(600);
  check("2-3 completes", (await st()).complete === true);
  await shot("w2-09-clear23");
});

const fails = results.filter((r) => !r.ok);
console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
process.exit(fails.length ? 1 : 0);
