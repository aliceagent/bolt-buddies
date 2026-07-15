# Bolt Buddies — Music Production Brief (for the Hermes agent)

You are generating the **soundtrack** for **Bolt Buddies**, a 2-player couch co-op
puzzle-platformer. Two little robots (Beep & Boop) rescue a robo-puppy (Bolt) from
a vain, comic security-AI villain named **K.O.B.I.**. The game currently plays a
**procedural chiptune synth** — we are replacing it with **real, produced music**.

**Do NOT make chiptune / 8-bit / retro pixel music.** We want modern, warm,
cinematic game music — a polished indie-platformer score (lush synths, real or
hybrid drums, melodic hooks, emotional arcs), never NES bleeps.

The work happens in **TWO PHASES**. Do Phase 1 first and STOP for feedback before
Phase 2.

---

# PHASE 1 — Style samples (do this first)

Goal: let the director hear **several distinct styles per world** and pick a
direction before you invest in full tracks. For **each** track below, generate the
**3 style variants** described (a/b/c). Each sample is **SHORT: 10–15 seconds**,
capturing the CORE groove/hook of that style (not a slow intro build — jump
straight into the characteristic sound).

### Sample specs
- **Length: 10–15 seconds** each.
- Format: **MP3, 44.1 kHz, stereo, ~192 kbps**.
- Loudness: aim ~ **-14 LUFS** so samples are comparable when auditioned back-to-back.
- Capture the *identity* of the style: main instrumentation, groove, and a hint of
  melody. It does NOT need to loop yet.

### Sample file naming + location
- Put ALL samples in **`public/music/samples/`** (a subfolder — the game engine only
  scans the top level of `public/music/`, so samples will NOT affect the game).
- Name: **`<id>_<variant>.mp3`** → e.g. `public/music/samples/w1_a.mp3`,
  `w1_b.mp3`, `w1_c.mp3`, `title_a.mp3`, etc.

### The variants to generate (18 samples: 6 tracks × 3 styles)

**title** — the main theme (heard on the title screen; the tune people remember):
- `title_a` — **warm synthwave**: lush analog pads, nostalgic + hopeful, a singing lead.
- `title_b` — **orchestral-hybrid adventure**: strings + light percussion + a piano
  motif, cinematic and heartfelt (Pixar-ish "brave little heroes").
- `title_c` — **bright electronic indie-pop**: punchy plucks, upbeat, feel-good energy.

**hub** — calm map/level-select room:
- `hub_a` — **ambient chill**: soft pads, gentle bells, lo-fi warmth.
- `hub_b` — **cozy jazz**: brushed drums, warm keys, relaxed.
- `hub_c` — **music-box wonder**: delicate celeste/glockenspiel, curious and light.

**w1** — World 1, the Assembly Wing (playful industrial, KOBI is a smug comic landlord):
- `w1_a` — **funky industrial groove**: clanks/stomps used as percussion, slappy bass,
  major key, FUN.
- `w1_b` — **bouncy synth-pop platformer**: bright saw leads, four-on-the-floor, cheerful.
- `w1_c` — **playful big-band/swing**: comedic brass stabs, walking bass, cartoon energy.

**w2** — World 2, the Maintenance Tunnels (sneaky, tense, still comic):
- `w2_a` — **stealth-caper**: muted plucks, upright bass, finger snaps, noir-cool.
- `w2_b` — **dark downtempo electronic**: moody synth bass, sparse beat, cool tension.
- `w2_c` — **percussive drive**: tribal-ish drums + low drone, forward momentum.

**w3** — World 3, the Flooded Labs (stormy/aquatic, KOBI starts losing control):
- `w3_a` — **cinematic hybrid orchestral**: surging strings + electronics, storm energy.
- `w3_b` — **energetic drum & bass**: fast breaks, watery synths, intense and propulsive.
- `w3_c` — **epic percussive trailer**: big taiko/hits, choir-ish pads, dramatic.

**w4** — World 4, the Dark Core (dark, lonely, sad — the comedy has drained out):
- `w4_a` — **ambient melancholic**: sparse piano, long pads, haunting and emotional.
- `w4_b` — **cold atmospheric drone**: minimal textures, ominous but sorrowful.
- `w4_c` — **solo lament**: a lone cello or music-box melody, intimate and tender-sad.

### Commit Phase 1
1. Ensure you have `aliceagent/bolt-buddies` (same GitHub account you're signed in
   with). `git fetch origin && git checkout dev && git pull --rebase origin dev`.
2. Put the 18 samples in `public/music/samples/`.
3. `git add public/music/samples && git commit -m "music: phase-1 style samples"`
4. `git pull --rebase origin dev && git push origin dev` (retry on reject).
5. Reply with the list of sample ids you pushed, and **STOP** — the director will
   listen and pick one variant per world before Phase 2.

Do NOT run the manifest generator or push to `main` in Phase 1 — samples are not
game tracks.

---

# PHASE 2 — Full tracks (only after the director picks winners)

You will be told the winning variant per world (e.g. "title = b, w1 = a, w4 = c…").
For each, produce the **full, finished, looping track** in that style.

### Full-track specs (follow precisely)
- **Length: 90–120 seconds** (hard minimum 75s). Long enough to not feel repetitive.
- **MUST LOOP SEAMLESSLY.** The engine loops the WHOLE file end→start with no gap.
  So compose a clean loop: bar-aligned length, and the last bar must lead naturally
  back into the first (matched key/energy, no dead air, no unresolved tail, no fade
  out). Test the wrap: play the end into the start and confirm there's no click, gap,
  or jarring jump.
- **Structure:** evolve over its length (e.g. A → B → A′ variation) so minutes of play
  stay interesting, but return to the loop point cleanly. No long silent intro (music
  starts on scene entry — hold energy from the first second).
- **Tempo:** consistent within the track (the BPM in the brief is a guide, not a rule).
- **Loudness:** **-14 LUFS integrated**, **true peak ≤ -1.0 dBTP**. Controlled low end
  and dynamics — the game plays music quiet UNDER sound effects + spoken dialogue, so
  nothing should spike or muddy the mids.
- **Format:** MP3, 44.1 kHz, stereo, ~192 kbps. Well-mixed stereo master (no stems).
- Match the world's mood brief below.

### World moods (for reference during Phase 2)
- **title** ~90 BPM — warm, hopeful, cinematic; the memorable "rescue" theme.
- **hub** ~100 BPM — calm, curious, low-stakes; loops for minutes without fatigue.
- **w1** ~120 BPM — playful industrial, bright and confident, comic-villain energy.
- **w2** ~110 BPM — cooler, groovier, sneaky; tension without real menace.
- **w3** ~115–125 BPM — stormy/aquatic, rising drama, the biggest/most turbulent track.
- **w4** ~80–90 BPM — dark, sparse, lonely, melancholic; the tonal opposite of title.
- **finale** *(optional/hold — the 4-3 level is being rebuilt)* — epic emotional climax
  that RESOLVES to warmth (last stand → puppy rescued → tender resolution).

### Full-track file names (the game reads these — see public/music/README.md)
Minimum full-coverage set (6 files): `title.mp3 hub.mp3 w1.mp3 w2.mp3 w3.mp3 w4.mp3`
(a level falls back to its world track). Optional per-level variety:
`w1l1 w1l2 w1l3 w2l1 w2l2 w2l3`.

### Commit Phase 2
1. `git checkout dev && git pull --rebase origin dev`.
2. Put the finished tracks in **`public/music/`** (top level, exact ids above).
3. **`node tools/gen_music_manifest.mjs`** — regenerates `src/audio/music_manifest.js`.
   Fix any "unknown id" warnings it prints.
4. `git add public/music src/audio/music_manifest.js && git commit -m "music: full tracks <ids>"`
5. `git pull --rebase origin dev && git push origin dev`. Do NOT push to `main`.
6. Reply with the ids added. The main session verifies each in-engine (loop seam,
   levels, mood) and promotes `dev → main` (production).

## Definition of done
- **Phase 1:** 18 samples (10–15s) in `public/music/samples/`, pushed to `dev`, styles
  clearly distinct per world.
- **Phase 2:** full tracks 90–120s, seamless loop, -14 LUFS / -1 dBTP, correct ids in
  `public/music/`, manifest regenerated, pushed to `dev`. Not chiptune.
