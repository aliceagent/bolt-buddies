// 1-2 "The Crusher Line" — role-parametric walkthrough.
// Roles: G = grapple, H = heavy. Transcribed from TESTKIT_ROADMAP.md.
export default [
  {
    name: "equip skills -> gate opens",
    fn: async (bb) => {
      await bb.equip("G", 3);
      await bb.equip("H", 6);
      await bb.waitFor((s) => s.doors.find((d) => d.id === "gate")?.open, 5000, "gate open");
    },
  },
  {
    name: "H holds plate plA -> barrier b1 opens",
    fn: async (bb) => {
      // Heavy is immune to the crushers; it parks on the plate (tiles 15-16) to
      // hold the sky-route barrier b1 open while G crosses above. The step ledge
      // (8-9,r12) is too tall to walk under, so H run-up jumps over it first.
      await bb.mountLedge("H", 5, "right");
      await bb.walkTo("H", 15, { tol: 22, timeout: 9000 });
      await bb.waitFor((s) => s.plates.find((p) => p.id === "plA")?.active, 4000, "plate plA active");
      await bb.waitFor((s) => s.doors.find((d) => d.id === "b1")?.open, 4000, "b1 open");
    },
  },
  {
    name: "G takes the sky route over the crushers",
    fn: async (bb) => {
      // G run-up jumps onto the step ledge (8-9,r12) and settles there, in range
      // of anchor (9,5).
      await bb.mountLedge("G", 6, "right", { stayTile: 8, runupMs: 110 });
      await bb.zipTo("G"); // zip to anchor (9,5)
      await bb.zipRelease("G", "right"); // release onto the slab top ~x10
      await bb.walkTo("G", 24, { timeout: 10000 }); // along the slab, through open b1
    },
  },
  {
    name: "H clears the scuttlebug yard",
    fn: async (bb) => {
      // H leaves the plate (b1 closes; G is already past) and walks the tunnel —
      // immune to crushers — into the yard, then stomps all 4 bugs.
      await bb.walkTo("H", 26, { timeout: 14000 });
      await bb.stompBugs("H", 4, { timeout: 50000 });
    },
  },
  {
    name: "both gather at the chasm edge (x40)",
    fn: async (bb) => {
      // G drops off the slab end (past the last crusher) down to the yard floor and
      // walks to the chasm edge; H joins from the yard.
      await bb.walkTo("G", 40, { tol: 16, timeout: 14000 });
      await bb.walkTo("H", 40, { tol: 22, timeout: 10000 });
    },
  },
  {
    name: "chasm relay: G crosses on the anchors, reels H over the pillar",
    fn: async (bb) => {
      // NOTE (documented blocker): the roadmap crosses H with a partner-reel from
      // the pillar/right floor. In the current GameScene, grapple targeting favors
      // anchors (bias -60, plus -50 when above), so anywhere near the chasm G's
      // action zips to an anchor instead of reeling H — verified by an exhaustive
      // scan and a live act test. Heavy cannot jump the 5/4-tile gaps, and pickup
      // (for a carry/throw) is likewise pre-empted by the same anchors. The chasm
      // is therefore uncrossable for Heavy input-only. The transcribed sequence is
      // below; it reaches the pillar and then cannot move H across (fails here).
      const hi = bb.idx("H");
      await bb.walkTo("G", 40, { tol: 12, timeout: 6000 });
      await bb.zipTo("G"); // zip anchor (43,8)
      await bb.act("G"); // zip anchor (46,8)
      await bb.waitFor((s) => s.players[bb.idx("G")].zip && s.players[bb.idx("G")].zip.arrived, 3000, "zip2").catch(() => {});
      await bb.zipRelease("G", "jump"); // drop onto the pillar (46-47,r11)
      await bb.page.waitForTimeout(600);
      // reel H across (blocked by anchor targeting)
      await bb.reelPartner("G", { partnerRole: "H" });
      await bb.waitFor((s) => s.players[hi].tx > 45, 4000, "H reeled onto the pillar");
    },
  },
  {
    name: "lever lv2 + plate pl2 open door d2; both exit",
    fn: async (bb) => {
      await bb.walkTo("G", 52, { tol: 14, timeout: 8000 });
      await bb.walkTo("G", 55, { timeout: 6000 });
      await bb.act("G"); // lever lv2
      await bb.walkTo("H", 57, { tol: 22, timeout: 10000 }); // plate pl2
      await bb.waitFor((s) => s.doors.find((d) => d.id === "d2")?.open, 4000, "door d2 open");
      await bb.walkTo("H", 62, { timeout: 8000 });
      await bb.walkTo("G", 62, { timeout: 8000 });
      await bb.waitFor((s) => s.complete, 5000, "level complete");
    },
  },
];
