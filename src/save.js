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
