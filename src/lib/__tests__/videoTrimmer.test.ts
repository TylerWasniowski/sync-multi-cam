import { describe, it, expect, vi, beforeEach } from 'vitest';
import { trimVideo, calculateAlignedTrims } from '../videoTrimmer.ts';

// Mock the ffmpeg module
vi.mock('../ffmpeg.ts', () => ({
  getFFmpeg: vi.fn(),
}));

// Mock @ffmpeg/util
vi.mock('@ffmpeg/util', () => ({
  fetchFile: vi.fn(),
}));

// Mock keyframeIndex
vi.mock('../keyframeIndex.ts', () => ({
  getKeyframeTimes: vi.fn(),
}));

describe('trimVideo', () => {
  let mockFFmpeg: {
    writeFile: ReturnType<typeof vi.fn>;
    exec: ReturnType<typeof vi.fn>;
    readFile: ReturnType<typeof vi.fn>;
    deleteFile: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.resetAllMocks();

    mockFFmpeg = {
      writeFile: vi.fn().mockResolvedValue(undefined),
      exec: vi.fn().mockResolvedValue(0),
      readFile: vi.fn().mockResolvedValue(new Uint8Array([0, 0, 0, 1, 2, 3])),
      deleteFile: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      off: vi.fn(),
    };

    const { getFFmpeg } = await import('../ffmpeg.ts');
    vi.mocked(getFFmpeg).mockResolvedValue(mockFFmpeg as never);

    const { fetchFile } = await import('@ffmpeg/util');
    vi.mocked(fetchFile).mockResolvedValue(new Uint8Array([1, 2, 3]));

    const { getKeyframeTimes } = await import('../keyframeIndex.ts');
    // Default: keyframes every ~0.933s
    vi.mocked(getKeyframeTimes).mockResolvedValue([0, 0.933, 1.867, 2.8, 3.733, 4.667]);
  });

  it('returns null without calling ffmpeg.exec when trimSeconds is 0', async () => {
    const file = new File(['test'], 'video.mp4', { type: 'video/mp4' });
    const result = await trimVideo(file, 0);

    expect(result).toBeNull();
    expect(mockFFmpeg.exec).not.toHaveBeenCalled();
  });

  it('calls getKeyframeTimes and uses result for -ss value', async () => {
    const { getKeyframeTimes } = await import('../keyframeIndex.ts');
    vi.mocked(getKeyframeTimes).mockResolvedValue([0, 1.0, 2.0, 3.0]);

    const file = new File(['test'], 'video.mp4', { type: 'video/mp4' });
    await trimVideo(file, 1.5);

    expect(getKeyframeTimes).toHaveBeenCalledWith(file);
    const args = mockFFmpeg.exec.mock.calls[0][0] as string[];
    const ssIndex = args.indexOf('-ss');
    expect(args[ssIndex + 1]).toBe('2'); // First keyframe >= 1.5
  });

  it('snaps to first keyframe >= trimSeconds', async () => {
    const { getKeyframeTimes } = await import('../keyframeIndex.ts');
    vi.mocked(getKeyframeTimes).mockResolvedValue([0, 0.933, 1.867, 2.8]);

    const file = new File(['test'], 'video.mp4', { type: 'video/mp4' });
    await trimVideo(file, 1.0);

    const args = mockFFmpeg.exec.mock.calls[0][0] as string[];
    const ssIndex = args.indexOf('-ss');
    expect(args[ssIndex + 1]).toBe('1.867'); // 1.867 is first >= 1.0
  });

  it('falls back to last keyframe when no keyframe >= trimSeconds', async () => {
    const { getKeyframeTimes } = await import('../keyframeIndex.ts');
    vi.mocked(getKeyframeTimes).mockResolvedValue([0, 1.0, 2.0]);

    const file = new File(['test'], 'video.mp4', { type: 'video/mp4' });
    await trimVideo(file, 5.0);

    const args = mockFFmpeg.exec.mock.calls[0][0] as string[];
    const ssIndex = args.indexOf('-ss');
    expect(args[ssIndex + 1]).toBe('2'); // Last keyframe
  });

  it('exec args contain -c copy and -avoid_negative_ts 1', async () => {
    const file = new File(['test'], 'video.mp4', { type: 'video/mp4' });
    await trimVideo(file, 2.5);

    const args = mockFFmpeg.exec.mock.calls[0][0] as string[];
    expect(args).toContain('-c');
    expect(args[args.indexOf('-c') + 1]).toBe('copy');
    expect(args).toContain('-avoid_negative_ts');
    expect(args[args.indexOf('-avoid_negative_ts') + 1]).toBe('1');
  });

  it('exec args do NOT contain re-encoding flags', async () => {
    const file = new File(['test'], 'video.mp4', { type: 'video/mp4' });
    await trimVideo(file, 2.5);

    const args = mockFFmpeg.exec.mock.calls[0][0] as string[];
    expect(args).not.toContain('-c:v');
    expect(args).not.toContain('-crf');
    expect(args).not.toContain('-preset');
    expect(args).not.toContain('-accurate_seek');
  });

  it('places -ss before -i (input seeking)', async () => {
    const file = new File(['test'], 'video.mp4', { type: 'video/mp4' });
    await trimVideo(file, 2.5);

    const args = mockFFmpeg.exec.mock.calls[0][0] as string[];
    expect(args.indexOf('-ss')).toBeLessThan(args.indexOf('-i'));
  });

  it('cleans up 2 WASM FS files (input + output)', async () => {
    const file = new File(['test'], 'video.mp4', { type: 'video/mp4' });
    await trimVideo(file, 2.5);

    expect(mockFFmpeg.deleteFile).toHaveBeenCalledTimes(2);
  });

  it('cleans up WASM FS even when exec throws', async () => {
    mockFFmpeg.exec.mockRejectedValue(new Error('FFmpeg crashed'));

    const file = new File(['test'], 'video.mp4', { type: 'video/mp4' });
    await expect(trimVideo(file, 2.5)).rejects.toThrow('FFmpeg crashed');

    expect(mockFFmpeg.deleteFile).toHaveBeenCalledTimes(2);
  });

  it('registers progress handler and removes it in finally', async () => {
    const file = new File(['test'], 'video.mp4', { type: 'video/mp4' });
    const onProgress = vi.fn();
    await trimVideo(file, 2.5, onProgress);

    expect(mockFFmpeg.on).toHaveBeenCalledWith('progress', expect.any(Function));
    expect(mockFFmpeg.off).toHaveBeenCalledWith('progress', expect.any(Function));

    const progressOnCall = mockFFmpeg.on.mock.calls.find((c: string[]) => c[0] === 'progress');
    const progressOffCall = mockFFmpeg.off.mock.calls.find((c: string[]) => c[0] === 'progress');
    expect(progressOnCall![1]).toBe(progressOffCall![1]);
  });

  it('removes progress handler even when exec throws', async () => {
    mockFFmpeg.exec.mockRejectedValue(new Error('FFmpeg crashed'));

    const file = new File(['test'], 'video.mp4', { type: 'video/mp4' });
    await expect(trimVideo(file, 2.5, vi.fn())).rejects.toThrow();

    expect(mockFFmpeg.off).toHaveBeenCalledWith('progress', expect.any(Function));
  });

  it('returns a Uint8Array when trimSeconds > 0', async () => {
    const file = new File(['test'], 'video.mp4', { type: 'video/mp4' });
    const result = await trimVideo(file, 2.5);

    expect(result).toBeInstanceOf(Uint8Array);
    expect(result!.length).toBeGreaterThan(0);
  });
});

describe('calculateAlignedTrims', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
  });

  it('equalizes overshoot across files', async () => {
    const { getKeyframeTimes } = await import('../keyframeIndex.ts');
    // File A: keyframes at 0, 1, 2, 3
    // File B: keyframes at 0, 0.5, 1.5, 2.5
    vi.mocked(getKeyframeTimes)
      .mockResolvedValueOnce([0, 1, 2, 3])   // File A
      .mockResolvedValueOnce([0, 0.5, 1.5, 2.5]); // File B

    const fileA = new File(['a'], 'a.mp4', { type: 'video/mp4' });
    const fileB = new File(['b'], 'b.mp4', { type: 'video/mp4' });

    const result = await calculateAlignedTrims([
      { file: fileA, idealTrimSeconds: 0.8 },
      { file: fileB, idealTrimSeconds: 0.3 },
    ]);

    // File A: ideal=0.8, first keyframe>=0.8 → 1.0, overshoot=0.2
    // File B: ideal=0.3, first keyframe>=0.3 → 0.5, overshoot=0.2
    // maxOvershoot=0.2 — both files already at same overshoot
    expect(result).toHaveLength(2);
    expect(result[0].snapTrimSeconds).toBe(1);
    expect(result[1].snapTrimSeconds).toBe(0.5);
  });

  it('reference file (idealTrim=0) snaps to keyframe near maxOvershoot', async () => {
    const { getKeyframeTimes } = await import('../keyframeIndex.ts');
    vi.mocked(getKeyframeTimes)
      .mockResolvedValueOnce([0, 1, 2, 3])   // File A (reference, idealTrim=0)
      .mockResolvedValueOnce([0, 0.5, 1.5, 2.5]); // File B

    const fileA = new File(['a'], 'a.mp4', { type: 'video/mp4' });
    const fileB = new File(['b'], 'b.mp4', { type: 'video/mp4' });

    const result = await calculateAlignedTrims([
      { file: fileA, idealTrimSeconds: 0 },
      { file: fileB, idealTrimSeconds: 1.2 },
    ]);

    // File A: ideal=0, first keyframe>=0 → 0, overshoot=0
    // File B: ideal=1.2, first keyframe>=1.2 → 1.5, overshoot=0.3
    // maxOvershoot=0.3
    // Re-snap A: first keyframe >= 0 + 0.3 = 0.3 → 1
    // B keeps its snap at 1.5 (it defined maxOvershoot)
    expect(result[0].snapTrimSeconds).toBe(1);
    expect(result[1].snapTrimSeconds).toBe(1.5);
  });

  it('returns driftFromIdeal for each file', async () => {
    const { getKeyframeTimes } = await import('../keyframeIndex.ts');
    vi.mocked(getKeyframeTimes)
      .mockResolvedValueOnce([0, 2, 4])
      .mockResolvedValueOnce([0, 2, 4]);

    const fileA = new File(['a'], 'a.mp4', { type: 'video/mp4' });
    const fileB = new File(['b'], 'b.mp4', { type: 'video/mp4' });

    const result = await calculateAlignedTrims([
      { file: fileA, idealTrimSeconds: 1.0 },
      { file: fileB, idealTrimSeconds: 1.5 },
    ]);

    // Both snap to 2 (first keyframe >= ideal), overshoot A=1.0, B=0.5
    // maxOvershoot=1.0, B re-snaps to first >= 1.5+1.0=2.5 → 4
    expect(result[0].driftFromIdeal).toBe(2 - 1.0); // 1.0
    expect(result[1].driftFromIdeal).toBe(4 - 1.5); // 2.5
  });
});
