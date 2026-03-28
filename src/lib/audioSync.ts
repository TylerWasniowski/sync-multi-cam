import SynAudio from 'synaudio';
import { SYNC_SAMPLE_RATE, CORRELATION_SAMPLE_SIZE, INITIAL_GRANULARITY } from './constants.ts';
import type { AudioData, SyncResult } from '../types/index.ts';

export type { SyncResult };

/**
 * Format offset seconds as human-readable timecode.
 * Example: 2.345 -> "+2.345s", -0.51 -> "-0.510s"
 */
export function formatOffset(seconds: number): string {
  const sign = seconds >= 0 ? '+' : '';
  return `${sign}${seconds.toFixed(3)}s`;
}

/**
 * Format seconds as NLE-style timecode: HH:MM:SS:FF @ {fps}fps
 * Uses 30fps as default (NTSC standard, most common NLE timeline).
 */
export function formatNLETimecode(seconds: number, fps: number = 30): string {
  const abs = Math.abs(seconds);
  const totalFrames = Math.round(abs * fps);
  const ff = totalFrames % fps;
  const totalSecs = Math.floor(totalFrames / fps);
  const ss = totalSecs % 60;
  const mm = Math.floor(totalSecs / 60) % 60;
  const hh = Math.floor(totalSecs / 3600);
  const pad2 = (n: number) => String(n).padStart(2, '0');
  return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}:${pad2(ff)} @ ${fps}fps`;
}

/**
 * Classify confidence percentage into display level.
 * high (>=70): Strong correlation, reliable sync
 * medium (40-69): Decent correlation, likely correct
 * low (<40): Weak correlation, may be inaccurate
 */
export function getConfidenceLevel(confidence: number): 'high' | 'medium' | 'low' {
  if (confidence >= 70) return 'high';
  if (confidence >= 40) return 'medium';
  return 'low';
}

/**
 * Correlate all audio tracks to find time offsets.
 * Selects longest track as reference, correlates all others against it.
 *
 * Uses SynAudio's WASM SIMD Pearson correlation via Web Workers
 * (syncWorkerConcurrent) to avoid blocking the main thread.
 */
export async function syncAudioTracks(
  tracks: { fileId: string; fileName: string; audio: AudioData }[],
  onProgress?: (progress: number) => void
): Promise<SyncResult[]> {
  if (tracks.length < 2) {
    throw new Error('At least 2 audio tracks required for sync');
  }

  // Select longest track as reference (SYNC-03)
  // SynAudio requires comparison clips to be subsets of the base clip
  const sorted = [...tracks].sort(
    (a, b) => b.audio.samplesDecoded - a.audio.samplesDecoded
  );
  const reference = sorted[0];
  const comparisons = sorted.slice(1);

  // Initialize SynAudio — uses syncWorker (single Web Worker) to avoid
  // a chunking bug in syncWorkerConcurrent that returns zero offsets
  const synAudio = new SynAudio({
    correlationSampleSize: CORRELATION_SAMPLE_SIZE,
    initialGranularity: INITIAL_GRANULARITY,
  });

  // Reference always has 0 offset and 100% confidence
  const results: SyncResult[] = [
    {
      fileId: reference.fileId,
      fileName: reference.fileName,
      offsetSeconds: 0,
      offsetSamples: 0,
      confidence: 100,
      isReference: true,
    },
  ];

  // Correlate each comparison track against reference sequentially
  // Using syncWorkerConcurrent for each pair (runs in Web Workers, does not block UI)
  for (let i = 0; i < comparisons.length; i++) {
    const track = comparisons[i];

    const { sampleOffset, correlation } = await synAudio.syncWorker(
      {
        channelData: reference.audio.channelData,
        samplesDecoded: reference.audio.samplesDecoded,
      },
      {
        channelData: track.audio.channelData,
        samplesDecoded: track.audio.samplesDecoded,
      },
    );

    results.push({
      fileId: track.fileId,
      fileName: track.fileName,
      offsetSeconds: sampleOffset / SYNC_SAMPLE_RATE,
      offsetSamples: sampleOffset,
      confidence: Math.round(Math.abs(correlation) * 100),
      isReference: false,
    });

    onProgress?.(((i + 1) / comparisons.length) * 100);
  }

  return results;
}
