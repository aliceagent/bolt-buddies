// Bolt Buddies — Beat Kit runner.
//
// Runs the tile-precise walkthrough routes for the requested levels, each in BOTH
// role assignments (P1-takes-first-pedestal and swapped), input-only. Reports a
// PASS/FAIL table + report.json and writes a failure artifact (screenshot + state
// JSON + step log) for any run that fails. Non-zero exit on any failure.
//
//   node tools/beat/runner.mjs               # World-1 matrix: 1-1, 1-2, 1-3
//   node tools/beat/runner.mjs 1-1           # one level, both assignments
//   node tools/beat/runner.mjs 1-1 1-3       # a subset
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { Driver } from "./driver.mjs";

const URL = process.env.BB_URL || "http://localhost:5173/?canvas=1";
const CHROMIUM = process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium";
const RUN_BUDGET_MS = 4 * 60 * 1000; // 4 minutes per run

// level id -> registry index
const LEVEL_INDEX = { "1-1": 0, "1-2": 1, "1-3": 2, "2-1": 3, "2-2": 4, "2-3": 5 };
const DEFAULT_LEVELS = ["1-1", "1-2", "1-3"];

// Both role assignments. Roles are abstract (G=grapple, H=heavy); the runner maps
// each to a player index. "A" = P1 takes the first (grapple) pedestal; "B" swaps.
const ASSIGNMENTS = [
  { name: "A:P1=G", roles: { G: 0, H: 1 } },
  { name: "B:P1=H", roles: { G: 1, H: 0 } },
];

const levels = process.argv.slice(2).filter((a) => LEVEL_INDEX[a] !== undefined);
const toRun = levels.length ? levels : DEFAULT_LEVELS;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function loadRoute(id) {
  const mod = await import(`./routes/${id}.mjs`);
  return mod.default;
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

async function runOne(page, id, assignment) {
  const steps = await loadRoute(id);
  const bb = new Driver(page);
  bb.setRoles(assignment.roles);
  const label = `${id}_${assignment.name}`;
  await startLevel(page, LEVEL_INDEX[id]);

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
  let complete = false;
  try { complete = (await bb.state())?.complete === true; } catch { /* page gone */ }

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

  const results = [];
  for (const id of toRun) {
    for (const assignment of ASSIGNMENTS) {
      process.stdout.write(`\n▶ ${id} [${assignment.name}] ... `);
      const r = await runOne(page, id, assignment);
      results.push(r);
      process.stdout.write(
        `${r.result} in ${(r.durationMs / 1000).toFixed(1)}s (${r.deaths} deaths, ${r.steps}/${r.totalSteps} steps)` +
        (r.result === "FAIL" ? ` — ${r.failedStep}: ${r.error}` : "")
      );
    }
  }

  await browser.close();

  console.log("\n\n=== Beat matrix summary ===");
  console.table(
    results.map((r) => ({
      level: r.id,
      assignment: r.assignment,
      result: r.result,
      "time(s)": +(r.durationMs / 1000).toFixed(1),
      deaths: r.deaths,
      steps: `${r.steps}/${r.totalSteps}`,
      failedStep: r.failedStep,
    }))
  );

  const passed = results.filter((r) => r.result === "PASS").length;
  console.log(`\n${passed}/${results.length} runs GREEN`);
  if (pageErrors.length) console.log(`page errors seen: ${pageErrors.length} (first: ${pageErrors[0]})`);

  writeFileSync(
    "tools/beat/report.json",
    JSON.stringify({ when: new Date().toISOString(), levels: toRun, results, pageErrors }, null, 2)
  );
  console.log("report -> tools/beat/report.json");

  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error("runner crashed:", e);
  process.exit(1);
});
