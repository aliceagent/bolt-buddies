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
      // both hop onto ledge1 (44-46,r12)
      await bb.mountLedge("G", 43, "right", { stayTile: 45, ledgeTy: 12.6 });
      await bb.mountLedge("H", 43, "right", { stayTile: 45, ledgeTy: 12.6 });
      // ledge1 -> ledge2: G zips anchor(51,7), drops to ledge2, reels H up
      await bb.zipTo("G");
      await bb.zipRelease("G", "jump");
      await bb.page.waitForTimeout(600);
      await bb.reelPartner("G", { partnerRole: "H" });
      await bb.waitFor((s) => s.players[hi].ty < 10, 4000, "H up to ledge2");
      // ledge2 -> ledge3
      await bb.zipTo("G");
      await bb.zipRelease("G", "jump");
      await bb.page.waitForTimeout(600);
      await bb.reelPartner("G", { partnerRole: "H" });
      await bb.waitFor((s) => s.players[hi].ty < 7, 4000, "H up to ledge3");
      // ledge3 -> top floor
      await bb.zipTo("G");
      await bb.zipRelease("G", "jump");
      await bb.page.waitForTimeout(600);
      await bb.reelPartner("G", { partnerRole: "H" });
      await bb.waitFor((s) => s.players[hi].ty < 4, 4000, "H up to top floor");
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
