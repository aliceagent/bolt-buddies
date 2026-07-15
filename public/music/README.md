# Produced music tracks (MP3)

Drop MP3 files here to replace the game's procedural synth music for that track.
No file present → the synth plays (default). After adding/removing files, run:

    node tools/gen_music_manifest.mjs

which regenerates `src/audio/music_manifest.js` (the list the game reads).

## File names (the track ids the game asks for)

Per-level (max variety):
  title.mp3   hub.mp3
  w1l1.mp3 w1l2.mp3 w1l3.mp3     (World 1: 1-1, 1-2, 1-3)
  w2l1.mp3 w2l2.mp3 w2l3.mp3     (World 2: 2-1, 2-2, 2-3)
  w3.mp3                          (World 3: all of 3-1..3-3)
  w4.mp3                          (World 4: all of 4-1..4-3)

Shortcuts (a level id falls back to its world group):
  w1.mp3        covers w1l1/w1l2/w1l3
  w2.mp3        covers w2l1/w2l2/w2l3
  finale.mp3    covers World 4 if present (preferred over w4 for 4-x)

Minimum viable set for full coverage: title, hub, w1, w2, w3, w4  (6 files).

## Specs
- Format: MP3, 44.1 kHz, stereo, ~160–192 kbps
- Length: ~60–120 s, composed to LOOP cleanly (the engine loops the file seamlessly)
- Level ~ -14 LUFS integrated; the game plays music quiet (bus at 0.45) under SFX/voice
- Everything routes through the music bus, so in-game volume/mute/ducking all apply
