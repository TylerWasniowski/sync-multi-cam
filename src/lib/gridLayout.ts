/**
 * Pure grid layout algorithm for computing tile positions.
 *
 * Given container dimensions, tile count, and tile aspect ratio,
 * computes absolute pixel positions for each tile. The same output
 * is consumed by both the React preview grid and the FFmpeg xstack
 * filtergraph (Phase 8).
 *
 * Algorithm: Brute-force column iteration. For each possible column
 * count (1..N), compute the maximum tile size that fits the container
 * while maintaining the given aspect ratio. Pick the configuration
 * that maximizes total tile area.
 */

export interface GridTile {
  x: number;      // left position in pixels
  y: number;      // top position in pixels
  width: number;  // tile width in pixels
  height: number; // tile height in pixels
}

export interface LayoutResult {
  tiles: GridTile[];
  gridWidth: number;   // total grid width used
  gridHeight: number;  // total grid height used
  columns: number;     // column count chosen
  rows: number;        // row count chosen
}

/**
 * Compute optimal tile arrangement for N videos in a container.
 *
 * Iterates all possible column counts (1..N) and picks the layout
 * that maximizes total tile area within the container bounds.
 *
 * Tile aspect ratio is assumed uniform (most common: 16:9).
 * All returned coordinates are rounded to integers.
 *
 * @param containerWidth  - Container width in pixels
 * @param containerHeight - Container height in pixels
 * @param tileCount       - Number of tiles to arrange (0-8)
 * @param tileAspectRatio - Tile width/height ratio (e.g. 16/9)
 * @returns LayoutResult with absolute pixel positions for each tile
 */
export function computeGridLayout(
  containerWidth: number,
  containerHeight: number,
  tileCount: number,
  tileAspectRatio: number,
): LayoutResult {
  // Edge case: no tiles
  if (tileCount === 0) {
    return { tiles: [], gridWidth: 0, gridHeight: 0, columns: 0, rows: 0 };
  }

  // Edge case: zero-dimension container
  if (containerWidth <= 0 || containerHeight <= 0) {
    const tiles: GridTile[] = Array.from({ length: tileCount }, () => ({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    }));
    return { tiles, gridWidth: 0, gridHeight: 0, columns: 0, rows: 0 };
  }

  let bestLayout: LayoutResult | null = null;
  let bestArea = -1;

  for (let cols = 1; cols <= tileCount; cols++) {
    const rows = Math.ceil(tileCount / cols);

    // Max tile size that fits within container cell
    const maxTileWidth = containerWidth / cols;
    const maxTileHeight = containerHeight / rows;

    // Constrain by aspect ratio
    let tileWidth: number;
    let tileHeight: number;

    if (maxTileWidth / maxTileHeight > tileAspectRatio) {
      // Height-constrained: tile height fills the cell height
      tileHeight = maxTileHeight;
      tileWidth = tileHeight * tileAspectRatio;
    } else {
      // Width-constrained: tile width fills the cell width
      tileWidth = maxTileWidth;
      tileHeight = tileWidth / tileAspectRatio;
    }

    const totalArea = tileWidth * tileHeight * tileCount;

    if (totalArea > bestArea) {
      bestArea = totalArea;

      // Round tile dimensions
      const roundedWidth = Math.round(tileWidth);
      const roundedHeight = Math.round(tileHeight);

      // Center the grid within the container
      const gridWidth = roundedWidth * cols;
      const gridHeight = roundedHeight * rows;
      const offsetX = (containerWidth - gridWidth) / 2;
      const offsetY = (containerHeight - gridHeight) / 2;

      // Generate absolute pixel positions
      const tiles: GridTile[] = [];
      for (let i = 0; i < tileCount; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        tiles.push({
          x: Math.round(offsetX + col * roundedWidth),
          y: Math.round(offsetY + row * roundedHeight),
          width: roundedWidth,
          height: roundedHeight,
        });
      }

      bestLayout = { tiles, gridWidth, gridHeight, columns: cols, rows };
    }
  }

  return bestLayout!;
}
