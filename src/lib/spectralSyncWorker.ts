/**
 * Web Worker: Spectral sync via GCC-PHAT.
 *
 * Receives PCM audio buffers via postMessage and runs gccPhat() from fftEngine.
 * Protocol:
 *   'init'    -> caches reference PCM + sampleRate, responds with 'ready'
 *   'compare' -> runs gccPhat against cached reference, responds with 'result'
 *   errors    -> responds with 'error'
 */

import { gccPhat } from './fftEngine';
import type { SyncWorkerCommand, SyncWorkerMessage } from './audioSync';

let cachedReference: Float32Array | null = null;
let cachedSampleRate = 16000;

self.onmessage = (e: MessageEvent<SyncWorkerCommand>) => {
  const { data } = e;

  switch (data.type) {
    case 'init': {
      cachedReference = data.referenceBuffer;
      cachedSampleRate = data.sampleRate;
      const msg: SyncWorkerMessage = { type: 'ready' };
      self.postMessage(msg);
      break;
    }

    case 'compare': {
      if (!cachedReference) {
        const msg: SyncWorkerMessage = {
          type: 'error',
          message: 'Worker not initialized: call init before compare',
        };
        self.postMessage(msg);
        return;
      }

      try {
        const { offsetSamples, confidence } = gccPhat(
          cachedReference,
          data.comparisonBuffer,
          cachedSampleRate,
          data.maxOffsetSeconds,
        );

        const msg: SyncWorkerMessage = { type: 'result', offsetSamples, confidence };
        self.postMessage(msg);
      } catch (err) {
        const msg: SyncWorkerMessage = {
          type: 'error',
          message: err instanceof Error ? err.message : String(err),
        };
        self.postMessage(msg);
      }
      break;
    }
  }
};
