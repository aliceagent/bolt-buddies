# Bolt Buddies — Spoken Voice-Over Plan (VO)

Add spoken words to the whole game, generated via **xAI**. The written blips
already carry a fully-realized character (K.O.B.I.) with a real arc; this plan
gives him — and a storybook narrator for the ending — an actual VOICE, wired into
the existing audio engine, event system, and captions, with a clean opt-out.

The scripts below **do not need to match the on-screen text one-to-one**. The
caption bar keeps the written line (it doubles as subtitles); the spoken take can
be tighter / punchier / re-timed for delivery. Both are provided where they differ.

---

## 1. Vision & principles (binding)

1. **One narrator of chaos: K.O.B.I.** He already talks constantly — every level
   intro, every teaching beat, every defeat, the whole finale. Voicing him is 90%
   of the value and needs zero new writing. He is the spine of the VO.
2. **A second voice for the ending: the Narrator** — warm, storybook, present only
   in the epilogue + credits ("The lab got very, very quiet after that."). The
   tonal contrast with KOBI's manic delivery is the emotional landing.
3. **The robots stay MUTE.** Beep & Boop speak in beeps/boops (already SFX).
   Giving them words would break the couch-co-op "they're us" design. (Open option
   if you disagree — see §7 — but the recommendation is: keep them wordless.)
4. **VO never replaces captions.** The blip bar text stays on screen — it's the
   subtitle track, accessibility-complete for free, and lets the spoken take
   diverge from the written line without losing meaning.
5. **VO ducks the music, never fights it.** A dedicated `voiceBus`; while KOBI
   speaks, music dips (deeper than today's 0.7× blip duck — target ~0.45×) and
   restores on clip end. SFX keep going.
6. **Fully opt-out.** A **VOICE** row joins the existing MUTE dropdown
   (MUSIC / SOUND FX / **VOICE** / MUTE ALL) and the settings page, persisted in
   `bolt-buddies-audio-v1`. Ships default-ON but one tap kills it.
7. **Pre-generated, not real-time.** Every line is synthesized once, offline, into
   an audio file shipped in `public/vo/`. Zero runtime latency, zero API calls in
   the played game. (xAI is a build-time tool, exactly like the walkthrough
   capture pipeline.)
8. **Physics/logic/suites sacred.** VO is a pure audio overlay on the existing
   `bb:blip` events — it changes no gameplay. The 12-run beat matrix, playtest,
   tut_sanity, and softlock suites stay green; a new `VOICE off` A/B proves the VO
   layer is inert when disabled.

---

## 2. Voice casting & direction

**K.O.B.I. — Keeper Of Building Integrity** (the antagonist-turned-family).
- **Character:** a vain, petty, theatrical building-management AI who is, under it
  all, catastrophically lonely. Think a passive-aggressive HR email that became
  self-aware and got a god complex about a mop closet.
- **Arc (the delivery must track it):**
  - **World 1 — smug & proprietary.** Everything is MINE, you are trespassers, the
    puppy is CONFISCATED. Big, gloating, unbothered.
  - **World 2 — rattled.** "Who turned off my steam?! That was LOAD-BEARING steam!"
    Indignation creeping into panic.
  - **World 3 — grandiose & defensive.** "I BUILT this maze. I am VERY proud."
    Overcompensating; the cracks show ("I am going somewhere very dark to think").
  - **World 4 — lonely & unraveling.** "It is dark because I LIKE it dark. The dark
    does not leave. It is me and the dark in here and we are FINE." Quieter,
    almost confessional between the bluster.
  - **The finale — tantrum → deflation → yearning.** "Being angry is all the warm I
    have!" → "You want me to COME WITH YOU?" The whole game turns here.
- **Voice target (xAI):** mid-range, a little nasal/synthetic, fast and clipped
  with sudden EMPHASIS spikes on the caps (the writing already scores the
  emphasis in ALL-CAPS). A faint robotic processing artifact is welcome but
  intelligibility first. Pick/tune one xAI voice for the whole game so he's
  consistent; layer the game's existing per-mood pitch bend (gloating / angry /
  defeated moods already exist on the blip bar — VO can pitch-shift to match).

**The Narrator** (epilogue + credits only).
- Warm, unhurried, bedtime-story cadence. The opposite of KOBI. Lets the ending
  breathe. A single, different xAI voice.

---

## 3. Where spoken words go (full game sweep) + the script

VO IDs are stable (`level.key` or `moment`). The **caption** is the on-screen text
(already shipped); the **spoken** take is what xAI voices — identical unless a
punchier line is given. ~110 lines total.

### 3.0 Title & onboarding
| id | moment | spoken (KOBI unless noted) |
|----|--------|-----------------------------|
| `title.intro` | title idle | "Welcome to MANDATORY orientation. I am K-O-B-I — Keeper Of Building Integrity. The building's integrity is currently… *annoyed*." |
| `title.hook` | under logo (Narrator, optional) | "K.O.B.I. grabbed your robo-puppy, Bolt. Chase him through the lab — neither of you can do it alone." |
| `onboard.panel` | onboarding card | "First shift? Orientation is MANDATORY." |

### 3.1 Per-level — start / skills / clear (the KOBI spine)
Voice **exactly the shipped `blips.start` / `blips.skills` / `blips.clear`** for
each level (they're already perfect). IDs: `1-1.start`, `1-1.skills`, `1-1.clear`,
… `4-3.clear`. 12 levels × 3 = 36 lines. Hero examples (verbatim from the game):
- `1-1.start` — "Welcome to MY Assembly Wing, little trespassers. Take those silly gadgets if you must. The puppy is CONFISCATED."
- `1-1.clear` — "You cleared ONE chamber. I have ELEVEN more. I am not worried. NOT. WORRIED."
- `2-2.clear` — "Who turned off my steam?! That was LOAD-BEARING steam!"
- `3-3.start` — "I reversed the POLARITY of the ENTIRE LAB. Everything not bolted down is now WEATHER. THIS is me not being subtle."
- `4-1.start` — "Welcome to the DARK CORE. It is dark because I LIKE it dark. The dark does not leave. Neither do visitors. LEAVE."
- `4-2.clear` — "You picked ALL THREE of my laser blooms… FINE. There is nothing left to guard me but my HEART. Do not come there. It is dark there. Even for me."

### 3.2 Per-level — in-level teaching triggers (the color)
Voice the one-shot `trigger.blip` lines (they fire once, on approach — perfect VO
beats). ~35 lines across the game. IDs: `<level>.t<n>`. Examples:
- `3-1.t2` — "The floor current is set to 'tingle'. The ceiling is genuine STEEL. I test-licked it myself."
- `3-2.t6` — "That is the master drain lock. The key does NOT fit. …It fits. I watched them machine it. WHY did I watch."
- `4-1.t3` — "My bridge spins because standing still is for LOSERS. You cannot stop time. …Can you? WAIT."
- `4-2.t4` — "The last bloom guards its OWN key. Laser, guard, lock — ALL AT ONCE. I call it multitasking. You will call it something ruder."

### 3.3 Tutorial ("Orientation Day") — 7 station lines
Voice the tutorial station blips (IDs `tut.s1…tut.s7`), incl. the restart lesson:
- `tut.s4` — "Grapple ZIPS the gap; Heavy STOMPS the cracked floor to drop a bridge. Your gadget helps your buddy. Teamwork. …Ugh."
- `tut.restart` — "And if you're ever truly WEDGED — hold R twice to restart the room. It is FINE. A little sad, but FINE."

### 3.4 The finale — the emotional core (voice ALL of these)
KOBI's fight lines are the peak performance. IDs `4-3.fight.*`:
- Death-streak encouragement (he starts *rooting for you*): "That is a LOT of respawns. Statistically you should be scrap. And yet — keep GOING." / "The scrap pile is getting HOPEFUL about you. Prove it WRONG. Please."
- Per-core exposure: "MY VENT! A cooling core is SHOWING! Turbines — SPIN! Guard it with your whole SPIN!" (angry) → "NOT THE LAST ONE. I need that one to stay ANGRY. Being angry is all the warm I have!" (angry, cracking)
- Per-core unplug: "UNPLUGGED?! That was my FAVORITE tantrum coil. I feel… 12% calmer. DISGUSTING." → "Two cores down. My rage is BUFFERING."
- The turn: "NO. NO NO NO. I am having a TANTRUM and you cannot just UNPLUG a—" *(cut off)* → clear: "…You want me to COME WITH YOU? I am a whole building. I am also, technically, this little eye. YES. WAIT THERE. I am coming. HOLD THE DOOR." **(this is the line — direct it for the whole arc to land.)**

### 3.5 Epilogue + credits — the Narrator
IDs `epi.1…epi.4`, `credits.roll` (Narrator, warm, slow):
- `epi.1` — "The lab got very, very quiet after that."
- `epi.2` — "So the family took both robots home. …Both. KOBI counted. Twice."
- `epi.3` — "Bolt got a yard, a ball, and two robots who throw it. KOBI got a new job: night-light."
- `epi.4` — *(KOBI, softly, the last word of the game)* — "NO DARK ALLOWED. It is rule one. …It is the only rule I need now."

### 3.6 Optional stingers (nice-to-have)
Short KOBI reactions on big moments already emit blips: crane defeat ("MY CRANE!!"),
the exposed-core stomp gag ("Somebody STAND ON— no wait, STOMP it! No! DON'T!"),
the all-cores greedy-respect lines. Voice if budget allows; skippable.

---

## 4. Implementation plan — staged (mirrors the U/P/A/SL/W protocol)

Every stage: build on `buddies dev`, reviewer verifies (listen to samples + specs
+ suites green), push `buddies main`. VO is additive audio; the beat matrix +
playtest + tut_sanity + softlock suites are the regression guard, plus a `VOICE
off` A/B proving inertness.

### V0 — xAI TTS pipeline + voice lock (the unblock; do FIRST)
- **VERIFY xAI can synthesize speech.** xAI's API is chat/vision today; confirm
  whether it exposes a **text-to-speech / audio-generation** endpoint (voice,
  format, auth, rate limits). This is an OPEN dependency — see §7. Needs an
  `XAI_API_KEY` from you.
- Build `tools/gen_vo.mjs`: reads a script manifest → calls the xAI voice endpoint
  per line → writes normalized audio to `public/vo/<id>.<ext>` (target: mono,
  ~64–96kbps, mp3 or ogg for size + iOS Safari support, `loudnorm`'d to a
  consistent VO loudness a few dB above the music bed). Idempotent + cached (only
  regenerates changed lines), exactly like the walkthrough pipeline.
- **Lock the two voices** (KOBI + Narrator): generate 4–5 sample lines each,
  audition, pick + pin the voice IDs/params. GATE: no bulk generation until the
  voices are signed off (by you).

### V1 — audio-engine voice bus + settings (no lines yet)
- `src/audio/engine.js`: add a **`voiceBus`** under `masterGain` beside music/sfx,
  with its own gain + a **`voiceMuted`** derived flag; a `playVoice(id)` that loads
  + plays a clip through it, and **ducks `musicBus` to ~0.45×** while a clip owns
  the voice channel (extends the existing blip/pause duck plumbing — one clip at a
  time, newest interrupts). Persist `voice`/`voiceMuted` in `bolt-buddies-audio-v1`
  (back-compat: absent → default on).
- **VOICE** row in the MUTE dropdown (`MuteScene`) + the settings page. `playtest_audio`
  extended to assert the voice bus + duck + mute, staying green.

### V2 — VO manifest + trigger wiring (still no bulk audio)
- `public/vo/manifest.json`: `{ id → file, durationMs, speaker }`. Lazy-load a
  level's VO set on level enter (never preload all ~110).
- Wire `playVoice` to the SAME events that already fire captions: the `bb:blip`
  handler (UIScene) looks up the blip's VO id and plays the clip; level
  `start`/`skills`/`clear`, tutorial triggers, finale core events, and the
  Epilogue lines each map to an id. Add a tiny stable-id tag to blip emissions (or
  hash the text) so the mapping is deterministic. **Zero gameplay change** — VO
  rides the existing event; if a clip is missing or VOICE is off, it's a silent
  no-op and the caption still shows.
- Caption/VO sync: the blip typewriter reveal is retimed to the clip duration (or
  simply plays over the existing reveal). Decide during V2 with a sample.

### V3 — generate + ship KOBI, Worlds 1–2 + tutorial
- Generate `1-1…2-3` start/skills/clear + their triggers + the 7 tutorial lines +
  `title.intro`/`onboard.panel`. Integrate, listen through, tune duck balance.
  Beat matrix + playtest + tut_sanity green; VOICE-off A/B inert.

### V4 — Worlds 3–4 + the finale + the Narrator epilogue
- Generate `3-1…4-3` (incl. the in-level triggers) + all `4-3.fight.*` + the
  Narrator `epi.*`/credits. The finale + epilogue get extra direction passes
  (this is the payoff). Confirm the finale VO never fights the boss music and the
  epilogue narrator lands over the lullaby.

### V5 — mix, sync, QA & audit close
- Full mix pass: VO/music/SFX levels, per-mood pitch, duck depth, no clipping,
  caption timing. fps A/B (audio is cheap). Full stack green twice. `VOICE off`
  proven byte-identical to today. A short "voiced playthrough" capture for review.
  Findings table appended here. (A voiced walkthrough re-capture is a natural
  follow-on once VO ships.)

---

## 5. Line-count & effort estimate
- **~110 lines** total: 36 level start/skills/clear · ~35 in-level triggers · 7
  tutorial · ~15 finale · ~5 epilogue/credits · ~10 title/onboard/stingers.
- Two voices (KOBI + Narrator). Generation is cheap once V0's pipeline works; the
  real work is V1 (audio bus + settings) and V4 (finale/epilogue direction).
- Rough shape: V0 ½ day (gated on the xAI API answer), V1 ~1 day, V2 ~1 day, V3/V4
  ~1 day each of generate+integrate+tune, V5 ~½ day.

## 6. Guardrails
- Provider-agnostic `gen_vo.mjs` (xAI is the backend; the synth call is one
  swappable function) so a different TTS can drop in if xAI lacks TTS.
- Captions always on; VO is enhancement, never the only channel.
- iOS Safari: ship a broadly-supported codec (mp3, or aac in an m4a) — same
  concern as the H.264 walkthroughs.
- Keep KOBI's ONE voice consistent game-wide; only pitch/energy tracks his arc.

## 7. Open decisions (need your call)
1. **xAI TTS availability — the critical one.** Does the account/API you want to
   use expose a speech-synthesis endpoint (not just chat)? If yes: share the
   endpoint + an `XAI_API_KEY` and V0 proceeds. If xAI has no TTS API yet, options:
   (a) use xAI (Grok) to *punch up the scripts* and a TTS provider for *synthesis*,
   (b) wait for xAI TTS, (c) pick another voice provider now. **I'll verify the API
   the moment you provide a key** rather than assume.
2. **One voice or two?** Recommend KOBI + a distinct Narrator for the epilogue. OK?
3. **Verbatim or adapted?** Recommend: captions stay verbatim; the *spoken* take may
   trim/rephrase for cadence (you said it needn't match 1:1). OK to give me that
   latitude per line?
4. **Robots mute?** Recommend yes (beeps only). Confirm.
5. **Default on or off?** Recommend VO default-ON with the one-tap VOICE mute.
## 8. Reactive BARKS — KOBI as live commentator (added by request)

Beyond the scripted narrative lines, KOBI reacts to what the players actually DO,
with **funny, varied, rarely-repeating** one-liners. The game already ships a
reactive precedent — the U9 death-streak lines + all-cores lines, with anti-repeat
(`_u9LastStreak`) and once-per-segment rate-limiting. Barks generalize that into
event-keyed line BANKS.

### Design of the bark system (systemic, so he's funny not annoying)
- **Banks, not lines.** Each event owns a POOL of 6–10 short barks (~1–2s each,
  punchier than the paragraph blips). One is chosen at random, **never repeating
  the last 2–3 played from that bank** (round-robin shuffle bag), so a whole play
  session rarely repeats.
- **Global VO cooldown + priority.** A shared cooldown (~5–7s) means KOBI never
  talks over himself or machine-guns lines. A scripted narrative line (level
  start/clear, finale) always wins; a bark is **suppressed** while a story blip is
  on screen and while another bark is within cooldown. Priority ladder:
  finale/story > level-clear > puzzle-solve/boss-defeat > enemy-kill > death >
  ambient idle.
- **Rate-limit per category** (e.g. at most 1 enemy-kill quip per ~15s even if you
  chain kills — the *first* of a chain gets a "combo" bark, the rest stay silent),
  so busy fights don't drown in chatter.
- **Contextual variety.** Where cheap, pick the bank by sub-context: death by
  ELECTRIC vs CRUSH vs FALL vs LASER; enemy type bug/roller/warden; puzzle type
  lever/plate/bridge/core. Falls back to a generic bank if no specific one.
- **Escalation & memory (reuse U9).** Repeated deaths in one segment escalate
  tone (mock → concern → *rooting for you*, already the finale's arc). "First time"
  variants fire once (first enemy killed, first gadget equipped, first death).
- **Never blocks input, respects VOICE mute, ducks music** — same voiceBus/duck as
  the scripted lines. All barks are pre-generated clips in the VO manifest.

### Bark banks & event hooks (grounded in existing game events)
| Event (existing hook) | Bank id | Size | Sample KOBI barks |
|---|---|---|---|
| **Player dies** (`killPlayer`) generic | `bark.death` | 8 | "Ha! …I mean. Oh no. Anyway." · "The floor thanks you for your donation." · "I have a whole DRAWER of you now." · "That's coming out of your deposit." |
| death by ELECTRIC pit | `bark.death.zap` | 6 | "Ohh, extra crispy." · "That floor is set to 'tingle'. I may have lied about 'tingle'." |
| death by CRUSH | `bark.death.crush` | 6 | "Two-dimensional now! More efficient, honestly." · "The Crusher Line remains UNDEFEATED. Mostly." |
| death by FALL / safe pit | `bark.death.fall` | 6 | "Down you go. Physics: still my employee." |
| death by LASER/steam (W4/W2) | `bark.death.beam` | 6 | "My garden pruned you. It does that." |
| **death streak** in a segment (U9 exists) | `bark.streak` | 8 | escalates: mock → "Statistically you should be scrap. And yet — keep GOING." → *rooting for you* |
| **enemy destroyed** — Scuttlebug | `bark.kill.bug` | 7 | "That was EMPLOYEE of the month! …the SMALL month." · "He had TWO days to retirement." |
| enemy destroyed — Patrol Roller | `bark.kill.roller` | 6 | "Do you KNOW how hard it is to hire rollers?" |
| enemy destroyed — Wall-Warden | `bark.kill.warden` | 6 | "He had ONE eye and you took his DIGNITY too." |
| enemy destroyed — jelly / chomper (W3) | `bark.kill.w3` | 6 | "Not the jelly! The jelly had DREAMS." |
| **first kill of the run** | `bark.firstkill` | 4 | once: "Oh, we're VIOLENT now. Noted. Filed. Resented." |
| **puzzle solved** — lever/switch | `bark.solve.lever` | 7 | "Sure, flip MY switches. Everyone does." · "That lever was DECORATIVE. …It was not." |
| puzzle solved — plate / door | `bark.solve.door` | 6 | "Teamwork. In MY building. Revolting." |
| puzzle solved — bridge / big mechanism | `bark.solve.big` | 6 | "You FROZE it? …That's actually clever. Forget I said that." |
| **core collected** (optional pickup) | `bark.core` | 7 | "That core was PRIVATE. That's THEFT with extra steps." · "One of my shinies. Gone. I felt that." |
| **gadget equipped** (`setSkill`) | `bark.equip` | 5 | once per gadget: "A magnet. My machines are DEFINITELY safe now." |
| **checkpoint reached** | `bark.checkpoint` | 5 | "A checkpoint. I let you keep those. Out of PITY." |
| **stuck** t1/t2/t3 (SL2/SL3 exist) | `bark.stuck` | 6 | tier-scaled: gentle ribbing → "Hold R twice. It is FINE. A little sad, but FINE." |
| **level cleared** (`finishLevel`) | `bark.clear` | — | uses the scripted per-level `clear` line; a short generic bank backs up replays |
| **idle / dawdling** (watchdog low tier) | `bark.idle` | 6 | "Take your time. I have NOTHING but time. And this building. And the dark." |

~110 scripted lines + **~120 bark lines** across ~18 banks = ~230 clips total.
Still cheap to generate once V0's pipeline works; the design work is the
cooldown/priority/shuffle-bag director (a small `src/audio/barks.js` that listens
to the existing events), which slots into the plan as its own stage:

### New stage — **V2.5 (Bark director)**, between V2 (wiring) and V3 (content)
Build the bark director: event listeners on the existing hooks (death/kill/solve/
core/equip/checkpoint/stuck/clear), shuffle-bag no-repeat per bank, global
cooldown + priority ladder + per-category rate-limit, all gated by VOICE + honoring
the story-line-wins rule. Prove (a) it never barks over a scripted line, (b) never
exceeds the cooldown, (c) the beat/playtest suites stay green (barks fire in real
play but must not perturb timing — pure audio), (d) VOICE-off = silent no-op. Then
V3/V4 generate the bank content alongside the scripted lines.

### One extra open decision (see §7 #6)
**How chatty should KOBI be?** Recommend a tuned middle — a bark on most *notable*
events but gated by the ~6s cooldown + per-category limits so a session feels
"he's always watching" without wall-to-wall talking. A **CHATTY / NORMAL / RARE**
option under settings could expose this if you want player control.
