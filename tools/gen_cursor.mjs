// Throwaway build-time script: draws the themed cursor ONCE to a canvas and dumps
// its data-URI so it can be hard-coded into src/ui/cursor.js (no runtime work).
// Run: node tools/gen_cursor.mjs   (requires the dev server + playwright)
import { chromium } from "playwright";
const browser = await chromium.launch({
  executablePath: process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium",
});
const page = await browser.newPage();
const uri = await page.evaluate(() => {
  const S = 22; // 22x22 — well under the 24px cap
  const c = document.createElement("canvas");
  c.width = S; c.height = S;
  const x = c.getContext("2d");
  // Rounded teal arrow pointer with a dark outline (Lumen palette).
  // Hotspot is the tip near (4,2) — matches setDefaultCursor('url(...) 4 2').
  const pts = [
    [4, 2], [4, 18], [8.5, 14], [11.5, 20.5], [14.5, 19], [11.5, 13], [17, 13],
  ];
  const path = () => {
    x.beginPath();
    x.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) x.lineTo(pts[i][0], pts[i][1]);
    x.closePath();
  };
  // dark rounded outline
  x.lineJoin = "round"; x.lineCap = "round";
  x.strokeStyle = "#08101c"; x.lineWidth = 3.4;
  path(); x.stroke();
  // teal fill
  const g = x.createLinearGradient(2, 2, 18, 20);
  g.addColorStop(0, "#5cf6ff");
  g.addColorStop(1, "#22c7d8");
  x.fillStyle = g;
  path(); x.fill();
  // thin bright inner rim + a soft highlight dab near the tip
  x.strokeStyle = "#d8fbff"; x.lineWidth = 0.9;
  path(); x.stroke();
  x.fillStyle = "rgba(255,255,255,0.55)";
  x.beginPath(); x.ellipse(6, 6, 1.3, 2.1, Math.PI / 4, 0, Math.PI * 2); x.fill();
  return c.toDataURL("image/png");
});
console.log(uri);
console.error("length:", uri.length);
await browser.close();
