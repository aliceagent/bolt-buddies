# Bolt Buddies — FINALE Roadmap ("KOBI's Heart" → THE END → Reward)

Elevate the endgame from a solid 3-core boss + modest epilogue into an epic,
tested, softlock-safe climax. Creative source of truth: `docs/FINALE_BIBLE.md`
(Phase-2 "runaway tantrum", numbered script FIN-/END-/RWD-, reward suite).

## Design invariants (never break)
- Non-violent; reunion over punishment; all-ages.
- No input gate from the corridor to the main menu — every caption/page/screen
  AUTO-advances on a timer; input only skips FORWARD. Strand-proof.
- Boss stays MONOTONIC + always winnable (exposed vents never re-close, taken
  cores never re-plug, dead turbines never respin; blind/freeze unlimited).
- Finale routing unchanged: level `finale:true` -> clear overlay -> Epilogue.
- Completion signal stays `save.unlocked >= 13` (add NEW reward fields alongside).

## Coupled test surfaces — update in lockstep with any change
- Boss state read projection: `tools/beat/driver.mjs:161-177`.
- 4-3 route (one source of truth for beat+campaign+softlock): `tools/beat/routes/4-3.mjs`.
- Softlock 4-3 scenarios: `tools/softlock/scenarios/world4.mjs`.
- Epilogue phases/keys: `EpilogueScene __BB.epilogue` getters + epilogue walk in
  `4-3.mjs:285-306` and `world4.mjs:1086-1129`.

## Verification gate per sprint (dev server on :5173)
`npm run build` · `node tools/beat/runner.mjs 4-3` · `node tools/softlock/runner.mjs 4-3`
· `node tools/campaign.mjs --campaigns 1 --from 4-3` · `node tools/snap_w4_l43.mjs`

## Sprints
- **FIN-A — Power-down climax cinematic + Phase-2 narrative.** Extend
  `updateHeartDown` (GameScene) into the full scripted Phase-2 → power-down →
  scale-reveal → Bolt zoomies → TURN-BACK → carry, with camera/FX and the
  FIN-05..38 blips. Auto-playing (no new required input) so input-only beat stays
  valid; `heartResolved` still opens the exit. Bump route/softlock waits.
- **FIN-B — Expanded narrated Epilogue (7 storybook pages).** Rebuild
  EpilogueScene into END-01..19 pages (preserving existing captions verbatim),
  richer drawn animation, VO-wired captions. Update epilogue-walk test helpers +
  `__BB.epilogue` for the new phase list. Strand-proof.
- **FIN-C — Reward suite.** Medal ceremony (any% / 100%), Family Album montage,
  shareable "WE BEAT BOLT BUDDIES!" card (RWD-01..03). New save fields
  (per-world Bolt-photo unlock, hundredPercent, beaten). Surface on Hub + Title.
- **FIN-D — Narration production wiring.** Register FIN-/END-/RWD- lines in
  `tools/vo_lines.mjs` (remove 4-3 from HELD) so they can be voiced by gen_vo.
- **FIN-E — Full-stack verification.** build · playtest · beat --full · softlock
  (all) · campaign (dev-smoke + full) · finale/ending/reward screenshots. Green.
- **FIN-F — Audio handoff.** Hermes prompt: finale music (boss theme, Phase-2
  overload, power-down/turn-back cue, epilogue lullaby, medal/album fanfare) +
  new finale SFX; note the gen_vo step for narration voice.

## Optional stretch (only if green + runway)
- FIN-A2: one interactive Phase-2 co-op beat (beam-mesmerize + freeze-fan-stairs
  + SLEEP-button hold), fully wired into driver/route/softlock. Falls back to the
  auto cinematic if it can't be made reliably green.
