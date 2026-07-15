# Produced sound effects (samples)

Drop a sound file here to replace the game's synthesized version of that effect.
No file present → the synth voice plays (default). After adding/removing files, run:

    node tools/gen_sfx_manifest.mjs

which regenerates `src/audio/sfxsamples_manifest.js` (the map the game reads).

## File names = the sfx voice names

Name each file exactly after the in-game voice it replaces, e.g. `jump.wav`,
`squish.wav`, `door.wav`. **WAV preferred** (short, lossless); MP3 also works. If
both exist for a name, WAV wins.

Known voice names (see docs/MUSIC_BRIEF.md's sibling docs/SFX_BRIEF.md for what each
sound is + a generation prompt):

  Player:  jump land stomp stompLaunch zip reel grab throwIt tossHigh hopOff
           die respawn equip phaseIn phaseOut buddyBeep
  World:   door doorClose exitDoor checkpoint key lockTurn lever platePress
           plateRelease core coresFanfare pickup
  Enemies: squish bugBounce bugBonk rollerAlert rollerZap wardenShove wardenTopple
           crush craneAlarm craneSlam craneYank podCrunch craneDefeat
  Gadgets: magnetOn magnetOff bubbleOn bubblePop splash
  UI:      menuMove menuSelect menuDeny saveTick settingsTick muteChirp denied

## Specs
- **WAV, 44.1 kHz** (mono is fine for most — the engine adds stereo pan from world
  position). Keep them **short and DRY** (no long reverb tails): most one-shots are
  0.1–0.8 s; fanfares/defeat up to ~2 s.
- **Normalize** so peaks land around -3 to -6 dBFS and sounds sit at consistent
  loudness relative to each other (the game plays them under music + voice).
- Everything routes through the sfx bus, so in-game SFX volume + mute apply.
