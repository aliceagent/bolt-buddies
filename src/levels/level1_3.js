// 1-3 "Crane Chaos" (master)
// KOBI animates the big crane. Grapple yanks its shield-plates while it rests low;
// Heavy stomps each exposed core pod. Then the tower: Grapple zips up the anchors
// and reels Heavy up ledge by ledge to the exit.
export default {
  id: "1-3",
  name: "Crane Chaos",
  world: 1,
  skills: ["grapple", "heavy"],
  cols: 56,
  rows: 18,
  spawns: [[2, 13], [4, 13]],
  build(g) {
    g.rect(0, 0, 0, 13, "#"); // left wall
    g.rect(0, 14, 55, 17, "#"); // full ground
    g.rect(5, 10, 7, 10, "#"); // core 1 ledge
    g.rect(38, 10, 40, 10, "#"); // core 2 ledge
    g.rect(41, 0, 41, 10, "#"); // arena/tower divider (door below)
    // FL-006: ledges widened one tile each — the beat matrix showed 3-tile
    // ledges make reel landings flaky even for a frame-perfect robot player
    g.rect(43, 12, 46, 12, "#"); // tower ledge 1
    g.rect(49, 9, 52, 9, "#"); // tower ledge 2
    g.rect(44, 6, 47, 6, "#"); // tower ledge 3
    g.rect(48, 3, 55, 3, "#"); // tower top floor
    g.rect(55, 0, 55, 17, "#"); // right wall
  },
  entities: [
    { t: "pedestal", x: 3, y: 13, skill: "grapple" },
    { t: "pedestal", x: 6, y: 13, skill: "heavy" },
    { t: "door", id: "gate", x: 8, y: 11, h: 3, needs: { skills: true } },
    { t: "anchor", x: 6, y: 6 },
    { t: "core", x: 6, y: 9 },
    { t: "checkpoint", x: 10, y: 13 },
    { t: "crane", minX: 12, maxX: 38, y: 4 },
    { t: "bug", x: 20, y: 13, min: 15, max: 25 },
    { t: "bug", x: 30, y: 13, min: 26, max: 36 },
    { t: "anchor", x: 39, y: 6 },
    { t: "core", x: 39, y: 9 },
    { t: "checkpoint", x: 36, y: 13 },
    { t: "door", id: "towerDoor", x: 41, y: 11, h: 3, latch: true, needs: { crane: true } },
    { t: "checkpoint", x: 43, y: 13 },
    { t: "anchor", x: 51, y: 7 },
    { t: "anchor", x: 45, y: 4 },
    { t: "anchor", x: 47, y: 1 }, // FL-004: (49,1) was LOS-shadowed by the top floor from ledge3
    { t: "core", x: 43, y: 5 },
    { t: "exit", x: 53, y: 0, h: 3, needs: { opened: ["towerDoor"] } },
  ],
  blips: {
    start: "KOBI: BEHOLD! My magnificent crane! It has FOUR STARS on LabReviews-dot-com. Say hello, crane. ...It says hello.",
    skills: "KOBI: Its shield plates are UN-YANKABLE. Probably. Do not test that.",
    craneDown: "KOBI: MY CRANE!! That is coming out of SOMEBODY'S paycheck!",
    clear: "KOBI: Fine! FINE! Enjoy the Maintenance Tunnels, you little gremlins. I mopped them MYSELF.",
  },
};
