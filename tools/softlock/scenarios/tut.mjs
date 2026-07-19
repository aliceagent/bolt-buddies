// Softlock scenarios — Orientation Day tutorial (registry index 12).
// Candidate: category A — the Station-4 grapple gap is a 4-tile-deep pit floored
// by the WORLD BOTTOM (no hazard, so no death → no respawn escape). Both robots,
// or one, can drop in. The shipped U13/U13b co-op hint teaches the escape: the
// grapple robot zips UP to anchor (36,9), lands on a rim, then reels the buddy
// out (DOWN+ACTION). We DRIVE both variants and confirm the escape actually works.
import { snap, push, sleep, TILE } from "../probe.mjs";

// Equip both, open the gate, and get both to the left rim of the Station-4 pit.
// Stations 1-2 have jump-gaps (x9-11) and a sparky pit (x16-17) that naive walkTo
// falls into — cross them with run-jumps (mirrors tools/tut_sanity.mjs staging).
async function toStation4(bb) {
  for (const role of ["G", "H"]) {
    await bb.runJump(role, 8, "right", { landTile: 12, runup: 2, jumpHold: 310, retries: 4 }).catch(() => {});
    await bb.walkTo(role, 14, { timeout: 14000 });
    await bb.runJump(role, 15, "right", { landTile: 18, jumpHold: 230, runup: 2, retries: 4 });
    await bb.walkTo(role, 20, { timeout: 12000 });
  }
  await bb.equip("G", 23);
  await bb.equip("H", 26);
  await bb.waitFor((s) => s.doors.find((d) => d.id === "gate")?.open, 6000, "gate open");
  // through the open gate (x28) to the Station-4 approach; stop on the left rim (x33)
  await bb.walkTo("H", 32.5, { tol: 12, timeout: 12000 });
  await bb.walkTo("G", 33, { tol: 12, timeout: 12000 });
}

// Drop a role off the left rim (x33) into the pit (x34-38); settle at the bottom.
async function dropIntoPit(bb, role) {
  const i = bb.idx(role);
  await push(bb, role, 36, 3500);
  await bb.waitFor((s) => s.players[i].ty > 15, 4000, `${role} in the pit`).catch(() => {});
}

// The U13 escape: grapple zips UP to anchor (36,9), releases onto a rim, then (if
// the buddy is still in the pit) reels it out. Returns {ok, note}.
async function grappleSelfRescueAndReel(bb, buddyRole) {
  const gi = bb.idx("G");
  const bi = bb.idx(buddyRole);
  // 1) grapple self-zip out of the pit
  const tgtBefore = await bb.grappleTarget("G");
  let zipped = false;
  for (let att = 0; att < 4 && !zipped; att++) {
    try {
      await bb.zipTo("G", { up: true, timeout: 3500 });
      zipped = true;
    } catch { await sleep(300); }
  }
  if (!zipped) return { ok: false, note: `grapple could not zip UP to anchor from the pit (grappleTarget=${JSON.stringify(tgtBefore)})` };
  // release onto the right rim (x39, solid floor) and settle
  await bb.zipRelease("G", "right");
  await sleep(500);
  await bb.walkTo("G", 39, { tol: 12, timeout: 5000 }).catch(() => {});
  const gOut = (await bb.state()).players[gi].ty < 14;
  // 2) reel the buddy out of the pit if it's still down there
  let buddyOut = (await bb.state()).players[bi].ty < 14;
  for (let att = 0; att < 4 && !buddyOut; att++) {
    await bb.walkTo("G", 39, { tol: 10, timeout: 4000 }).catch(() => {});
    await bb.face("G", "left");
    try { await bb.reelPartner("G", { partnerRole: buddyRole }); } catch (e) { console.log("  REEL-ERR:", e.message); }
    await sleep(400);
    buddyOut = (await bb.state()).players[bi].ty < 14;
  }
  return {
    ok: gOut && buddyOut,
    note: `grapple self-zipped out (ty<14=${gOut}); buddy reeled out (ty<14=${buddyOut})`,
  };
}

export default [
  {
    id: "tut-station4-both-in",
    level: "tut",
    category: "A",
    candidate: "Station-4 grapple pit — BOTH robots fall in (safe pit, no death escape)",
    repro: [
      "equip grapple@x23, heavy@x26; gate opens",
      "both walk right off the x33 rim into the 4-tile Station-4 pit (x34-38, floored by the world bottom, no hazard)",
      "neither can die (no '^' floor) and neither can jump 4 tiles out",
    ],
    async run(bb) {
      await toStation4(bb);
      await dropIntoPit(bb, "H");
      await dropIntoPit(bb, "G");
      const stuck = await snap(bb);
      const bothIn = stuck.players.every((p) => p.ty > 15);
      const rec = await grappleSelfRescueAndReel(bb, "H");
      const after = await snap(bb);
      const recoverable = rec.ok || after.players.every((p) => p.ty < 14);
      return {
        classification: recoverable ? "RECOVERABLE" : "HARD SOFTLOCK",
        stuck: { bothInPit: bothIn, players: stuck.players },
        recoveries: [{ name: "U13: grapple zips UP to anchor (36,9), lands on rim, reels buddy out (DOWN+ACTION)", ok: rec.ok, note: rec.note }],
        repro: this.repro,
        verdict: recoverable
          ? "RECOVERABLE — grapple self-zips out of the pit then reels the buddy out; no restart needed."
          : "HARD SOFTLOCK — no hazard to die into and the co-op zip/reel did not free the team.",
        notes: "The safe pit cannot kill (floored by the world bottom, GameScene 3279 only fires below worldH+60). The ONLY escape is the grapple zip-up + reel — role-symmetric because the grapple robot always carries the zip. Both assignments behave the same.",
      };
    },
  },
  {
    id: "tut-station4-heavy-only-in",
    level: "tut",
    category: "A",
    candidate: "Station-4 grapple pit — heavy falls in, grapple free on the rim",
    repro: [
      "equip both; gate opens",
      "heavy walks off the x33 rim into the pit; grapple stays on the rim",
      "heavy cannot climb 4 tiles out alone",
    ],
    async run(bb) {
      await toStation4(bb);
      await dropIntoPit(bb, "H");
      // grapple stays on the left rim, reel the heavy out from there (U13b)
      const hi = bb.idx("H");
      const stuck = await snap(bb);
      const heavyIn = stuck.players[hi].ty > 15;
      let out = false;
      for (let att = 0; att < 5 && !out; att++) {
        await bb.walkTo("G", 33, { tol: 8, timeout: 4000 }).catch(() => {});
        await bb.face("G", "right");
        try { await bb.reelPartner("G", { partnerRole: "H" }); } catch (e) { console.log("  REEL-ERR:", e.message); }
        await sleep(400);
        out = (await bb.state()).players[hi].ty < 14;
      }
      return {
        classification: out ? "RECOVERABLE" : "HARD SOFTLOCK",
        stuck: { heavyInPit: heavyIn, players: stuck.players },
        recoveries: [{ name: "U13b: grapple on the rim reels the stranded buddy out (DOWN+ACTION)", ok: out, note: `heavy out of pit (ty<14)=${out}` }],
        repro: this.repro,
        verdict: out
          ? "RECOVERABLE — grapple on the rim reels the stranded buddy out."
          : "HARD SOFTLOCK — the reel-out did not free the stranded buddy.",
        notes: "Asymmetric case (one in, one free). If the GRAPPLE robot is the one that falls in, the both-in scenario covers it (grapple self-zips). If the HEAVY falls in, the free grapple reels it out — this test.",
      };
    },
  },
];
