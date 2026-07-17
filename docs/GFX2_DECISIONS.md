# GFX2 — Decision Log (autonomous judgment calls)

- D1: Restyle IN PLACE — every texture key/canvas-dim/origin/feature-anchor preserved exactly (or code updated in lockstep per the anim contract). Chosen over re-dimensioning for test/physics safety; detail comes from drawing craft within the same canvases.
- D2: FONT stays Courier New — it is the game's typographic identity and every layout measures against it; restyle spends its budget on color/form/glow instead.
- D3: Color expansion is ADDITIVE at the token level (new COLORS entries + new WORLD_THEMES fields accent3/warmth); existing token keys keep working, values enriched only where nothing asserts them.
- D4: Canvas renderer remains the reference tier (tests run ?canvas=1); WebGL-only effects must degrade safely.
- D5: Working name for the style: "Lumen Lab".
- D6: KOBI iris unified to magenta everywhere (blip-bar + onboard were red; Title/Hub canon is magenta) — one character identity across surfaces.
