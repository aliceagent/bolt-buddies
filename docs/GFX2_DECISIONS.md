# GFX2 — Decision Log (autonomous judgment calls)

- D1: Restyle IN PLACE — every texture key/canvas-dim/origin/feature-anchor preserved exactly (or code updated in lockstep per the anim contract). Chosen over re-dimensioning for test/physics safety; detail comes from drawing craft within the same canvases.
- D2: FONT stays Courier New — it is the game's typographic identity and every layout measures against it; restyle spends its budget on color/form/glow instead.
- D3: Color expansion is ADDITIVE at the token level (new COLORS entries + new WORLD_THEMES fields accent3/warmth); existing token keys keep working, values enriched only where nothing asserts them.
- D4: Canvas renderer remains the reference tier (tests run ?canvas=1); WebGL-only effects must degrade safely.
- D5: Working name for the style: "Lumen Lab".
- D6: KOBI iris unified to magenta everywhere (blip-bar + onboard were red; Title/Hub canon is magenta) — one character identity across surfaces.
- D7: beat 2-2 role-B flakes in THIS container under load (software-Canvas fps contention on the fan-ride) — proven pre-existing by stash-baseline test (fails on pre-V3 code at varying steps, wd/sl 0). Art bakes once and cannot affect physics. Full-kit revalidation at V10; campaign harness already retries thermal flakes.
- D8: V5 (icons) merged into the V6 HUD sprint (one agent run, both scopes verified) — icons are HUD-facing and tiny; saves a cycle.
- D9: a container recycle destroyed V7's uncommitted output once; protocol changed to commit-on-landing (QA after, revert on fail). V7 re-run.
- D10: softlock scenario 4-1-respawn-strand-audit stays UNVERIFIED in this container (an audit drive-leg flakes under load; deterministic). Accepted: its own geometry check passes, 4-1 is beat-GREEN both roles, the CLEAN campaign exercised 4-1 respawns, and GFX2 is art-only (no geometry diffs). Re-verify on quieter hardware.
- D11: tut-station4-heavy-only-in flaked HARD 3x during/right after sustained kit load, then passed 12 consecutive runs across two harness paths (instrumented runner x6 + independent diag x6), plus production-build green and a CLEAN campaign playing the full tutorial. Attribution: load-dependent reel-chord race (driver-documented DOWN+ACTION keydown sequencing hazard), not a code regression — T4 touches neither input nor physics and no reproducible mechanism was found. Scenario errors are now surfaced (ec0e729) so any future HARD names its failing step immediately.
