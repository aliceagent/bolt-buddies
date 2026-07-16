# Bolt Buddies — Sound-Effects Brief (for the Hermes agent)

Generate produced **sound effects** to replace the game's synthesized (slightly
retro) SFX. Two little rescue robots (Beep & Boop) in a comic mad-scientist's lab.
Target vibe: **cute, chunky, tactile, modern game SFX** — satisfying and clean, not
harsh, not chiptune. Think a polished indie platformer: punchy but friendly.

## Tool
Use an open-source text-to-audio model on the Spark — **Stable Audio Open 1.0** is
recommended (best-in-class for SFX, Creative-Commons-trained so rights-clean). Setup
note for DGX Spark (aarch64/Blackwell): use PyTorch nightly ARM cu13x or an NGC
container, `soundfile` for I/O, and the NVRTC `libnvrtc.so.13`→`.so.12` symlink if
mel/FFT ops error. AudioGen / AudioLDM2 are fallbacks.

## Deliverable & specs
- One file per sound, named EXACTLY after the voice (see list below and
  `public/sfx/README.md`): `jump.wav`, `squish.wav`, …
- **WAV, 44.1 kHz. Short and DRY** (trim silence; no long reverb tails). Most are
  **0.1–0.8 s**; fanfares/defeat up to ~2 s.
- **Normalize** peaks to ~ -3 to -6 dBFS, consistent loudness across the set.
- Mono is fine (the engine adds stereo pan from world position).

Two phases — do Phase 1 first and STOP for feedback.

---

# PHASE 1 — palette samples (do first)

Pick the overall SOUND IDENTITY before making all ~50. Generate **3 style variants**
of a small **core set** of the most-heard sounds, so the director can choose a
palette. Core set: **jump, land, stomp, zip, core, squish, door, checkpoint, die,
menuSelect** (10 sounds × 3 styles = 30 short samples).

The 3 styles to try for each (keep them clearly distinct):
- **_a "cute chunky"** — rounded, toy-like, friendly; soft synth + light foley.
- **_b "sleek hi-tech"** — clean digital/robotic UI-ish beeps and whirs, futuristic.
- **_c "tactile foley"** — real-world-ish material sounds (metal, springs, clicks)
  lightly processed; grounded and physical.

Naming + location: put them in **`public/sfx/samples/`** (a subfolder — the game
ignores it) as `<name>_<variant>.wav` → `jump_a.wav`, `jump_b.wav`, `jump_c.wav`, …

Commit: `git checkout dev && git pull --rebase origin dev`, add `public/sfx/samples/`,
commit that folder only, `git pull --rebase origin dev && git push origin dev`. Do
NOT run the manifest generator, do NOT push to main. Reply with the list and STOP.

---

# PHASE 1 DECISION (director) — recorded

The core 10 were auditioned and the director chose a **mixed palette** (not one global
style):

| sound | pick | style | | sound | pick | style |
|---|---|---|---|---|---|---|
| jump | **B** | sleek hi-tech | | core | **A** | cute chunky |
| land | **A** | cute chunky | | door | **C** | tactile foley |
| stomp | **B** | sleek hi-tech | | checkpoint | **B** | sleek hi-tech |
| zip | **C** | tactile foley | | die | **C** | tactile foley |
| squish | **B** | sleek hi-tech | | menuSelect | **C** | tactile foley |

Emergent logic to carry into Phase 2: **soft / rewarding → A (cute chunky)** ·
**crisp actions & alerts → B (sleek hi-tech)** · **heavy mechanical / cable / physical →
C (tactile foley)**.

---

# PHASE 1.5 — extended palette probe (do next, before Phase 2)

Because the palette is a per-sound mix, produce **3 style variants** (same a/b/c
definitions as Phase 1) of **6 more sounds** that each anchor a big remaining cluster, so
the mix is grounded beyond the core 10. Same specs and same
`public/sfx/samples/<name>_<variant>.wav` naming as Phase 1 (18 files total).

- `reel` — ~0.3s. "small motor reeling a cable in"
  (anchors sustained-mechanical actions: grab, throwIt, tossHigh, lever, lockTurn, plates)
- `craneSlam` — ~0.35s. "giant crane arm slam, heavy metal impact"
  (anchors heavy impacts: crush, wardenShove, wardenTopple, podCrunch, stompLaunch)
- `magnetOn` — ~0.25s. "electromagnet hum engaging"
  (anchors energy/gadget hums & zaps: magnetOff, bubbleOn, phaseIn, phaseOut, rollerZap)
- `rollerAlert` — ~0.3s. "robot alert two-note, rising alarm"
  (anchors alerts/chirps/tones: craneAlarm, buddyBeep, equip, key)
- `respawn` — ~0.5s. "bright rebuild power-up sparkle, hopeful"
  (anchors short rewards: pickup, key-get, exitDoor)
- `coresFanfare` — ~1.5s. "short triumphant collectible fanfare"
  (anchors the long musical cues: craneDefeat, level-clear — tests how each palette scales)

Keep the three styles clearly distinct per sound. WAV 44.1 kHz, mono, short + DRY,
normalized peaks ~ -3..-6 dBFS.

Commit: `git checkout dev && git pull --rebase origin dev`, add only the new
`public/sfx/samples/` files, commit that folder, `git pull --rebase origin dev &&
git push origin dev`. Do NOT run the manifest generator, do NOT push to main. Reply with
the list and STOP for the director to lock the final per-sound mix.

---

# PHASE 2 — full set (after the palette is chosen)

Produce the finished one-shot for every sound below, in the chosen palette style,
to `public/sfx/` (top level, exact names). Prompts are starting points — adapt to
the style. Keep them short/dry per the specs.

### Player
- `jump` — short bouncy robot hop blip. ~0.2s. "cute robot jump, quick upward blip"
- `land` — soft small landing thud. ~0.15s. "small robot feet landing, soft thud"
- `stompLaunch` — wind-up whoosh before a heavy stomp. ~0.25s. "quick mechanical wind-up whoosh"
- `stomp` — heavy satisfying ground stomp/impact. ~0.3s. "heavy robot stomp, deep chunky impact"
- `zip` — grappling-hook zip/launch. ~0.3s. "grappling hook zip launch, taut cable whoosh"
- `reel` — reeling in on the cable (short mechanical whir). ~0.3s. "small motor reeling a cable in"
- `grab` — pick up / grab buddy. ~0.15s. "soft mechanical grab click"
- `throwIt` — throw the buddy (low whoosh). ~0.2s. "low toss whoosh"
- `tossHigh` — high toss (brighter whoosh). ~0.2s. "light upward toss whoosh"
- `hopOff` — hop off buddy's shoulders. ~0.15s. "small hop-off blip"
- `buddyBeep` — friendly two-note robot chirp (co-op call). ~0.25s. "cute two-note robot chirp, friendly"
- `die` — non-violent robot power-down/deconstruct. ~0.4s. "robot powering down, comic deflate, not gory"
- `respawn` — cheerful power-up/rebuild sparkle. ~0.5s. "bright rebuild power-up sparkle, hopeful"
- `equip` — gadget equip confirm (rising 4-note). ~0.4s. "gadget equip, rising confident chime"
- `phaseIn` / `phaseOut` — ghost/phase whoosh (up / down). ~0.25s. "sci-fi phase shimmer whoosh"

### World / items
- `core` — collect a data-core (bright happy pickup). ~0.3s. "collect a glowing energy core, bright happy pickup"
- `coresFanfare` — all 3 cores collected (short triumphant flourish). ~1.5s. "short triumphant collectible fanfare"
- `pickup` — generic small pickup. ~0.2s. "small item pickup blip"
- `door` — big door/gate rumbles open. ~0.5s. "large lab door sliding open, mechanical rumble"
- `doorClose` — door closes. ~0.4s. "large door closing thunk"
- `exitDoor` — level-exit door opens (grander, welcoming). ~0.7s. "grand exit door opening, warm mechanical"
- `checkpoint` — checkpoint reached (gentle rising confirm). ~0.5s. "gentle checkpoint confirm, rising three-note"
- `key` — collect a key. ~0.25s. "small bright key pickup, two-note"
- `lockTurn` — a lock turning/opening. ~0.3s. "mechanical lock turning and clicking open"
- `lever` — pull a lever. ~0.25s. "chunky lever pull and latch"
- `platePress` / `plateRelease` — pressure plate down / up. ~0.15s. "pressure plate click down / release up"

### Enemies / hazards
- `squish` — squish a little bug enemy (comic, non-gross). ~0.15s. "comic squish pop, cartoon, harmless"
- `bugBounce` — bounce off a bug. ~0.2s. "springy boing bounce"
- `bugBonk` — bonk a bug harmlessly. ~0.15s. "light comedic bonk"
- `rollerAlert` — patrol roller spots you. ~0.3s. "robot alert two-note, rising alarm"
- `rollerZap` — roller electric zap. ~0.25s. "quick electric zap"
- `wardenShove` — wall-warden shove. ~0.25s. "heavy mechanical shove thud"
- `wardenTopple` — warden topples over. ~0.5s. "large robot toppling, descending mechanical"
- `crush` — crusher slams. ~0.3s. "heavy hydraulic crush slam"
- `craneAlarm` — boss crane alarm. ~0.4s. "boss alarm klaxon, two-note, urgent but comic"
- `craneSlam` — crane arm slams down. ~0.35s. "giant crane arm slam, heavy metal impact"
- `craneYank` — crane yanks/whips a cable. ~0.35s. "fast cable yank whip"
- `podCrunch` — crush a crane pod (weak point). ~0.25s. "satisfying pod crunch pop"
- `craneDefeat` — boss defeat (big comic power-down + sparks). ~2s. "big boss power-down, descending whine with spark crackles, comic not scary"

### Gadgets
- `magnetOn` / `magnetOff` — magnet engages / releases. ~0.25s. "electromagnet hum engaging / powering off"
- `bubbleOn` — bubble shield inflates. ~0.3s. "soft bubble inflate whoosh"
- `bubblePop` — bubble pops. ~0.15s. "light bubble pop"
- `splash` — enter/exit water. ~0.3s. "small water splash"

### UI
- `menuMove` — cursor move. ~0.08s. "soft UI tick"
- `menuSelect` — confirm. ~0.15s. "pleasant UI confirm blip"
- `menuDeny` / `denied` — invalid. ~0.15s. "gentle UI error buzz, not harsh"
- `saveTick` — progress saved tick. ~0.1s. "tiny save tick"
- `settingsTick` — settings adjust tick. ~0.08s. "tiny adjust tick"
- `muteChirp` — mute toggle chirp. ~0.12s. "short mute toggle chirp"

### Commit Phase 2
1. `git checkout dev && git pull --rebase origin dev`.
2. Put the finished WAVs in `public/sfx/` (exact names).
3. **`node tools/gen_sfx_manifest.mjs`** — regenerates `src/audio/sfxsamples_manifest.js`.
   Fix any "unknown voice" warnings (they mean a filename typo).
4. `git add public/sfx src/audio/sfxsamples_manifest.js && git commit -m "sfx: full set <what>"`
5. `git pull --rebase origin dev && git push origin dev`. Do NOT push to main.
6. Reply with the names added. The main session verifies in-engine (each plays,
   levels, mix) and promotes `dev → main` (production).

## Definition of done
- Phase 1: 30 palette samples in `public/sfx/samples/`, 3 clearly-distinct styles.
- Phase 2: full one-shots in `public/sfx/`, WAV 44.1k, short + dry + normalized,
  correct names, manifest regenerated, pushed to `dev`. Cute/chunky/modern, not chiptune.
