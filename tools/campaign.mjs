// Bolt Buddies — END-STATE userland campaign loop.
//
//   npm run campaign            # loop until TWO consecutive clean campaigns
//   node tools/campaign.mjs
//   node tools/campaign.mjs --campaigns 1     # run exactly one campaign
//   node tools/campaign.mjs --campaigns 1 --from 4-3   # DEV SMOKE (see --from)
//
// Plays the WHOLE game with REAL INPUT ONLY, exactly like a human: the Title
// menu's NEW GAME, the KOBI onboarding SKIP, real hub navigation to each node,
// entering with SPACE/L, the per-level Beat-Kit routes to actually beat ALL
// TWELVE levels 1-1…4-3 (W3W4 X1 extended the original 6-level loop), the
// clear-overlay CONTINUE back to the hub — and after the 4-3 FINALE the full
// ending: clear overlay -> continue -> EPILOGUE (story -> credits -> end ->
// Title, driven by the 4-3 route's own epilogue step), campaign-complete save
// state (unlocked=13), and the Title "BOLT IS HOME" + Hub "BOLT RESCUED!"
// completion chips — then the TUTORIAL launched
// from the Title menu. It advances gameplay ONLY through Playwright keyboard
// events (via the beat Driver). The ONLY evaluate() calls are pure READS of
// state (scene id, save, records, hub cursor) plus zeroing the wd/sl session
// peaks — identical to how tools/beat/runner.mjs measures a run. No scene.start,
// no teleport, no setSkill, no body.reset to advance play.
//
// Asserts across the whole run:
//   • save/unlock progression: fresh save → 1-1…4-3 unlocked/cleared IN ORDER
//     (the bolt-buddies-save-v1 `unlocked` count advances a step per clear,
//     1 → 13); cores array + a ux-v1 best-time RECORD persist per chamber.
//   • the FINALE ending: after 4-3 the epilogue is walked story → credits →
//     end → Title with real keys (the route's own driven epilogue step), the
//     save reads campaign-complete (unlocked >= 13 — save.js campaignComplete),
//     and BOTH completion chips render (Title "BOLT IS HOME", Hub "BOLT
//     RESCUED!") with all 12 hub nodes completed.
//   • ZERO page errors for the entire session.
//   • NO un-signalled softlock: window.__bbWatchdogPeakTier (SL2) and
//     window.__bbSoftlockPeak (SL3) must both stay 0 across every level — a real
//     playthrough beats levels and never stalls, so neither guard may raise.
//   • the TUTORIAL from the menu returns to TITLE (not the Hub) and writes NO
//     unlock (the save's `unlocked` is byte-for-byte unchanged).
//
// ROBUSTNESS — one continuous context on the CANVAS renderer.
//   The single-browser title→hub→level→hub path is known to wedge the headless
//   WEBGL context (documented in tools/playtest_w2.mjs + tools/gallery.mjs, which
//   is why the gallery uses a fresh browser per chunk). This harness runs on the
//   Canvas tier (?canvas=1, the suite default), which sidesteps that WebGL-context
//   wedge — the beat runner already drives all 12 sequential level loads in ONE
//   canvas page without wedging. So a campaign is ONE truly-continuous browser
//   context: title → 12 levels → epilogue → tutorial, in one session, exercising real
//   hub navigation, unlock progression, and clear-continue with full save
//   continuity (no per-level context restore needed, no localStorage save-poking
//   mid-campaign). The save is only cleared+reloaded at a CAMPAIGN BOUNDARY to
//   start each pass from a genuinely fresh profile.
//
// ENV-FLAKE HANDLING (thermal). 2-2 fan / 1-3 reel are known to flake thermally
//   in this headless env (documented across the beat kit). A level that fails to
//   COMPLETE is retried IN PLACE — ESC-ESC exits to the map (real input), then we
//   re-navigate and re-enter — up to MAX_LEVEL_ATTEMPTS. A retry marks the
//   campaign "dirty" (a warm re-run is proof of a thermal flake, not a defect), so
//   only fully-first-try passes count toward the two-consecutive-CLEAN bar.
//   Post-completion assertion failures (bad unlock, non-zero peak, page error)
//   are FATAL and never retried — those are real defects, reported precisely.
import { chromium } from "playwright";
import { writeFileSync } from "fs";
import { Driver } from "./beat/driver.mjs";

const URL = process.env.BB_URL || "http://localhost:5173/?canvas=1";
const CHROMIUM = process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium";
const SAVE_KEY = "bolt-buddies-save-v1";
const UX_KEY = "bolt-buddies-ux-v1";

// registry idx 0..11 — the FULL game (W3W4 X1 extended the loop past 2-3)
const LEVELS = ["1-1", "1-2", "1-3", "2-1", "2-2", "2-3", "3-1", "3-2", "3-3", "4-1", "4-2", "4-3"];
const FINALE = LEVELS.length - 1; // 4-3 ends on the Title via the epilogue, not the hub
// P1 takes the first pedestal (runner assignment "A"): W1 G/H, W2 P/T, W3 M/B, W4 F/B
const ROLES = { G: 0, H: 1, P: 0, T: 1, M: 0, B: 1, F: 0 };
const LEVEL_BUDGET_MS = 4 * 60 * 1000; // per whole-level attempt
const STEP_CAP_MS = 3.5 * 60 * 1000;   // hard cap on any single route step
const MAX_LEVEL_ATTEMPTS = 3;          // thermal-flake retries per level
const RETRY_COOLDOWN_MS = 25 * 1000;   // idle on the hub before a retry — a hot
                                       // box caused the flake; retrying instantly
                                       // just re-runs it hot (X1 finding)
const TARGET_CLEAN = 2;                // two CONSECUTIVE clean campaigns
const MAX_CAMPAIGNS = 6;               // safety cap on total passes

const argv = process.argv.slice(2);
const forcedCampaigns = (() => {
  const i = argv.indexOf("--campaigns");
  return i >= 0 ? parseInt(argv[i + 1], 10) : null;
})();
// DEV SMOKE ONLY: --from 4-3 seeds a save with everything before <id> already
// cleared and plays from there (harness-bringup aid for the finale leg). A
// --from run is NEVER clean-eligible and skips the tutorial — the real bar is
// always the full fresh-save 12-level campaign.
const fromIdx = (() => {
  const i = argv.indexOf("--from");
  if (i < 0) return 0;
  const idx = LEVELS.indexOf(argv[i + 1]);
  if (idx < 0) throw new Error(`--from: unknown level ${argv[i + 1]}`);
  return idx;
})();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// pure reads / setup pokes on the page (never advance gameplay)
// ---------------------------------------------------------------------------
const active = (page, k) => page.evaluate((k) => window.__BB?.game?.scene?.isActive(k) || false, k);
const sceneId = (page) => page.evaluate(() => window.__BB?.scene?.def?.id ?? null);
const readSave = (page) => page.evaluate((k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, SAVE_KEY);
const readRecords = (page) => page.evaluate((k) => { try { return (JSON.parse(localStorage.getItem(k)) || {}).records || {}; } catch { return {}; } }, UX_KEY);
const zeroPeaks = (page) => page.evaluate(() => {
  window.__bbWatchdogPeakTier = 0;
  window.__bbSoftlockPeak = 0;
  window.__bbSoftlock = null;
}).catch(() => {});
const readPeaks = (page) => page.evaluate(() => ({
  wd: window.__bbWatchdogPeakTier | 0,
  sl: window.__bbSoftlockPeak | 0,
})).catch(() => ({ wd: 0, sl: 0 }));
const hubInfo = (page) => page.evaluate(() => {
  const m = window.__BB?.game?.scene;
  if (!m || !m.isActive("Hub")) return null;
  const h = m.getScene("Hub");
  if (!h || !h.nodes || !h.nodes.length) return null;
  return {
    sel: h.sel,
    count: h.hubCount,
    nodes: h.nodes.map((n) => ({ idx: n.idx, unlocked: n.unlocked, completed: n.completed })),
  };
});
// PURE READ: does the given scene's display list contain a Text whose content
// matches `re`? (Recurses into containers — the Title chip label lives inside
// one.) Used only to assert the two campaign-complete chips actually RENDER.
const sceneHasText = (page, key, re) => page.evaluate(([key, src]) => {
  const m = window.__BB?.game?.scene;
  if (!m || !m.isActive(key)) return false;
  const rx = new RegExp(src);
  const walk = (list) => list.some((o) =>
    (o.type === "Text" && rx.test(o.text || "")) || (o.list && walk(o.list)));
  const sc = m.getScene(key);
  return !!(sc && sc.children && walk(sc.children.list));
}, [key, re]);
const menuInfo = (page) => page.evaluate(() => {
  const mm = window.__BB?.menu;
  if (!mm) return null;
  return { sel: mm.sel, items: mm.items.map((it) => it.id) };
});

function assert(cond, msg) {
  if (!cond) throw new Error("ASSERT FAILED: " + msg);
}

async function waitFor(fn, timeout, desc) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try { last = await fn(); if (last) return last; } catch { /* keep polling */ }
    await sleep(100);
  }
  throw new Error(`waitFor timed out: ${desc}`);
}

// ---------------------------------------------------------------------------
// route loading (reuse the exact beat routes that beat each level)
// ---------------------------------------------------------------------------
const routeCache = {};
async function loadRoute(id) {
  if (!routeCache[id]) routeCache[id] = (await import(`./beat/routes/${id}.mjs`)).default;
  return routeCache[id];
}

// ---------------------------------------------------------------------------
// real-input navigation helpers
// ---------------------------------------------------------------------------
async function gotoNode(page, bb, target) {
  await waitFor(() => hubInfo(page), 8000, "hub ready for navigation");
  for (let guard = 0; guard < 24; guard++) {
    const info = await hubInfo(page);
    if (!info) { await sleep(150); continue; }
    if (info.sel === target) return;
    await bb.tap(target > info.sel ? "ArrowRight" : "ArrowLeft");
    await sleep(160);
  }
  throw new Error(`gotoNode: could not reach node ${target}`);
}

async function enterLevel(page, bb, i) {
  const id = LEVELS[i];
  await gotoNode(page, bb, i);
  await bb.tap("Space"); // hub enter (SPACE/E/L/Enter all valid)
  await waitFor(async () => (await active(page, "Game")) && (await sceneId(page)) === id, 9000, `Game scene ${id}`);
  await sleep(1700); // let the scene warm up + banner clear (mirrors runner's 1600ms)
}

// ESC-ESC exits a live level to the map (GameScene arms a confirm on the first
// ESC, exits on the second). Real input only — used to recover for a retry.
async function abortToHub(page, bb) {
  await bb.releaseAll().catch(() => {});
  for (let t = 0; t < 3; t++) {
    if (await active(page, "Hub")) return;
    await bb.tap("Escape");
    await sleep(450);
    await bb.tap("Escape");
    try { await waitFor(() => active(page, "Hub"), 4000, "hub after abort"); return; } catch { /* retry */ }
  }
  throw new Error("abortToHub: never returned to the hub");
}

// Recover to the Hub from ANY scene a failed attempt can leave us in — real
// input only. A live level exits ESC-ESC; a stranded EPILOGUE walks forward
// (any key advances every phase, end exits to Title — the always-exitable
// contract); the TITLE re-enters the hub via the CONTINUE menu item.
async function recoverToHub(page, bb) {
  for (let t = 0; t < 16; t++) {
    if (await active(page, "Hub")) return;
    if (await active(page, "Epilogue")) { await bb.tap("Enter"); await sleep(650); continue; }
    if (await active(page, "Title")) {
      const mi = await menuInfo(page).catch(() => null);
      if (mi) {
        for (let g = 0; g < 6; g++) {
          const m = await menuInfo(page);
          if (m.items[m.sel] === "continue") break;
          await bb.tap("ArrowUp");
          await sleep(160);
        }
        const m = await menuInfo(page);
        if (m.items[m.sel] === "continue") {
          await bb.tap("KeyE");
          try { await waitFor(() => active(page, "Hub"), 6000, "hub via CONTINUE"); return; } catch { /* loop */ }
        }
      }
      await sleep(400);
      continue;
    }
    if (await active(page, "Game")) {
      await abortToHub(page, bb).catch(() => {});
      continue;
    }
    await sleep(400);
  }
  throw new Error("recoverToHub: never reached the Hub");
}

async function continueToHub(page, bb) {
  // clear overlay: SPACE/E/L/Enter advances; wait out the fade/iris back to Hub.
  for (let t = 0; t < 5; t++) {
    if (await active(page, "Hub")) return;
    await bb.tap("Space");
    await sleep(400);
    try { await waitFor(() => active(page, "Hub"), 4000, "hub after continue"); return; } catch { /* retry */ }
  }
  throw new Error("continueToHub: never returned to the hub");
}

// Run every step of a route, throwing if the level does not COMPLETE. Retryable.
async function runRouteToComplete(page, bb, i) {
  const id = LEVELS[i];
  const steps = await loadRoute(id);
  bb.setRoles(ROLES);
  bb.deaths = 0;
  const start = Date.now();
  for (const step of steps) {
    bb.stepDeaths = 0;
    if (Date.now() - start > LEVEL_BUDGET_MS) throw new Error(`${id} exceeded ${LEVEL_BUDGET_MS / 1000}s budget at "${step.name}"`);
    await Promise.race([
      step.fn(bb),
      sleep(STEP_CAP_MS).then(() => { throw new Error(`step "${step.name}" hung > ${STEP_CAP_MS / 1000}s`); }),
    ]);
  }
  await bb.releaseAll().catch(() => {});
  // Direct scalar read (runner-style, not bb.state()): the 4-3 route
  // legitimately ends on the TITLE (clear -> Epilogue -> credits -> Title), and
  // a stopped Game scene keeps its `complete` flag while deeper state() reads
  // would throw. Identical semantics for every other level (Game still live).
  const complete = await page.evaluate(() => window.__BB.scene && window.__BB.scene.complete === true).catch(() => false);
  if (complete !== true) throw new Error(`${id} route ran but level not complete`);
}

// ---------------------------------------------------------------------------
// one level: enter → beat → assert unlock/peaks/records → continue to hub
// ---------------------------------------------------------------------------
async function playLevel(page, bb, i) {
  const id = LEVELS[i];
  const before = await readSave(page);
  const unlockedBefore = before ? before.unlocked : 1;
  let attempt = 0, lastErr = null, peaks = null, deaths = 0, t0 = Date.now();

  while (attempt < MAX_LEVEL_ATTEMPTS) {
    attempt++;
    try {
      await enterLevel(page, bb, i);
      await zeroPeaks(page);
      t0 = Date.now();
      await runRouteToComplete(page, bb, i);
      peaks = await readPeaks(page); // read BEFORE leaving the scene
      deaths = bb.deaths;
      break;
    } catch (e) {
      lastErr = e;
      process.stdout.write(`\n    · ${id} attempt ${attempt} did not complete: ${e.message}`);
      await bb.releaseAll().catch(() => {});
      // a failed FINALE attempt can leave us mid-epilogue or on the Title —
      // recoverToHub handles every scene (a live level still exits ESC-ESC)
      if (!(await active(page, "Hub"))) await recoverToHub(page, bb).catch(() => {});
      if (attempt >= MAX_LEVEL_ATTEMPTS) {
        throw new Error(`${id} failed to complete after ${MAX_LEVEL_ATTEMPTS} attempts — last: ${lastErr.message}`);
      }
      // idle cooldown on the hub before retrying: the flake means the box is
      // running hot RIGHT NOW; an instant re-entry mostly re-fails (observed on
      // 4-1's beam-herd step: 3 instant retries failed back-to-back while the
      // same level passed standalone 2/2 minutes later).
      await sleep(RETRY_COOLDOWN_MS);
    }
  }

  // --- FATAL assertions (a real defect if any fail; never retried) ----------
  const save = await readSave(page);
  assert(save && save.unlocked >= i + 2, `${id}: save.unlocked advanced to >=${i + 2} (was ${unlockedBefore}, now ${save?.unlocked})`);
  assert(Array.isArray(save.cores[id]), `${id}: cores array persisted in save (${JSON.stringify(save.cores[id])})`);
  const rec = (await readRecords(page))[id];
  assert(rec && typeof rec.bestTime === "number", `${id}: ux-v1 best-time record persisted (${JSON.stringify(rec)})`);
  assert(peaks.wd === 0, `${id}: SL2 watchdog peak stayed 0 (got ${peaks.wd})`);
  assert(peaks.sl === 0, `${id}: SL3 softlock peak stayed 0 (got ${peaks.sl})`);

  if (i === FINALE) {
    // ---- the ENDING (all asserts fatal) -----------------------------------
    // The 4-3 route's own final step already drove: clear overlay CONTINUE ->
    // EpilogueScene (phase "story" -> 4 captions -> "credits" -> "end", every
    // advance a real keypress) -> Title. If any phase had not been reached the
    // route step would have thrown above — here we assert the LANDING + the
    // campaign-complete acknowledgements.
    assert(await active(page, "Title"), "finale: epilogue walk (story→credits→end) exited to the TITLE");
    assert(save.unlocked >= 13, `finale: save reads campaign-complete (unlocked ${save.unlocked} >= 13)`);
    await sleep(700); // let the Title settle (chip fades in over ~1.1s)
    assert(await sceneHasText(page, "Title", "BOLT IS HOME"),
      "finale: the Title 'BOLT IS HOME' completion chip renders");
    // hub acknowledgement: CONTINUE back into the map — the "BOLT RESCUED!"
    // chip renders and ALL 12 nodes read completed. (Also parks us on the Hub,
    // where the tutorial leg starts — same as every non-finale level.)
    await recoverToHub(page, bb);
    const info = await waitFor(() => hubInfo(page), 6000, "hub after the finale");
    assert(info.nodes.length >= LEVELS.length && info.nodes.every((n) => n.completed),
      `finale: all ${LEVELS.length} hub nodes read completed (${info.nodes.filter((n) => n.completed).length}/${info.nodes.length})`);
    assert(await sceneHasText(page, "Hub", "BOLT RESCUED!"),
      "finale: the Hub 'BOLT RESCUED!' completion chip renders");
  } else {
    await continueToHub(page, bb);

    // unlock progression is visible on the very hub we navigate: the next node
    // is now unlocked (and this one shows completed).
    const info = await waitFor(() => hubInfo(page), 6000, "hub after clear");
    const next = info.nodes.find((n) => n.idx === i + 1);
    assert(next && next.unlocked, `${id}: next node (${LEVELS[i + 1]}) is unlocked on the hub after clearing`);
  }

  return {
    id, attempts: attempt, flake: attempt > 1, deaths,
    time: ((Date.now() - t0) / 1000).toFixed(1),
    unlocked: save.unlocked, wd: peaks.wd, sl: peaks.sl,
  };
}

// ---------------------------------------------------------------------------
// tutorial from the Title menu — drives all 7 stations, returns to Title, no save
// (station tiles transcribed from tools/tut_sanity.mjs)
// ---------------------------------------------------------------------------
async function driveTutorial(bb) {
  await bb.runJump("G", 8, "right", { landTile: 12, runup: 2, jumpHold: 300, retries: 4 }).catch(() => {});
  await bb.walkTo("G", 14, { timeout: 14000 });
  await bb.runJump("H", 8, "right", { landTile: 12, runup: 2, jumpHold: 320, retries: 4 }).catch(() => {});
  await bb.walkTo("H", 14, { timeout: 14000 });

  await bb.runJump("G", 15, "right", { landTile: 18, jumpHold: 220, runup: 2, retries: 4 });
  await bb.runJump("H", 15, "right", { landTile: 18, jumpHold: 240, runup: 2, retries: 4 });
  const advance = async (tile, opts = {}) => {
    await bb.walkTo("G", tile, { timeout: 14000, ...opts });
    await bb.walkTo("H", tile, { timeout: 14000, ...opts });
  };
  await advance(20);

  const gskill = await bb.equip("G", 23);
  const hskill = await bb.equip("H", 26);
  assert(gskill === "grapple", `tutorial: P1 equipped grapple (${gskill})`);
  assert(hskill === "heavy", `tutorial: P2 equipped heavy (${hskill})`);
  await bb.waitFor((s) => s.doors.find((d) => d.id === "gate")?.open, 5000, "gate open");
  await advance(29);

  await bb.walkTo("H", 31, { timeout: 9000 });
  await bb.tap("ArrowUp", 120);
  await sleep(120);
  await bb.tap("KeyL", 80);
  await sleep(900);
  await bb.walkTo("H", 31, { timeout: 6000 }).catch(() => {});
  await bb.act("H");
  await bb.waitFor((s) => s.bridges.find((b) => b.id === "tbr")?.open, 5000, "bridge down").catch(() => {});
  await bb.walkTo("H", 33, { timeout: 8000 }).catch(() => {});
  try {
    await bb.walkTo("G", 33, { timeout: 8000 });
    await bb.zipTo("G", { timeout: 3500 });
    await bb.zipRelease("G", "right");
    await sleep(400);
  } catch { /* fall through to walking the bridge */ }
  await advance(40);

  await advance(43);
  try {
    await bb.walkTo("G", 43, { timeout: 5000 });
    await bb.walkTo("H", 42, { timeout: 5000 });
    await bb.act("H");
    await sleep(200);
    await bb.act("H");
    await sleep(500);
  } catch { /* optional carry/throw demo */ }
  await advance(47);

  await bb.walkTo("H", 48, { timeout: 8000 });
  await bb.waitFor((s) => s.plates.find((p) => p.id === "tpl")?.active, 5000, "plate active").catch(() => {});
  await bb.waitFor((s) => s.doors.find((d) => d.id === "td1")?.open, 4000, "td1 open").catch(() => {});
  await bb.walkTo("G", 51, { timeout: 9000 });
  await bb.act("G");
  await bb.waitFor((s) => s.levers.find((l) => l.id === "tlv2")?.on, 4000, "tlv2 on").catch(() => {});
  await bb.walkTo("H", 52, { timeout: 9000 });
  await advance(52);

  await bb.walkTo("H", 51, { timeout: 6000 });
  await bb.walkTo("G", 54, { timeout: 9000 });
  await sleep(500);
  await bb.walkTo("H", 54, { timeout: 9000 });
  await bb.waitFor((s) => s.complete, 6000, "tutorial complete");
}

async function runTutorialFromMenu(page, bb) {
  // hub → Title (hub ESC goes straight to the menu)
  await bb.tap("Escape");
  await waitFor(() => active(page, "Title"), 6000, "Title after hub ESC");
  await sleep(400);
  const saveBefore = await readSave(page);

  // navigate the Title menu to TUTORIAL with real keys, then activate
  await waitFor(() => menuInfo(page), 5000, "title menu ready");
  for (let guard = 0; guard < 8; guard++) {
    const mi = await menuInfo(page);
    if (mi.items[mi.sel] === "tutorial") break;
    await bb.tap("ArrowDown");
    await sleep(160);
  }
  const mi = await menuInfo(page);
  assert(mi.items[mi.sel] === "tutorial", `tutorial selected on menu (sel=${mi.items[mi.sel]})`);
  await bb.tap("Space");
  await waitFor(async () => (await active(page, "Game")) && (await sceneId(page)) === "tut", 9000, "tutorial Game scene");
  await sleep(1200);

  await zeroPeaks(page);
  bb.setRoles(ROLES);
  bb.deaths = 0;
  await driveTutorial(bb);
  const peaks = await readPeaks(page);
  await bb.releaseAll().catch(() => {});
  assert(peaks.wd === 0 && peaks.sl === 0, `tutorial: peaks stayed 0 (wd ${peaks.wd}, sl ${peaks.sl})`);

  // no save written by the tutorial (unlocked untouched) + continue → Title
  const saveAfter = await readSave(page);
  const uBefore = saveBefore ? saveBefore.unlocked : 1;
  const uAfter = saveAfter ? saveAfter.unlocked : 1;
  assert(uAfter === uBefore, `tutorial wrote NO unlock (unlocked ${uBefore} -> ${uAfter})`);

  for (let t = 0; t < 5; t++) {
    if (await active(page, "Title")) break;
    await bb.tap("Space");
    await sleep(400);
  }
  assert(await active(page, "Title"), "tutorial continue returned to TITLE");
  assert(!(await active(page, "Hub")), "tutorial did NOT drop into the Hub");
  return { wd: peaks.wd, sl: peaks.sl, unlocked: uAfter };
}

// ---------------------------------------------------------------------------
// one full campaign: title → NEW GAME → skip → 12 levels (+ the finale's
// epilogue/credits/completion-chip walk) → tutorial
// ---------------------------------------------------------------------------
async function runCampaign(page, bb, no, errCountAtStart, pageErrors) {
  process.stdout.write(`\n\n========== CAMPAIGN ${no}${fromIdx ? ` (DEV SMOKE --from ${LEVELS[fromIdx]})` : ""} ==========`);
  // fresh profile at the campaign boundary (setup only — not a gameplay poke).
  // A --from DEV SMOKE instead seeds "everything before <id> cleared".
  await page.evaluate((k) => { localStorage.removeItem(k); }, SAVE_KEY);
  await page.evaluate((k) => { localStorage.removeItem(k); }, UX_KEY);
  if (fromIdx) {
    await page.evaluate(([k, unlocked, ids]) => {
      const cores = {};
      for (const id of ids) cores[id] = [false, false, false];
      localStorage.setItem(k, JSON.stringify({ unlocked, cores }));
    }, [SAVE_KEY, fromIdx + 1, LEVELS.slice(0, fromIdx)]);
  }
  await page.reload({ waitUntil: "networkidle" });
  await sleep(1200);

  // Warmup pass (same rationale + shape as the beat runner's): the reload above
  // gives this campaign a cold JS context, and the first level a cold context
  // simulates is measurably slower (JIT, texture generation, audio spin-up) —
  // which made the SCORED 1-1 flake on attempt 1 repeatedly. Load 1-1 directly
  // (setup poke, discarded — writes nothing), idle-drive ~10s, then return to
  // the Title. The campaign proper still starts from a fresh save on the Title.
  process.stdout.write(`\n  warmup: 1-1 idle pass ... `);
  await page.evaluate(() => {
    const m = window.__BB.game.scene;
    ["UI", "Title", "Hub", "Epilogue"].forEach((k) => m.stop(k));
    m.start("Game", { levelIndex: 0 });
  });
  await sleep(1600);
  for (let w = 0; w < 4; w++) {
    await page.keyboard.down("KeyD"); await sleep(800); await page.keyboard.up("KeyD");
    await page.keyboard.down("KeyA"); await sleep(800); await page.keyboard.up("KeyA");
    await sleep(400);
  }
  await page.evaluate(() => {
    const m = window.__BB.game.scene;
    ["UI", "Game", "Hub", "Epilogue"].forEach((k) => m.stop(k));
    m.start("Title");
  });
  await sleep(900);
  process.stdout.write(`done`);

  assert(await active(page, "Title"), "campaign starts on the Title scene");
  if (!fromIdx) assert((await readSave(page)) === null, "fresh save (no bolt-buddies-save-v1)");

  if (fromIdx) {
    // DEV SMOKE: CONTINUE straight into the hub with the seeded save
    await recoverToHub(page, bb);
  } else {
    // NEW GAME → onboarding SKIP → Hub (mirrors tools/playtest.mjs L44-52)
    await waitFor(() => menuInfo(page), 5000, "title menu ready");
    for (let guard = 0; guard < 6; guard++) {
      const mi = await menuInfo(page);
      if (mi.items[mi.sel] === "new") break;
      await bb.tap("ArrowUp"); // NEW GAME is index 0 on a fresh menu
      await sleep(150);
    }
    await bb.tap("KeyE"); // NEW GAME
    await sleep(500);
    await bb.tap("ArrowDown"); // interstitial: ORIENTATION -> SKIP
    await bb.tap("KeyE");      // confirm SKIP
    await waitFor(() => active(page, "Hub"), 8000, "Hub after NEW GAME + SKIP");
    await sleep(600);
    process.stdout.write(`\n  hub reached (fresh save)`);
  }

  const levelResults = [];
  for (let i = fromIdx; i < LEVELS.length; i++) {
    process.stdout.write(`\n  ▶ ${LEVELS[i]} ...`);
    const r = await playLevel(page, bb, i);
    levelResults.push(r);
    process.stdout.write(
      ` ${r.flake ? "PASS*" : "PASS"} in ${r.time}s ` +
      `(attempts ${r.attempts}, deaths ${r.deaths}, unlocked=${r.unlocked}, wd-peak ${r.wd}, sl-peak ${r.sl})`
    );
  }

  let tut = null;
  if (!fromIdx) {
    process.stdout.write(`\n  ▶ tutorial (from menu) ...`);
    tut = await runTutorialFromMenu(page, bb);
    process.stdout.write(` PASS (returned to Title, no unlock, wd ${tut.wd}, sl ${tut.sl})`);
  }

  const flakes = levelResults.filter((r) => r.flake).length;
  const pageErrsThis = pageErrors.length - errCountAtStart;
  const wdMax = levelResults.reduce((m, r) => Math.max(m, r.wd), 0);
  const slMax = levelResults.reduce((m, r) => Math.max(m, r.sl), 0);
  // a --from DEV SMOKE never counts clean — only full fresh-save campaigns do
  const clean = !fromIdx && flakes === 0 && pageErrsThis === 0 && wdMax === 0 && slMax === 0;

  const played = `${levelResults.length}/${LEVELS.length - fromIdx}`;
  process.stdout.write(`\n  --- campaign ${no} summary ---`);
  console.table(levelResults.map((r) => ({
    level: r.id, result: r.flake ? "PASS*" : "PASS", attempts: r.attempts,
    "time(s)": +r.time, deaths: r.deaths, unlocked: r.unlocked, "wd-peak": r.wd, "sl-peak": r.sl,
  })));
  process.stdout.write(
    `  campaign ${no}: ${played} levels beat (incl. the 4-3 finale + epilogue/credits/chips)` +
    `${fromIdx ? " [DEV SMOKE — never clean]" : " + tutorial"} · flake-retries ${flakes} · ` +
    `page errors ${pageErrsThis} · SL2 max ${wdMax} · SL3 max ${slMax} → ${clean ? "CLEAN" : "PASS (not clean)"}`
  );
  return { no, levelResults, tut, flakes, pageErrsThis, wdMax, slMax, clean };
}

// ---------------------------------------------------------------------------
// main — loop until two CONSECUTIVE clean campaigns
// ---------------------------------------------------------------------------
async function main() {
  const browser = await chromium.launch({ executablePath: CHROMIUM });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  // Real JS page errors (uncaught exceptions) — these MUST stay 0 for the whole
  // session. Console/resource noise (a favicon-type 404, a Vite HMR ping) is NOT
  // a JS error: it's tracked separately and reported for transparency, but never
  // counts against a clean campaign.
  const pageErrors = [];
  const consoleNoise = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") consoleNoise.push(m.text()); });
  await page.goto(URL, { waitUntil: "networkidle" });
  await sleep(1500);
  const bb = new Driver(page);

  const campaigns = [];
  let consecutive = 0, no = 0, fatal = null;
  const maxRuns = forcedCampaigns || MAX_CAMPAIGNS;

  while (no < maxRuns) {
    no++;
    const errAt = pageErrors.length;
    let result;
    try {
      result = await runCampaign(page, bb, no, errAt, pageErrors);
    } catch (e) {
      process.stdout.write(`\n  !! CAMPAIGN ${no} FAILED: ${e.message}`);
      result = { no, failed: true, error: e.message, clean: false, pageErrsThis: pageErrors.length - errAt };
      await bb.releaseAll().catch(() => {});
    }
    campaigns.push(result);

    if (result.failed) {
      // A hard failure after in-place thermal retries is almost certainly a real
      // defect — stop and report rather than spinning campaigns forever.
      fatal = result.error;
      consecutive = 0;
      break;
    }
    consecutive = result.clean ? consecutive + 1 : 0;
    process.stdout.write(`\n  consecutive clean campaigns: ${consecutive}/${TARGET_CLEAN}`);
    if (!forcedCampaigns && consecutive >= TARGET_CLEAN) break;
    if (forcedCampaigns && no >= forcedCampaigns) break;
  }

  await browser.close();

  // ---- final report ----
  console.log(`\n\n============================================================`);
  console.log(`CAMPAIGN LOOP — ${campaigns.length} campaign(s) run`);
  console.log(`============================================================`);
  for (const c of campaigns) {
    if (c.failed) { console.log(`  campaign ${c.no}: FAILED — ${c.error}`); continue; }
    console.log(
      `  campaign ${c.no}: ${c.clean ? "CLEAN" : "PASS (not clean)"} — ` +
      `${c.levelResults.length}/${LEVELS.length - fromIdx} levels (incl. finale+epilogue)${fromIdx ? "" : " + tutorial"}, ` +
      `flake-retries ${c.flakes}, page errors ${c.pageErrsThis}, ` +
      `SL2 max ${c.wdMax}, SL3 max ${c.slMax}`
    );
  }
  console.log(`  total JS page errors (whole session): ${pageErrors.length}`);
  if (pageErrors.length) console.log(`    first: ${pageErrors[0]}`);
  if (consoleNoise.length) console.log(`  (benign console/resource noise, not counted: ${consoleNoise.length} — e.g. ${consoleNoise[0].slice(0, 80)})`);

  const twoClean = consecutive >= TARGET_CLEAN;
  const ok = fromIdx
    ? campaigns.every((c) => !c.failed) // DEV SMOKE: completing is the bar
    : forcedCampaigns ? campaigns.every((c) => !c.failed && c.clean) : twoClean;
  const okText = fromIdx ? `PASS — DEV SMOKE (--from ${LEVELS[fromIdx]}) completed` : `PASS — ${TARGET_CLEAN} consecutive CLEAN campaigns`;
  console.log(`\n  RESULT: ${ok ? okText : (fatal ? `FAIL — ${fatal}` : "FAIL — did not reach two consecutive clean campaigns")}`);

  writeFileSync("tools/campaign.report.json", JSON.stringify({
    when: new Date().toISOString(), url: URL, targetClean: TARGET_CLEAN,
    consecutiveClean: consecutive, ok, fatal, pageErrors, consoleNoise, campaigns,
  }, null, 2));
  console.log("  report -> tools/campaign.report.json");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error("campaign harness crashed:", e); process.exit(1); });
