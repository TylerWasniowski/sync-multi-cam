import { describe, it, expect } from 'vitest';
import {
  EXPORT_RESOLUTIONS,
  buildFilterComplex,
  buildAudioArgs,
  buildExportArgs,
  type ExportConfig,
  type AudioConfig,
  type ResolutionKey,
} from './exportComposite';
import type { ExportState } from '../types';
import { computeGridLayout } from './gridLayout';

describe('Export types and resolution presets', () => {
  it('ExportConfig has width, height, fps, and crf fields', () => {
    const config: ExportConfig = { width: 1920, height: 1080, fps: 30, crf: 23 };
    expect(config.width).toBe(1920);
    expect(config.height).toBe(1080);
    expect(config.fps).toBe(30);
    expect(config.crf).toBe(23);
  });

  it('AudioConfig discriminated union supports single, mix, and none modes', () => {
    const single: AudioConfig = { mode: 'single', trackIndex: 0 };
    const mix: AudioConfig = { mode: 'mix', trackIndices: [0, 1, 2] };
    const none: AudioConfig = { mode: 'none' };
    expect(single.mode).toBe('single');
    expect(mix.mode).toBe('mix');
    expect(none.mode).toBe('none');
  });

  it('EXPORT_RESOLUTIONS has 4K, 1080p, and 720p entries with correct dimensions', () => {
    expect(EXPORT_RESOLUTIONS['4K']).toEqual({ width: 3840, height: 2160, label: '4K' });
    expect(EXPORT_RESOLUTIONS['1080p']).toEqual({ width: 1920, height: 1080, label: '1080p' });
    expect(EXPORT_RESOLUTIONS['720p']).toEqual({ width: 1280, height: 720, label: '720p' });
  });

  it('ResolutionKey is a valid key of EXPORT_RESOLUTIONS', () => {
    const key: ResolutionKey = '1080p';
    const resolution = EXPORT_RESOLUTIONS[key];
    expect(resolution.width).toBe(1920);
  });

  it('ExportState type covers all expected states', () => {
    const states: ExportState[] = ['idle', 'preparing', 'encoding', 'complete', 'error'];
    expect(states).toHaveLength(5);
  });
});

describe('buildFilterComplex', () => {
  it('generates correct scale + xstack for 2 cameras at 1920x1080', () => {
    const layout = computeGridLayout(1920, 1080, 2, 16 / 9);
    const result = buildFilterComplex(layout.tiles, 2);

    // Should have 2 scale filters and 1 xstack
    for (let i = 0; i < 2; i++) {
      expect(result).toContain(`[${i}:v]scale=`);
      expect(result).toContain(`,setsar=1[v${i}]`);
    }
    expect(result).toContain('xstack=inputs=2');
    expect(result).toContain(':fill=black[vout]');

    // All dimensions in scale filters should be even
    const scaleMatches = result.matchAll(/scale=(\d+):(\d+)/g);
    for (const match of scaleMatches) {
      expect(Number(match[1]) % 2).toBe(0);
      expect(Number(match[2]) % 2).toBe(0);
    }
  });

  it('generates correct positions for 3 cameras at 1280x720 (incomplete last row)', () => {
    const layout = computeGridLayout(1280, 720, 3, 16 / 9);
    const result = buildFilterComplex(layout.tiles, 3);

    // Should have 3 scale filters
    for (let i = 0; i < 3; i++) {
      expect(result).toContain(`[${i}:v]scale=`);
    }
    expect(result).toContain('xstack=inputs=3');

    // xstack layout should contain tile positions from layout
    const layoutMatch = result.match(/layout=([^:]+):fill/);
    expect(layoutMatch).not.toBeNull();
    const positions = layoutMatch![1].split('|');
    expect(positions).toHaveLength(3);

    // Each position should be x_y format matching tile positions
    for (let i = 0; i < 3; i++) {
      expect(positions[i]).toBe(`${layout.tiles[i].x}_${layout.tiles[i].y}`);
    }
  });

  it('rounds odd tile dimensions to even using bitwise AND ~1', () => {
    // Create tiles with odd dimensions
    const oddTiles = [
      { x: 0, y: 0, width: 641, height: 361 },
      { x: 641, y: 0, width: 641, height: 361 },
    ];
    const result = buildFilterComplex(oddTiles, 2);

    // 641 & ~1 = 640, 361 & ~1 = 360
    expect(result).toContain('scale=640:360');
    // Should NOT contain the odd dimensions
    expect(result).not.toContain('scale=641');
    expect(result).not.toContain(':361');
  });

  it('handles 1 camera (single scale + trivial xstack)', () => {
    const layout = computeGridLayout(1920, 1080, 1, 16 / 9);
    const result = buildFilterComplex(layout.tiles, 1);

    expect(result).toContain('[0:v]scale=');
    expect(result).toContain('xstack=inputs=1');
    expect(result).toContain('[vout]');
  });
});

describe('buildAudioArgs', () => {
  it('single track returns -map N:a', () => {
    const result = buildAudioArgs({ mode: 'single', trackIndex: 2 }, 4);
    expect(result.filterParts).toEqual([]);
    expect(result.mapArgs).toEqual(['-map', '2:a']);
  });

  it('mix multiple tracks returns amix filter with normalize=0', () => {
    const result = buildAudioArgs({ mode: 'mix', trackIndices: [0, 1, 3] }, 4);
    expect(result.filterParts).toHaveLength(1);
    expect(result.filterParts[0]).toContain('amix=inputs=3');
    expect(result.filterParts[0]).toContain('normalize=0');
    expect(result.filterParts[0]).toContain('duration=longest');
    expect(result.filterParts[0]).toContain('[aout]');
    expect(result.mapArgs).toEqual(['-map', '[aout]']);
  });

  it('mix with empty array returns -an (no audio)', () => {
    const result = buildAudioArgs({ mode: 'mix', trackIndices: [] }, 4);
    expect(result.filterParts).toEqual([]);
    expect(result.mapArgs).toEqual(['-an']);
  });

  it('mix with single element optimizes to direct map (no amix)', () => {
    const result = buildAudioArgs({ mode: 'mix', trackIndices: [2] }, 4);
    expect(result.filterParts).toEqual([]);
    expect(result.mapArgs).toEqual(['-map', '2:a']);
  });

  it('mode none returns -an', () => {
    const result = buildAudioArgs({ mode: 'none' }, 4);
    expect(result.filterParts).toEqual([]);
    expect(result.mapArgs).toEqual(['-an']);
  });
});

describe('buildExportArgs', () => {
  it('assembles full args for 4 cameras at 1080p with single audio', () => {
    const layout = computeGridLayout(1920, 1080, 4, 16 / 9);
    const config: ExportConfig = { width: 1920, height: 1080, fps: 30, crf: 23 };
    const audio: AudioConfig = { mode: 'single', trackIndex: 0 };

    const args = buildExportArgs(layout.tiles, config, 4, audio);

    // Should have 4 -i pairs (8 args)
    const iFlags = args.filter((a) => a === '-i');
    expect(iFlags).toHaveLength(4);

    // Should contain -filter_complex
    expect(args).toContain('-filter_complex');

    // Should have video codec args
    expect(args).toContain('-c:v');
    expect(args).toContain('libx264');
    expect(args).toContain('-preset');
    expect(args).toContain('fast');
    expect(args).toContain('-crf');
    expect(args).toContain('23');
    expect(args).toContain('-r');
    expect(args).toContain('30');
    expect(args).toContain('-pix_fmt');
    expect(args).toContain('yuv420p');
    expect(args).toContain('-movflags');
    expect(args).toContain('+faststart');

    // Should map vout
    expect(args).toContain('-map');
    expect(args).toContain('[vout]');

    // Should map audio track 0
    expect(args).toContain('0:a');

    // Should end with output filename
    expect(args[args.length - 1]).toBe('composite_output.mp4');
  });

  it('assembles args for 1 camera (degenerate case)', () => {
    const layout = computeGridLayout(1920, 1080, 1, 16 / 9);
    const config: ExportConfig = { width: 1920, height: 1080, fps: 30, crf: 23 };
    const audio: AudioConfig = { mode: 'single', trackIndex: 0 };

    const args = buildExportArgs(layout.tiles, config, 1, audio);

    // Should have 1 -i pair
    const iFlags = args.filter((a) => a === '-i');
    expect(iFlags).toHaveLength(1);

    // Should still have filter_complex with xstack
    const fcIdx = args.indexOf('-filter_complex');
    expect(fcIdx).toBeGreaterThan(-1);
    expect(args[fcIdx + 1]).toContain('xstack=inputs=1');

    expect(args[args.length - 1]).toBe('composite_output.mp4');
  });

  it('uses -an when audio mode is none', () => {
    const layout = computeGridLayout(1920, 1080, 2, 16 / 9);
    const config: ExportConfig = { width: 1920, height: 1080, fps: 30, crf: 23 };
    const audio: AudioConfig = { mode: 'none' };

    const args = buildExportArgs(layout.tiles, config, 2, audio);
    expect(args).toContain('-an');
  });

  it('includes amix filter in -filter_complex when audio mode is mix', () => {
    const layout = computeGridLayout(1920, 1080, 3, 16 / 9);
    const config: ExportConfig = { width: 1920, height: 1080, fps: 30, crf: 23 };
    const audio: AudioConfig = { mode: 'mix', trackIndices: [0, 1, 2] };

    const args = buildExportArgs(layout.tiles, config, 3, audio);

    const fcIdx = args.indexOf('-filter_complex');
    const filterComplex = args[fcIdx + 1];

    // filter_complex should contain both video (xstack) and audio (amix) parts
    expect(filterComplex).toContain('xstack');
    expect(filterComplex).toContain('amix');
    expect(args).toContain('[aout]');
  });
});
