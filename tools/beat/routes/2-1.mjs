// 2-1 "The Vents" — role-parametric walkthrough.
// Roles: P = phase, T = tiny. Transcribed from TESTKIT_ROADMAP.md.
// Lanes: Tiny runs the tunnel through vent pinches; Phase walks the slab top
// through shimmer panels. Each lane's door opens from the OTHER lane.
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
    name: "P climbs the stairs, crosses panel x15, pulls lvP1 -> dT1",
    fn: async (bb) => {
      // stairs x10/x11 then slab top: walkTo's auto-hop chains the climbs
      await bb.walkTo("P", 18, { tol: 10, timeout: 20000 });
      await bb.act("P"); // lvP1 at (18,7)
      await bb.waitFor((s) => s.doors.find((d) => d.id === "dT1")?.open, 4000, "dT1 open");
    },
  },
  {
    name: "T runs the tunnel to lvT1 -> dP1",
    fn: async (bb) => {
      // pinch x15 (tiny-only), open dT1 at x20, pinch x25
      await bb.walkTo("T", 28, { tol: 10, timeout: 16000 });
      await bb.act("T"); // lvT1 at (28,13)
      await bb.waitFor((s) => s.doors.find((d) => d.id === "dP1")?.open, 4000, "dP1 open");
    },
  },
  {
    name: "both lanes run out to the merge zone (x45-46)",
    fn: async (bb) => {
      // P: through open dP1 (x30) and panel x35, off the slab end (x44), down
      // the toss ledge to the ground. T: pinches x35/x42/x44 are pass-through.
      await bb.walkTo("P", 46, { tol: 14, timeout: 22000 });
      await bb.walkTo("T", 45, { tol: 14, timeout: 16000 });
    },
  },
  {
    name: "roller yard: T strolls; P shelters pillar-to-pillar, pulls lvE",
    fn: async (bb) => {
      // Rollers can't see Tiny — it walks straight to the exit side.
      await bb.walkTo("T", 56, { tol: 12, timeout: 12000 });
      // P dash 1 (x46 -> pillar x50): roller0 (patrol 47-52) must face away
      // from the left approach; its beam is otherwise the whole corridor.
      await bb.waitRollerSafe(0, 46);
      await bb.walkTo("P", 50, { tol: 8, timeout: 5000 });
      // P dash 2 (pillar x50 -> pillar x54 with lvE inside): roller0 must face
      // back left (beam away / blocked by pillar 50) AND roller1 (52-57) must
      // face right (beam away from the 50->54 corridor). Combined predicate —
      // two sequential waits could each pass at different moments.
      await bb.waitFor((s) => {
        const r0 = s.rollers[0], r1 = s.rollers[1];
        return r0.state === "patrol" && r1.state === "patrol" && r0.dir === -1 && r1.dir === 1;
      }, 20000, "both rollers facing away from the 50->54 corridor");
      await bb.walkTo("P", 54, { tol: 8, timeout: 5000 });
      await bb.act("P"); // lvE tucked inside the pillar
      await bb.waitFor((s) => s.doors.find((d) => d.id === "exit")?.open, 4000, "exit open");
    },
  },
  {
    name: "P dashes to the exit; both finish",
    fn: async (bb) => {
      // dash 3 (x54 -> exit x57): only roller1 matters — its beam must face
      // away from P's start side (the pillar at 54)
      await bb.waitRollerSafe(1, 54);
      await bb.walkTo("P", 57.4, { tol: 8, timeout: 5000 });
      await bb.walkTo("T", 57.4, { tol: 8, timeout: 6000 });
      await bb.waitFor((s) => s.complete, 5000, "level complete");
    },
  },
];
