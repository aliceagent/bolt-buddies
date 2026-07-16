const KEY = "bolt-buddies-save-v1";

export function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && typeof s.unlocked === "number" && s.cores) return s;
  } catch (e) {
    /* corrupt or missing save — start fresh */
  }
  return { unlocked: 1, cores: {} };
}

export function storeSave(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch (e) {
    /* storage unavailable — progress just won't persist */
  }
}

// levelIndex is 0-based; unlocked counts how many levels are playable.
export function completeLevel(levelIndex, id, coresArr) {
  const s = loadSave();
  s.unlocked = Math.max(s.unlocked, levelIndex + 2);
  const prev = s.cores[id] || [false, false, false];
  s.cores[id] = prev.map((v, i) => v || !!coresArr[i]);
  storeSave(s);
  return s;
}

export function totalCores(s) {
  return Object.values(s.cores).reduce((n, arr) => n + arr.filter(Boolean).length, 0);
}

// W3W4 L43: campaign-complete is READ from the existing `unlocked` counter — no
// new save field. `unlocked` counts playable levels; clearing chamber index 11
// (4-3 "KOBI's Heart", the 12th and last real chamber) drives it to 13 via
// completeLevel (levelIndex + 2). So unlocked > 12 <=> the finale was cleared.
// (The tutorial is appended at index 12 but never writes the save, and no other
// code path can push `unlocked` past 12 — smallest correct change wins.)
const REAL_LEVELS = 12;
export function campaignComplete(s = loadSave()) {
  return s.unlocked > REAL_LEVELS;
}

// --- FIN-C reward derivations ------------------------------------------------
// All DERIVED from the existing `{unlocked, cores:{}}` shape — no new persisted
// fields, so every older save (and every suite fixture) reads correctly.

// Cores collected in one world (levels `${world}-1/-2/-3`, 3 cores each, 9 max).
export function worldCoreCount(s, world) {
  let n = 0;
  for (let lvl = 1; lvl <= 3; lvl++) {
    const arr = s.cores[`${world}-${lvl}`];
    if (arr) n += arr.filter(Boolean).length;
  }
  return n;
}

// The Family Album's "bonus Bolt photos": one per world, unlocked by sweeping
// all 9 of that world's cores. Index 0 = world 1 … index 3 = world 4.
export function worldPhotos(s) {
  return [1, 2, 3, 4].map((w) => worldCoreCount(s, w) === 9);
}

// The GOLDEN GLARE condition: every core in the game (12 levels x 3 = 36).
export function hundredPercent(s) {
  return totalCores(s) === 36;
}
