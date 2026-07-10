// Terrain grids are built with ops instead of ASCII art — less error-prone to author.
// Chars: '.' empty, '#' solid, '%' cracked (heavy-breakable), '<' '>' conveyor, '^' hazard,
// '~' phase-wall, 'd' duct lip (W2), '=' steel rail (W3: solid run a MAGNET GLOVE
// robot clings to and traverses hanging beneath).
export function makeGrid(cols, rows) {
  const g = Array.from({ length: rows }, () => Array(cols).fill("."));
  const api = {
    g,
    cols,
    rows,
    set(x, y, c) {
      if (y >= 0 && y < rows && x >= 0 && x < cols) g[y][x] = c;
    },
    rect(x1, y1, x2, y2, c = "#") {
      for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) api.set(x, y, c);
    },
  };
  return api;
}
