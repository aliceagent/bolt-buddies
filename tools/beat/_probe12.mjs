import { chromium } from "playwright";
import { Driver } from "./driver.mjs";
const CHROMIUM = "/opt/pw-browsers/chromium";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ executablePath: CHROMIUM });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (e) => console.log("PAGEERR", e.message));
await page.goto("http://localhost:5173/?canvas=1", { waitUntil: "networkidle" });
await sleep(1500);
const bb = new Driver(page);
bb.setRoles({ G: 0, H: 1 });
async function fresh() {
  await page.evaluate(() => { localStorage.clear(); const m=window.__BB.game.scene; ["UI","Game","Title","Hub"].forEach(k=>m.stop(k)); m.start("Game",{levelIndex:2}); });
  await sleep(1300);
  await page.evaluate(() => { const s=window.__BB.scene; s.players[0].skill="grapple"; s.players[1].skill="heavy"; });
}
async function trial(gx, gy, gface, hx, hy) {
  await page.evaluate(([gx,gy,hx,hy])=>{const s=window.__BB.scene;s.players[0].body.reset(gx*48+24,gy*48);s.players[1].body.reset(hx*48+24,hy*48);},[gx,gy,hx,hy]);
  await sleep(200);
  await page.evaluate((gface)=>{window.__BB.scene.players[0].facing=gface;},gface);
  const tgt = await bb.grappleTarget("G");
  if (!tgt || tgt.kind !== "partner") return `no-partner(${tgt?tgt.kind:"null"})`;
  await bb.reelPartner("G",{partnerRole:"H"});
  await sleep(600);
  const st = await bb.state();
  const h = st.players[1];
  return `H(${h.tx.toFixed(2)},${h.ty.toFixed(2)},gr=${h.grounded})`;
}
await fresh();
console.log("=== Reel A sweep: H from L1 varying x; G on L2 varying x (face left) ===");
for (const hx of [44.5,45.0,45.5]) {
  for (const gx of [50.0,50.15,50.3]) { await fresh(); console.log(` H@${hx} G@${gx}:`, await trial(gx,8.5,-1,hx,11.5)); }
}
console.log("=== Reel B sweep: H from L2; G on L3 (face right) ===");
for (const hx of [50.0,50.5,51.0]) {
  for (const gx of [46.0,46.2,46.4]) { await fresh(); console.log(` H@${hx} G@${gx}:`, await trial(gx,5.5,1,hx,8.5)); }
}
console.log("=== Reel C sweep: H from L3; G on top (face left) ===");
for (const hx of [44.5,45.0,45.5,46.0]) {
  for (const gx of [48.0,48.2]) { await fresh(); console.log(` H@${hx} G@${gx}:`, await trial(gx,2.5,-1,hx,5.5)); }
}
await browser.close();
