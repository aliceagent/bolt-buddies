// 1-1 "First Day on the Job" — role-parametric walkthrough.
// Roles: G = grapple, H = heavy. Transcribed from TESTKIT_ROADMAP.md.
//
// DEVIATION (documented): the roadmap's step 6 says "both walkTo 40" after H
// exits the key pocket. But breaking the cracked lid (30-33) to reach the key
// severs the mid-floor into a 4-tile chasm, and the pocket can only be exited to
// the LEFT (its right side has a solid ceiling). Heavy cannot jump a 4-tile gap,
// so H is stranded on the left. The physically-correct crossing: G runJumps the
// chasm (grapple's ~4.6-tile jump clears it) and then REELS H across (the reel
// primitive the roadmap lists). Everything else follows the written route.
export default [
  {
    name: "equip skills -> gate opens",
    fn: async (bb) => {
      await bb.equip("G", 5);
      await bb.equip("H", 8);
      await bb.waitFor((s) => s.doors.find((d) => d.id === "gate")?.open, 5000, "gate open");
    },
  },
  {
    name: "G zips the belt gap, pulls lever lv1 -> bridge",
    fn: async (bb) => {
      await bb.walkTo("G", 13, { timeout: 6000 });
      await bb.zipTo("G"); // zip to anchor (17,9)
      await bb.zipRelease("G", "right"); // release right, land ~x20
      await bb.walkTo("G", 21, { timeout: 6000 });
      await bb.act("G"); // pull lever lv1 (adjacent)
      await bb.waitFor((s) => s.bridges.find((b) => b.id === "br1")?.open, 4000, "bridge br1 open");
    },
  },
  {
    name: "H crosses the bridge into the yard",
    fn: async (bb) => {
      await bb.walkTo("H", 23, { timeout: 9000 });
    },
  },
  {
    name: "H stomps the two bug patrols (clears the way for G)",
    fn: async (bb) => {
      // Stomp from fixed safe anchors (tiles 25 and 37) well clear of the cracked
      // lid (30-33): pouncing straight up keeps the blast off the lid, so it stays
      // intact until H deliberately breaks it (otherwise H is stranded behind the
      // chasm). Anchor 25 clears patrol 1 (24-29), anchor 37 clears patrol 2 (34-37).
      await bb.stompBugs("H", 2, { timeout: 40000, anchors: [25, 37] });
    },
  },
  {
    name: "H breaks the cracked lid, grabs the key, climbs out to tile 29",
    fn: async (bb) => {
      const hi = bb.idx("H");
      const kH = bb.keysFor("H");
      // stomp the lid at its centre (tile 31) so all of 30-33 break -> a clean,
      // deterministic 4-tile chasm, and H drops into the key pocket.
      await bb.walkTo("H", 31, { tol: 12, timeout: 6000 });
      let p = (await bb.state()).players[hi];
      if (p.ty < 14.3) {
        await bb.tap(kH.jump, 120);
        await bb.page.waitForTimeout(140);
        await bb.tap(kH.act, 80); // mid-air stomp
        await bb.page.waitForTimeout(1000);
      }
      // collect the key inside the pocket
      await bb.walkTo("H", 33, { tol: 22, timeout: 6000 }).catch(() => {});
      await bb.waitFor((s) => s.keysHeld >= 1, 4000, "key collected");
      // climb out to the LEFT: centre on the step (tile 30), jump straight up
      // through the open lid to clear row 14, then drift left onto tile 29. (The
      // pocket's right side has a solid ceiling, so left is the only exit.)
      let escaped = false;
      for (let i = 0; i < 12 && !escaped; i++) {
        const b = (await bb.state()).players[hi];
        if (b.y < 14 * 48 - 8 && b.tx < 30) { escaped = true; break; }
        await bb.walkTo("H", 30, { tol: 6, timeout: 3000 }).catch(() => {});
        await bb.tap(kH.jump, 175);
        const t0 = Date.now();
        while (Date.now() - t0 < 800) {
          if ((await bb.state()).players[hi].y < 14 * 48 - 26) { await bb.down(kH.left); break; }
          await bb.page.waitForTimeout(15);
        }
        await bb.page.waitForTimeout(300);
        await bb.up(kH.left);
        const a = (await bb.state()).players[hi];
        if (a.y < 14 * 48 - 8 && a.tx < 30) escaped = true;
      }
      if (!escaped) throw new Error("H failed to climb out of the key pocket");
    },
  },
  {
    name: "G jumps the chasm; then reels H across the open gap",
    fn: async (bb) => {
      const hi = bb.idx("H");
      // G walks to the chasm edge and jumps the 4-tile gap onto tile 34.
      await bb.walkTo("G", 29, { tol: 14, timeout: 9000 });
      await bb.runJump("G", 29, "right", { landTile: 34, retries: 5, runup: 3 });
      // Both are now at row-14 level either side of the open gap (LOS is clear), so
      // grounded G reels the stranded H across.
      await bb.walkTo("G", 35, { tol: 16, timeout: 5000 });
      for (let i = 0; i < 5; i++) {
        const st = await bb.state();
        if (st.players[hi].tx > 32.5 && st.players[hi].y < 14 * 48) break;
        await bb.reelPartner("G", { partnerRole: "H" });
        await bb.page.waitForTimeout(300);
      }
      await bb.waitFor((s) => s.players[hi].tx > 32.5 && s.players[hi].y < 14 * 48, 4000,
        "H reeled onto the right side");
    },
  },
  {
    name: "both approach door1 (key opens it)",
    fn: async (bb) => {
      await bb.walkTo("H", 40, { timeout: 9000 });
      await bb.walkTo("G", 40, { timeout: 9000 });
      await bb.waitFor((s) => s.doors.find((d) => d.id === "door1")?.open, 4000, "door1 open");
    },
  },
  {
    name: "ride the co-op lift; G carries H across to the terrace",
    fn: async (bb) => {
      const gi = bb.idx("G");
      const hi = bb.idx("H");
      // Both aboard (weight 3 = Heavy 2 + Grapple 1) raises the lift.
      await bb.walkTo("H", 49, { timeout: 8000 });
      await bb.walkTo("G", 48, { timeout: 8000 });
      await bb.waitFor((s) => s.lifts[0].y <= s.lifts[0].topY + 40, 9000, "lift near top");
      // DEVIATION: heavy can't reliably clear the lift->terrace gap solo (its jump
      // arc is a hair short off the 4-tile lift runway). Instead G picks H up and
      // jumps across carrying it — grapple's stronger jump clears the gap, and
      // carrying heavy keeps the lift at weight 3 so it never sinks. G must stand
      // at tile 48 to pick up: from there the anchor at (51,4) is LOS-blocked by
      // the core ledge (50-51,r7), so `act` falls through to the partner pickup.
      let picked = false;
      for (let i = 0; i < 12 && !picked; i++) {
        const H = await bb.player("H");
        // Snug G up against H (just left of it): at dx<50 the partner is too close
        // to be a grapple target and the anchor is LOS-blocked, so act picks up.
        await bb.walkTo("G", H.tx - 0.7 - (i % 2) * 0.2, { tol: 7, timeout: 2500 }).catch(() => {});
        const tgt = await bb.grappleTarget("G"); // must be null, else act would grapple
        const G = await bb.player("G");
        const dx = Math.abs((await bb.player("H")).x - G.x);
        if (!tgt && dx < 54) {
          await bb.act("G"); // pick up H
          await bb.page.waitForTimeout(200);
          picked = (await bb.state()).players[gi].carrying;
        } else {
          await bb.page.waitForTimeout(100);
        }
      }
      await bb.waitFor((s) => s.players[gi].carrying, 3000, "G carrying H");
      // cold-fps misses drop the pair into the x50-51 landing pit. U4 (F8) added a
      // 2-tile step at x51 against the terrace wall, so the PRIMARY recovery is now
      // to escape FORWARD — walk right and let walkTo's auto-hop take the two
      // 2-tile risers (pit floor r14 -> step r12 -> terrace r10). Carrying keeps the
      // lift at weight 3, so the old lift re-ride still works and is kept as the
      // FALLBACK. retries:1 on the jump — runJump's in-place walk-back assumes the
      // runway is still underfoot, but a short landing drops G a level below it, so
      // in-place retries jump into the strip wall; fail fast into the recovery.
      let across = false;
      for (let cycle = 0; cycle < 3 && !across; cycle++) {
        try {
          await bb.runJump("G", 49, "right", { landTile: 52, retries: 1, runup: 3, jumpHold: 500, edgeX: 2384 });
          across = true;
        } catch (e) {
          const G = await bb.player("G");
          if (G.ty > 12 && G.tx > 45.5 && G.tx < 52.5) {
            // PRIMARY (U4): climb the step forward onto the terrace. Retry the walk
            // a few times — a narrow-step auto-hop can slip on the first try.
            bb.log("terrace jump missed -> in the pit; climbing the x51 step forward onto the terrace");
            let onTerrace = false;
            for (let t = 0; t < 3 && !onTerrace; t++) {
              await bb.walkTo("G", 55, { tol: 12, timeout: 8000 }).catch(() => {});
              const g2 = await bb.player("G");
              onTerrace = g2.tx > 52 && g2.ty < 11;
              if (!onTerrace) await bb.page.waitForTimeout(200);
            }
            if (onTerrace) {
              across = true;
            } else {
              // FALLBACK (pre-U4): re-ride the lift. Escape LEFT to the approach
              // floor while the lift is still up (it parks flush with the shaft
              // mouth and can only be boarded from the left; the strip side is a
              // dead end, and waiting in the shaft wedges G under the platform).
              bb.log("step climb didn't reach the terrace; falling back to the lift re-ride");
              await bb.walkTo("G", 44.5, { tol: 10, timeout: 8000 });
              await bb.waitFor((s) => s.lifts[0].y >= s.lifts[0].botY - 6, 12000, "lift home");
              await bb.walkTo("G", 48, { tol: 8, timeout: 6000 }); // board; carry weight 3 sends it up
              await bb.waitFor((s) => s.lifts[0].y <= s.lifts[0].topY + 40, 12000, "lift back at top");
            }
          } else if (cycle === 2) {
            throw e;
          }
        }
      }
      // set H down on the terrace: H taps its jump to detach with a little hop
      for (let i = 0; i < 4 && (await bb.state()).players[hi].carriedBy; i++) {
        await bb.tap(bb.keysFor("H").jump, 90);
        await bb.page.waitForTimeout(200);
      }
      await bb.waitFor((s) => !s.players[hi].carriedBy && s.players[hi].tx > 51, 3000, "H set down on terrace");
      await bb.walkTo("H", 55, { timeout: 6000 });
      await bb.walkTo("G", 55, { timeout: 6000 });
    },
  },
  {
    name: "both reach the exit -> complete",
    fn: async (bb) => {
      await bb.walkTo("H", 58, { timeout: 6000 });
      await bb.walkTo("G", 58, { timeout: 6000 });
      await bb.waitFor((s) => s.complete, 5000, "level complete");
    },
  },
];

// --- 100%-core variant (Beat Sprint T3) -------------------------------------
// Cores by ents order: 0=(9,9) start-side ledge (grapple zip), 1=(28,16) under-
// floor key chamber, 2=(50,6) exit-terrace core ledge (grapple zip). None sit
// on the base path (verified by coreprobe) so each is its own detour.
//
// FINDING (uncollectable — see TESTKIT_ROADMAP.md FL-T3-A): core1 (28,16) sits
// in a left pocket (cols28-29) whose ceiling (r14) is solid, separated from the
// lid-hole entry (cols30-33) by the step at col30. A Heavy robot on that step
// cannot translate left into the pocket — its head collides with the pocket's
// r14 ceiling corner at col29 — and there is no vertical opening above the
// pocket to drop straight in (scan- and drive-verified). Grapple has no anchor
// there either. So core1 is not collectable by real input without a level
// change; it is excluded from the assertion pending design arbitration.
export const uncollectableCores = [
  { index: 1, reason: "core (28,16) walled in a Heavy-impassable left pocket behind the col30 step; no drop-in opening (r14 solid). Level-design flaw — FL-T3-A." },
];

export const coreSteps = [
  {
    after: "equip skills -> gate opens",
    steps: [
      {
        name: "core0: G zips the start-side ledge for the core (9,9)",
        fn: async (bb) => {
          // anchor (9,6) sits ABOVE its own ledge (8-10,r10); the ledge blocks
          // the sightline from directly under/right of it, so the only grapple
          // stance is a couple tiles LEFT where the LOS clears the ledge (x6,
          // d≈366; x7+ is LOS-blocked — scan-verified). Then drop straight down
          // through the core onto the ledge and return to the start floor.
          let fired = false;
          for (const tx of [6, 6.2, 5.9, 6.35, 6.05, 5.8]) {
            await bb.walkTo("G", tx, { tol: 4, timeout: 5000 }).catch(() => {});
            await bb.face("G", "right");
            await bb.waitFor((s) => s.players[bb.idx("G")].grounded && !s.players[bb.idx("G")].zip, 1500, "G settled").catch(() => {});
            const tgt = await bb.grappleTarget("G");
            if (tgt && tgt.kind === "anchor") {
              try { await bb.zipTo("G"); fired = true; break; } catch { /* marginal stance — try next */ }
            }
          }
          if (!fired) throw new Error("core0: no LOS stance to anchor (9,6)");
          await bb.zipRelease("G", "jump"); // drop through core (9,9) onto the ledge
          await bb.waitFor((s) => s.coresGot[0], 3000, "core0 collected");
          await bb.walkTo("G", 6, { tol: 10, timeout: 6000 }).catch(() => {});
        },
      },
    ],
  },
  // core1 (28,16): no detour — documented uncollectable (see uncollectableCores).
  {
    after: "ride the co-op lift; G carries H across to the terrace",
    steps: [
      {
        name: "core2: G zips onto the exit-terrace core ledge (50,6)",
        fn: async (bb) => {
          const gi = bb.idx("G");
          // from the terrace, zip up-left to anchor (51,4) and drop onto the
          // 2-tile core ledge (50-51,r7); standing at x50 sits level with the
          // core, then hop right off the ledge back down onto the terrace.
          let fired = false;
          for (const tx of [53.5, 53.2, 53.8, 53, 54]) {
            await bb.walkTo("G", tx, { tol: 6, timeout: 8000 }).catch(() => {});
            await bb.face("G", "left");
            await bb.waitFor((s) => s.players[gi].grounded && !s.players[gi].zip, 1500, "G settled").catch(() => {});
            const tgt = await bb.grappleTarget("G");
            if (tgt && tgt.kind === "anchor") {
              try { await bb.zipTo("G"); fired = true; break; } catch { /* marginal — try next */ }
            }
          }
          if (!fired) throw new Error("core2: no zip stance to anchor (51,4)");
          await bb.zipRelease("G", "jump"); // drop onto the core ledge (50-51,r7)
          await bb.waitFor((s) => s.players[gi].grounded && s.players[gi].ty < 8, 3000, "G on the core ledge").catch(() => {});
          await bb.walkTo("G", 50, { tol: 8, timeout: 4000 }).catch(() => {});
          await bb.waitFor((s) => s.coresGot[2], 3000, "core2 collected");
          await bb.walkTo("G", 55, { tol: 12, timeout: 8000 }).catch(() => {});
        },
      },
    ],
  },
];
