// Automated playtest: drives both robots through the World 1 mechanics in
// headless Chromium and screenshots each stage. Run `npm run dev` first
// (or set BB_URL). Screenshots land in tools/shots/.
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const URL = process.env.BB_URL || "http://localhost:5173/?canvas=1";
const SHOTS = process.env.BB_SHOTS || "tools/shots";
mkdirSync(SHOTS, { recursive: true });

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

// use the environment's preinstalled Chromium if the pinned browser is absent
const browser = await chromium.launch({
  executablePath: process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium",
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
page.on("console", (m) => {
  if (m.type() === "error") console.log("CONSOLE ERROR:", m.text());
});
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png` });
const scene = (fn, ...args) => page.evaluate(fn, ...args);
const active = (key) => scene((k) => window.__BB.game.scene.isActive(k), key);
const hold = async (key, ms) => {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
};
// Phaser's Key.onUp clears the JustDown flag, so an instant down+up between
// two frames is invisible to the game — tap with a human-scale hold instead.
const tap = (key) => hold(key, 70);

// --- title & hub ------------------------------------------------------------
await shot("01-title");
check("title scene active", await active("Title"));
await tap("KeyE");
await page.waitForTimeout(500);
await shot("02-hub");
check("hub scene active", await active("Hub"));
await tap("KeyL");
await page.waitForTimeout(800);
check("game scene active (1-1)", await active("Game"));
check("UI scene active", await active("UI"));
await page.waitForTimeout(1500); // let the headless renderer warm up to full fps
await shot("03-level1-start");

// helpers operating on the live GameScene
const st = () => scene(() => {
  const s = window.__BB.scene;
  return {
    id: s.def.id,
    p: s.players.map((p) => ({
      x: Math.round(p.x), y: Math.round(p.y), skill: p.skill, dead: p.dead,
      zip: !!p.zip, carrying: !!p.carrying, grounded: p.grounded,
    })),
    keysHeld: s.keysHeld,
    cores: s.coresGot,
    crackies: s.crackies.countActive(true),
    bugs: s.bugs.countActive(true),
    complete: s.complete,
    doors: s.doors.map((d) => ({ id: d.id, open: d.open })),
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
const giveSkill = (i, sk) => scene(([i, sk]) => window.__BB.scene.players[i].setSkill(sk), [i, sk]);

// --- movement ---------------------------------------------------------------
let s0 = await st();
await hold("KeyD", 500);
let s1 = await st();
check("P1 moves right", s1.p[0].x > s0.p[0].x + 40, `${s0.p[0].x} -> ${s1.p[0].x}`);
await hold("ArrowRight", 500);
let s2 = await st();
check("P2 moves right", s2.p[1].x > s1.p[1].x + 40, `${s1.p[1].x} -> ${s2.p[1].x}`);

// jump
const beforeJump = (await st()).p[0].y;
await page.keyboard.down("KeyW");
await page.waitForTimeout(250);
const midJump = (await st()).p[0].y;
await page.keyboard.up("KeyW");
check("P1 jumps", midJump < beforeJump - 40, `${beforeJump} -> ${midJump}`);
await page.waitForTimeout(600);

// --- pedestals ----------------------------------------------------------------
await tp(0, 5, 12);
await page.waitForTimeout(150);
await tap("KeyE");
await page.waitForTimeout(150);
check("P1 equips grapple at pedestal", (await st()).p[0].skill === "grapple");
await tp(1, 8, 12);
await page.waitForTimeout(150);
await tap("KeyL");
await page.waitForTimeout(150);
check("P2 equips heavy at pedestal", (await st()).p[1].skill === "heavy");
check("skills gate opened", (await st()).doors.find((d) => d.id === "gate").open === true);
await shot("04-skills-equipped");

// --- grapple zip across the belt gap -------------------------------------------
await tp(0, 13, 12);
await page.waitForTimeout(300);
await tap("KeyE"); // zip to anchor (17,9)
await page.waitForTimeout(700);
const zipState = await st();
check("grapple zip lifted P1 over the gap", zipState.p[0].y < 12 * 48 && zipState.p[0].x > 15 * 48, `x=${zipState.p[0].x} y=${zipState.p[0].y}`);
await shot("05-zip-hang");
await hold("KeyD", 500); // release right, land on far side
await page.waitForTimeout(700);
const landed = await st();
check("P1 landed on far side", landed.p[0].x > 19 * 48 && landed.p[0].grounded, `x=${landed.p[0].x}`);

// --- lever -> bridge ------------------------------------------------------------
await tp(0, 21, 13);
await page.waitForTimeout(200);
await tap("KeyE");
await page.waitForTimeout(400);
const bridgeOpen = await scene(() => window.__BB.scene.bridges[0].open);
check("lever lowers the bridge", bridgeOpen === true);
// heavy walks across the bridge
await tp(1, 13, 12);
await page.waitForTimeout(200);
await hold("ArrowRight", 1600);
await page.waitForTimeout(400);
check("heavy crossed the bridge", (await st()).p[1].x > 19 * 48, `x=${(await st()).p[1].x}`);
await shot("06-bridge-crossed");

// --- heavy stomp: cracked floor + key -------------------------------------------
const cracksBefore = (await st()).crackies;
await tp(1, 31, 12);
await page.waitForTimeout(250);
await tap("ArrowUp");
await page.waitForTimeout(200);
await tap("KeyL"); // stomp mid-air
await page.waitForTimeout(900);
const afterStomp = await st();
check("stomp broke cracked tiles", afterStomp.crackies < cracksBefore, `${cracksBefore} -> ${afterStomp.crackies}`);
await shot("07-stomp");
// grab the key below
await tp(1, 33, 15);
await page.waitForTimeout(300);
check("key collected in chamber", (await st()).keysHeld >= 1);

// --- key door --------------------------------------------------------------------
await tp(1, 37, 13);
await tp(0, 36, 13);
await page.waitForTimeout(600);
const doorState = await st();
check("key door consumed key and opened", doorState.doors.find((d) => d.id === "door1")?.open === true && doorState.keysHeld === 0, `keysHeld=${doorState.keysHeld} ${JSON.stringify(doorState.doors)}`);

// --- bug bounce vs squish -------------------------------------------------------
const bugsBefore = (await st()).bugs;
const bugX = await scene(() => {
  const b = window.__BB.scene.bugs.getFirstAlive();
  return b ? Math.round(b.x / 48) : null;
});
await tp(1, bugX, 11); // drop heavy right onto the bug
await page.waitForTimeout(150);
await tap("KeyL");
await page.waitForTimeout(900);
check("heavy squished a scuttlebug", (await st()).bugs < bugsBefore, `${bugsBefore} -> ${(await st()).bugs}`);

// --- hazard death & respawn ------------------------------------------------------
const cpBefore = await scene(() => window.__BB.scene.cpPos[0]);
await tp(0, 16, 16); // electric pit
let died = false;
for (let i = 0; i < 6 && !died; i++) {
  await page.waitForTimeout(250);
  died = (await st()).p[0].dead;
}
check("hazard kills P1", died);
await page.waitForTimeout(1400);
const resp = await st();
check("P1 respawned at checkpoint", !resp.p[0].dead && Math.abs(resp.p[0].x - cpBefore.x) < 60, `x=${resp.p[0].x} cp=${cpBefore.x}`);
await shot("08-respawn");

// --- carry & throw ----------------------------------------------------------------
await tp(0, 40, 13);
await tp(1, 41, 13);
await page.waitForTimeout(250);
await tap("KeyL"); // heavy picks up grapple-buddy
await page.waitForTimeout(200);
check("heavy picked up partner", (await st()).p[1].carrying === true);
await tap("KeyL"); // throw
await page.waitForTimeout(600);
const thrown = await st();
check("partner thrown forward", thrown.p[1].carrying === false && Math.abs(thrown.p[0].x - thrown.p[1].x) > 60, JSON.stringify(thrown.p));
await shot("09-throw");

// --- co-op lift --------------------------------------------------------------------
await tp(0, 47, 13);
await tp(1, 48, 13);
await page.waitForTimeout(2500); // both aboard: lift should rise
const liftDbg = await scene(() => {
  const s = window.__BB.scene;
  const lf = s.lifts[0];
  return {
    liftY: Math.round(lf.img.y), hold: Math.round(lf.holdTimer), top: lf.img.body.top,
    p: s.players.map((p) => ({ x: Math.round(p.x), bottom: Math.round(p.body.bottom), grounded: p.grounded, carried: !!p.carriedBy, w: p.weight })),
  };
});
check("lift rises with both aboard", liftDbg.liftY < 13 * 48, JSON.stringify(liftDbg));
await shot("10-lift");

// --- partner reel ------------------------------------------------------------------
await tp(0, 44, 13);
await tp(1, 40, 13);
await page.waitForTimeout(250);
await tap("KeyA"); // FL-001: aim at the buddy first — the rope goes where you point
await tap("KeyE"); // grounded grapple reels heavy in
await page.waitForTimeout(900);
const reeled = await st();
check("grapple reels heavy to them", Math.abs(reeled.p[0].x - reeled.p[1].x) < 90, JSON.stringify(reeled.p));

// --- data core pickup ----------------------------------------------------------------
const coresBefore = (await st()).cores.filter(Boolean).length;
await tp(0, 28, 15);
await page.waitForTimeout(300);
check("data core collected", (await st()).cores.filter(Boolean).length > coresBefore);

// --- exit: both through ----------------------------------------------------------------
await tp(0, 58, 8);
await page.waitForTimeout(400);
check("exit waits for buddy", (await st()).complete === false);
await tp(1, 58, 8);
await page.waitForTimeout(600);
check("level completes when both exit", (await st()).complete === true);
await shot("11-clear");

// save written?
const save = await scene(() => JSON.parse(localStorage.getItem("bolt-buddies-save-v1")));
check("save unlocks 1-2", save && save.unlocked >= 2, JSON.stringify(save));

// continue to hub
await tap("KeyE");
await page.waitForTimeout(600);
check("back at hub", await active("Hub"));
await shot("12-hub-after");

// --- level 1-2 spot checks ---------------------------------------------------------------
await tap("KeyE"); // selected node should be 1-2
await page.waitForTimeout(800);
check("1-2 loads", (await st()).id === "1-2");
await shot("13-level2");
await scene(() => {
  const s = window.__BB.scene;
  s.players[0].setSkill("grapple");
  s.players[1].setSkill("heavy");
});
// crusher kills grapple robot (wait a full crusher cycle)
await scene(() => window.__BB.scene.players[0].__wasSquished = false);
await tp(0, 13, 12);
let squished = false;
for (let i = 0; i < 10 && !squished; i++) {
  await page.waitForTimeout(500);
  squished = (await st()).p[0].dead;
}
check("crusher flattens non-heavy", squished);
await page.waitForTimeout(1200);
// crusher spares heavy
await tp(1, 13, 12);
await page.waitForTimeout(4500);
check("crusher spares heavy", (await st()).p[1].dead === false);
await shot("14-crushers");
// plate opens barrier while held
await tp(1, 15, 12);
await page.waitForTimeout(500);
check("heavy on plate opens barrier b1", (await st()).doors.find((d) => d.id === "b1")?.open === true, JSON.stringify((await st()).doors));
await tp(1, 24, 12);
await page.waitForTimeout(700);
check("barrier closes when heavy leaves", (await st()).doors.find((d) => d.id === "b1")?.open === false);

// --- level 1-3 spot checks ----------------------------------------------------------------
await scene(() => {
  const m = window.__BB.game.scene;
  m.stop("UI");
  m.stop("Game");
  m.start("Game", { levelIndex: 2 });
});
await page.waitForTimeout(1200);
check("1-3 loads", (await st()).id === "1-3");
await scene(() => {
  const s = window.__BB.scene;
  s.players[0].setSkill("grapple");
  s.players[1].setSkill("heavy");
});
await shot("15-level3");
// force crane into rest and yank all plates + stomp pods; the live crane keeps
// slamming (and killing testers) between steps, so wait out respawns each round
for (let i = 0; i < 3; i++) {
  await page.waitForTimeout(1100); // let any pending respawn land
  await scene(() => {
    const s = window.__BB.scene;
    s.crane.state = "rest";
    s.crane.timer = 6000;
    s.crane.body.y = 10 * 48;
    window.__trace = [];
    if (!s.__wrapped) {
      s.__wrapped = true;
      const orig = s.handleAction.bind(s);
      s.handleAction = (p) => {
        const t = p.skill === "grapple" ? s.findGrappleTarget(p) : null;
        window.__trace.push({ idx: p.idx, target: t && t.kind });
        return orig(p);
      };
    }
  });
  await tp(1, 30, 13); // park heavy out of grapple range
  await tp(0, Math.round(await scene(() => window.__BB.scene.crane.body.x / 48)), 13);
  await page.waitForTimeout(250);
  await tap("KeyE"); // yank plate
  await page.waitForTimeout(400);
  const podX = await scene(() => {
    const pods = window.__BB.scene.pods.filter((p) => p.active);
    return pods.length ? pods[pods.length - 1].x : null;
  });
  if (podX === null) {
    check(`plate ${i + 1} yanked -> pod spawned`, false, "trace=" + JSON.stringify(await scene(() => window.__trace)));
    continue;
  }
  check(`plate ${i + 1} yanked -> pod spawned`, true);
  await tp(1, Math.round(podX / 48), 11);
  await page.waitForTimeout(150);
  await tap("KeyL"); // stomp pod
  await page.waitForTimeout(800);
}
const craneState = await scene(() => ({ dead: window.__BB.scene.craneDefeated, pods: window.__BB.scene.crane.podsStomped }));
check("crane defeated after 3 pods", craneState.dead === true, JSON.stringify(craneState));
check("tower door opened", (await st()).doors.find((d) => d.id === "towerDoor").open === true);
await shot("16-crane-down");

// tower: airborne zip-to-partner (heavy as anchor) quick check
await page.waitForTimeout(1100); // let any pending respawn land
await tp(1, 45, 11); // heavy on tower ledge 1
await tp(0, 43, 13);
await page.waitForTimeout(250);
await page.keyboard.down("KeyW");
await page.waitForTimeout(120);
await page.keyboard.up("KeyW");
await tap("KeyE"); // airborne: zip toward heavy
await page.waitForTimeout(700);
const zipUp = await st();
check("airborne grapple zips to heavy partner", zipUp.p[0].y < 13 * 48 - 20, `y=${zipUp.p[0].y}`);

// finish 1-3 via exit teleport
await tp(0, 54, 1);
await tp(1, 54, 1);
await page.waitForTimeout(700);
check("1-3 completes", (await st()).complete === true);
await shot("17-level3-clear");

const fails = results.filter((r) => !r.ok);
console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
await browser.close();
process.exit(fails.length ? 1 : 0);
