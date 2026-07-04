// 1-3 "Crane Chaos" — role-parametric walkthrough.
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
    name: "enter the crane arena",
    fn: async (bb) => {
      await bb.walkTo("G", 12, { timeout: 8000 });
      await bb.walkTo("H", 11, { timeout: 8000 });
    },
  },
  {
    name: "defeat the crane (yank plates + stomp pods x3)",
    fn: async (bb) => {
      await bb.fightCrane({ maxCycles: 8, timeout: 150000 });
      await bb.waitFor((s) => s.doors.find((d) => d.id === "towerDoor")?.open, 5000, "tower door open");
    },
  },
  {
    name: "H clears the arena bugs, both cross to the tower base (x43)",
    fn: async (bb) => {
      // Two scuttlebug patrols (15-25, 26-36) block Grapple's walk to the tower.
      await bb.stompBugs("H", 2, { timeout: 30000 });
      await bb.walkTo("H", 43, { timeout: 12000 });
      await bb.walkTo("G", 43, { timeout: 12000 });
    },
  },
  {
    name: "tower: G zips up the anchors and reels H up ledge by ledge",
    fn: async (bb) => {
      const hi = bb.idx("H");
      // both hop onto ledge1 (44-46,r12) — run-up must START well left of the
      // ledge at x44, or the pre-jump run carries the robot under the lip
      await bb.mountLedge("G", 41.7, "right", { stayTile: 45, ledgeTy: 12.6 });
      await bb.mountLedge("H", 41.7, "right", { stayTile: 45, ledgeTy: 12.6, runupMs: 300 });
      // Reels are fired from each ledge's NEAR edge — from mid-ledge the rope
      // clips the ledge's own lip and drops the buddy (see FL-002 kit notes).
      // ledge1 -> ledge2: G zips anchor(51,7), drops to ledge2, reels H up
      await bb.face("G", "right");
      await bb.zipTo("G");
      await bb.zipRelease("G", "jump");
      await bb.page.waitForTimeout(600);
      await bb.walkTo("G", 50.3, { tol: 8, timeout: 4000 });
      await bb.reelPartner("G", { partnerRole: "H" });
      await bb.waitFor((s) => s.players[hi].ty < 10 && s.players[hi].grounded, 5000, "H up to ledge2");
      // ledge2 -> ledge3 (leftward zip: face left so the hook goes left)
      await bb.face("G", "left");
      await bb.zipTo("G");
      await bb.zipRelease("G", "jump");
      await bb.page.waitForTimeout(600);
      await bb.walkTo("G", 46.3, { tol: 8, timeout: 4000 }); // stay ON ledge3 (ends at x46)
      await bb.reelPartner("G", { partnerRole: "H" });
      await bb.waitFor((s) => s.players[hi].ty < 7 && s.players[hi].grounded, 5000, "H up to ledge3");
      // ledge3 -> top floor: anchor (47,1) hangs beside the floor's left edge
      // (FL-004) — release rightward to drift onto the slab
      await bb.face("G", "right");
      await bb.zipTo("G");
      await bb.zipRelease("G", "right");
      await bb.page.waitForTimeout(600);
      await bb.walkTo("G", 48.3, { tol: 8, timeout: 4000 });
      await bb.reelPartner("G", { partnerRole: "H" });
      await bb.waitFor((s) => s.players[hi].ty < 4 && s.players[hi].grounded, 5000, "H up to top floor");
    },
  },
  {
    name: "both reach the exit -> complete",
    fn: async (bb) => {
      await bb.walkTo("H", 54, { timeout: 6000 });
      await bb.walkTo("G", 54, { timeout: 6000 });
      await bb.waitFor((s) => s.complete, 5000, "level complete");
    },
  },
];
