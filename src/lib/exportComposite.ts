/**
 * Main-thread orchestration for the WebCodecs export pipeline.
 *
 * Creates a dedicated Web Worker (exportWorker.ts), sends typed commands,
 * and relays typed progress/complete/error/cancelled messages back to the
 * UI via callbacks.
 */

import type { ExportWorkerCommand, ExportWorkerMessage, AudioConfig } from '../types/index';

export type { AudioConfig };
export { type ExportWorkerCommand, type ExportWorkerMessage };

export const EXPORT_RESOLUTIONS = {
  '4K': { width: 3840, height: 2160, label: '4K', bitrate: 20_000_000 },
  '1080p': { width: 1920, height: 1080, label: '1080p', bitrate: 8_000_000 },
  '720p': { width: 1280, height: 720, label: '720p', bitrate: 5_000_000 },
} as const;

export type ResolutionKey = keyof typeof EXPORT_RESOLUTIONS;

export interface ExportCallbacks {
  onProgress: (ratio: number) => void;
  onComplete: (data: ArrayBuffer) => void;
  onError: (message: string) => void;
  onCancelled: () => void;
}

let activeWorker: Worker | null = null;

/** Check if WebCodecs is available in this browser */
export function checkWebCodecsSupport(): { supported: boolean; reason?: string } {
  if (typeof VideoEncoder === 'undefined') {
    return {
      supported: false,
      reason: 'WebCodecs API is not available in this browser. Use Chrome or Edge.',
    };
  }
  return { supported: true };
}

/** Start a composite export in a Web Worker */
export function startExport(
  command: Extract<ExportWorkerCommand, { type: 'start' }>,
  callbacks: ExportCallbacks,
): void {
  // Terminate any existing worker
  if (activeWorker) {
    activeWorker.terminate();
    activeWorker = null;
  }

  const worker = new Worker(
    new URL('./exportWorker.ts', import.meta.url),
    { type: 'module' },
  );
  activeWorker = worker;

  worker.onmessage = (e: MessageEvent<ExportWorkerMessage>) => {
    switch (e.data.type) {
      case 'progress':
        callbacks.onProgress(e.data.ratio);
        break;
      case 'complete':
        callbacks.onComplete(e.data.data);
        activeWorker = null;
        worker.terminate();
        break;
      case 'error':
        callbacks.onError(e.data.message);
        activeWorker = null;
        worker.terminate();
        break;
      case 'cancelled':
        callbacks.onCancelled();
        activeWorker = null;
        worker.terminate();
        break;
    }
  };

  worker.onerror = (e) => {
    callbacks.onError(e.message || 'Export worker crashed');
    activeWorker = null;
  };

  worker.postMessage(command);
}

/** Cancel any in-progress export */
export function cancelExport(): void {
  if (activeWorker) {
    activeWorker.postMessage({ type: 'cancel' } satisfies ExportWorkerCommand);
  }
}
