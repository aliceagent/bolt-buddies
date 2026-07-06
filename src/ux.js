// UX hints kill-switch (Sprint U6 seed; U11 wires the real setting).
//
// A single choke-point every optional "hint/affordance" visual reads before it
// draws. Today it returns a constant `true` — U6's throw-arc and rope-tether
// previews are always eligible. Sprint U11 will replace the body with a read of
// the persisted HINTS option in localStorage `bolt-buddies-ux-v1` (on/off), so
// callers never have to change: they already gate through `uxHints()`.
//
// Documented default: ON. Kept dependency-free and side-effect-free so it is
// safe to call every frame from a render path.
export function uxHints() {
  return true;
}
