// 2-3 "The Warden's Maze" — role-parametric walkthrough.
// Roles: P = phase, T = tiny. Transcribed from TESTKIT_ROADMAP.md.
// Mirrored lanes with timed cross-doors (6.5s windows); Phase ambushes wardens
// through shimmer panels; finale carry-throws Tiny across the electric gap.
export default [
  {
    name: "equip skills -> gate opens",
    fn: async (bb) => {
      await bb.equip("P", 3);
      await bb.equip("T", 6);
      await bb.waitFor((s) => s.doors.find((d) => d.id === "gate")?.open, 5000, "gate open");
    },
  },
  {
    name: "P ambushes w1 through panel x20, stages at lvB1; T stages at tDoorA",
    fn: async (bb) => {
      // T first: stairs x9/x10 to the slab top, then wait just short of tDoorA
      // (x26). The lane rollers ignore Tiny.
      await bb.walkTo("T", 24.7, { tol: 8, timeout: 18000 });
      // P: tunnel; walking through the x20 panel touches w1's back -> defeated
      await bb.walkTo("P", 22, { tol: 10, timeout: 14000 });
      await bb.waitFor((s) => s.wardens.find((w) => w.id === "w1")?.defeated, 4000, "w1 ambushed");
      await bb.walkTo("P", 24, { tol: 8, timeout: 5000 }); // lvB1
    },
  },
  {
    name: "timed relay: lvB1 -> T through tDoorA; lvA1 -> P through tDoorB",
    fn: async (bb) => {
      // window 1: P pulls lvB1 (6.5s), T dashes through tDoorA (x26) + pinch x30
      await bb.act("P");
      await bb.waitFor((s) => s.doors.find((d) => d.id === "tDoorA")?.open, 3000, "tDoorA open");
      await bb.walkTo("T", 32, { tol: 8, timeout: 6000 });
      await bb.act("T"); // lvA1 at (32,8)
      // window 2: P dashes through tDoorB (x34)
      await bb.waitFor((s) => s.doors.find((d) => d.id === "tDoorB")?.open, 3000, "tDoorB open");
      await bb.walkTo("P", 35.5, { tol: 8, timeout: 6000 });
    },
  },
  {
    name: "P ambushes w2, exits the tunnel; T runs out the slab; meet at x47",
    fn: async (bb) => {
      // panel x37 -> w2's back
      await bb.walkTo("P", 39, { tol: 10, timeout: 8000 });
      await bb.waitFor((s) => s.wardens.find((w) => w.id === "w2")?.defeated, 4000, "w2 ambushed");
      // through the x43/x45 shimmer pocket, out of the tunnel
      await bb.walkTo("P", 47, { tol: 10, timeout: 12000 });
      // T: pinch x40, slab end (x45), drop to the ground, join at the checkpoint
      await bb.walkTo("T", 47.5, { tol: 10, timeout: 14000 });
      await bb.waitFor((s) => s.players[bb.idx("T")].grounded && s.players[bb.idx("T")].ty > 12, 6000, "T down at the checkpoint");
    },
  },
  {
    name: "finale: carry through panel x49 (w3 ambush), throw T across the gap",
    fn: async (bb) => {
      const pi = bb.idx("P");
      const ti = bb.idx("T");
      // pick T up: stand snug, act (no lever/anchor nearby, falls through to pickup)
      let picked = false;
      for (let i = 0; i < 10 && !picked; i++) {
        const T = await bb.player("T");
        await bb.walkTo("P", T.tx - 0.7, { tol: 7, timeout: 3000 }).catch(() => {});
        const P = await bb.player("P");
        if (Math.abs(P.x - T.x) < 54) {
          await bb.act("P");
          await bb.page.waitForTimeout(200);
          picked = (await bb.state()).players[pi].carrying;
        } else {
          await bb.page.waitForTimeout(120);
        }
      }
      await bb.waitFor((s) => s.players[pi].carrying, 3000, "P carrying T");
      // carried buddies pass shimmer with the carrier; w3 (x50, faces right)
      // is defeated by the back-bump as P emerges from panel x49
      await bb.walkTo("P", 50.6, { tol: 8, timeout: 8000 });
      await bb.waitFor((s) => s.wardens.find((w) => w.id === "w3")?.defeated, 5000, "w3 ambushed");
      // throw from x51: T flies the electric gap (52-58) and lands ~x60
      await bb.walkTo("P", 51, { tol: 7, timeout: 4000 });
      await bb.face("P", "right");
      await bb.act("P"); // throw!
      await bb.waitFor((s) => s.players[ti].tx > 58.5 && s.players[ti].grounded && !s.players[ti].dead, 6000, "T across the gap");
    },
  },
  {
    name: "T lowers bridge br1; P crosses; both finish",
    fn: async (bb) => {
      await bb.walkTo("T", 61, { tol: 8, timeout: 6000 });
      await bb.act("T"); // lvF
      await bb.waitFor((s) => s.bridges.find((b) => b.id === "br1")?.open, 4000, "bridge br1 down");
      await bb.walkTo("P", 62, { tol: 8, timeout: 9000 });
      await bb.walkTo("T", 62.4, { tol: 8, timeout: 5000 });
      await bb.waitFor((s) => s.complete, 5000, "level complete");
    },
  },
];
