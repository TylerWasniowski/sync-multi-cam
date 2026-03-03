import { describe, it, expect } from 'vitest';
import {
  EXPORT_RESOLUTIONS,
  type ExportConfig,
  type AudioConfig,
  type ResolutionKey,
} from './exportComposite';
import type { ExportState } from '../types';

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
