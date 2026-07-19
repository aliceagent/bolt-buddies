// Reactive KOBI barks — the live-commentary system.
//
// KOBI reacts to what the players DO: dying, getting stuck, squishing an enemy,
// solving a room. Every bark flows through the SAME bb:blip queue as scripted
// dialogue (so it shows in the blip bar AND, when a matching pre-generated clip
// exists, speaks through the voice bus — see src/audio/vo.js). Barks NEVER touch
// physics/timing/finishLevel; a bark arriving mid-blip simply queues behind.
//
// This module is the SINGLE SOURCE OF TRUTH for the bark line text. Both the game
// (BarkDirector) and the VO build step (tools/vo_lines.mjs imports these banks)
// read the exact same strings, so a clip's trigger can never drift from what fires.
//
// "Tuned middle" pacing (the locked chattiness decision): a global cooldown means
// KOBI can't spam, per-event probabilities mean he doesn't comment on EVERY squish,
// and a shuffle bag guarantees no line repeats until its bank is exhausted (then it
// reshuffles for fresh ordering) — so he stays funny, not annoying.

// --- line banks --------------------------------------------------------------
// Each string keeps the "KOBI:" speaker prefix (UIScene strips it for display and
// the VO normalizer strips it for lookup). Event key -> array of variants.
export const BARK_BANKS = {
  // a single respawn (fires occasionally — most deaths pass silently)
  death: [
    "KOBI: Ooh, that HAD to sting. Rebuilding you now. Try flinching LESS.",
    "KOBI: And DOWN you go. I keep a whole SHELF of spare you.",
    "KOBI: Respawn number... let us not SAY the number. For your DIGNITY.",
    "KOBI: Scrap! Delicious scrap. ...Oh fine, here is another one of you.",
    "KOBI: You died. I felt NOTHING. ...A little something. Not much.",
  ],
  // squished a Scuttlebug (fires rarely — he can't mourn every bug)
  enemyKill: [
    "KOBI: You SQUISHED him! He had a NAME, you know. It was Unit 7. ...Whatever.",
    "KOBI: Do you KNOW how hard it is to hire good Scuttlebugs? VERY.",
    "KOBI: One less minion. I am putting this on your PERMANENT record.",
    "KOBI: Ka-SQUISH. That comes out of your PAYCHECK. You have none? Typical.",
    "KOBI: My beautiful bug! ...Eh. I have a whole DRAWER of them.",
  ],
  // a mid-level gate/door just opened — the room's lock is solved
  puzzleSolve: [
    "KOBI: ...Fine. That was CLEVER. Do not let it go to your little metal HEAD.",
    "KOBI: Oh, TEAMWORK solved it. I am THRILLED. Can you HEAR how thrilled I am.",
    "KOBI: You figured it out. I was SURE the puzzle would win. It has DISAPPOINTED me.",
    "KOBI: Correct! Ugh. I liked it better when you were STUMPED.",
  ],
  // the gentle tier-1 "stuck?" moment — warm, never mean
  stuck: [
    "KOBI: Stuck? Take your TIME. I have literally FOREVER. It is quite lonely, actually.",
    "KOBI: Struggling? ...I could HELP. I will not. But I COULD. Emotionally.",
    "KOBI: You have been THERE a while. Should I put on some MUSIC? I have ONE song.",
    "KOBI: Take a breath. Look AROUND. The answer is RIGHT there. ...No. Over THERE.",
  ],
};

// --- U9 reactive lines, re-homed here so they get voiced too ------------------
// (Behaviour unchanged — GameScene still fires these via its own u9Pick/session
// no-repeat path; centralizing the strings just lets the VO build pick them up.)
export const STREAK_LINES = [
  "KOBI: I have seen TOASTERS do better. The toasters also exploded. You're FINE.",
  "KOBI: That is a LOT of respawns. Statistically you should be scrap. And yet — keep GOING.",
  "KOBI: Three tries. I am NOT counting. I am DEFINITELY not counting. ...Try the jump SOONER.",
  "KOBI: The scrap pile is getting HOPEFUL about you. Prove it WRONG. Please.",
];
export const ALLCORES_LINES = [
  "KOBI: ALL three cores?! Those were MY cores. ...Fine. You EARNED the paperwork.",
  "KOBI: Every core, gone. I should be FURIOUS. I am, regrettably, a little IMPRESSED.",
  "KOBI: A CLEAN sweep, you greedy little machines. ...I respect it. OFFICIALLY off the record.",
];

// --- shuffle bag: no repeat until the bank empties, then reshuffle ------------
// Fires only on rare user events (never per-frame), so Math.random here is fine
// and matches the existing U9/ambient-FX precedent in GameScene.
class Bag {
  constructor(items) { this.items = items.slice(); this._pool = []; this._last = null; }
  next() {
    if (!this.items.length) return null;
    if (!this._pool.length) this._pool = this.items.slice(); // refill + fresh order
    let i = (Math.random() * this._pool.length) | 0;
    // guard the one seam a plain bag can repeat on: last-of-cycle == first-of-next.
    // If we'd echo the last emitted line and an alternative exists, pick a neighbour.
    if (this._pool.length > 1 && this._pool[i] === this._last) i = (i + 1) % this._pool.length;
    this._last = this._pool.splice(i, 1)[0];
    return this._last;
  }
}

// --- the director ------------------------------------------------------------
// One per GameScene. fire(scene, event, {prob, force}) gates on a global cooldown
// and a per-call probability, picks a no-repeat variant, and emits it as a blip.
export class BarkDirector {
  constructor(opts = {}) {
    this.cooldown = opts.cooldown ?? 6500; // ms between any two barks (anti-spam)
    this.lastAt = -1e9;
    this.bags = {};
    for (const k of Object.keys(BARK_BANKS)) this.bags[k] = new Bag(BARK_BANKS[k]);
  }

  // Returns true if a bark actually fired. `prob` (0..1) is the chance to even
  // consider firing for this event; `force` bypasses cooldown + probability.
  fire(scene, event, { prob = 1, force = false } = {}) {
    const bag = this.bags[event];
    if (!bag) return false;
    const now = scene && scene.time ? scene.time.now : 0;
    if (!force) {
      if (now - this.lastAt < this.cooldown) return false;         // cooldown gate
      if (prob < 1 && Math.random() > prob) return false;          // probability gate
    }
    const line = bag.next();
    if (!line) return false;
    this.lastAt = now;
    // T1: tag barks so UIScene's blip handler can DROP them when a line is already
    // showing / queued (barks are droppable live-commentary; scripted lines queue).
    scene.game.events.emit("bb:blip", { text: line, bark: true });
    return true;
  }
}
