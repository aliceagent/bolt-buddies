// Bolt Buddies — Beat Kit runner.
//
// Runs the tile-precise walkthrough routes for the requested levels, each in BOTH
// role assignments (P1-takes-first-pedestal and swapped), input-only. Reports a
// PASS/FAIL table + report.json and writes a failure artifact (screenshot + state
// JSON + step log) for any run that fails. Non-zero exit on any failure.
//
//   node tools/beat/runner.mjs               # default 12-run matrix (no cores)
//   node tools/beat/runner.mjs 1-1           # one level, both assignments
//   node tools/beat/runner.mjs 1-1 1-3       # a subset
//   node tools/beat/runner.mjs --full        # 12 core-collecting runs + 6 chaos smokes
//   node tools/beat/runner.mjs --chaos       # chaos smoke only (6 runs)
//   node tools/beat/runner.mjs --full 2-2    # core variant + chaos for one level
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { Driver } from "./driver.mjs";
import { buildCoreRoute, assertCoresStep } from "./coremerge.mjs";
import { runChaos, HEADLESS_FPS_BAR } from "./chaos.mjs";

const URL = process.env.BB_URL || "http://localhost:5173/?canvas=1";
const CHROMIUM = process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium";
const RUN_BUDGET_MS = 4 * 60 * 1000; // 4 minutes per run

// level id -> registry index
const LEVEL_INDEX = { "1-1": 0, "1-2": 1, "1-3": 2, "2-1": 3, "2-2": 4, "2-3": 5 };
const DEFAULT_LEVELS = ["1-1", "1-2", "1-3", "2-1", "2-2", "2-3"]; // full 12-run matrix

// Both role assignments. Roles are abstract (G=grapple, H=heavy); the runner maps
// each to a player index. "A" = P1 takes the first (grapple) pedestal; "B" swaps.
// W1 routes use G(rapple)/H(eavy); W2 routes use P(hase)/T(iny). Both alias
// the same idea: the first-listed role takes the FIRST pedestal.
const ASSIGNMENTS = [
  { name: "A:P1=G", roles: { G: 0, H: 1, P: 0, T: 1 } },
  { name: "B:P1=H", roles: { G: 1, H: 0, P: 1, T: 0 } },
];

const argv = process.argv.slice(2);
const FULL = argv.includes("--full");
const CHAOS_ONLY = argv.includes("--chaos");
const levels = argv.filter((a) => LEVEL_INDEX[a] !== undefined);
const toRun = levels.length ? levels : DEFAULT_LEVELS;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Default matrix: the route's `export default` VERBATIM (provably unchanged).
// --full: splice the route's `coreSteps` detours in and add the pre-exit
// "all 3 cores collected" assertion before the final (exit/complete) step.
async function loadRoute(id, full) {
  const mod = await import(`./routes/${id}.mjs`);
  if (!full) return mod.default;
  if (!mod.coreSteps) {
    throw new Error(`--full: routes/${id}.mjs has no coreSteps export`);
  }
  const merged = buildCoreRoute(mod.default, mod.coreSteps || []);
  // cores documented uncollectable-by-real-input (findings for design arbitration)
  const exclude = new Set((mod.uncollectableCores || []).map((c) => c.index));
  // insert the cores assertion immediately before the final route step
  return [...merged.slice(0, -1), assertCoresStep(exclude), merged[merged.length - 1]];
}

async function startLevel(page, levelIndex) {
  await page.evaluate((i) => {
    localStorage.clear();
    const m = window.__BB.game.scene;
    ["UI", "Game", "Title", "Hub"].forEach((k) => m.stop(k));
    m.start("Game", { levelIndex: i });
  }, levelIndex);
  await sleep(1600); // let the scene warm up
}

async function runOne(page, id, assignment, full) {
  const steps = await loadRoute(id, full);
  const bb = new Driver(page);
  bb.setRoles(assignment.roles);
  const label = `${id}_${assignment.name}`;
  await startLevel(page, LEVEL_INDEX[id]);
  // SL2: zero the passive progress-watchdog session peak so this run measures its
  // OWN peak tier (pure read; the watchdog itself changes no gameplay).
  await page.evaluate(() => { window.__bbWatchdogPeakTier = 0; }).catch(() => {});

  const start = Date.now();
  let stepsDone = 0;
  let failure = null;
  for (const step of steps) {
    bb.stepDeaths = 0;
    if (Date.now() - start > RUN_BUDGET_MS) {
      failure = { step: step.name, error: "run exceeded 4-minute budget" };
      break;
    }
    try {
      // hard cap each step so a hang can't blow the whole run's budget
      await Promise.race([
        step.fn(bb),
        sleep(RUN_BUDGET_MS - (Date.now() - start)).then(() => {
          throw new Error("run budget elapsed mid-step");
        }),
      ]);
      stepsDone++;
    } catch (e) {
      failure = { step: step.name, error: e?.message || String(e) };
      await bb.writeFailure(label, step.name, e).catch(() => {});
      break;
    }
  }
  await bb.releaseAll().catch(() => {});
  // paranoid full purge: a step abandoned mid-tap (budget race, thrown
  // primitive) can leave a key PHYSICALLY down that the driver never tracked —
  // and the page persists across runs, poisoning every later route.
  for (const c of ["KeyA", "KeyD", "KeyW", "KeyS", "KeyE", "Space",
    "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyL"]) {
    await page.keyboard.up(c).catch(() => {});
  }
  let complete = false;
  try { complete = (await bb.state())?.complete === true; } catch { /* page gone */ }
  // SL2: the passive watchdog's peak tier reached during THIS run (should be 0 —
  // the suite progresses fast, so a correct watchdog never raises). Reported
  // SEPARATELY from PASS/FAIL so an env beat-flake is never conflated with a
  // watchdog false-fire.
  let watchdogPeak = 0;
  try { watchdogPeak = await page.evaluate(() => window.__bbWatchdogPeakTier | 0); } catch { /* page gone */ }

  const pass = !failure && complete;
  return {
    id,
    assignment: assignment.name,
    result: pass ? "PASS" : "FAIL",
    complete,
    durationMs: Date.now() - start,
    deaths: bb.deaths,
    steps: stepsDone,
    totalSteps: steps.length,
    failedStep: failure?.step || "",
    error: failure?.error || "",
    watchdogPeak,
  };
}

async function main() {
  mkdirSync("tools/beat", { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROMIUM });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.goto(URL, { waitUntil: "networkidle" });
  await sleep(1500);

  // Warmup pass: the very first level a fresh headless browser runs is measurably
  // slower (JIT, texture generation, audio-context spin-up), which makes tight
  // physics steps (run-jumps, reel timing) flaky on run 1 only. Load a level,
  // let it simulate ~15s with a little real input, then discard — so the first
  // scored run behaves like every later one.
  process.stdout.write("warmup: running 1-1 idle pass ... ");
  await startLevel(page, LEVEL_INDEX["1-1"]);
  for (let i = 0; i < 6; i++) {
    await page.keyboard.down("KeyD");
    await sleep(900);
    await page.keyboard.up("KeyD");
    await page.keyboard.down("KeyA");
    await sleep(900);
    await page.keyboard.up("KeyA");
    await sleep(600);
  }
  process.stdout.write("done\n");

  // The run matrix. --chaos runs ONLY the chaos smoke; default and --full both
  // run the 12-run matrix (--full uses the core-collecting variants).
  const results = [];
  const runMatrix = !CHAOS_ONLY;
  const runChaosSmoke = FULL || CHAOS_ONLY;
  const label = FULL ? "core matrix (100%)" : "matrix";

  if (runMatrix) {
    for (const id of toRun) {
      for (const assignment of ASSIGNMENTS) {
        process.stdout.write(`\n▶ ${id} [${assignment.name}]${FULL ? " +cores" : ""} ... `);
        const r = await runOne(page, id, assignment, FULL);
        results.push(r);
        process.stdout.write(
          `${r.result} in ${(r.durationMs / 1000).toFixed(1)}s (${r.deaths} deaths, ${r.steps}/${r.totalSteps} steps, wd-peak ${r.watchdogPeak})` +
          (r.result === "FAIL" ? ` — ${r.failedStep}: ${r.error}` : "")
        );
      }
    }
  }

  const chaosResults = [];
  if (runChaosSmoke) {
    process.stdout.write(`\n\n=== chaos smoke (60s random input/level, fps bar ${HEADLESS_FPS_BAR}) ===`);
    for (const id of toRun) {
      process.stdout.write(`\n▶ chaos ${id} ... `);
      const c = await runChaos(page, id, LEVEL_INDEX[id]).catch((e) => ({
        id, kind: "chaos", result: "FAIL", pageErrors: 1, firstError: e.message,
        minFps: 0, avgFps: 0, oob: [], fpsBar: HEADLESS_FPS_BAR,
      }));
      chaosResults.push(c);
      process.stdout.write(
        `${c.result} — fps min ${c.minFps}/avg ${c.avgFps}, ${c.pageErrors} page errors, ${c.oob.length} oob` +
        (c.result === "FAIL" && c.firstError ? ` — ${c.firstError}` : "")
      );
    }
  }

  await browser.close();

  if (runMatrix) {
    console.log(`\n\n=== Beat ${label} summary ===`);
    console.table(
      results.map((r) => ({
        level: r.id,
        assignment: r.assignment,
        result: r.result,
        "time(s)": +(r.durationMs / 1000).toFixed(1),
        deaths: r.deaths,
        steps: `${r.steps}/${r.totalSteps}`,
        "wd-peak": r.watchdogPeak,
        failedStep: r.failedStep,
      }))
    );
  }
  if (runChaosSmoke) {
    console.log(`\n=== Chaos smoke summary (headless fps bar ${HEADLESS_FPS_BAR}; design bar 50) ===`);
    console.table(
      chaosResults.map((c) => ({
        level: c.id,
        result: c.result,
        "fps(min)": c.minFps,
        "fps(avg)": c.avgFps,
        pageErrors: c.pageErrors,
        oob: c.oob.length,
      }))
    );
  }

  const matrixPass = results.filter((r) => r.result === "PASS").length;
  const chaosPass = chaosResults.filter((c) => c.result === "PASS").length;
  if (runMatrix) console.log(`\n${matrixPass}/${results.length} matrix runs GREEN`);
  if (runMatrix) {
    const wdMax = results.reduce((m, r) => Math.max(m, r.watchdogPeak || 0), 0);
    console.log(`SL2 watchdog: peak tier ${wdMax} across the matrix (0 = never raised — the no-false-fire guard)`);
  }
  if (runChaosSmoke) console.log(`${chaosPass}/${chaosResults.length} chaos smokes GREEN`);
  if (pageErrors.length) console.log(`page errors seen (runner listener): ${pageErrors.length} (first: ${pageErrors[0]})`);

  writeFileSync(
    "tools/beat/report.json",
    JSON.stringify({ when: new Date().toISOString(), full: FULL, chaosOnly: CHAOS_ONLY, levels: toRun, results, chaosResults, pageErrors }, null, 2)
  );
  console.log("report -> tools/beat/report.json");

  const allGreen = matrixPass === results.length && chaosPass === chaosResults.length;
  process.exit(allGreen ? 0 : 1);
}

main().catch((e) => {
  console.error("runner crashed:", e);
  process.exit(1);
});
