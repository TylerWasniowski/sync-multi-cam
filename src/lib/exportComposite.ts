/**
 * FFmpeg filtergraph builder for composite video export.
 *
 * Converts grid tile positions + resolution + audio config into a complete
 * FFmpeg args array. The xstack filter_complex generation is the heart of
 * composite export, isolated as pure functions for thorough unit testing.
 */

import type { GridTile } from './gridLayout';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExportConfig {
  width: number;
  height: number;
  fps: number;
  crf: number;
}

export type AudioConfig =
  | { mode: 'single'; trackIndex: number }
  | { mode: 'mix'; trackIndices: number[] }
  | { mode: 'none' };

export const EXPORT_RESOLUTIONS = {
  '4K': { width: 3840, height: 2160, label: '4K' },
  '1080p': { width: 1920, height: 1080, label: '1080p' },
  '720p': { width: 1280, height: 720, label: '720p' },
} as const;

export type ResolutionKey = keyof typeof EXPORT_RESOLUTIONS;
