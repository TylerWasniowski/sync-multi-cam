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
 * that maximizes total tile area. Tiles use full cell dimensions
 * (CSS object-fit handles aspect-ratio display). Incomplete last
 * rows are centered horizontally.
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
 * that maximizes AR-constrained tile area (proxy for "cells closest
 * to desired aspect ratio"). Final tile dimensions fill cells fully;
 * CSS object-fit handles cropping / letterboxing.
 *
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

  // Find optimal column count using AR-constrained tile area as proxy
  let bestCols = 1;
  let bestArea = -1;

  for (let cols = 1; cols <= tileCount; cols++) {
    const rows = Math.ceil(tileCount / cols);

    // Max tile size that fits within container cell
    const maxTileWidth = containerWidth / cols;
    const maxTileHeight = containerHeight / rows;

    // Constrain by aspect ratio (for comparison only)
    let tileWidth: number;
    let tileHeight: number;

    if (maxTileWidth / maxTileHeight > tileAspectRatio) {
      tileHeight = maxTileHeight;
      tileWidth = tileHeight * tileAspectRatio;
    } else {
      tileWidth = maxTileWidth;
      tileHeight = tileWidth / tileAspectRatio;
    }

    const totalArea = tileWidth * tileHeight * tileCount;

    if (totalArea > bestArea) {
      bestArea = totalArea;
      bestCols = cols;
    }
  }

  // Generate layout with full-cell tile dimensions
  const rows = Math.ceil(tileCount / bestCols);
  const cellWidth = Math.round(containerWidth / bestCols);
  const cellHeight = Math.round(containerHeight / rows);

  const gridWidth = cellWidth * bestCols;
  const gridHeight = cellHeight * rows;
  const offsetX = Math.round((containerWidth - gridWidth) / 2);
  const offsetY = Math.round((containerHeight - gridHeight) / 2);

  // Last-row centering for incomplete rows
  const tilesInLastRow = tileCount - (rows - 1) * bestCols;
  const lastRowEmpty = bestCols - tilesInLastRow;
  const lastRowExtraOffset = Math.round((lastRowEmpty * cellWidth) / 2);

  const tiles: GridTile[] = [];
  for (let i = 0; i < tileCount; i++) {
    const col = i % bestCols;
    const row = Math.floor(i / bestCols);
    const isLastRow = row === rows - 1 && tilesInLastRow < bestCols;

    tiles.push({
      x: Math.round(offsetX + col * cellWidth + (isLastRow ? lastRowExtraOffset : 0)),
      y: Math.round(offsetY + row * cellHeight),
      width: cellWidth,
      height: cellHeight,
    });
  }

  return { tiles, gridWidth, gridHeight, columns: bestCols, rows };
}
