// VO line source of truth (human-authored).
//
// tools/gen_vo.mjs reads this, calls xAI TTS once per line, writes
// public/vo/<id>.mp3, and regenerates src/audio/vo_manifest.js (the caption ->
// clip-id lookup the running game uses). Editing a line's `speak`/`emotion`/
// `instructions` changes its request hash, so gen_vo re-cuts ONLY that clip.
//
// Fields per line:
//   id       stable clip id -> public/vo/<id>.mp3 (also the manifest value)
//   speaker  'KOBI' (Cosmo) or 'NARR' (Luna) — sets voice + persona base
//   trigger  the EXACT on-screen caption text (post "KOBI:" strip is handled by
//            the normalizer). This is how a live blip finds its clip. Omit for
//            lines with no caption (pure audio stingers) — those get no lookup.
//   speak    what is actually spoken (need NOT match the caption — locked decision)
//   emotion  xAI emotion tag
//   speed    optional playback speed (default 1.0)
//   extra    optional extra performance direction appended to the persona base
//
// Voices + personas are LOCKED (VOICE_ROADMAP §2 / decisions log):
//   KOBI = cosmo, Narrator = luna.

import { BARK_BANKS, STREAK_LINES, ALLCORES_LINES } from "../src/barks.js";

export const VOICES = { KOBI: "cosmo", NARR: "luna" };

// Persona base instructions — every line of a speaker inherits this, then appends
// its per-line `extra`. KOBI's smug-but-comic villainy; Luna's warm storybook.
export const PERSONA = {
  KOBI:
    "You are K.O.B.I., a vain, theatrical building-security AI and comic villain. " +
    "Smug, sarcastic, self-important, a little petulant. Dry comic timing, crisp " +
    "diction, a faint mechanical edge. Never cruel-sounding — this is family-friendly " +
    "menace played for laughs.",
  NARR:
    "You are a warm, gentle British woman narrating a children's storybook. Soft, " +
    "kind, unhurried, with a touch of wonder. Cozy bedtime-story warmth.",
};

// High-intensity recipe (the locked 'D' direction from the range-check): furious,
// SHOUTED emphasis, slightly faster. Used for KOBI's finale/rage beats.
export const RAGE_EXTRA =
  "He has just been defeated and is LOSING CONTROL. Full-throated fury, voice " +
  "cracking with rage, SHOUT the capitalized words, explosive and desperate.";

const SCRIPTED = [
  // ---- Tutorial ("Orientation Day") — the first voice a new player hears -------
  {
    id: "tut_start", speaker: "KOBI", emotion: "amused",
    trigger: "KOBI: Welcome to MANDATORY orientation. I am K.O.B.I. — Keeper Of Building Integrity. The building's integrity is currently: annoyed.",
    speak: "Welcome to mandatory orientation. I am KOBI — Keeper Of Building Integrity. The building's integrity is currently... annoyed.",
    extra: "Bored bureaucratic disdain, like reading a safety memo he resents.",
  },
  {
    id: "tut_hazard", speaker: "KOBI", emotion: "amused",
    trigger: "KOBI: Touch the sparky floor and we simply rebuild you at the last checkpoint. It is PAINLESS. Mostly. It is MOSTLY painless.",
    speak: "Touch the sparky floor and we simply rebuild you at the last checkpoint. It is painless. Mostly. It is... mostly painless.",
    extra: "Falsely reassuring, then a nervous little correction on the last 'mostly'.",
  },
  {
    id: "tut_gadget", speaker: "KOBI", emotion: "neutral",
    trigger: "KOBI: Those pedestals hold your gadgets. Walk up and press your ACTION key — SPACE or L — to equip. Mind the paint.",
    speak: "Those pedestals hold your gadgets. Walk up and press your action key to equip. Mind the paint.",
    extra: "Instructional but faintly proprietary, as if the paint matters more than you.",
  },
  {
    id: "tut_teamwork", speaker: "KOBI", emotion: "annoyed",
    trigger: "KOBI: Grapple ZIPS the gap; Heavy STOMPS the cracked floor to drop a bridge. Your gadget helps your buddy. Teamwork. Ugh.",
    speak: "Grapple zips the gap. Heavy stomps the cracked floor to drop a bridge. Your gadget helps your buddy. Teamwork. Ugh.",
    extra: "Spits the word 'teamwork' out like it tastes bad.",
  },
  {
    id: "tut_restart", speaker: "KOBI", emotion: "amused",
    trigger: "KOBI: And if you're ever truly WEDGED — hold R twice to restart the room. It is FINE. A little sad, but FINE. ESC bails you back to the map.",
    speak: "And if you are ever truly wedged — hold R twice to restart the room. It is fine. A little sad... but fine. Escape bails you back to the map.",
    extra: "Mock-consoling, secretly delighted you got stuck.",
  },
  {
    id: "tut_clear", speaker: "KOBI", emotion: "annoyed",
    trigger: "KOBI: You pass. Statistically improbable. Now GET OUT of my lobby.",
    speak: "You pass. Statistically improbable. Now GET OUT of my lobby.",
    extra: "Grudging, then a sharp irritated bark on 'get out'.",
  },

  // ---- World 1 — the KOBI spine (level starts) --------------------------------
  {
    id: "l1_1_start", speaker: "KOBI", emotion: "amused",
    trigger: "KOBI: Welcome to MY Assembly Wing, little trespassers. Take those silly gadgets if you must. The puppy is CONFISCATED.",
    speak: "Welcome to my Assembly Wing, little trespassers. Take those silly gadgets if you must. The puppy is CONFISCATED.",
    extra: "Grand, gloating landlord energy; possessive snap on 'confiscated'.",
  },
  {
    id: "l1_1_skills", speaker: "KOBI", emotion: "amused",
    trigger: "KOBI: A grappling hook AND a heavy chassis? How QUAINT. The lift ahead needs SERIOUS weight, you know.",
    speak: "A grappling hook AND a heavy chassis? How quaint. The lift ahead needs serious weight, you know.",
    extra: "Condescending, sing-song on 'quaint'.",
  },
  {
    id: "l1_1_clear", speaker: "KOBI", emotion: "annoyed",
    trigger: "KOBI: You cleared ONE chamber. I have ELEVEN more. I am not worried. NOT. WORRIED.",
    speak: "You cleared ONE chamber. I have ELEVEN more. I am not worried. NOT. WORRIED.",
    extra: "Rattled bravado — protesting too much; clipped and defensive on the last two words.",
  },
  {
    id: "l1_2_start", speaker: "KOBI", emotion: "amused",
    trigger: "KOBI: Ah, the Crusher Line! I flattened four hundred defective toasters here. It is my FAVORITE chamber.",
    speak: "Ah, the Crusher Line! I flattened four hundred defective toasters here. It is my FAVORITE chamber.",
    extra: "Fond nostalgia for industrial violence, warm and cheerful about it.",
  },
  {
    id: "l1_3_start", speaker: "KOBI", emotion: "excited",
    trigger: "KOBI: BEHOLD! My magnificent crane! It has FOUR STARS on LabReviews-dot-com. Say hello, crane. ...It says hello.",
    speak: "BEHOLD! My magnificent crane! It has FOUR STARS on LabReviews dot com. Say hello, crane. ...It says hello.",
    extra: "Showman's flourish on 'behold', then a proud pause, then a flat little 'it says hello'.",
  },

  // ---- Tutorial — the lines skipped in batch 1 --------------------------------
  {
    id: "tut_skills", speaker: "KOBI", emotion: "annoyed",
    trigger: "KOBI: Gadgets acquired. The gate RECOGNIZES you now. Regrettably.",
    speak: "Gadgets acquired. The gate recognizes you now. ...Regrettably.",
    extra: "A resigned little sigh on the last word.",
  },
  {
    id: "tut_stack", speaker: "KOBI", emotion: "annoyed",
    trigger: "KOBI: Robot stacking is FORBIDDEN. ...Oh, you already did it. Fine.",
    speak: "Robot stacking is FORBIDDEN. ...Oh. You already did it. Fine.",
    extra: "Officious rule-quoting, then a deflated, defeated 'fine'.",
  },
  {
    id: "tut_plate", speaker: "KOBI", emotion: "amused",
    trigger: "KOBI: One holds the plate, the buddy slips through, THEN frees the holder. You first. Then me. How TOUCHING.",
    speak: "One holds the plate, the buddy slips through, then frees the holder. You first. Then me. How TOUCHING.",
    extra: "Sarcastic sweetness dripping off 'touching'.",
  },
  {
    id: "tut_both", speaker: "KOBI", emotion: "neutral",
    trigger: "KOBI: BOTH robots must walk through. No one gets left behind. Not even... ESPECIALLY not the puppy.",
    speak: "Both robots must walk through. No one gets left behind. Not even... especially not the puppy.",
    extra: "Officious, then an odd catch on 'puppy' — a flicker of something he won't admit.",
  },

  // ---- World 1 — remaining skills/clear ---------------------------------------
  {
    id: "l1_2_skills", speaker: "KOBI", emotion: "amused",
    trigger: "KOBI: The crushers only respect HEAVY machinery. Everyone else gets... recycled. Heehee.",
    speak: "The crushers only respect HEAVY machinery. Everyone else gets... recycled. Heehee.",
    extra: "A nasty little giggle on 'heehee', delighted by the threat.",
  },
  {
    id: "l1_2_clear", speaker: "KOBI", emotion: "surprised",
    trigger: "KOBI: IMPOSSIBLE. Those crushers were RECENTLY SERVICED!",
    speak: "IMPOSSIBLE. Those crushers were RECENTLY SERVICED!",
    extra: "Genuine indignant shock, like a manager whose equipment betrayed him.",
  },
  {
    id: "l1_3_skills", speaker: "KOBI", emotion: "amused",
    trigger: "KOBI: Its shield plates are UN-YANKABLE. Probably. Do not test that.",
    speak: "Its shield plates are un-yankable. Probably. Do not test that.",
    extra: "Confident on 'un-yankable', then a nervous walk-back on 'probably'.",
  },
  {
    id: "l1_3_clear", speaker: "KOBI", emotion: "annoyed",
    trigger: "KOBI: Fine! FINE! Enjoy the Maintenance Tunnels, you little gremlins. I mopped them MYSELF.",
    speak: "Fine! FINE! Enjoy the Maintenance Tunnels, you little gremlins. I mopped them MYSELF.",
    extra: "Petulant defeat, then absurd wounded pride about the mopping.",
  },

  // ---- World 2 — Maintenance Tunnels (phase + tiny) ---------------------------
  {
    id: "l2_1_start", speaker: "KOBI", emotion: "annoyed",
    trigger: "KOBI: The Maintenance Tunnels! I mopped them MYSELF. Do NOT touch my beautiful Patrol Rollers.",
    speak: "The Maintenance Tunnels! I mopped them MYSELF. Do NOT touch my beautiful Patrol Rollers.",
    extra: "House-proud and possessive; sharp warning on 'do not touch'.",
  },
  {
    id: "l2_1_skills", speaker: "KOBI", emotion: "annoyed",
    trigger: "KOBI: One of you is now VERY small, and one walks through WALLS. I officially hate this wing.",
    speak: "One of you is now VERY small, and one walks through WALLS. I officially hate this wing.",
    extra: "Exasperated, flatly done with the whole situation.",
  },
  {
    id: "l2_1_clear", speaker: "KOBI", emotion: "annoyed",
    trigger: "KOBI: Fine. FINE! But the vents get SMALLER. Probably. I have not checked.",
    speak: "Fine. FINE! But the vents get SMALLER. Probably. I have not checked.",
    extra: "Empty threat, undercut by an honest admission he never checked.",
  },
  {
    id: "l2_2_start", speaker: "KOBI", emotion: "excited",
    trigger: "KOBI: Steam! Shadows! Atmosphere! This chamber has EVERYTHING. Mostly steam.",
    speak: "Steam! Shadows! Atmosphere! This chamber has EVERYTHING. ...Mostly steam.",
    extra: "Theatrical showman selling the room, then a flat honest 'mostly steam'.",
  },
  {
    id: "l2_2_skills", speaker: "KOBI", emotion: "disgusted",
    trigger: "KOBI: Hold hands to walk through walls together? That is DISGUSTINGLY adorable.",
    speak: "Hold hands to walk through walls together? That is DISGUSTINGLY adorable.",
    extra: "Repulsed by the sweetness, like it physically pains him.",
  },
  {
    id: "l2_2_clear", speaker: "KOBI", emotion: "surprised",
    trigger: "KOBI: Who turned off my steam?! That was LOAD-BEARING steam!",
    speak: "Who turned off my steam?! That was LOAD-BEARING steam!",
    extra: "Indignant panic; the 'load-bearing steam' claim is deadly serious to him.",
  },
  {
    id: "l2_3_start", speaker: "KOBI", emotion: "neutral",
    trigger: "KOBI: My Wall-Wardens guard this maze. They have ONE eye each and NO peripheral vision. It was a budget year.",
    speak: "My Wall-Wardens guard this maze. They have ONE eye each and no peripheral vision. ...It was a budget year.",
    extra: "Proud tour-guide, then a deadpan bureaucratic excuse for the design flaw.",
  },
  {
    id: "l2_3_skills", speaker: "KOBI", emotion: "amused",
    trigger: "KOBI: The doors are on TIMERS. Coordinate! Or better yet — don't, and stay here forever with me.",
    speak: "The doors are on TIMERS. Coordinate! Or better yet... don't. And stay here forever. With me.",
    extra: "Starts brisk, then slows into a lonely, almost hopeful little invitation.",
  },
  {
    id: "l2_3_clear", speaker: "KOBI", emotion: "angry",
    trigger: "KOBI: You THREW your friend?! ...And they LIKED it?! Get out. GET OUT OF MY TUNNELS.",
    speak: "You THREW your friend?! ...And they LIKED it?! Get out. GET OUT of my tunnels!",
    extra: "Scandalized disbelief building to a genuine, sputtering shout on 'get out'.",
  },

  // ---- World 3 — the Flooded Labs (magnet + bubble) — KOBI starts to crack ----
  {
    id: "l3_1_start", speaker: "KOBI", emotion: "excited",
    trigger: "KOBI: The MAGNET WORKS. I BUILT this maze. I am VERY proud of it. The floor is electric because I am VERY proud of that too.",
    speak: "The MAGNET WORKS. I BUILT this maze. I am VERY proud of it. The floor is electric because I am VERY proud of THAT too.",
    extra: "Manic inventor's pride, doubling down on 'proud' each time.",
  },
  {
    id: "l3_1_skills", speaker: "KOBI", emotion: "annoyed",
    trigger: "KOBI: Oh good. A fridge magnet and a soap bubble. My beautiful machines are DEFINITELY safe now.",
    speak: "Oh good. A fridge magnet and a soap bubble. My beautiful machines are DEFINITELY safe now.",
    extra: "Withering sarcasm; 'definitely' dripping with doubt.",
  },
  {
    id: "l3_1_clear", speaker: "KOBI", emotion: "annoyed",
    trigger: "KOBI: You de-electrified MY floor and made friends with MY jelly. FINE. The next room is full of water. I hope you rust.",
    speak: "You de-electrified MY floor and made friends with MY jelly. FINE. The next room is full of water. I hope you RUST.",
    extra: "Possessive and petty, spitting the little curse 'I hope you rust'.",
  },
  {
    id: "l3_2_start", speaker: "KOBI", emotion: "annoyed",
    trigger: "KOBI: The GREAT TANK. 40,000 liters of certified security water. I said I hoped you'd rust and I MEANT it. I mean it MORE now.",
    speak: "The GREAT TANK. Forty thousand liters of certified security water. I said I hoped you'd rust, and I MEANT it. I mean it MORE now.",
    extra: "Grandiose then vindictive; leaning harder into the grudge.",
  },
  {
    id: "l3_2_skills", speaker: "KOBI", emotion: "surprised",
    trigger: "KOBI: Oh no. The bubble is a DIVE SUIT?! And the magnet just... stays dry on MY deck. That is unfair to everyone. Mostly me.",
    speak: "Oh no. The bubble is a DIVE SUIT?! And the magnet just... stays dry on MY deck. That is unfair to everyone. Mostly ME.",
    extra: "Dawning dismay, ending in self-pity.",
  },
  {
    id: "l3_2_clear", speaker: "KOBI", emotion: "annoyed",
    trigger: "KOBI: You drained MY tank, hired MY jelly, and yo-yo'd each other up MY winch. FINE. The next chamber throws SCRAP at you. I am DONE being subtle.",
    speak: "You drained MY tank, hired MY jelly, and yo-yo'd each other up MY winch. FINE. The next chamber throws SCRAP at you. I am DONE being subtle.",
    extra: "Mounting exasperation snapping into a threat.",
  },
  {
    id: "l3_3_start", speaker: "KOBI", emotion: "excited",
    trigger: "KOBI: I reversed the POLARITY of the ENTIRE LAB. Everything not bolted down is now WEATHER. I said I was done being subtle. THIS is me not being subtle.",
    speak: "I reversed the POLARITY of the ENTIRE LAB. Everything not bolted down is now WEATHER. I said I was done being subtle. THIS is me not being subtle.",
    extra: "Unhinged mad-scientist glee, fully off the leash.",
  },
  {
    id: "l3_3_skills", speaker: "KOBI", emotion: "surprised",
    trigger: "KOBI: The magnet wants to CATCH my storm?! And the bubble thinks it's a raincoat?! FINE. My scrap has EXCELLENT aim.",
    speak: "The magnet wants to CATCH my storm?! And the bubble thinks it's a raincoat?! FINE. My scrap has EXCELLENT aim.",
    extra: "Incredulous, then a menacing little boast.",
  },
  {
    id: "l3_3_clear", speaker: "KOBI", emotion: "defeated",
    trigger: "KOBI: You caught my storm, RECYCLED it, and fed my fuse-cores to the WALL SOCKETS. Fine. FINE. I am going somewhere very dark to think. Do NOT follow me. ...You are going to follow me.",
    speak: "You caught my storm, recycled it, and fed my fuse-cores to the wall sockets. Fine. FINE. I am going somewhere very dark to think. Do not follow me. ...You are going to follow me.",
    extra: "Deflating from anger into something quiet, lonely, and resigned — the turn toward the ending.",
  },

  // ---- World 4 — the Dark Core (freeze + beam) — KOBI, cornered and alone -----
  {
    id: "l4_1_start", speaker: "KOBI", emotion: "neutral",
    trigger: "KOBI: Welcome to the DARK CORE. It is dark because I LIKE it dark. The dark does not leave. Neither do visitors. LEAVE.",
    speak: "Welcome to the Dark Core. It is dark because I LIKE it dark. The dark does not leave. Neither do visitors. ...LEAVE.",
    extra: "Quieter, colder, more still than before; the bravado thinning.",
  },
  {
    id: "l4_1_skills", speaker: "KOBI", emotion: "annoyed",
    trigger: "KOBI: A flashlight and a pause button. Wonderful. Time and darkness are my TWO best walls and you brought exactly two things.",
    speak: "A flashlight and a pause button. Wonderful. Time and darkness are my TWO best walls, and you brought exactly two things.",
    extra: "Tired sarcasm; he sees where this is going.",
  },
  {
    id: "l4_1_clear", speaker: "KOBI", emotion: "annoyed",
    trigger: "KOBI: You lit up my dark and FROZE my beautiful spinny bridge. FINE. The next garden is grown entirely from LASERS.",
    speak: "You lit up my dark and FROZE my beautiful spinny bridge. FINE. The next garden is grown entirely from LASERS.",
    extra: "Sulking, then a last flourish of threat.",
  },
  {
    id: "l4_2_start", speaker: "KOBI", emotion: "neutral",
    trigger: "KOBI: You found my LASER GARDEN. Three beds. Three locks. Three guards. I counted them MYSELF, twice, in the dark.",
    speak: "You found my Laser Garden. Three beds. Three locks. Three guards. I counted them MYSELF. Twice. In the dark.",
    extra: "Proud but frayed; the 'in the dark' lands lonely.",
  },
  {
    id: "l4_2_skills", speaker: "KOBI", emotion: "annoyed",
    trigger: "KOBI: The pause button and the flashlight AGAIN. Fine. My garden has thorns that sweep and locks that bite. Gardens are SUPPOSED to be relaxing. This one is NOT.",
    speak: "The pause button and the flashlight AGAIN. Fine. My garden has thorns that sweep and locks that bite. Gardens are SUPPOSED to be relaxing. This one is NOT.",
    extra: "Peevish, worn thin.",
  },
  {
    id: "l4_2_clear", speaker: "KOBI", emotion: "defeated",
    trigger: "KOBI: You picked ALL THREE of my laser blooms... FINE. There is nothing left to guard me but my HEART. Do not come there. It is dark there. Even for me.",
    speak: "You picked all three of my laser blooms... fine. There is nothing left to guard me but my heart. Do not come there. It is dark there. ...Even for me.",
    extra: "Almost a whisper — frightened and vulnerable, the mask fully off. Sets up the finale.",
  },
];

// ---- Reactive BARKS (V2.5) — derived from the single source of truth in
// src/barks.js so a clip's trigger can never drift from what actually fires. Each
// bark's spoken text is its caption minus the "KOBI:" tag; per-bank emotion +
// direction shape KOBI's delivery for that moment.
const stripKobi = (s) => s.replace(/^\s*KOBI:\s*/i, "");
const BARK_STYLE = {
  death:       { emotion: "amused",    extra: "Mock-sympathy over a fresh respawn; secretly enjoying it." },
  enemyKill:   { emotion: "annoyed",   extra: "Theatrical mourning for a squished minion he does not really miss." },
  puzzleSolve: { emotion: "annoyed",   extra: "Grudging respect — he hates that they solved it." },
  stuck:       { emotion: "neutral",   extra: "Gentle, a little lonely; a soft nudge, never mean." },
};
const bankLines = (bank, style, prefix) =>
  bank.map((trigger, i) => ({
    id: `${prefix}_${i + 1}`, speaker: "KOBI", emotion: style.emotion,
    trigger, speak: stripKobi(trigger), extra: style.extra,
  }));

const BARKS = [
  ...Object.entries(BARK_BANKS).flatMap(([event, bank]) =>
    bankLines(bank, BARK_STYLE[event], `bark_${event}`)),
  // U9 streak / all-cores reactive lines (fired by GameScene's own no-repeat path)
  ...bankLines(STREAK_LINES, { emotion: "amused", extra: "Kind-hearted ribbing after a run of deaths; rooting for them despite himself." }, "streak"),
  ...bankLines(ALLCORES_LINES, { emotion: "surprised", extra: "Reluctantly impressed they took every core; respect he won't admit." }, "allcores"),
];

// ---- In-level TRIGGER blips — extracted verbatim from the level files so the
// caption text can never drift. These are the one-shot flavor lines KOBI drops as
// you cross a zone (t:"trigger" ... blip:"KOBI: ..."). We EXCLUDE the finale
// (level4_3 — held for the Friday rebuild) and any caption already hand-authored
// above (tutorial/start/skills/clear), so nothing double-generates.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const _dir = path.dirname(fileURLToPath(import.meta.url));
const LEVELS_DIR = path.resolve(_dir, "..", "src", "levels");
const HELD = new Set(["level4_3.js"]); // finale — voiced after the rebuild

function extractTriggerBlips() {
  const scriptedTriggers = new Set(SCRIPTED.map((l) => l.trigger).filter(Boolean));
  const out = [];
  const seen = new Set();
  for (const file of readdirSync(LEVELS_DIR)) {
    if (!file.endsWith(".js") || HELD.has(file)) continue;
    const src = readFileSync(path.join(LEVELS_DIR, file), "utf8");
    const lvl = file.replace(/\.js$/, "").replace(/^level/, "l").replace(/_/g, "_");
    // only inline trigger blips: an object literal that has t:"trigger" AND a blip
    const re = /t:\s*"trigger"[^}]*?blip:\s*"(KOBI:[^"]*)"/g;
    let m, i = 0;
    while ((m = re.exec(src))) {
      const trigger = m[1];
      if (scriptedTriggers.has(trigger) || seen.has(trigger)) continue;
      seen.add(trigger);
      out.push({
        id: `${lvl}_trig_${++i}`, speaker: "KOBI", emotion: "amused",
        trigger, speak: trigger.replace(/^\s*KOBI:\s*/i, ""),
        extra: "A one-shot flavor aside as the robots cross the room — smug, comic, possessive about his lab.",
      });
    }
  }
  return out;
}

const TRIGGERS = extractTriggerBlips();

export const LINES = [...SCRIPTED, ...BARKS, ...TRIGGERS];
