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

export const LINES = [
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
];
