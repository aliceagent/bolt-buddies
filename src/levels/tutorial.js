// "Orientation Day" — the KOBI-narrated tutorial chamber (Sprint 10). Reachable
// only from the TITLE menu's TUTORIAL button; hidden from the hub and never
// touches the save. Teaches every shared W1 mechanic across 7 flat, friendly
// stations with a checkpoint before each one. 56x18.
//
// Engine features used: the standard grid chars + entity types, plus the two
// Sprint-10 additions — `trigger` zones (one-shot blip / key-glyph reveal) and
// `def.glyphs` static key-cap prompts (see GameScene.addGlyphs).
export default {
  id: "tut",
  name: "Orientation Day",
  world: 1,
  tutorial: true, // finishLevel() skips completeLevel(); overlay -> Title
  hidden: true, // HubScene skips this when laying out its 12 nodes
  skills: ["grapple", "heavy"],
  cols: 56,
  rows: 18,
  spawns: [[2, 13], [4, 13]],
  build(g) {
    // one thick, continuous floor (rows 14-17) — features are carved out of it
    g.rect(0, 14, 55, 17, "#");

    // --- Station 1: Move & Jump (x0-12) --------------------------------------
    g.rect(6, 13, 7, 13, "#"); // a 2-tile step up to hop onto
    g.rect(9, 14, 11, 15, "."); // a 3-tile gap (2 deep, safe floor below) to hop

    // --- Station 2: Hazards & respawn (x13-20) -------------------------------
    g.rect(16, 14, 17, 15, "."); // sparky pit (2 wide) — hop it or ride the platform
    g.set(16, 16, "^");
    g.set(17, 16, "^"); // electric floor at the pit bottom
    g.rect(15, 11, 18, 11, "#"); // a generous platform up OVER the sparky floor

    // --- Station 4: Use your gadget (x29-40) ---------------------------------
    // heavy's cracked-floor pocket with a lever inside
    g.rect(30, 15, 32, 16, "."); // hollow the under-floor pocket
    g.rect(30, 14, 32, 14, "%"); // cracked lid the heavy stomps through
    g.set(32, 16, "#"); // a step to climb back out of the pocket
    // grapple's 5-tile gap (a lever-dropped bridge lets the buddy cross too)
    g.rect(34, 14, 38, 17, ".");

    // --- Station 5: Carry & throw (x41-47) -----------------------------------
    g.rect(45, 10, 47, 10, "#"); // a 4-tile-high ledge for the joy-core
  },
  entities: [
    // --- Station 2 -----------------------------------------------------------
    { t: "checkpoint", x: 13, y: 13 },
    {
      t: "trigger", x: 14, y: 12, w: 4, h: 3, once: true,
      blip: "KOBI: Touch the sparky floor and we simply rebuild you at the last checkpoint. It is PAINLESS. Mostly. It is MOSTLY painless.",
    },

    // --- Station 3: Action & pedestals (x21-28) ------------------------------
    { t: "checkpoint", x: 20, y: 13 },
    {
      t: "trigger", x: 21, y: 12, w: 6, h: 3, once: true,
      blip: "KOBI: Those pedestals hold your gadgets. Walk up and press your ACTION key — SPACE or L — to equip. Mind the paint.",
    },
    { t: "pedestal", x: 23, y: 13, skill: "grapple" },
    { t: "pedestal", x: 26, y: 13, skill: "heavy" },
    { t: "door", id: "gate", x: 28, y: 11, h: 3, needs: { skills: true } },

    // --- Station 4 -----------------------------------------------------------
    { t: "checkpoint", x: 29, y: 13 },
    {
      t: "trigger", x: 29, y: 12, w: 4, h: 3, once: true,
      blip: "KOBI: Grapple ZIPS the gap; Heavy STOMPS the cracked floor to drop a bridge. Your gadget helps your buddy. Teamwork. Ugh.",
    },
    { t: "anchor", x: 36, y: 9 },
    { t: "lever", id: "tlv", x: 31, y: 16 }, // inside the pocket
    { t: "bridge", id: "tbr", x: 34, y: 14, w: 5, needs: { levers: ["tlv"] } },

    // --- Station 5 -----------------------------------------------------------
    { t: "checkpoint", x: 41, y: 13 },
    {
      t: "trigger", id: "s5", x: 41, y: 12, w: 5, h: 3, once: true,
      blip: "KOBI: Robot stacking is FORBIDDEN. ...Oh, you already did it. Fine.",
    },
    { t: "core", x: 46, y: 9 }, // tutorial core — just for joy, never saved

    // --- Station 6: Plates & teamwork (x48-52) -------------------------------
    { t: "checkpoint", x: 47, y: 13 },
    {
      t: "trigger", x: 47, y: 12, w: 3, h: 3, once: true,
      blip: "KOBI: One holds the plate, the buddy slips through, THEN frees the holder. You first. Then me. How TOUCHING.",
    },
    { t: "plate", id: "tpl", x: 48, y: 13, w: 2, threshold: 2 }, // needs the heavy
    { t: "door", id: "td1", x: 50, y: 11, h: 3, needs: { plates: ["tpl"], latchLever: "tlv2" } },
    { t: "lever", id: "tlv2", x: 51, y: 13 }, // the buddy frees the plate-holder

    // --- Station 7: Exit — no one left behind (x53-55) -----------------------
    { t: "checkpoint", x: 52, y: 13 }, // just short of the exit zone (x53-55)
    {
      t: "trigger", x: 53, y: 12, w: 3, h: 3, once: true,
      blip: "KOBI: BOTH robots must walk through. No one gets left behind. Not even... ESPECIALLY not the puppy.",
    },
    { t: "exit", x: 54, y: 11, h: 3, needs: {} }, // open from the start
  ],
  // Static key-glyph prompts (Sprint 10). Colour is per-cap: default P1 beep-blue,
  // arrow glyphs default to P2 boop-orange; `p:1` forces the boop-orange cap.
  glyphs: [
    // Station 1 — controls above the spawn (P1 stacked over P2)
    { x: 3, y: 11, caps: [{ k: "A" }, { k: "D" }, { gap: 14 }, { k: "W" }] },
    { x: 3, y: 9, caps: [{ k: "←" }, { k: "→" }, { gap: 14 }, { k: "↑" }] },
    // Station 4 — gadget-action keys near the anchor + above the cracked lid
    { x: 36, y: 11, caps: [{ k: "E" }, { k: "L", p: 1 }] },
    { x: 31, y: 12, caps: [{ k: "E" }, { k: "L", p: 1 }] },
    // Station 5 — ACTION to grab/throw, hold JUMP for a high toss
    { x: 43, y: 12, caps: [{ k: "E" }, { k: "L", p: 1 }, { gap: 14 }, { k: "W" }, { k: "↑", p: 1 }] },
  ],
  blips: {
    // fires after the intro banner leaves (Station 1)
    start: "KOBI: Welcome to MANDATORY orientation. I am K.O.B.I. — Keeper Of Building Integrity. The building's integrity is currently: annoyed.",
    // fires when BOTH robots have equipped a gadget (Station 3)
    skills: "KOBI: Gadgets acquired. The gate RECOGNIZES you now. Regrettably.",
    // fires on completion (Station 7 -> overlay)
    clear: "KOBI: You pass. Statistically improbable. Now GET OUT of my lobby.",
  },
};
