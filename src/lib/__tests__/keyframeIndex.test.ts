import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getKeyframeTimes } from '../keyframeIndex.ts';

// Mock mp4box
vi.mock('mp4box', () => {
  return {
    createFile: vi.fn(),
  };
});

describe('getKeyframeTimes', () => {
  let mockMp4: {
    onReady: ((info: unknown) => void) | null;
    onError: ((e: string) => void) | null;
    appendBuffer: ReturnType<typeof vi.fn>;
    flush: ReturnType<typeof vi.fn>;
    getTrackSamplesInfo: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.resetAllMocks();

    mockMp4 = {
      onReady: null,
      onError: null,
      appendBuffer: vi.fn(),
      flush: vi.fn(),
      getTrackSamplesInfo: vi.fn(),
    };

    const mp4box = await import('mp4box');
    vi.mocked(mp4box.createFile).mockReturnValue(mockMp4 as never);
  });

  function triggerReady(info: unknown) {
    // appendBuffer/flush trigger parsing; simulate onReady callback
    mockMp4.appendBuffer.mockImplementation(() => {
      if (mockMp4.onReady) mockMp4.onReady(info);
      return 0;
    });
  }

  it('parses keyframe timestamps from sample data', async () => {
    mockMp4.getTrackSamplesInfo.mockReturnValue([
      { is_sync: true, cts: 0, timescale: 1000 },
      { is_sync: false, cts: 500, timescale: 1000 },
      { is_sync: true, cts: 1000, timescale: 1000 },
      { is_sync: false, cts: 1500, timescale: 1000 },
      { is_sync: true, cts: 2000, timescale: 1000 },
    ]);

    triggerReady({ videoTracks: [{ id: 1 }] });

    const file = new File(['test'], 'video.mp4', { type: 'video/mp4' });
    const result = await getKeyframeTimes(file);

    expect(result).toEqual([0, 1, 2]);
  });

  it('returns sorted timestamps', async () => {
    mockMp4.getTrackSamplesInfo.mockReturnValue([
      { is_sync: true, cts: 3000, timescale: 1000 },
      { is_sync: true, cts: 1000, timescale: 1000 },
      { is_sync: true, cts: 2000, timescale: 1000 },
    ]);

    triggerReady({ videoTracks: [{ id: 1 }] });

    const file = new File(['test'], 'video.mp4', { type: 'video/mp4' });
    const result = await getKeyframeTimes(file);

    expect(result).toEqual([1, 2, 3]);
  });

  it('throws on missing video track', async () => {
    triggerReady({ videoTracks: [] });

    const file = new File(['test'], 'video.mp4', { type: 'video/mp4' });
    await expect(getKeyframeTimes(file)).rejects.toThrow('No video track found');
  });

  it('handles single keyframe edge case', async () => {
    mockMp4.getTrackSamplesInfo.mockReturnValue([
      { is_sync: true, cts: 0, timescale: 30000 },
      { is_sync: false, cts: 1001, timescale: 30000 },
    ]);

    triggerReady({ videoTracks: [{ id: 1 }] });

    const file = new File(['test'], 'video.mp4', { type: 'video/mp4' });
    const result = await getKeyframeTimes(file);

    expect(result).toEqual([0]);
  });
});
