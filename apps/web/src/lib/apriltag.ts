import { TAG36H11_CODES } from './tag36h11-codes';

export const TAG_FAMILY = 'tag36h11';

/**
 * 10×10 module grid for a tag36h11 marker: 1 white quiet ring, 1 black border ring, 6×6 data.
 * Returns true for white modules. Matches the bit order of the in-browser detector.
 */
export function tagModules(id: number): boolean[][] {
  const code = TAG36H11_CODES[id];
  if (code === undefined) throw new Error(`Invalid tag36h11 id ${id}`);
  const bits = code.toString(2).padStart(36, '0');
  const grid: boolean[][] = [];
  for (let y = 0; y < 10; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < 10; x++) {
      if (y === 0 || y === 9 || x === 0 || x === 9) row.push(true);
      else if (y === 1 || y === 8 || x === 1 || x === 8) row.push(false);
      else row.push(bits[(y - 2) * 6 + (x - 2)] === '1');
    }
    grid.push(row);
  }
  return grid;
}

/** Rasterises a marker into an RGBA buffer (used by tests and the self-check page). */
export function renderTagRGBA(id: number, moduleSize: number, margin = 2) {
  const grid = tagModules(id);
  const size = (10 + margin * 2) * moduleSize;
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let y = 0; y < 10; y++)
    for (let x = 0; x < 10; x++) {
      if (grid[y][x]) continue;
      for (let py = 0; py < moduleSize; py++)
        for (let px = 0; px < moduleSize; px++) {
          const i = (((y + margin) * moduleSize + py) * size + (x + margin) * moduleSize + px) * 4;
          data[i] = data[i + 1] = data[i + 2] = 0;
        }
    }
  return { width: size, height: size, data };
}
