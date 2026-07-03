# Bolt Buddies — Sound & Music Roadmap

Five sprints that give the game a complete, zero-asset audio identity: a
procedural chiptune/synthwave soundtrack with a **unique track per level**,
a **unique sound effect for every action, enemy and reward**, a **settings
page with volume controls**, and a **mute button**. Everything is synthesized
in WebAudio at runtime — no audio files, consistent with the art direction.

## Ground rules (every sound sprint)

1. **Zero assets.** All audio is WebAudio synthesis (oscillators, noise
   buffers, gain envelopes, filters). No files, no CDNs, no `<audio>` tags.
2. **Gameplay is frozen.** Same rule as the UI roadmap: physics, level
   geometry, entity logic, save format and the playtest contract
   (`window.__BB.scene` internals) must not change. EXCEPTIONS granted for
   this roadmap: a pause overlay (new `P` key), a Settings scene, and the
   `M` mute key — these are additive UX and specified below. `ESC` must keep
   its exact current behavior (playtests use it).
3. **Suites green.** `node tools/playtest.mjs` (42), `node tools/playtest_w2.mjs`
   (30), plus the new `tools/playtest_audio.mjs` once it exists.
4. **Autoplay-safe.** The AudioContext resumes on first keydown (the existing
   `initAudio()` pattern). Nothing may error or warn before that.
5. **No audio spam.** Every repeatable SFX goes through a rate-limiter
   (per-sound minimum interval). Proximity sounds attenuate with distance
   from the camera midpoint and are silent when off-screen.
6. **Performance.** One AudioContext. Scheduler creates only short-lived
   oscillator/gain nodes; no per-frame node creation; music scheduler uses
   the standard 25ms-interval / 120ms-lookahead pattern.

## Audio architecture (built in Sprint S1, used by all)

```
AudioContext
└── masterGain  (mute toggles this to 0)
    ├── musicBus (music volume setting; ducks to 0.7x while a KOBI blip types)
    └── sfxBus   (sfx volume setting)
```

- `src/audio/engine.js` — context + buses + settings. Settings persist to
  localStorage `bolt-buddies-audio-v1`: `{ music: 0.7, sfx: 0.8, muted: false }`.
  API: `initAudio()`, `setMusicVolume(v)`, `setSfxVolume(v)`, `setMuted(b)`,
  `toggleMute()`, `getAudioSettings()`, `duckMusic(on)`.
- `src/audio/music.js` — a 16-step sequencer. Voices: **bass** (triangle),
  **lead** (square, slight detune), **arp** (pulse 25%), **pad** (two detuned
  saws through a lowpass), **drums** (noise-buffer kick/snare/hat). Tracks are
  pure data: `{ bpm, root, scale, bars, bass[], lead[], arp[], pads[], drums[] }`.
  API: `playTrack(id)` (0.6s crossfade, no-op if already playing), `stopMusic()`,
  `setMusicLayer(name, on)` (for the boss layer). Expose state for tests:
  `window.__BB.audio = { engine: <settings getter>, music: { current, playing } }`.
- `src/audio/sfx.js` — the existing `tone()` blips move here, joined by a
  `noise()` helper (filtered noise bursts), a `slide()` helper (pitch
  glissandi), and `rateLimit(key, ms)`. All routed through `sfxBus`.
  `src/audio.js` becomes a re-export shim so existing imports keep working.
- Global keys: **M** toggles mute anywhere (Title, Hub, Game, Settings).
  A small mute icon shows in the corner of every scene while muted.

## Music inventory — one track per screen and level

| Track id | Where | Direction |
|---|---|---|
| `title` | Title/menu | Warm synthwave: slow pad, gentle arp, hopeful. 90 BPM, C major. |
| `hub` | Sector map | Quiet "map room" sequencer: ticking hat, sparse plucks. 100 BPM, A minor. |
| `w1l1` | 1-1 First Day | Bright bouncy chiptune, major pentatonic lead, walking bass. 112 BPM. |
| `w1l2` | 1-2 Crusher Line | Industrial: heavier kick on the 1, clanking off-beat lead, E minor. 120 BPM. |
| `w1l3` | 1-3 Crane Chaos | Driving boss groove; `tension` layer (fast arp + snare rolls) ON while the crane lives, OFF after defeat (calm coda). 132 BPM, D minor. |
| `w2l1` | 2-1 The Vents | Sneaky staccato: muted pulse stabs, walking chromatic bass, D dorian. 104 BPM. |
| `w2l2` | 2-2 Steam & Shadows | Humid and mysterious: long pads, drip-like plink lead, sparse drums. 92 BPM, F# minor. |
| `w2l3` | 2-3 Warden's Maze | Syncopated heist groove; short "tick-tock" motif in the arp (timed doors). 116 BPM, G minor. |
| `w3`/`w4` | future worlds | Reserve ids + direction (electro-funk / dark ambient) so later levels drop in. |
| `jingle_clear` | Chamber clear | 3-second triumphant cadence, then silence (overlay). |
| `jingle_unlock` | New chamber unlocked (hub) | 1.5s rising fanfare over the hub track. |

Wiring: TitleScene/HubScene call `playTrack` in `create`; GameScene picks by
`def.id` (map in music.js); `finishLevel()` stops the level track and plays
`jingle_clear`; 1-3's crane defeat calls `setMusicLayer("tension", false)`.
Restart/death do NOT restart the track (keep it playing — no music whiplash).

## SFX inventory — full walk of the game

**Player actions** (all exist as basic blips today unless noted — each gets a
distinct, better voice): jump, land, heavy stomp launch (new), heavy stomp
impact, zip fire + short travel whoosh, hang latch click (new), partner reel,
pickup partner, throw, high toss (higher pitch), carried hop-off (new), death
zap, respawn beam-in (new), phase-wall enter/exit whoosh (new), fan-lift
flutter while rising (new, rate-limited), pedestal equip power-up.

**Devices**: lever clunk, plate press + plate release (new), door open rumble,
door close (new), exit door open (grander, new), bridge tiles materializing
(rising tick per tile, new), lift start/stop + soft motor loop while moving
(new), checkpoint ding (new — currently reuses blip), key pickup, key consumed
by door (new lock-turn), data-core pickup arpeggio, **all-3-cores-in-a-level
bonus fanfare** (new — fires on collecting the third), conveyor ambience (very
quiet, only when a player rides it, new).

**Enemies** (unique voice per enemy per action): Scuttlebug — skitter chitter
when a player is near (rate-limited), squish pop, bounce boing, bonk-turn thud.
Patrol Roller — motor hum by proximity, alert chirp (rising "?!"), zap crack.
Wall-Warden — shove thud + comic "HMPH" buzz, defeat topple (descending
slide-whistle synth). Crusher — slam clank (exists, improve), servo rise whine
(new). Steam jet — filtered-noise hiss while active, attenuated by distance
(new). Fan — soft whoosh loop when someone is in the column (new). Crane —
patrol servo, telegraph alarm (two-tone), slam boom, plate-yank metal screech,
pod-exposed alarm pulse while a pod is out, pod crunch, defeat power-down
glissando + spark crackles.

**UI / meta**: menu move blip, menu select, menu deny, pause open (soft
freeze-whoosh) + close, settings value tick, mute on/off chirp (audible even
when muting: play BEFORE gain hits 0 / after it restores), typewriter blips
(exists — give KOBI three moods: angry = lower/harsher, gloating = default,
defeated = descending; pick per blip via an optional mood tag, default
gloating), locked-node deny, level-enter sting, save toast tick.

## Settings page + pause (Sprint S4)

- **SettingsScene** (keyboard-driven, matches game style): rows —
  `MUSIC VOLUME [◀ ██████░░░░ ▶] 60%`, `SFX VOLUME`, `MUTE ALL  [on/off]`,
  `BACK`. W/S or ↑/↓ selects, A/D or ←/→ adjusts in 10% steps (live audio
  feedback tick at the new volume), E/L/Enter toggles/activates, ESC = back.
  Opens from: Title (S key + a "S — sound settings" hint line; becomes a real
  menu button when UI Sprint 7 lands), Hub (S key + hint), and the pause menu.
  Remembers which scene to return to.
- **Pause overlay** (in-game): **P** pauses — `this.physics.pause()`, dim
  overlay, panel with RESUME / SETTINGS / EXIT TO MAP, music keeps playing at
  0.5x volume. P or RESUME resumes. ESC keeps its current instant-exit-to-hub
  behavior untouched (playtest contract). Pause must be impossible during the
  clear overlay and must not break the respawn timer (use `physics.pause` +
  guard the update loop with an early return; `time.delayedCall` timers may
  keep running — acceptable, respawn while paused is harmless, but document it).
- **Mute button**: M everywhere, plus a MUTE row in settings; muted state
  shows a small 🔇-style drawn icon bottom-right in every scene.

## Test plan (`tools/playtest_audio.mjs`, wired into `npm run playtest`)

Headless WebAudio works in Chromium; assert engine STATE rather than sound:
1. After a keypress, `__BB.audio` exists and context state is "running".
2. Title plays `title`; entering 1-1 plays `w1l1`; 2-2 plays `w2l2` (evaluate
   `__BB.audio.music.current` after scene switches).
3. Completing a level (teleport both to exit) switches music to `jingle_clear`.
4. M toggles `muted` true/false and masterGain 0/restored.
5. Settings: open with S from title, arrow-adjust music volume, value changes
   and persists after page reload (localStorage).
6. Pause: P sets `scene.physics.world.isPaused` true, panel visible, P resumes.
7. 1-3: crane defeat turns the `tension` layer off.
8. Rate limiter: 20 rapid squish calls schedule ≤ 5 actual plays (expose a
   counter for tests).

## Sprints

### Sound Sprint S1 — Engine, buses, settings persistence, mute
Build `src/audio/engine.js` + `src/audio/sfx.js` (move existing tones onto the
sfx bus; keep `src/audio.js` as a re-export shim so nothing else changes),
`src/audio/music.js` sequencer with ONE proof track (`title`) playing on the
title screen, M mute toggle + corner icon in all scenes, localStorage
persistence, `window.__BB.audio` test surface, and the skeleton of
`tools/playtest_audio.mjs` (checks 1, 4). Acceptance: title music audibly
plays after a keypress (verify state via evaluate), all suites green.

### Sound Sprint S2 — The soundtrack
All tracks from the music inventory + scene/level wiring + crossfades +
clear/unlock jingles + the 1-3 tension layer + blip ducking. Each track must
be genuinely distinct (different tempo, scale, voices, drum pattern) and loop
seamlessly for at least 8 bars. Acceptance: audio test checks 2, 3, 7; a
human-readable one-line description per track in music.js comments.

### Sound Sprint S3 — The SFX pass
Everything in the SFX inventory: unique voices, proximity attenuation,
rate limiting, KOBI blip moods, all-cores fanfare, and wiring at every call
site listed. Acceptance: audio test check 8 + spot-checks (squish/zap/yank
fire the right synth — assert via the exposed play-counter per sound id);
suites green.

### Sound Sprint S4 — Settings page, pause menu, mute UX
As specified above. Acceptance: audio test checks 5, 6; screenshots of the
settings page and pause overlay; suites green (ESC behavior byte-identical).

### Sound Sprint S5 — Mix, balance & audio QA
Volume-balance every sound against the music (document a mix table in
sfx.js), stereo pan by on-screen x (±0.3), fade music on scene transitions,
audit every rate limit, fix anything harsh/clipping (keep master ≤ 0.8),
run all four suites, update README (audio section: unique per-level music,
settings, mute). Acceptance: full green run of `npm run playtest`.
