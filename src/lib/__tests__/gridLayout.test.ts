import { describe, it, expect } from 'vitest';
import { computeGridLayout, GridTile, LayoutResult } from '../gridLayout';

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
    it('returns 1 tile centered, filling the width at 16:9 ratio', () => {
      const result = computeGridLayout(800, 600, 1, AR_16_9);
      expect(result.tiles).toHaveLength(1);
      expect(result.columns).toBe(1);
      expect(result.rows).toBe(1);

      const tile = result.tiles[0];
      // At 16:9 in an 800x600 container:
      // Width-constrained: tileWidth=800, tileHeight=800/(16/9)=450
      // 450 <= 600, so it fits
      expect(tile.width).toBe(800);
      expect(tile.height).toBe(450);
      // Centered vertically: (600 - 450) / 2 = 75
      expect(tile.x).toBe(0);
      expect(tile.y).toBe(75);
    });
  });

  describe('two tiles', () => {
    it('returns 2 tiles side-by-side (2 cols x 1 row)', () => {
      const result = computeGridLayout(800, 600, 2, AR_16_9);
      expect(result.tiles).toHaveLength(2);

      // 2 cols x 1 row: maxTileWidth=400, maxTileHeight=600
      // Width-constrained: tileWidth=400, tileHeight=400/(16/9)=225
      // Area = 400*225*2 = 180,000
      // 1 col x 2 rows: maxTileWidth=800, maxTileHeight=300
      // Height-constrained: tileHeight=300, tileWidth=300*(16/9)=533.33
      // But 533.33 < 800, so width-constrained doesn't apply
      // Area = 533.33*300*2 = 320,000
      // Actually 1 col x 2 rows wins because more total area
      // Let's check: for 1 col x 2 rows, tileWidth = min(800, 300*16/9) = min(800, 533.33) = 533.33
      // But wait: 800/533.33 > 16/9 means height-constrained
      // tileHeight = 300, tileWidth = 300 * (16/9) = 533.33
      // Area per tile = 533.33 * 300 = 160,000, total = 320,000
      //
      // For 2 cols x 1 row: maxTileWidth=400, maxTileHeight=600
      // 400/600 = 0.667 < 16/9=1.778, so width-constrained
      // tileWidth=400, tileHeight=400/(16/9) = 225
      // Area per tile = 400*225 = 90,000, total = 180,000
      //
      // 1 col x 2 rows wins with 320,000 total area
      expect(result.columns).toBe(1);
      expect(result.rows).toBe(2);

      // Tiles should be stacked vertically, centered horizontally
      const [tile0, tile1] = result.tiles;
      const expectedW = Math.round(300 * (16 / 9)); // 533
      const expectedH = 300;
      expect(tile0.width).toBe(expectedW);
      expect(tile0.height).toBe(expectedH);
      expect(tile1.width).toBe(expectedW);
      expect(tile1.height).toBe(expectedH);

      // Centered horizontally: offset = (800 - 533) / 2 = 133.5 -> rounds to 134
      const expectedOffsetX = Math.round((800 - expectedW) / 2);
      expect(tile0.x).toBe(expectedOffsetX);
      expect(tile0.y).toBe(0);
      expect(tile1.x).toBe(expectedOffsetX);
      expect(tile1.y).toBe(300);
    });
  });

  describe('four tiles', () => {
    it('returns 4 tiles in a 2x2 grid', () => {
      const result = computeGridLayout(800, 600, 4, AR_16_9);
      expect(result.tiles).toHaveLength(4);
      expect(result.columns).toBe(2);
      expect(result.rows).toBe(2);

      // 2 cols x 2 rows: maxTileWidth=400, maxTileHeight=300
      // 400/300 = 1.333 < 16/9 = 1.778, so width-constrained
      // tileWidth=400, tileHeight=400/(16/9)=225
      // Area = 400*225*4 = 360,000
      for (const tile of result.tiles) {
        expect(tile.width).toBe(400);
        expect(tile.height).toBe(225);
      }
    });
  });

  describe('three tiles', () => {
    it('returns 3 tiles in optimal arrangement maximizing tile area', () => {
      const result = computeGridLayout(800, 600, 3, AR_16_9);
      expect(result.tiles).toHaveLength(3);

      // Options:
      // 1 col x 3 rows: maxTileW=800, maxTileH=200
      //   800/200=4 > 1.778, height-constrained: tileH=200, tileW=200*1.778=355.56
      //   Area = 355.56*200*3 = 213,333
      // 2 cols x 2 rows: maxTileW=400, maxTileH=300
      //   400/300=1.333 < 1.778, width-constrained: tileW=400, tileH=225
      //   Area = 400*225*3 = 270,000
      // 3 cols x 1 row: maxTileW=266.67, maxTileH=600
      //   266.67/600=0.444 < 1.778, width-constrained: tileW=266.67, tileH=150
      //   Area = 266.67*150*3 = 120,000
      // Winner: 2 cols x 2 rows with area 270,000
      expect(result.columns).toBe(2);
      expect(result.rows).toBe(2);
    });
  });

  describe('six tiles', () => {
    it('returns 6 tiles in optimal arrangement', () => {
      const result = computeGridLayout(800, 600, 6, AR_16_9);
      expect(result.tiles).toHaveLength(6);

      // Options (checking key ones):
      // 2 cols x 3 rows: maxTileW=400, maxTileH=200
      //   400/200=2 > 1.778, height-constrained: tileH=200, tileW=200*1.778=355.56
      //   Area = 355.56*200*6 = 426,667
      // 3 cols x 2 rows: maxTileW=266.67, maxTileH=300
      //   266.67/300=0.889 < 1.778, width-constrained: tileW=266.67, tileH=150
      //   Area = 266.67*150*6 = 240,000
      // Winner: 2 cols x 3 rows
      expect(result.columns).toBe(2);
      expect(result.rows).toBe(3);
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

    it('grid is centered within the container', () => {
      const result = computeGridLayout(800, 600, 1, AR_16_9);
      // Single tile: 800x450, centered in 800x600
      // offsetX = 0, offsetY = 75
      const tile = result.tiles[0];
      const rightGap = 800 - (tile.x + tile.width);
      const bottomGap = 600 - (tile.y + tile.height);
      // Symmetric centering: left gap ~= right gap, top gap ~= bottom gap
      expect(Math.abs(tile.x - rightGap)).toBeLessThanOrEqual(1); // rounding tolerance
      expect(Math.abs(tile.y - bottomGap)).toBeLessThanOrEqual(1);
    });
  });

  describe('different aspect ratios', () => {
    it('handles 4:3 aspect ratio', () => {
      const result = computeGridLayout(800, 600, 4, 4 / 3);
      expect(result.tiles).toHaveLength(4);
      // 2x2: maxTileW=400, maxTileH=300
      // 400/300=1.333 > 4/3=1.333 -- exactly equal, width-constrained
      // tileW=400, tileH=300
      expect(result.columns).toBe(2);
      expect(result.rows).toBe(2);
      expect(result.tiles[0].width).toBe(400);
      expect(result.tiles[0].height).toBe(300);
    });

    it('handles 1:1 (square) aspect ratio', () => {
      const result = computeGridLayout(800, 600, 4, 1);
      expect(result.tiles).toHaveLength(4);
      // 2x2: maxTileW=400, maxTileH=300
      // 400/300=1.333 > 1, height-constrained: tileH=300, tileW=300
      expect(result.tiles[0].width).toBe(300);
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
