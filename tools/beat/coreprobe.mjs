// Diagnostic: run each base route (assignment A) and report final coresGot +
// player end positions. Tells us which of the 3 data-cores each level's base
// route already collects incidentally, so we only author detours for the rest.
//   node tools/beat/coreprobe.mjs            # all 6 levels
//   node tools/beat/coreprobe.mjs 2-2 2-3    # a subset
import { chromium } from "playwright";
import { Driver } from "./driver.mjs";
import { buildCoreRoute, assertCoresStep } from "./coremerge.mjs";

const URL = process.env.BB_URL || "http://localhost:5173/?canvas=1";
const CHROMIUM = process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium";
const LEVEL_INDEX = { "1-1": 0, "1-2": 1, "1-3": 2, "2-1": 3, "2-2": 4, "2-3": 5 };
const ALL = ["1-1", "1-2", "1-3", "2-1", "2-2", "2-3"];
// default assignment A; pass --swap to probe assignment B
const argv = process.argv.slice(2);
const FULL = argv.includes("--full");
const SWAP = argv.includes("--swap");
const roles = SWAP ? { G: 1, H: 0, P: 1, T: 0 } : { G: 0, H: 1, P: 0, T: 1 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const args = argv.filter((a) => LEVEL_INDEX[a] !== undefined);
const toRun = args.length ? args : ALL;

async function startLevel(page, i) {
  await page.evaluate((i) => {
    localStorage.clear();
    const m = window.__BB.game.scene;
    ["UI", "Game", "Title", "Hub"].forEach((k) => m.stop(k));
    m.start("Game", { levelIndex: i });
  }, i);
  await sleep(1600);
}

const browser = await chromium.launch({ executablePath: CHROMIUM });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
await page.goto(URL, { waitUntil: "networkidle" });
await sleep(1500);

for (const id of toRun) {
  const mod = await import(`./routes/${id}.mjs`);
  let steps = mod.default;
  if (FULL) {
    const merged = buildCoreRoute(mod.default, mod.coreSteps || []);
    const exclude = new Set((mod.uncollectableCores || []).map((c) => c.index));
    steps = [...merged.slice(0, -1), assertCoresStep(exclude), merged[merged.length - 1]];
  }
  const bb = new Driver(page);
  bb.setRoles(roles);
  await startLevel(page, LEVEL_INDEX[id]);
  let failedAt = "";
  // snapshot coresGot progression per step
  const progression = [];
  for (const step of steps) {
    bb.stepDeaths = 0;
    try {
      await Promise.race([step.fn(bb), sleep(180000).then(() => { throw new Error("budget"); })]);
    } catch (e) {
      failedAt = `${step.name}: ${e.message}`;
      break;
    }
    const st = await bb.state().catch(() => null);
    progression.push(`${st?.coresGot?.map((b) => (b ? "1" : "0")).join("")} after "${step.name}"`);
  }
  await bb.releaseAll().catch(() => {});
  for (const c of ["KeyA", "KeyD", "KeyW", "KeyS", "KeyE", "Space", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyL"]) {
    await page.keyboard.up(c).catch(() => {});
  }
  const st = await bb.state().catch(() => null);
  console.log(`\n=== ${id} === complete=${st?.complete} cores=${JSON.stringify(st?.coresGot)}${failedAt ? ` FAILED@ ${failedAt}` : ""}`);
  for (const line of progression) console.log("   " + line);
}
if (errs.length) console.log(`\npage errors: ${errs.length} first=${errs[0]}`);
await browser.close();
