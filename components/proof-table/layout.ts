/** Shared, exact card centres for the glass slate. Art proportions never affect mount placement. */
export function slateCardLayout(count: number, size: number, panelWidth: number, panelDepth: number) {
  const n = Math.max(1, Math.floor(count));
  const gap = 0.14;
  const availableWidth = panelWidth - 0.3;
  const availableDepth = panelDepth - 0.3;
  let best = { cols: 1, rows: n, width: 0, depth: 0 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    let width = (availableWidth - gap * (cols - 1)) / cols;
    let depth = (availableDepth - gap * (rows - 1)) / rows;
    if (width / depth > 2.5) width = depth * 2.5;
    else if (width / depth < 1.3) depth = width / 1.3;
    if (width * depth > best.width * best.depth) best = { cols, rows, width, depth };
  }
  const { cols, rows } = best;
  const pitchX = best.width + gap;
  const pitchZ = best.depth + gap;
  return {
    cols,
    rows,
    width: best.width * size,
    depth: best.depth * size,
    positions: Array.from({ length: count }, (_, index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;
      const rowCount = row === rows - 1 ? count - row * cols : cols;
      return { x: (col - (rowCount - 1) / 2) * pitchX, z: (row - (rows - 1) / 2) * pitchZ };
    }),
  };
}

/** The tint setting also governs the slab's rim and sheen, not just its large flat face. */
export function slabFinish(opacity: number) {
  const amount = Math.min(1, Math.max(0, opacity));
  return {
    rim: 0.18 + amount * 0.65,
    sheen: 0.1 + amount * 0.4,
    frame: 0.035 + amount * 0.23,
  };
}
