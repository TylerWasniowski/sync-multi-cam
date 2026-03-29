import { SYNC_SAMPLE_RATE, MAX_SYNC_OFFSET_SECONDS } from './constants.ts';
import type { AudioData, SyncResult } from '../types/index.ts';

export type { SyncResult };

// ---------------------------------------------------------------------------
// Worker message protocol (discriminated unions per D-01/D-02)
// ---------------------------------------------------------------------------

/** Commands sent TO the spectral sync worker */
export type SyncWorkerCommand =
  | { type: 'init'; referenceBuffer: Float32Array; sampleRate: number }
  | { type: 'compare'; comparisonBuffer: Float32Array; maxOffsetSeconds: number };

/** Messages sent FROM the spectral sync worker */
export type SyncWorkerMessage =
  | { type: 'ready' }
  | { type: 'result'; offsetSamples: number; confidence: number }
  | { type: 'error'; message: string };

// ---------------------------------------------------------------------------
// Utility functions (unchanged from previous implementation)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Worker RPC helper
// ---------------------------------------------------------------------------

/**
 * Send a command to the worker and wait for the next response message.
 * Rejects on 'error' type messages or worker.onerror events.
 */
function workerRPC(
  worker: Worker,
  command: SyncWorkerCommand,
  transferable: Transferable[] = [],
): Promise<SyncWorkerMessage> {
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent<SyncWorkerMessage>) => {
      cleanup();
      if (e.data.type === 'error') {
        reject(new Error(e.data.message));
      } else {
        resolve(e.data);
      }
    };

    const onError = (e: ErrorEvent) => {
      cleanup();
      reject(new Error(e.message || 'Worker error'));
    };

    const cleanup = () => {
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
    };

    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    worker.postMessage(command, transferable);
  });
}

// ---------------------------------------------------------------------------
// Main sync function (rewritten to use Web Worker + GCC-PHAT)
// ---------------------------------------------------------------------------

/**
 * Correlate all audio tracks to find time offsets.
 * Selects longest track as reference, correlates all others against it
 * using GCC-PHAT in a dedicated Web Worker.
 *
 * @param tracks - Audio tracks with PCM data
 * @param onProgress - Called after each pair with { current, total } counts
 */
export async function syncAudioTracks(
  tracks: { fileId: string; fileName: string; audio: AudioData }[],
  onProgress?: (info: { current: number; total: number }) => void,
): Promise<SyncResult[]> {
  if (tracks.length < 2) {
    throw new Error('At least 2 audio tracks required for sync');
  }

  // Select longest track as reference
  const sorted = [...tracks].sort(
    (a, b) => b.audio.samplesDecoded - a.audio.samplesDecoded,
  );
  const reference = sorted[0];
  const comparisons = sorted.slice(1);

  // Create worker per sync run (D-01, D-04)
  const worker = new Worker(
    new URL('./spectralSyncWorker.ts', import.meta.url),
    { type: 'module' },
  );

  try {
    // Send init with COPIED reference buffer (D-03: original needed for all comparisons)
    const refCopy = reference.audio.channelData[0].slice();
    await workerRPC(
      worker,
      { type: 'init', referenceBuffer: refCopy, sampleRate: SYNC_SAMPLE_RATE },
      [refCopy.buffer],
    );

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
    for (let i = 0; i < comparisons.length; i++) {
      const track = comparisons[i];

      // Transfer comparison buffer (D-03: zero-copy, used only once)
      const compBuffer = track.audio.channelData[0];
      const response = await workerRPC(
        worker,
        { type: 'compare', comparisonBuffer: compBuffer, maxOffsetSeconds: MAX_SYNC_OFFSET_SECONDS },
        [compBuffer.buffer],
      );

      if (response.type !== 'result') {
        throw new Error('Unexpected worker response');
      }

      results.push({
        fileId: track.fileId,
        fileName: track.fileName,
        offsetSeconds: response.offsetSamples / SYNC_SAMPLE_RATE,
        offsetSamples: response.offsetSamples,
        confidence: response.confidence,
        isReference: false,
      });

      // Per-pair progress (PROG-01, D-11)
      onProgress?.({ current: i + 1, total: comparisons.length });
    }

    return results;
  } finally {
    // Terminate worker after all comparisons (D-04)
    worker.terminate();
  }
}
