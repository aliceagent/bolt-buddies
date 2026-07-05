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
      // Each rung retries as a unit: if the reel doesn't land, re-establish the
      // stance (re-zipping only if G isn't already up on the rung's ledge) and
      // reel again, instead of failing on the follow-up waitFor.
      const rung = async (name, { zip, stance, upTy }) => {
        for (let att = 0; att < 3; att++) {
          const st = await bb.state();
          const H = st.players[hi];
          const G = st.players[bb.idx("G")];
          if (H.ty < upTy && H.grounded) return; // buddy already up
          if (!(G.ty < upTy)) {
            await zip(); // G not on this rung's ledge yet — zip up
            await bb.page.waitForTimeout(600);
          }
          await bb.walkTo("G", stance, { tol: 8, timeout: 4000 }).catch(() => {});
          try {
            await bb.reelPartner("G", { partnerRole: "H" });
          } catch (e) {
            if (att === 2) throw e;
            bb.log(`${name}: ${e.message}; retrying the rung`);
            continue;
          }
          const ok = await bb.waitFor((s) => s.players[hi].ty < upTy && s.players[hi].grounded, 5000, name)
            .then(() => true).catch(() => false);
          if (ok) return;
          if (att === 2) throw new Error(`waitFor timed out: ${name}`);
          bb.log(`${name}: reel didn't land; retrying the rung`);
        }
      };
      // ledge1 -> ledge2: G zips anchor(51,7), drops to ledge2, reels H up
      await rung("H up to ledge2", {
        zip: async () => { await bb.face("G", "right"); await bb.zipTo("G"); await bb.zipRelease("G", "jump"); },
        stance: 50.3, upTy: 10,
      });
      // ledge2 -> ledge3 (leftward zip: face left so the hook goes left);
      // stance 46.3 stays ON ledge3 (it ends at x46)
      await rung("H up to ledge3", {
        zip: async () => { await bb.face("G", "left"); await bb.zipTo("G"); await bb.zipRelease("G", "jump"); },
        stance: 46.3, upTy: 7,
      });
      // Park H mid-ledge before the last reel: the reel-forgiveness pop leaves H
      // on ledge3's right lip (tx ~46.8), and from there the rope from the top
      // floor clips the slab's corner tile (48,3) — mid-ledge clears it easily.
      await bb.walkTo("H", 44.6, { tol: 10, timeout: 4000 }).catch(() => {});
      // ledge3 -> top floor: anchor (47,1) hangs beside the floor's left edge
      // (FL-004) — UP+ACTION zips to it deterministically; release rightward
      // to drift onto the slab. Stance 48.0 (center x2328), NOT 48.3: walkTo
      // targets tile-center +24px and rests up to ~8px past it, and from
      // x>~2345 even the head-to-head LOS line clips slab tile (48,3).
      await rung("H up to top floor", {
        zip: async () => { await bb.zipTo("G", { up: true }); await bb.zipRelease("G", "right"); },
        stance: 48.0, upTy: 4,
      });
    },
  },
  {
    name: "both reach the exit -> complete",
    fn: async (bb) => {
      // 53.5, not 54 — tile 54 is the exit zone's exact right boundary and
      // rectangle-contains excludes the edge
      await bb.walkTo("H", 53.5, { tol: 10, timeout: 6000 });
      await bb.walkTo("G", 53.5, { tol: 10, timeout: 6000 });
      await bb.waitFor((s) => s.complete, 6000, "level complete");
    },
  },
];
