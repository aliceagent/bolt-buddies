// Bolt Buddies — Softlock prober runner (SL1).
//
// Drives each level (1-1…2-3 + tutorial) into every CANDIDATE softlock state from
// SOFTLOCK_ROADMAP.md's inventory table, attempts every in-game recovery, and
// classifies each as RECOVERABLE or HARD SOFTLOCK from the ACTUAL driven run
// (final state + which recoveries were tried and their outcomes). Input-only,
// headless-Chromium, deterministic and repeatable so it guards future changes.
//
//   node tools/softlock/runner.mjs                 # all scenarios
//   node tools/softlock/runner.mjs tut 2-3         # only these levels
//   node tools/softlock/runner.mjs --only tut-station4-both-in
//
// Writes tools/softlock/report.json and prints a per-candidate verdict table.
// Exit 0 always (this is an AUDIT, not a pass/fail gate — a HARD SOFTLOCK is a
// finding to record for SL3/SL4, not a build break). Use --strict to exit
// non-zero if any scenario failed to be DRIVEN (setup error), so CI can catch a
// prober that silently stopped reaching its states.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import { Driver } from "../beat/driver.mjs";
import { LEVEL_INDEX, ROLES_A, startLevel, snap, sleep } from "./probe.mjs";

import tutScenarios from "./scenarios/tut.mjs";
import world1Scenarios from "./scenarios/world1.mjs";
import world2Scenarios from "./scenarios/world2.mjs";

const URL = process.env.BB_URL || "http://localhost:5173/?canvas=1";
const CHROMIUM = process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium";
const SCENARIO_BUDGET_MS = 3.5 * 60 * 1000;

const ALL = [...tutScenarios, ...world1Scenarios, ...world2Scenarios];

const argv = process.argv.slice(2);
const STRICT = argv.includes("--strict");
// --merge: fold this batch's results into an existing report.json (replace by id),
// so the suite can be driven in FOREGROUND batches that accumulate one report.
const MERGE = argv.includes("--merge");
const onlyIdx = argv.indexOf("--only");
const onlyId = onlyIdx >= 0 ? argv[onlyIdx + 1] : null;
const levelFilter = argv.filter((a) => LEVEL_INDEX[a] !== undefined);

let scenarios = ALL;
if (onlyId) scenarios = ALL.filter((s) => s.id === onlyId);
else if (levelFilter.length) scenarios = ALL.filter((s) => levelFilter.includes(s.level));

async function runScenario(page, scn) {
  const bb = new Driver(page);
  bb.setRoles(ROLES_A);
  await startLevel(page, LEVEL_INDEX[scn.level]);
  const start = Date.now();
  let res;
  try {
    res = await Promise.race([
      scn.run(bb, page),
      sleep(SCENARIO_BUDGET_MS).then(() => { throw new Error("scenario exceeded budget"); }),
    ]);
  } catch (e) {
    // Setup couldn't be driven (flake / timeout). Report honestly rather than guess.
    await bb.writeFailure(`softlock_${scn.id}`, "run", e).catch(() => {});
    res = {
      classification: "UNVERIFIED",
      verdict: `could not be driven: ${e?.message || e}`,
      notes: scn.notesOnFail || "setup failed to reach the softlock state on this run (see failure artifact).",
      recoveries: [],
      repro: scn.repro || [],
    };
  }
  await bb.releaseAll().catch(() => {});
  for (const c of ["KeyA", "KeyD", "KeyW", "KeyS", "KeyE", "Space",
    "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyL"]) {
    await page.keyboard.up(c).catch(() => {});
  }
  return {
    id: scn.id, level: scn.level, category: scn.category, candidate: scn.candidate,
    durationMs: Date.now() - start, deaths: bb.deaths, ...res,
  };
}

async function main() {
  mkdirSync("tools/softlock", { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROMIUM });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.goto(URL, { waitUntil: "networkidle" });
  await sleep(1500);

  // Warmup (same rationale as the beat runner): the first level a fresh headless
  // browser runs is measurably slower (JIT/textures), which makes tight physics
  // probes flaky on run 1 only. Warm one level, discard.
  process.stdout.write("warmup: 1-1 idle pass ... ");
  await startLevel(page, LEVEL_INDEX["1-1"]);
  for (let i = 0; i < 5; i++) {
    await page.keyboard.down("KeyD"); await sleep(700); await page.keyboard.up("KeyD");
    await page.keyboard.down("KeyA"); await sleep(700); await page.keyboard.up("KeyA");
    await sleep(400);
  }
  process.stdout.write("done\n");

  const results = [];
  for (const scn of scenarios) {
    process.stdout.write(`\n▶ [${scn.level}] ${scn.id} — ${scn.candidate} ... `);
    const r = await runScenario(page, scn);
    results.push(r);
    process.stdout.write(`${r.classification} in ${(r.durationMs / 1000).toFixed(1)}s\n    ${r.verdict}`);
  }

  await browser.close();

  // Summary table
  console.log(`\n\n=== Softlock audit summary (${results.length} candidates) ===`);
  console.table(results.map((r) => ({
    level: r.level, id: r.id, category: r.category,
    classification: r.classification,
    "recovery / reason": r.classification === "RECOVERABLE"
      ? (r.recoveries.find((x) => x.ok)?.name || "(see notes)")
      : r.verdict,
  })));

  const counts = results.reduce((m, r) => (m[r.classification] = (m[r.classification] || 0) + 1, m), {});
  console.log(`\nRECOVERABLE: ${counts.RECOVERABLE || 0}   HARD SOFTLOCK: ${counts["HARD SOFTLOCK"] || 0}   UNVERIFIED: ${counts.UNVERIFIED || 0}`);
  const hard = results.filter((r) => r.classification === "HARD SOFTLOCK");
  if (hard.length) {
    console.log(`\nHARD SOFTLOCKS (for SL3/SL4):`);
    for (const h of hard) console.log(`  - [${h.level}] ${h.candidate}: ${h.verdict}`);
  }
  if (pageErrors.length) console.log(`\npage errors: ${pageErrors.length} (first: ${pageErrors[0]})`);

  let merged = results;
  if (MERGE && existsSync("tools/softlock/report.json")) {
    try {
      const prev = JSON.parse(readFileSync("tools/softlock/report.json", "utf8")).results || [];
      const byId = new Map(prev.map((r) => [r.id, r]));
      for (const r of results) byId.set(r.id, r);
      merged = [...byId.values()];
    } catch { /* corrupt/absent — just write this batch */ }
  }
  writeFileSync(
    "tools/softlock/report.json",
    JSON.stringify({ when: new Date().toISOString(), url: URL, results: merged, pageErrors }, null, 2)
  );
  console.log("\nreport -> tools/softlock/report.json");

  const undriven = results.filter((r) => r.classification === "UNVERIFIED" && !r.expectedUnverified);
  process.exit(STRICT && undriven.length ? 1 : 0);
}

main().catch((e) => { console.error("softlock runner crashed:", e); process.exit(1); });
