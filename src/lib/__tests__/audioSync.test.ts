import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AudioData } from '../../types/index.ts';
import type { SyncWorkerCommand, SyncWorkerMessage } from '../audioSync.ts';

// ---------------------------------------------------------------------------
// Mock Worker
// ---------------------------------------------------------------------------

// Configurable mock return values
let mockOffsetSamples = 8000;
let mockConfidence = 75;
let mockShouldError = false;
let mockErrorMessage = 'mock error';

// Track worker interactions
let workerInstances: MockWorker[] = [];
let postMessageCalls: { data: SyncWorkerCommand; transfer: Transferable[] }[] = [];

class MockWorker {
  private listeners = new Map<string, Function[]>();
  terminated = false;

  constructor(public url: URL | string, public options?: WorkerOptions) {
    workerInstances.push(this);
  }

  addEventListener(type: string, fn: Function) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type)!.push(fn);
  }

  removeEventListener(type: string, fn: Function) {
    const fns = this.listeners.get(type);
    if (fns) this.listeners.set(type, fns.filter(f => f !== fn));
  }

  postMessage(data: SyncWorkerCommand, transfer?: Transferable[]) {
    postMessageCalls.push({ data, transfer: transfer || [] });

    // Simulate async worker response
    queueMicrotask(() => {
      if (mockShouldError) {
        this.dispatchMessage({ type: 'error', message: mockErrorMessage });
        return;
      }

      if (data.type === 'init') {
        this.dispatchMessage({ type: 'ready' });
      } else if (data.type === 'compare') {
        this.dispatchMessage({
          type: 'result',
          offsetSamples: mockOffsetSamples,
          confidence: mockConfidence,
        });
      }
    });
  }

  private dispatchMessage(data: SyncWorkerMessage) {
    const event = { data } as MessageEvent;
    for (const fn of this.listeners.get('message') || []) {
      fn(event);
    }
  }

  terminate() {
    this.terminated = true;
  }
}

// Stub Worker globally before any imports
vi.stubGlobal('Worker', MockWorker);

function makeTrack(fileId: string, fileName: string, samples: number): {
  fileId: string;
  fileName: string;
  audio: AudioData;
} {
  return {
    fileId,
    fileName,
    audio: {
      channelData: [new Float32Array(samples)],
      samplesDecoded: samples,
      sampleRate: 16000,
    },
  };
}

describe('syncAudioTracks', () => {
  beforeEach(() => {
    vi.resetModules();
    workerInstances = [];
    postMessageCalls = [];
    mockOffsetSamples = 8000;
    mockConfidence = 75;
    mockShouldError = false;
    mockErrorMessage = 'mock error';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('selects the longest track (by samplesDecoded) as reference', async () => {
    const { syncAudioTracks } = await import('../audioSync.ts');

    const tracks = [
      makeTrack('short', 'short.mp4', 16000),
      makeTrack('long', 'long.mp4', 48000),
      makeTrack('medium', 'medium.mp4', 32000),
    ];

    const results = await syncAudioTracks(tracks);
    const ref = results.find((r) => r.isReference);
    expect(ref?.fileId).toBe('long');
  });

  it('reference track gets offsetSeconds=0, confidence=100, isReference=true', async () => {
    const { syncAudioTracks } = await import('../audioSync.ts');

    const tracks = [
      makeTrack('a', 'a.mp4', 32000),
      makeTrack('b', 'b.mp4', 16000),
    ];

    const results = await syncAudioTracks(tracks);
    const ref = results.find((r) => r.isReference);
    expect(ref).toBeDefined();
    expect(ref!.offsetSeconds).toBe(0);
    expect(ref!.offsetSamples).toBe(0);
    expect(ref!.confidence).toBe(100);
    expect(ref!.isReference).toBe(true);
  });

  it('comparison track offsetSeconds = offsetSamples / SYNC_SAMPLE_RATE', async () => {
    const { syncAudioTracks } = await import('../audioSync.ts');

    mockOffsetSamples = 8000;
    mockConfidence = 75;

    const tracks = [
      makeTrack('ref', 'ref.mp4', 48000),
      makeTrack('comp', 'comp.mp4', 16000),
    ];

    const results = await syncAudioTracks(tracks);
    const comp = results.find((r) => !r.isReference);
    expect(comp).toBeDefined();
    // 8000 / 16000 = 0.5 seconds
    expect(comp!.offsetSeconds).toBe(0.5);
    expect(comp!.offsetSamples).toBe(8000);
  });

  it('comparison track confidence comes directly from worker result', async () => {
    const { syncAudioTracks } = await import('../audioSync.ts');

    mockOffsetSamples = 0;
    mockConfidence = 42;

    const tracks = [
      makeTrack('ref', 'ref.mp4', 48000),
      makeTrack('comp', 'comp.mp4', 16000),
    ];

    const results = await syncAudioTracks(tracks);
    const comp = results.find((r) => !r.isReference);
    // Confidence is 0-100 directly from gccPhat, not Math.round(abs(corr) * 100)
    expect(comp!.confidence).toBe(42);
  });

  it('calls onProgress with {current, total} per pair', async () => {
    const { syncAudioTracks } = await import('../audioSync.ts');

    const onProgress = vi.fn();
    const tracks = [
      makeTrack('ref', 'ref.mp4', 48000),
      makeTrack('a', 'a.mp4', 32000),
      makeTrack('b', 'b.mp4', 16000),
    ];

    await syncAudioTracks(tracks, onProgress);

    // 2 comparison tracks: progress at {1,2} and {2,2}
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenCalledWith({ current: 1, total: 2 });
    expect(onProgress).toHaveBeenCalledWith({ current: 2, total: 2 });
  });

  it('throws if fewer than 2 tracks', async () => {
    const { syncAudioTracks } = await import('../audioSync.ts');

    await expect(
      syncAudioTracks([makeTrack('a', 'a.mp4', 16000)])
    ).rejects.toThrow('At least 2 audio tracks required for sync');
  });

  it('creates Worker with module type', async () => {
    const { syncAudioTracks } = await import('../audioSync.ts');

    const tracks = [
      makeTrack('ref', 'ref.mp4', 48000),
      makeTrack('comp', 'comp.mp4', 16000),
    ];

    await syncAudioTracks(tracks);

    expect(workerInstances.length).toBe(1);
    expect(workerInstances[0].options).toEqual({ type: 'module' });
  });

  it('sends init with copied reference buffer before compare', async () => {
    const { syncAudioTracks } = await import('../audioSync.ts');

    const tracks = [
      makeTrack('ref', 'ref.mp4', 48000),
      makeTrack('comp', 'comp.mp4', 16000),
    ];

    await syncAudioTracks(tracks);

    // First message should be 'init', then 'compare'
    expect(postMessageCalls.length).toBe(2);
    expect(postMessageCalls[0].data.type).toBe('init');
    expect(postMessageCalls[1].data.type).toBe('compare');

    // Init should include a Float32Array reference buffer
    const initCmd = postMessageCalls[0].data;
    if (initCmd.type === 'init') {
      expect(initCmd.referenceBuffer).toBeInstanceOf(Float32Array);
      expect(initCmd.sampleRate).toBe(16000);
    }
  });

  it('transfers comparison buffer via Transferable', async () => {
    const { syncAudioTracks } = await import('../audioSync.ts');

    const tracks = [
      makeTrack('ref', 'ref.mp4', 48000),
      makeTrack('comp', 'comp.mp4', 16000),
    ];

    await syncAudioTracks(tracks);

    // Init: reference buffer transferred (after copy)
    expect(postMessageCalls[0].transfer.length).toBe(1);

    // Compare: comparison buffer transferred (zero-copy)
    expect(postMessageCalls[1].transfer.length).toBe(1);
  });

  it('worker is terminated after all comparisons complete', async () => {
    const { syncAudioTracks } = await import('../audioSync.ts');

    const tracks = [
      makeTrack('ref', 'ref.mp4', 48000),
      makeTrack('comp', 'comp.mp4', 16000),
    ];

    await syncAudioTracks(tracks);

    expect(workerInstances.length).toBe(1);
    expect(workerInstances[0].terminated).toBe(true);
  });

  it('handles worker error message', async () => {
    const { syncAudioTracks } = await import('../audioSync.ts');

    mockShouldError = true;
    mockErrorMessage = 'GCC-PHAT computation failed';

    const tracks = [
      makeTrack('ref', 'ref.mp4', 48000),
      makeTrack('comp', 'comp.mp4', 16000),
    ];

    await expect(syncAudioTracks(tracks)).rejects.toThrow(
      'GCC-PHAT computation failed'
    );

    // Worker should still be terminated (via finally block)
    expect(workerInstances[0].terminated).toBe(true);
  });
});

describe('formatOffset', () => {
  it('formats positive offset with + sign', async () => {
    const { formatOffset } = await import('../audioSync.ts');
    expect(formatOffset(2.345)).toBe('+2.345s');
  });

  it('formats negative offset with - sign', async () => {
    const { formatOffset } = await import('../audioSync.ts');
    expect(formatOffset(-0.51)).toBe('-0.510s');
  });

  it('formats zero as +0.000s', async () => {
    const { formatOffset } = await import('../audioSync.ts');
    expect(formatOffset(0)).toBe('+0.000s');
  });
});

describe('getConfidenceLevel', () => {
  it('returns high for >= 70', async () => {
    const { getConfidenceLevel } = await import('../audioSync.ts');
    expect(getConfidenceLevel(75)).toBe('high');
    expect(getConfidenceLevel(70)).toBe('high');
    expect(getConfidenceLevel(100)).toBe('high');
  });

  it('returns medium for 40-69', async () => {
    const { getConfidenceLevel } = await import('../audioSync.ts');
    expect(getConfidenceLevel(55)).toBe('medium');
    expect(getConfidenceLevel(40)).toBe('medium');
    expect(getConfidenceLevel(69)).toBe('medium');
  });

  it('returns low for < 40', async () => {
    const { getConfidenceLevel } = await import('../audioSync.ts');
    expect(getConfidenceLevel(20)).toBe('low');
    expect(getConfidenceLevel(0)).toBe('low');
    expect(getConfidenceLevel(39)).toBe('low');
  });
});
