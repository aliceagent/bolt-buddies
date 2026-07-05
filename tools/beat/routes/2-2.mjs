// 2-2 "Steam & Shadows" — role-parametric walkthrough.
// Roles: P = phase, T = tiny. Transcribed from TESTKIT_ROADMAP.md.
// Escort through the entry wall; Tiny rides the fan to the deck, dodges timed
// jets, throws the valve; Phase takes the now-quiet ground corridor; escorted
// pillar-hops past the reunion-yard roller; plate + lever open the exit.
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
    name: "escort through the entry wall (x12)",
    fn: async (bb) => {
      // no vent here — Tiny only passes hand-in-hand with Phase. Stop SHORT of
      // the fan column (zone edge ~x13.9): the escort must not hand T over
      // with leftover momentum inside the draft (airborne vx persists keyless
      // and glides T out of the one-tile column mid-rise).
      await bb.escortTogether("P", "T", 13.25, { timeout: 20000 });
    },
  },
  {
    name: "fan lifts T to the deck",
    fn: async (bb) => {
      const ti = bb.idx("T");
      const kT = bb.keysFor("T");
      // FL-010 gives the draft gentle keyless centering, so the ride is what
      // the walkthrough promised: walk in, let go, float up.
      let up = false;
      for (let attempt = 0; attempt < 3 && !up; attempt++) {
        await bb.walkTo("T", 13.4, { tol: 8, timeout: 5000 }).catch(() => {});
        await bb.page.waitForTimeout(250);
        await bb.down(kT.right); // step into the column
        await bb.waitFor((s) => s.players[ti].tx >= 14.15 || !s.players[ti].grounded, 3000, "into the draft").catch(() => {});
        await bb.up(kT.right); // release — centering holds T in the column
        up = await bb.waitFor((s) => s.players[ti].y < 5 * 48, 8000, "T rising")
          .then(() => true).catch(() => false);
        if (!up) bb.log(`fan ride attempt ${attempt + 1} didn't lift; re-entering`);
      }
      if (!up) throw new Error("T never rode the fan to deck height");
      // drift right at the apex to land on the deck (r4, starts x15)
      await bb.down(kT.right);
      await bb.waitFor((s) => s.players[ti].grounded && s.players[ti].ty < 4.2 && s.players[ti].tx >= 15, 6000, "T on the deck")
        .finally(() => bb.up(kT.right));
    },
  },
  {
    name: "T dodges the timed jets, throws the valve lvV1",
    fn: async (bb) => {
      // deck jets are state indices 0/1/2 at x20/x28/x34 (1.5s off-windows)
      await bb.dashPastJet("T", 0, 23);
      await bb.dashPastJet("T", 1, 30);
      await bb.dashPastJet("T", 2, 36);
      await bb.walkTo("T", 37, { tol: 8, timeout: 4000 });
      await bb.act("T"); // valve lvV1 at (37,3)
      await bb.waitFor((s) => s.levers.find((l) => l.id === "lvV1")?.on, 4000, "valve on");
      await bb.waitFor((s) => s.jets.slice(3).every((j) => !j.active), 4000, "corridor steam off");
    },
  },
  {
    name: "P takes the quiet corridor; T drops off the deck; both reach x39-40",
    fn: async (bb) => {
      // P: through the x23 shimmer entry and the corridor under the deck
      await bb.walkTo("P", 39, { tol: 12, timeout: 18000 });
      // T: off the deck end (x38) into the reunion yard
      await bb.walkTo("T", 39.8, { tol: 10, timeout: 8000 });
      await bb.waitFor((s) => s.players[bb.idx("T")].grounded && s.players[bb.idx("T")].ty > 12, 6000, "T down in the yard");
    },
  },
  {
    name: "escorted pillar-hops past the yard roller (x42 -> x46 -> x48)",
    fn: async (bb) => {
      // Beams stop at shimmer pillars, so each corridor is safe while the
      // roller (patrol 40-47) is on the OTHER side of the pillar ahead —
      // simple position predicates beat direction games here.
      await bb.waitFor((s) => s.rollers[0].state === "patrol" && s.rollers[0].x > 42.6 * 48, 20000, "roller right of pillar 42");
      await bb.escortTogether("P", "T", 42.2, { timeout: 9000 });
      await bb.waitFor((s) => s.rollers[0].state === "patrol" && s.rollers[0].x < 41.6 * 48, 25000, "roller left of pillar 42");
      await bb.escortTogether("P", "T", 46.2, { timeout: 9000 });
      await bb.waitFor((s) => s.rollers[0].state === "patrol" && s.rollers[0].x < 45 * 48, 25000, "roller clear of pillar 46");
      await bb.escortTogether("P", "T", 48.4, { timeout: 9000 });
    },
  },
  {
    name: "P holds plate pl1, T pulls lvF -> exit; both finish",
    fn: async (bb) => {
      await bb.walkTo("P", 50, { tol: 8, timeout: 5000 });
      await bb.waitFor((s) => s.plates.find((p) => p.id === "pl1")?.active, 4000, "plate pl1 held");
      await bb.walkTo("T", 52, { tol: 8, timeout: 5000 });
      await bb.act("T"); // lvF
      await bb.waitFor((s) => s.doors.find((d) => d.id === "exit")?.open, 4000, "exit open");
      await bb.walkTo("T", 55.4, { tol: 8, timeout: 6000 });
      await bb.walkTo("P", 55.4, { tol: 8, timeout: 6000 });
      await bb.waitFor((s) => s.complete, 5000, "level complete");
    },
  },
];

// --- 100%-core variant (Beat Sprint T3) -------------------------------------
// Cores by ents order: 0=(14,2) top of the fan column, 1=(32,13) deep in the
// steam corridor (base route sweeps it up when P walks the quiet corridor —
// verified by coreprobe), 2=(48,9) the reunion-yard TOSS ledge. core0 rides the
// fan higher than the base ride; core2 is a high-toss (the ledge is 4 rows up,
// unwalkable — the level names it a "toss ledge").
export const coreSteps = [
  {
    after: "fan lifts T to the deck",
    steps: [
      {
        name: "core0: T rides the fan to its top for the core (14,2)",
        fn: async (bb) => {
          const ti = bb.idx("T");
          const kT = bb.keysFor("T");
          // the fan column at x14 has no ceiling (reaches row0), so keyless FL-010
          // centering lifts T all the way up past the core at row2. Base landed T
          // on the deck (r4). Re-enter with a BRIEF nudge off the deck's left edge
          // then release: holding left overshoots the one-tile column to x13
          // (out of the draft); a short tap drops T into x14 where centering
          // catches her and the fan lofts her up through the core.
          for (let attempt = 0; attempt < 4 && !(await bb.state()).coresGot[0]; attempt++) {
            await bb.walkTo("T", 15.2, { tol: 6, timeout: 6000 }).catch(() => {});
            await bb.down(kT.left);
            await bb.page.waitForTimeout(130);
            await bb.up(kT.left);
            await bb.waitFor((s) => s.coresGot[0] || s.players[ti].ty < 2.4, 5000, "T rides up to the core").catch(() => {});
            // drift back down-right onto the deck (r4) to resume the route
            await bb.down(kT.right);
            await bb.waitFor((s) => s.players[ti].grounded && s.players[ti].ty < 4.3 && s.players[ti].tx >= 15, 6000, "T back on deck")
              .catch(() => {}).finally(() => bb.up(kT.right));
          }
          await bb.waitFor((s) => s.coresGot[0], 2500, "core0 collected");
        },
      },
    ],
  },
  {
    after: "escorted pillar-hops past the yard roller (x42 -> x46 -> x48)",
    steps: [
      {
        name: "core2: P high-tosses T through the toss-ledge core (48,9)",
        fn: async (bb) => {
          const pi = bb.idx("P");
          const ti = bb.idx("T");
          const kP = bb.keysFor("P");
          const kT = bb.keysFor("T");
          // The toss ledge (48-49,r10) is 4 rows up — the core bobs 24px above
          // it, unwalkable. Recipe (all input-only, scan-tuned; see the T3 note in
          // TESTKIT_ROADMAP.md): P carries T against pillar46's RIGHT face (~x47.2)
          // and high-tosses her right. TWO non-obvious requirements:
          //  1) the thrown Tiny must hold HER OWN jump the instant she's released,
          //     or Player.update's variable-jump-height clamp (vy<-260 && !jump)
          //     cuts the tossY launch (-886) down to -260 and she never clears row9;
          //  2) launch from x47.2 (not further right) so she rises through the core
          //     at ~x47.7 BEFORE drifting into the solid ledge's left edge (x48).
          const pickUp = async () => {
            let picked = (await bb.state()).players[pi].carrying;
            for (let i = 0; i < 12 && !picked; i++) {
              const T = await bb.player("T");
              await bb.walkTo("P", T.tx - 0.65, { tol: 7, timeout: 3000 }).catch(() => {});
              const P = await bb.player("P");
              if (Math.abs(P.x - T.x) < 54) {
                await bb.act("P");
                await bb.page.waitForTimeout(220);
                picked = (await bb.state()).players[pi].carrying;
              } else await bb.page.waitForTimeout(120);
            }
            return picked;
          };
          for (let attempt = 0; attempt < 6 && !(await bb.state()).coresGot[2]; attempt++) {
            if (!(await pickUp())) { await bb.page.waitForTimeout(400); continue; }
            // stance: walk left until snug against pillar46's right face (~x47.2)
            for (let k = 0; k < 8; k++) {
              await bb.walkTo("P", 46.8, { tol: 5, timeout: 4000 }).catch(() => {});
              const P = await bb.player("P");
              if (Math.abs(P.x / 48 - 47.2) < 0.2) break;
              const dx = P.x - (46.8 * 48 + 24);
              const key = dx > 0 ? kP.left : kP.right;
              await bb.down(key); await bb.page.waitForTimeout(45); await bb.up(key); await bb.page.waitForTimeout(100);
            }
            if (!(await bb.state()).players[pi].carrying) continue;
            await bb.face("P", "right");
            await bb.down(kP.jump);      // carrier jumps WITH the buddy
            await bb.page.waitForTimeout(60);
            await bb.tap(kP.act, 30);    // throw while jump held -> high toss
            await bb.down(kT.jump);      // Tiny holds her jump -> no vy clamp
            await bb.up(kP.jump);
            await bb.waitFor((s) => s.coresGot[2], 2200, "core2 via toss").catch(() => {});
            await bb.up(kT.jump);
            await bb.waitFor((s) => s.players[ti].grounded && !s.players[ti].carriedBy, 4000, "T landed").catch(() => {});
          }
          await bb.up(kT.jump);
          await bb.waitFor((s) => s.coresGot[2], 2000, "core2 collected");
        },
      },
    ],
  },
];
