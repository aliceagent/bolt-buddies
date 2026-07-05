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
      // no vent here — Tiny only passes hand-in-hand with Phase
      await bb.escortTogether("P", "T", 13.6, { timeout: 20000 });
    },
  },
  {
    name: "fan lifts T to the deck",
    fn: async (bb) => {
      const ti = bb.idx("T");
      const kT = bb.keysFor("T");
      // step into the fan column and ride it up
      await bb.walkTo("T", 14, { tol: 8, timeout: 5000 }).catch(() => {});
      await bb.waitFor((s) => s.players[ti].y < 5 * 48, 6000, "T lifted to deck height");
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
