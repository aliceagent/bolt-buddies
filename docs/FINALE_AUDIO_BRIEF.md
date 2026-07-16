# Bolt Buddies — FINALE Audio Brief (for Hermes)

The finale ("KOBI's Heart" 4-3 → power-down cinematic → storybook epilogue → reward)
is built and tested; it currently plays PROCEDURAL SYNTH for its music + boss SFX.
This brief requests the produced audio that makes the ending land. Same drop-in
pipelines as before — no game-code changes needed; produced files transparently
replace the synth.

Style palette reminder (the director's locked mix): **A** = cute chunky · **B** =
sleek hi-tech · **C** = tactile foley.

---

## 1. MUSIC (2 tracks) → `public/music/<id>.mp3`, then `node tools/gen_music_manifest.mjs`

- **`epilogue`** — the ending underscore for the 7-page storybook epilogue AND the
  reward (medal/album/share). A gentle, growing **lullaby**: music-box/celesta + soft
  strings, warm and storybook, hopeful not sad. Loops cleanly, ~60–90s. This is the
  emotional payoff of the whole game — the most important track here.
- **`w4l3`** — the KOBI's-Heart **boss/finale theme** (World-4 finale level). Tense
  and dramatic but COMIC, never scary (all-ages) — a mad-scientist boss march that
  builds; it can hand off to the calm coda when the tantrum powers down. Loops, ~60–120s.
  (The engine also fades a "tension" layer over it — keep the base track able to sit
  under a light tension overlay.)

Specs: same as the music set — 44.1 kHz stereo MP3, seamless loop, mixed to sit under
SFX + narration.

---

## 2. SFX (7 finale/boss voices) → `public/sfx/<name>.wav`, then `node tools/gen_sfx_manifest.mjs`

These are the KOBI's-Heart boss + rescue voices (NOT in the Phase-2 set — that set was
the crane boss + general game). WAV 44.1 kHz, mono, short + DRY, peaks −3..−6 dBFS.
The generator's KNOWN set already lists these names.

| voice | style | ~dur | what it is / prompt |
|---|---|---|---|
| `heartAlarm` | **A** | 0.4s | KOBI's eye boss alarm — comic klaxon, two-note, "urgent but friendly, not scary" |
| `heartGlare` | **B** | 0.35s | the eye's GLARE strike — a charged sci-fi energy zap/sweep, telegraphed then FIRE |
| `heartSquint` | **A** | 0.25s | the eye SQUINTS shut when the beam blinds it — a soft cute servo/eyelid "mmnk" |
| `heartUnplug` | **C** | 0.3s | unplugging a cooling core — satisfying physical UNPLUG + power-dip (chunky, tactile) |
| `heartDown` | **C** | ~1.5s | the boss POWER-DOWN — big comic deflate + descending whine + soft spark crackles |
| `ventBlow` | **C** | 0.3s | a cooling-vent hatch blows open — metal clank + short steam hiss |
| `boltYip` | **A** | 0.2s | Bolt the puppy's happy YIP/bark at the reunion — cute, warm, non-annoying |

(The reward stings — SLEEP-button "boop", medal ding, album page-flip, stamp — currently
reuse existing UI voices and need nothing new.)

---

## 3. NARRATION VOICE (optional, separate xAI-TTS pipeline — `tools/gen_vo.mjs`)

The finale's on-screen NARRATION already works as captions. To VOICE it (KOBI = `cosmo`,
Narrator = `luna`), the ~60 scripted lines live in `docs/FINALE_BIBLE.md` (keys
FIN-01..38, END-01..19, RWD-01..03). Two voices: a warm storybook NARRATOR and KOBI.
Register them in `tools/vo_lines.mjs` (remove `level4_3.js` from `HELD`, add the
code-emitted lines to `SCRIPTED`) and run `node tools/gen_vo.mjs` (needs `$XAI_API_KEY`).
This is independent of the music/SFX above and can follow later.

### Commit (Hermes)
`git checkout dev && git pull --rebase origin dev`; drop the 2 MP3s in `public/music/`
and the 7 WAVs in `public/sfx/`; run `node tools/gen_music_manifest.mjs` and
`node tools/gen_sfx_manifest.mjs`; `git add public/music public/sfx src/audio/*_manifest.js
&& git commit -m "audio: finale music + boss SFX"`; `git pull --rebase origin dev &&
git push origin dev`. Do NOT push to main. Reply with what was added; the main session
verifies in-engine and promotes.
