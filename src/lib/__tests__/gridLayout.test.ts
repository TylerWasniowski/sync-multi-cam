import { describe, it, expect } from 'vitest';
import { computeGridLayout } from '../gridLayout';

describe('computeGridLayout', () => {
  const AR_16_9 = 16 / 9;

  describe('edge cases', () => {
    it('returns empty layout for 0 tiles', () => {
      const result = computeGridLayout(800, 600, 0, AR_16_9);
      expect(result.tiles).toEqual([]);
      expect(result.gridWidth).toBe(0);
      expect(result.gridHeight).toBe(0);
      expect(result.columns).toBe(0);
      expect(result.rows).toBe(0);
    });

    it('returns zero-dimension tiles for containerWidth of 0', () => {
      const result = computeGridLayout(0, 600, 4, AR_16_9);
      for (const tile of result.tiles) {
        expect(tile.width).toBe(0);
        expect(tile.height).toBe(0);
      }
    });

    it('returns zero-dimension tiles for containerHeight of 0', () => {
      const result = computeGridLayout(800, 0, 4, AR_16_9);
      for (const tile of result.tiles) {
        expect(tile.width).toBe(0);
        expect(tile.height).toBe(0);
      }
    });
  });

  describe('single tile', () => {
    it('returns 1 tile filling the entire container', () => {
      const result = computeGridLayout(800, 600, 1, AR_16_9);
      expect(result.tiles).toHaveLength(1);
      expect(result.columns).toBe(1);
      expect(result.rows).toBe(1);

      const tile = result.tiles[0];
      // Full cell: 800x600 (CSS object-fit handles aspect ratio)
      expect(tile.width).toBe(800);
      expect(tile.height).toBe(600);
      expect(tile.x).toBe(0);
      expect(tile.y).toBe(0);
    });
  });

  describe('two tiles', () => {
    it('returns 2 tiles stacked vertically (1 col x 2 rows)', () => {
      const result = computeGridLayout(800, 600, 2, AR_16_9);
      expect(result.tiles).toHaveLength(2);

      // 1 col x 2 rows wins by AR-area optimization:
      //   cell=800x300, AR-constrained area=533.33*300*2=320,000
      // vs 2 cols x 1 row:
      //   cell=400x600, AR-constrained area=400*225*2=180,000
      expect(result.columns).toBe(1);
      expect(result.rows).toBe(2);

      // Full cell dimensions
      const [tile0, tile1] = result.tiles;
      expect(tile0.width).toBe(800);
      expect(tile0.height).toBe(300);
      expect(tile0.x).toBe(0);
      expect(tile0.y).toBe(0);
      expect(tile1.width).toBe(800);
      expect(tile1.height).toBe(300);
      expect(tile1.x).toBe(0);
      expect(tile1.y).toBe(300);
    });
  });

  describe('four tiles', () => {
    it('returns 4 tiles in a 2x2 grid with full cell dimensions', () => {
      const result = computeGridLayout(800, 600, 4, AR_16_9);
      expect(result.tiles).toHaveLength(4);
      expect(result.columns).toBe(2);
      expect(result.rows).toBe(2);

      // Full cell: 400x300
      for (const tile of result.tiles) {
        expect(tile.width).toBe(400);
        expect(tile.height).toBe(300);
      }
    });
  });

  describe('three tiles', () => {
    it('returns 3 tiles in 2x2 grid with last tile centered', () => {
      const result = computeGridLayout(800, 600, 3, AR_16_9);
      expect(result.tiles).toHaveLength(3);

      // 2 cols x 2 rows wins (same area optimization as before)
      expect(result.columns).toBe(2);
      expect(result.rows).toBe(2);

      // Full cell: 400x300
      const [tile0, tile1, tile2] = result.tiles;
      expect(tile0.width).toBe(400);
      expect(tile0.height).toBe(300);
      expect(tile0.x).toBe(0);
      expect(tile0.y).toBe(0);

      expect(tile1.width).toBe(400);
      expect(tile1.height).toBe(300);
      expect(tile1.x).toBe(400);
      expect(tile1.y).toBe(0);

      // Last row: 1 tile centered. Extra offset = (1 empty * 400) / 2 = 200
      expect(tile2.width).toBe(400);
      expect(tile2.height).toBe(300);
      expect(tile2.x).toBe(200);
      expect(tile2.y).toBe(300);
    });
  });

  describe('six tiles', () => {
    it('returns 6 tiles in optimal arrangement with full cell dimensions', () => {
      const result = computeGridLayout(800, 600, 6, AR_16_9);
      expect(result.tiles).toHaveLength(6);

      // 2 cols x 3 rows wins by AR-area optimization
      expect(result.columns).toBe(2);
      expect(result.rows).toBe(3);

      // Full cell: 400x200
      for (const tile of result.tiles) {
        expect(tile.width).toBe(400);
        expect(tile.height).toBe(200);
      }
    });
  });

  describe('coordinate properties', () => {
    it('all tile positions are non-negative integers', () => {
      for (let n = 1; n <= 8; n++) {
        const result = computeGridLayout(800, 600, n, AR_16_9);
        for (const tile of result.tiles) {
          expect(tile.x).toBeGreaterThanOrEqual(0);
          expect(tile.y).toBeGreaterThanOrEqual(0);
          expect(tile.width).toBeGreaterThan(0);
          expect(tile.height).toBeGreaterThan(0);
          expect(Number.isInteger(tile.x)).toBe(true);
          expect(Number.isInteger(tile.y)).toBe(true);
          expect(Number.isInteger(tile.width)).toBe(true);
          expect(Number.isInteger(tile.height)).toBe(true);
        }
      }
    });

    it('all tiles have identical width and height within a layout', () => {
      for (let n = 1; n <= 8; n++) {
        const result = computeGridLayout(800, 600, n, AR_16_9);
        const { width, height } = result.tiles[0];
        for (const tile of result.tiles) {
          expect(tile.width).toBe(width);
          expect(tile.height).toBe(height);
        }
      }
    });

    it('tiles do not overlap', () => {
      for (let n = 1; n <= 8; n++) {
        const result = computeGridLayout(800, 600, n, AR_16_9);
        for (let i = 0; i < result.tiles.length; i++) {
          for (let j = i + 1; j < result.tiles.length; j++) {
            const a = result.tiles[i];
            const b = result.tiles[j];
            const overlapX = a.x < b.x + b.width && a.x + a.width > b.x;
            const overlapY = a.y < b.y + b.height && a.y + a.height > b.y;
            expect(overlapX && overlapY).toBe(false);
          }
        }
      }
    });

    it('tiles fit within container bounds', () => {
      const W = 800;
      const H = 600;
      for (let n = 1; n <= 8; n++) {
        const result = computeGridLayout(W, H, n, AR_16_9);
        for (const tile of result.tiles) {
          expect(tile.x + tile.width).toBeLessThanOrEqual(W + 1); // +1 for rounding tolerance
          expect(tile.y + tile.height).toBeLessThanOrEqual(H + 1);
        }
      }
    });

    it('grid fills the container (no centering gap for full-cell tiles)', () => {
      const result = computeGridLayout(800, 600, 1, AR_16_9);
      const tile = result.tiles[0];
      // Single tile fills the entire container
      expect(tile.x).toBe(0);
      expect(tile.y).toBe(0);
      expect(tile.width).toBe(800);
      expect(tile.height).toBe(600);
    });

    it('last row is centered when incomplete', () => {
      // 5 tiles in 800x600: 3 cols x 2 rows or 2 cols x 3 rows
      const result = computeGridLayout(800, 600, 5, AR_16_9);
      const { columns, rows, tiles } = result;
      const tilesInLastRow = 5 - (rows - 1) * columns;

      if (tilesInLastRow < columns) {
        // Last row tiles should be centered
        const lastRowTiles = tiles.slice(-tilesInLastRow);
        const firstLastRowX = lastRowTiles[0].x;
        const lastLastRowRight = lastRowTiles[tilesInLastRow - 1].x + lastRowTiles[tilesInLastRow - 1].width;
        const leftGap = firstLastRowX;
        const rightGap = 800 - lastLastRowRight;
        // Left and right gaps should be approximately equal (within rounding)
        expect(Math.abs(leftGap - rightGap)).toBeLessThanOrEqual(2);
      }
    });
  });

  describe('different aspect ratios', () => {
    it('handles 4:3 aspect ratio', () => {
      const result = computeGridLayout(800, 600, 4, 4 / 3);
      expect(result.tiles).toHaveLength(4);
      // 2x2 grid: full cell = 400x300
      expect(result.columns).toBe(2);
      expect(result.rows).toBe(2);
      expect(result.tiles[0].width).toBe(400);
      expect(result.tiles[0].height).toBe(300);
    });

    it('handles 1:1 (square) aspect ratio', () => {
      const result = computeGridLayout(800, 600, 4, 1);
      expect(result.tiles).toHaveLength(4);
      // 2x2 grid: full cell = 400x300 (object-fit handles square display)
      expect(result.tiles[0].width).toBe(400);
      expect(result.tiles[0].height).toBe(300);
    });
  });

  describe('eight tiles', () => {
    it('handles max tile count of 8', () => {
      const result = computeGridLayout(1920, 1080, 8, AR_16_9);
      expect(result.tiles).toHaveLength(8);
      // Should find optimal arrangement for 8 tiles in 1920x1080
      // All tiles should be valid
      for (const tile of result.tiles) {
        expect(tile.width).toBeGreaterThan(0);
        expect(tile.height).toBeGreaterThan(0);
        expect(tile.x).toBeGreaterThanOrEqual(0);
        expect(tile.y).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('return types', () => {
    it('returns LayoutResult with all required fields', () => {
      const result = computeGridLayout(800, 600, 4, AR_16_9);
      expect(result).toHaveProperty('tiles');
      expect(result).toHaveProperty('gridWidth');
      expect(result).toHaveProperty('gridHeight');
      expect(result).toHaveProperty('columns');
      expect(result).toHaveProperty('rows');
      expect(Array.isArray(result.tiles)).toBe(true);
      expect(typeof result.gridWidth).toBe('number');
      expect(typeof result.gridHeight).toBe('number');
      expect(typeof result.columns).toBe('number');
      expect(typeof result.rows).toBe('number');
    });

    it('each tile has x, y, width, height', () => {
      const result = computeGridLayout(800, 600, 4, AR_16_9);
      for (const tile of result.tiles) {
        expect(tile).toHaveProperty('x');
        expect(tile).toHaveProperty('y');
        expect(tile).toHaveProperty('width');
        expect(tile).toHaveProperty('height');
      }
    });
  });
});
