import level1_1 from "./level1_1.js";
import level1_2 from "./level1_2.js";
import level1_3 from "./level1_3.js";
import level2_1 from "./level2_1.js";
import level2_2 from "./level2_2.js";
import level2_3 from "./level2_3.js";

export const WORLD_INFO = [
  { name: "Assembly Wing", emoji: "🔧", skills: "Grapple + Heavyweight" },
  { name: "Maintenance Tunnels", emoji: "🌀", skills: "Phase-Walk + Tiny" },
  { name: "Magnet Works", emoji: "⚡", skills: "Magnet Glove + Bubble Shield" },
  { name: "The Dark Core", emoji: "🌑", skills: "Time-Freeze + Light-Beam" },
];

// Linear unlock order. Worlds 2-4 are designed (see GAME_DESIGN.md) but not built yet.
export const LEVELS = [
  level1_1,
  level1_2,
  level1_3,
  level2_1,
  level2_2,
  level2_3,
  { id: "3-1", name: "Attract Mode", world: 3, wip: true },
  { id: "3-2", name: "The Flooded Tank", world: 3, wip: true },
  { id: "3-3", name: "The Scrap Storm", world: 3, wip: true },
  { id: "4-1", name: "Lights Out", world: 4, wip: true },
  { id: "4-2", name: "The Laser Garden", world: 4, wip: true },
  { id: "4-3", name: "KOBI's Heart", world: 4, wip: true },
];

export const KOBI_HUB_LINES = [
  "KOBI: You will NEVER get past my Assembly Wing. The conveyor belts alone have won AWARDS.",
  "KOBI: The puppy is FINE. He has a bowl. And a firewall.",
  "KOBI: I am not lonely. I have 4,096 security cameras. We talk.",
  "KOBI: NO PETS ALLOWED. It is rule one. It is also the ONLY rule I remember.",
  "KOBI: Turn back now and I will only be MODERATELY dramatic about it.",
];
