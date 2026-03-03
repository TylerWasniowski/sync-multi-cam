/**
 * FFmpeg filtergraph builder and export pipeline for composite video export.
 *
 * Converts grid tile positions + resolution + audio config into a complete
 * FFmpeg args array. The xstack filter_complex generation is the heart of
 * composite export, isolated as pure functions for thorough unit testing.
 *
 * The exportComposite() function orchestrates the full pipeline: MEMFS I/O,
 * FFmpeg exec with progress reporting, and cleanup.
 */

import type { GridTile } from './gridLayout';
import type { DownloadableResult } from '../types/index.ts';
import { getFFmpeg } from './ffmpeg.ts';
import { computeGridLayout } from './gridLayout.ts';

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

// ---------------------------------------------------------------------------
// Audio args builder
// ---------------------------------------------------------------------------

export interface AudioArgsResult {
  filterParts: string[];
  mapArgs: string[];
}

/**
 * Build audio-related FFmpeg args based on audio configuration.
 *
 * - 'single': maps one input's audio stream directly
 * - 'mix': uses amix filter to combine multiple tracks (optimizes single-element to direct map)
 * - 'none': disables audio with -an
 */
export function buildAudioArgs(
  audioConfig: AudioConfig,
  inputCount: number,
): AudioArgsResult {
  switch (audioConfig.mode) {
    case 'single':
      return {
        filterParts: [],
        mapArgs: ['-map', `${audioConfig.trackIndex}:a`],
      };

    case 'mix': {
      const indices = audioConfig.trackIndices;

      // No tracks selected -- disable audio
      if (indices.length === 0) {
        return { filterParts: [], mapArgs: ['-an'] };
      }

      // Single track optimization -- no amix needed
      if (indices.length === 1) {
        return {
          filterParts: [],
          mapArgs: ['-map', `${indices[0]}:a`],
        };
      }

      // Multiple tracks -- amix filter
      const inputs = indices.map((i) => `[${i}:a]`).join('');
      const amix = `${inputs}amix=inputs=${indices.length}:duration=longest:normalize=0[aout]`;
      return {
        filterParts: [amix],
        mapArgs: ['-map', '[aout]'],
      };
    }

    case 'none':
      return { filterParts: [], mapArgs: ['-an'] };
  }
}

// ---------------------------------------------------------------------------
// Video filtergraph builder
// ---------------------------------------------------------------------------

/**
 * Build the -filter_complex string for xstack compositing.
 *
 * For each input: scale to even tile dimensions with setsar=1.
 * Then xstack all scaled inputs using tile x_y positions.
 *
 * @param tiles - Grid tile positions from computeGridLayout
 * @param inputCount - Number of video inputs
 * @returns The filter_complex value string (without the -filter_complex flag)
 */
export function buildFilterComplex(
  tiles: GridTile[],
  inputCount: number,
): string {
  const parts: string[] = [];

  // Scale filters -- round dimensions to even numbers (H.264 requirement)
  for (let i = 0; i < inputCount; i++) {
    const w = tiles[i].width & ~1;
    const h = tiles[i].height & ~1;
    parts.push(`[${i}:v]scale=${w}:${h},setsar=1[v${i}]`);
  }

  // xstack layout string: x_y positions joined by |
  const layout = tiles
    .slice(0, inputCount)
    .map((t) => `${t.x}_${t.y}`)
    .join('|');

  // xstack filter combining all scaled inputs
  const inputs = Array.from({ length: inputCount }, (_, i) => `[v${i}]`).join('');
  parts.push(`${inputs}xstack=inputs=${inputCount}:layout=${layout}:fill=black[vout]`);

  return parts.join(';');
}

// ---------------------------------------------------------------------------
// Full export args assembly
// ---------------------------------------------------------------------------

/**
 * Build complete FFmpeg args array for composite export.
 *
 * Combines: input flags, filter_complex (video + optional audio filters),
 * stream mapping, codec settings, and output filename.
 *
 * @param tiles - Grid tile positions from computeGridLayout
 * @param config - Export configuration (width, height, fps, crf)
 * @param inputCount - Number of video inputs
 * @param audioConfig - Audio configuration
 * @returns Complete FFmpeg args array (without the 'ffmpeg' command itself)
 */
export function buildExportArgs(
  tiles: GridTile[],
  config: ExportConfig,
  inputCount: number,
  audioConfig: AudioConfig,
): string[] {
  const args: string[] = [];

  // Input flags: -i input0.mp4 -i input1.mp4 ...
  for (let i = 0; i < inputCount; i++) {
    args.push('-i', `input${i}.mp4`);
  }

  // Build video filter_complex
  const videoFilter = buildFilterComplex(tiles, inputCount);

  // Build audio args
  const audio = buildAudioArgs(audioConfig, inputCount);

  // Combine video and audio filter parts into single -filter_complex
  const allFilterParts = [videoFilter, ...audio.filterParts];
  args.push('-filter_complex', allFilterParts.join(';'));

  // Map video output
  args.push('-map', '[vout]');

  // Map audio output
  args.push(...audio.mapArgs);

  // Video codec settings
  args.push(
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', String(config.crf),
    '-r', String(config.fps),
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
  );

  // Output filename
  args.push('composite_output.mp4');

  return args;
}

// ---------------------------------------------------------------------------
// Export pipeline
// ---------------------------------------------------------------------------

/**
 * Full composite export pipeline: write inputs to MEMFS, run FFmpeg,
 * report progress, read output, and clean up.
 *
 * @param results - Synced video results with trimmedData or originalFile
 * @param config - Export resolution and codec config
 * @param audioConfig - Which audio tracks to include
 * @param totalDurationSeconds - Total timeline duration (for progress calculation)
 * @param onProgress - Optional callback receiving ratio 0-1
 * @returns Uint8Array of the output MP4
 */
export async function exportComposite(
  results: DownloadableResult[],
  config: ExportConfig,
  audioConfig: AudioConfig,
  totalDurationSeconds: number,
  onProgress?: (ratio: number) => void,
): Promise<Uint8Array> {
  const ffmpeg = await getFFmpeg();

  const inputNames: string[] = [];
  const outputName = 'composite_output.mp4';

  // Progress handler: convert FFmpeg time (microseconds) to 0-1 ratio
  const progressHandler = ({ time }: { progress: number; time: number }) => {
    if (onProgress && time > 0 && totalDurationSeconds > 0) {
      const ratio = Math.min(time / (totalDurationSeconds * 1_000_000), 1);
      onProgress(ratio);
    }
  };

  ffmpeg.on('progress', progressHandler);

  try {
    // 1. Write input files to MEMFS
    for (let i = 0; i < results.length; i++) {
      const name = `input_${i}.mp4`;
      inputNames.push(name);

      const data = results[i].trimmedData
        ?? new Uint8Array(await results[i].originalFile.arrayBuffer());
      await ffmpeg.writeFile(name, data);
    }

    // 2. Compute grid layout at export resolution
    const layout = computeGridLayout(
      config.width,
      config.height,
      results.length,
      16 / 9,
    );

    // 3. Build FFmpeg args
    const args = buildExportArgs(layout.tiles, config, results.length, audioConfig);

    // 4. Execute FFmpeg
    await ffmpeg.exec(args);

    // 5. Read output
    const output = await ffmpeg.readFile(outputName) as Uint8Array;
    return output;
  } finally {
    ffmpeg.off('progress', progressHandler);

    // Clean up all MEMFS files
    for (const name of inputNames) {
      await ffmpeg.deleteFile(name).catch(() => {});
    }
    await ffmpeg.deleteFile(outputName).catch(() => {});
  }
}
