# Bolt Buddies — Music Production Brief (for the Hermes agent)

You are generating the **soundtrack** for **Bolt Buddies**, a 2-player couch co-op
puzzle-platformer. Two little robots (Beep & Boop) rescue a robo-puppy (Bolt) from
a vain, comic security-AI villain named **K.O.B.I.**. The game currently plays a
**procedural chiptune synth** — we are replacing it with **real, produced music**.

**Do NOT make chiptune / 8-bit / retro pixel music.** We want modern, warm,
cinematic game music — think a polished indie platformer score (lush synths, real
drum kits or hybrid percussion, melodic hooks, emotional arcs), not NES bleeps.

## Your deliverable

MP3 files placed in `public/music/` of the `aliceagent/bolt-buddies` repo, named by
the exact track id below, then the manifest regenerated and everything committed to
the **`dev`** branch. See `public/music/README.md` in the repo for the naming +
technical specs (they are authoritative). Summary:

- Format: **MP3, 44.1 kHz, stereo, ~160–192 kbps**
- Length: **~60–120 s, composed to LOOP SEAMLESSLY** (the game loops the file with
  no gap — write an intro/body that returns cleanly to the loop point, or a clean
  bar-aligned loop with matched head/tail).
- Loudness: **~ -14 LUFS integrated.** The game plays music quiet under SFX + voice,
  so keep dynamics controlled (no huge silent intros — the loop should hold energy).
- Everything routes through the game's music bus (volume / mute / ducking handled by
  the engine) — just deliver a well-mixed stereo master.

## Tracks & style briefs (id → brief)

KOBI has an emotional arc across the worlds — smug comic villain who cracks into
loneliness by the end. The music should track that. Minimum full-coverage set is
6 files: `title, hub, w1, w2, w3, w4`. Per-level ids (w1l1 etc.) are optional extra
variety; a level falls back to its world track.

- **title** — Main theme. Warm, hopeful, a little cinematic. This is the "two brave
  little robots on a rescue" tune with a memorable melodic hook (the Bolt Buddies
  motif). Mid-tempo ~90 BPM, major key, lush pads + gentle arps + a singing lead.
  Inviting, not epic. This is the track people remember.

- **hub** — Map room / level select. Calm, curious, low-stakes exploration. Warm and
  gentle with a soft pulse; ~100 BPM, sparse and pretty. Should loop for minutes
  without fatigue.

- **w1** — World 1, the Assembly Wing. Playful **industrial-but-fun**. Bright, bouncy,
  mechanical percussion (clanks, stomps as groove), a cheeky bassline, major key.
  KOBI is still a smug comic landlord here. ~120 BPM, upbeat and confident.

- **w2** — World 2, the Maintenance Tunnels. Cooler, groovier, a touch **sneaky**.
  Minor key, driving bassline, tension without real menace (it's still comic). Think
  stealth-caper groove. ~110 BPM.

- **w3** — World 3, the Flooded Labs. **Stormy / aquatic**, rising drama. Watery
  textures, building intensity, a hybrid orchestral-electronic feel as KOBI starts
  to lose control. ~115–125 BPM, the biggest, most turbulent track.

- **w4** — World 4, the Dark Core. **Dark, sparse, lonely, melancholic.** KOBI is
  cornered and alone in the dark; the comedy has drained out. Slow, atmospheric,
  minimal, a little haunting and sad — but still beautiful. ~80–90 BPM, ambient and
  emotional. This is the tonal opposite of the title theme.

- **finale** *(optional / hold)* — the 4-3 finale is being rebuilt; if you want to
  prep one, aim for an **epic, emotional climax that resolves to warmth** (villain's
  last stand → the puppy is rescued → tender resolution). Otherwise skip for now.

Optional per-level variety (same world mood, distinct arrangement): `w1l1 w1l2 w1l3`,
`w2l1 w2l2 w2l3`. Not required.

## Git workflow (get it into the game)

The game auto-deploys `main`; we stage on `dev` and review. Steps:

1. Clone (if not already): `git clone <bolt-buddies remote> && cd bolt-buddies`
   — the repo is `aliceagent/bolt-buddies`, same account you're signed in with.
2. `git fetch origin && git checkout dev && git pull --rebase origin dev`
3. Drop your MP3s into `public/music/` with the exact ids above.
4. `node tools/gen_music_manifest.mjs`  (regenerates `src/audio/music_manifest.js`;
   it will warn if a filename doesn't match a known track id — fix any warnings).
5. `git add public/music src/audio/music_manifest.js && git commit -m "music: <what you added>"`
6. `git pull --rebase origin dev && git push origin dev`  (rebase-then-push; retry on reject)
7. Post back which ids you added. The main session will verify in-engine and promote
   `dev → main` (production). Do NOT push to `main` yourself.

## Definition of done
- Each MP3 loops seamlessly, is ~-14 LUFS, matches its world's mood brief, and is
  NOT chiptune.
- `node tools/gen_music_manifest.mjs` lists your ids with no "unknown id" warnings.
- Committed + pushed to `dev`.
