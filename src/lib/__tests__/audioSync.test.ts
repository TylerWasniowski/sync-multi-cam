import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AudioData } from '../../types/index.ts';

// Mock synaudio before importing the module under test
vi.mock('synaudio', () => {
  const mockSyncWorkerConcurrent = vi.fn();
  const MockSynAudio = vi.fn().mockImplementation(() => ({
    syncWorkerConcurrent: mockSyncWorkerConcurrent,
  }));
  return {
    default: MockSynAudio,
    __mockSyncWorkerConcurrent: mockSyncWorkerConcurrent,
    __MockSynAudio: MockSynAudio,
  };
});

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
  let mockSyncWorkerConcurrent: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetAllMocks();
    const synaudioMock = await import('synaudio');
    mockSyncWorkerConcurrent = (synaudioMock as unknown as { __mockSyncWorkerConcurrent: ReturnType<typeof vi.fn> }).__mockSyncWorkerConcurrent;
    mockSyncWorkerConcurrent.mockResolvedValue({
      sampleOffset: 8000,
      correlation: 0.85,
    });
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

  it('comparison track gets sampleOffset/SYNC_SAMPLE_RATE as offsetSeconds', async () => {
    const { syncAudioTracks } = await import('../audioSync.ts');

    mockSyncWorkerConcurrent.mockResolvedValue({
      sampleOffset: 8000,
      correlation: 0.85,
    });

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

  it('comparison track confidence = Math.round(Math.abs(correlation) * 100)', async () => {
    const { syncAudioTracks } = await import('../audioSync.ts');

    mockSyncWorkerConcurrent.mockResolvedValue({
      sampleOffset: 0,
      correlation: 0.756,
    });

    const tracks = [
      makeTrack('ref', 'ref.mp4', 48000),
      makeTrack('comp', 'comp.mp4', 16000),
    ];

    const results = await syncAudioTracks(tracks);
    const comp = results.find((r) => !r.isReference);
    // Math.round(Math.abs(0.756) * 100) = Math.round(75.6) = 76
    expect(comp!.confidence).toBe(76);
  });

  it('handles negative correlation (inverted signal)', async () => {
    const { syncAudioTracks } = await import('../audioSync.ts');

    mockSyncWorkerConcurrent.mockResolvedValue({
      sampleOffset: 1600,
      correlation: -0.92,
    });

    const tracks = [
      makeTrack('ref', 'ref.mp4', 48000),
      makeTrack('comp', 'comp.mp4', 16000),
    ];

    const results = await syncAudioTracks(tracks);
    const comp = results.find((r) => !r.isReference);
    // Math.round(Math.abs(-0.92) * 100) = 92
    expect(comp!.confidence).toBe(92);
  });

  it('calls onProgress callback with percentage (0-100)', async () => {
    const { syncAudioTracks } = await import('../audioSync.ts');

    const onProgress = vi.fn();
    const tracks = [
      makeTrack('ref', 'ref.mp4', 48000),
      makeTrack('a', 'a.mp4', 32000),
      makeTrack('b', 'b.mp4', 16000),
    ];

    await syncAudioTracks(tracks, onProgress);

    // 2 comparison tracks: progress at 50% and 100%
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenCalledWith(50);
    expect(onProgress).toHaveBeenCalledWith(100);
  });

  it('throws if fewer than 2 tracks', async () => {
    const { syncAudioTracks } = await import('../audioSync.ts');

    await expect(
      syncAudioTracks([makeTrack('a', 'a.mp4', 16000)])
    ).rejects.toThrow('At least 2 audio tracks required for sync');
  });

  it('initializes SynAudio with shared: true', async () => {
    await import('../audioSync.ts');
    const synaudioMock = await import('synaudio');
    const MockSynAudio = (synaudioMock as unknown as { __MockSynAudio: ReturnType<typeof vi.fn> }).__MockSynAudio;

    const tracks = [
      makeTrack('ref', 'ref.mp4', 48000),
      makeTrack('comp', 'comp.mp4', 16000),
    ];

    const { syncAudioTracks } = await import('../audioSync.ts');
    await syncAudioTracks(tracks);

    expect(MockSynAudio).toHaveBeenCalledWith(
      expect.objectContaining({ shared: true })
    );
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
