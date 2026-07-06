// 2-2 "Steam & Shadows" (twist)
// Phase escorts Tiny hand-in-hand through the entry wall; a fan lifts Tiny to a
// high deck with timed steam jets; the valve at its end shuts the constant steam
// wall blocking Phase's ground corridor below.
export default {
  id: "2-2",
  name: "Steam & Shadows",
  world: 2,
  skills: ["phase", "tiny"],
  cols: 60,
  rows: 18,
  spawns: [[2, 13], [4, 13]],
  build(g) {
    g.rect(0, 0, 0, 13, "#"); // left wall
    g.rect(0, 14, 59, 17, "#"); // ground
    // escort wall — no vents here, Tiny only gets through holding hands
    g.rect(12, 0, 12, 10, "#");
    g.rect(12, 11, 12, 13, "~");
    // high deck spanning the fan room and the corridor
    g.rect(15, 4, 38, 4, "#");
    // deck-jet mounts
    g.set(20, 0, "#");
    g.set(28, 0, "#");
    g.set(34, 0, "#");
    // corridor wall: solid above, shimmer at walking height (Phase's way in)
    g.rect(23, 5, 23, 10, "#");
    g.rect(23, 11, 23, 13, "~");
    g.rect(24, 10, 38, 10, "#"); // corridor ceiling
    // reunion-yard shimmer pillars
    g.rect(42, 11, 42, 13, "~");
    g.rect(46, 11, 46, 13, "~");
    // core 3 toss ledge
    g.rect(48, 10, 49, 10, "#");
    g.rect(59, 0, 59, 13, "#"); // right wall
  },
  entities: [
    { t: "pedestal", x: 3, y: 13, skill: "phase" },
    { t: "pedestal", x: 6, y: 13, skill: "tiny" },
    { t: "door", id: "gate", x: 9, y: 11, h: 3, needs: { skills: true } },
    { t: "checkpoint", x: 8, y: 13 },
    { t: "fan", x: 14, y: 13 },
    { t: "checkpoint", x: 17, y: 13 },
    { t: "core", x: 14, y: 2 }, // bobbing at the top of the fan column
    // timed steam jets over the deck (dodge on the way to the valve)
    { t: "jet", x: 20, y: 1, len: 3, period: 2600, on: 1100, offset: 0 },
    { t: "jet", x: 28, y: 1, len: 3, period: 2600, on: 1100, offset: 1300 },
    { t: "jet", x: 34, y: 1, len: 3, period: 2600, on: 1100, offset: 650 },
    { t: "lever", id: "lvV1", x: 37, y: 3 }, // the valve
    // constant steam sealing Phase's corridor until the valve is thrown
    { t: "jet", x: 26, y: 11, len: 3, period: 1000, on: 1000, disabledBy: "lvV1" },
    { t: "jet", x: 31, y: 11, len: 3, period: 1000, on: 1000, disabledBy: "lvV1" },
    { t: "jet", x: 35, y: 11, len: 3, period: 1000, on: 1000, disabledBy: "lvV1" },
    { t: "core", x: 32, y: 13 }, // deep in the steam corridor
    { t: "checkpoint", x: 40, y: 13 },
    { t: "roller", x: 44, y: 13, min: 40, max: 47, beam: 130 },
    { t: "core", x: 48, y: 9 },
    { t: "plate", id: "pl1", x: 50, y: 13, w: 1, threshold: 1 },
    { t: "lever", id: "lvF", x: 52, y: 13 },
    { t: "exit", x: 55, y: 11, h: 3, needs: { plates: ["pl1"], levers: ["lvF"] } },
    // U5 (F11): "all-clear" indicator at Phase's waiting spot (x22). Red while the
    // corridor jets are live, flips green when the valve lvV1 shuts them off, with
    // a final vent puff + KOBI blip. Passive VISUAL entity only — no body, no
    // collision, no needs logic, and NEVER joined to s.jets. Appended LAST so no
    // positionally-read entity index (jets by index, cores by order) shifts.
    { t: "ventlamp", x: 22, y: 11, wiredTo: "lvV1" },
  ],
  blips: {
    start: "KOBI: Steam! Shadows! Atmosphere! This chamber has EVERYTHING. Mostly steam.",
    skills: "KOBI: Hold hands to walk through walls together? That is DISGUSTINGLY adorable.",
    clear: "KOBI: Who turned off my steam?! That was LOAD-BEARING steam!",
  },
};
