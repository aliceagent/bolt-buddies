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

// --- 100%-core variant (Beat Sprint T3) -------------------------------------
// Cores by ents order: 0=(6,9) start ledge (zip), 1=(39,9) arena-end ledge
// (zip), 2=(43,5) high in the tower shaft. None are on the base path (verified
// by coreprobe). core0/core1 are clean grapple zip-and-drops. core2 is the
// stretch: it sits level with ledge3 (44-46,r6) just past its left lip, so it is
// only reachable by hugging that lip — the detour drops G back to ledge3 after
// the climb, collects, and re-ascends via the same top-floor zip the base uses.
export const coreSteps = [
  {
    after: "equip skills -> gate opens",
    steps: [
      {
        name: "core0: G zips the start ledge for the core (6,9)",
        fn: async (bb) => {
          // anchor (6,6) sits ABOVE its own ledge (5-7,r10); the ledge blocks the
          // sightline from under/right of it, so the only grapple stance is at x3
          // (d≈366, LOS clears the ledge on the left; x3.5+ is blocked — scan-
          // verified). Zip up, drop straight through the core onto the ledge.
          let fired = false;
          for (const tx of [3, 2.9, 3.15, 2.8, 3.3, 3.05]) {
            await bb.walkTo("G", tx, { tol: 4, timeout: 5000 }).catch(() => {});
            await bb.face("G", "right");
            await bb.waitFor((s) => s.players[bb.idx("G")].grounded && !s.players[bb.idx("G")].zip, 1500, "G settled").catch(() => {});
            const tgt = await bb.grappleTarget("G");
            if (tgt && tgt.kind === "anchor") {
              try { await bb.zipTo("G"); fired = true; break; } catch { /* marginal stance — try next */ }
            }
          }
          if (!fired) throw new Error("core0: no LOS stance to anchor (6,6)");
          await bb.zipRelease("G", "jump"); // drop through core (6,9) onto ledge (5-7,r10)
          await bb.waitFor((s) => s.coresGot[0], 3000, "core0 collected");
        },
      },
    ],
  },
  {
    after: "H clears the arena bugs, both cross to the tower base (x43)",
    steps: [
      {
        name: "core1: G zips the arena-end ledge for the core (39,9)",
        fn: async (bb) => {
          // anchor (39,6) sits ABOVE its own ledge (38-40,r10); like the start
          // ledge, the sightline only clears from a stance LEFT of the ledge.
          // Step back through the open (latched) tower door into the arena and
          // find a stance (~x37, facing right) where the anchor is grappleable.
          let fired = false;
          for (const tx of [36, 35.7, 36.3, 35.4, 36.6, 35.9]) {
            await bb.walkTo("G", tx, { tol: 4, timeout: 8000 }).catch(() => {});
            await bb.face("G", "right");
            await bb.waitFor((s) => s.players[bb.idx("G")].grounded && !s.players[bb.idx("G")].zip, 1500, "G settled").catch(() => {});
            const tgt = await bb.grappleTarget("G");
            if (tgt && tgt.kind === "anchor") {
              try { await bb.zipTo("G"); fired = true; break; } catch { /* marginal stance — try next */ }
            }
          }
          if (!fired) throw new Error("core1: no LOS stance to anchor (39,6)");
          await bb.zipRelease("G", "jump"); // drop through core (39,9) onto the ledge
          await bb.waitFor((s) => s.coresGot[1], 3000, "core1 collected");
          // the ledge (38-40,r10) is walled on the RIGHT by the arena/tower
          // divider (col41, solid r0-10), so drop off its LEFT edge back to the
          // arena floor FIRST, then walk right to x43 through the open tower door.
          await bb.walkTo("G", 36, { tol: 10, timeout: 6000 }).catch(() => {});
          await bb.waitFor((s) => s.players[bb.idx("G")].ty > 12, 3000, "G back on the arena floor").catch(() => {});
          await bb.walkTo("G", 43, { tol: 10, timeout: 9000 }).catch(() => {});
        },
      },
    ],
  },
  {
    after: "tower: G zips up the anchors and reels H up ledge by ledge",
    steps: [
      {
        name: "core2: G drops to ledge3's left lip for the core (43,5)",
        fn: async (bb) => {
          const gi = bb.idx("G");
          const kG = bb.keysFor("G");
          // core (43,5) is level with ledge3 (44-46,r6), a hair past its left
          // lip. From the top floor, a gentle step off the left edge drops G onto
          // ledge3 (right lip); hugging the left lip (x44) brings the 42px collect
          // radius over the core. Then re-ascend with the base's top-floor zip.
          let onLedge3 = false;
          for (let att = 0; att < 4 && !onLedge3; att++) {
            const g0 = (await bb.state()).players[gi];
            if (g0.ty > 6.8) {
              // not on the top floor (a prior attempt fell) — cannot re-climb
              // here; bail so the failure is reported precisely.
              break;
            }
            await bb.walkTo("G", 48.2, { tol: 6, timeout: 6000 }).catch(() => {});
            await bb.down(kG.left);
            await bb.page.waitForTimeout(190); // gentle: low speed lands near ledge3's right lip
            await bb.up(kG.left);
            await bb.waitFor((s) => s.players[gi].grounded, 2500, "G settled").catch(() => {});
            const G = (await bb.state()).players[gi];
            if (G.ty > 5.4 && G.ty < 6.8 && G.tx >= 43.5 && G.tx <= 46.6) onLedge3 = true;
          }
          if (!onLedge3) throw new Error("core2: G could not settle on ledge3 (tower geometry)");
          // hug the left lip; nudge left until the core registers
          await bb.walkTo("G", 44, { tol: 4, timeout: 4000 }).catch(() => {});
          for (let i = 0; i < 8 && !(await bb.state()).coresGot[2]; i++) {
            await bb.down(kG.left);
            await bb.page.waitForTimeout(220);
            await bb.up(kG.left);
            await bb.page.waitForTimeout(150);
          }
          await bb.waitFor((s) => s.coresGot[2], 3000, "core2 collected");
          // re-ascend to the top floor: UP+ACTION zip to anchor (47,1), drift right
          await bb.zipTo("G", { up: true });
          await bb.zipRelease("G", "right");
          await bb.waitFor((s) => s.players[gi].ty < 4 && s.players[gi].grounded, 6000, "G back on the top floor").catch(() => {});
        },
      },
    ],
  },
];
