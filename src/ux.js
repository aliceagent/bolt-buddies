// UX options + per-level records, persisted in localStorage `bolt-buddies-ux-v1`.
//
// This is the ONE UX key (never the save key `bolt-buddies-save-v1`, never the
// audio key `bolt-buddies-audio-v1`). U6 seeded the module with the `uxHints()`
// choke-point; U8 adds display-only run records (best time + fewest deaths per
// level) that ride alongside any future option fields via read-modify-write.

const UX_KEY = "bolt-buddies-ux-v1";

// --- hints kill-switch (Sprint U6 seed; U11 wires the real setting) ----------
//
// A single choke-point every optional "hint/affordance" visual reads before it
// draws. Today it returns a constant `true` — U6's throw-arc and rope-tether
// previews are always eligible. Sprint U11 will replace the body with a read of
// the persisted HINTS option, so callers never have to change: they already
// gate through `uxHints()`.
//
// Documented default: ON. Kept dependency-free and side-effect-free so it is
// safe to call every frame from a render path.
export function uxHints() {
  return true;
}

// --- persisted UX blob -------------------------------------------------------
// Always returns a plain object (empty on missing/corrupt). Never throws.
function loadUx() {
  try {
    const o = JSON.parse(localStorage.getItem(UX_KEY));
    if (o && typeof o === "object") return o;
  } catch (e) {
    /* corrupt or missing — treat as empty, preserving nothing we can't parse */
  }
  return {};
}

// Read-modify-WRITE that PRESERVES every field it doesn't touch (future option
// rows from U11, etc.). Silent no-op if storage is unavailable.
function saveUx(o) {
  try {
    localStorage.setItem(UX_KEY, JSON.stringify(o));
  } catch (e) {
    /* storage unavailable — records just won't persist this session */
  }
}

// --- records -----------------------------------------------------------------
// Shape: ux.records = { "<levelId>": { bestTime: <ms>, bestDeaths: <n> } }.
// Best time is the LOWEST elapsed ms; best deaths is the LOWEST respawn count.
// Both tracked independently (a fast messy run and a slow clean run each keep
// their own crown).
export function getRecord(id) {
  const r = loadUx().records;
  return (r && r[id]) || null;
}

// Fold a finished run into the records. Returns a summary the clear overlay uses
// to decide the "NEW RECORD!" starburst and the grade line's fast-time branch:
//   { prevTime, prevDeaths, bestTime, bestDeaths, beatTime, beatDeaths }
// `beat*` is true when this run set a NEW best (first-ever record counts as new).
// NEVER called for the tutorial (it persists nothing — standing rule).
export function saveRecord(id, timeMs, deaths) {
  const ux = loadUx();
  const records = ux.records || {};
  const prev = records[id] || null;
  const prevTime = prev && typeof prev.bestTime === "number" ? prev.bestTime : null;
  const prevDeaths = prev && typeof prev.bestDeaths === "number" ? prev.bestDeaths : null;

  const beatTime = prevTime === null || timeMs < prevTime;
  const beatDeaths = prevDeaths === null || deaths < prevDeaths;

  const bestTime = beatTime ? timeMs : prevTime;
  const bestDeaths = beatDeaths ? deaths : prevDeaths;

  records[id] = { bestTime, bestDeaths };
  ux.records = records;
  saveUx(ux); // read-modify-write: every other ux field is carried through

  return { prevTime, prevDeaths, bestTime, bestDeaths, beatTime, beatDeaths };
}

// --- first-run onboarding (U10, fixes F6) ------------------------------------
// A single boolean flag: has the tutorial ("Orientation Day") ever been
// completed? Drives the title's TUTORIAL "new!" pip (shown until first
// completion). This is the ONLY thing the tutorial ever persists — it still
// writes NOTHING to the save key (standing rule). Read-modify-write, so it
// rides alongside `records` and any future option rows.
export function tutorialDone() {
  return !!loadUx().tutorialDone;
}

export function markTutorialDone() {
  const ux = loadUx();
  if (ux.tutorialDone) return; // idempotent: never rewrites an already-set flag
  ux.tutorialDone = true;
  saveUx(ux); // preserves every other ux field (records, options)
}

// --- time formatting ---------------------------------------------------------
// Full stats-row form "m:ss.t" (tenths). Built ONCE at finishLevel, never per
// frame. Guards against negatives/NaN so a weird counter can never crash the
// clear overlay.
export function fmtTime(ms) {
  const t = Math.max(0, Math.round(ms || 0));
  const m = Math.floor(t / 60000);
  const s = Math.floor((t % 60000) / 1000);
  const tenths = Math.floor((t % 1000) / 100);
  return `${m}:${String(s).padStart(2, "0")}.${tenths}`;
}

// Compact hub-chip form "m:ss" (no tenths — the chip is tiny). e.g. 83000 -> "1:23".
export function fmtClock(ms) {
  const t = Math.max(0, Math.round(ms || 0));
  const m = Math.floor(t / 60000);
  const s = Math.floor((t % 60000) / 1000);
  return `${m}:${String(s).padStart(2, "0")}`;
}
