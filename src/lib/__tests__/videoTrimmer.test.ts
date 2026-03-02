import { describe, it, expect, vi, beforeEach } from 'vitest';
import { trimVideo } from '../videoTrimmer.ts';

// Mock the ffmpeg module
vi.mock('../ffmpeg.ts', () => ({
  getFFmpeg: vi.fn(),
}));

// Mock @ffmpeg/util
vi.mock('@ffmpeg/util', () => ({
  fetchFile: vi.fn(),
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
  });

  it('returns null without calling ffmpeg.exec when trimSeconds is 0', async () => {
    const file = new File(['test'], 'video.mp4', { type: 'video/mp4' });
    const result = await trimVideo(file, 0);

    expect(result).toBeNull();
    expect(mockFFmpeg.exec).not.toHaveBeenCalled();
  });

  it('calls ffmpeg.exec when trimSeconds > 0', async () => {
    const file = new File(['test'], 'video.mp4', { type: 'video/mp4' });
    await trimVideo(file, 2.5);

    expect(mockFFmpeg.exec).toHaveBeenCalled();
  });

  it('places -ss before -i in the ffmpeg exec args (input seeking)', async () => {
    const file = new File(['test'], 'video.mp4', { type: 'video/mp4' });
    await trimVideo(file, 2.5);

    // Get the fallback exec call args (the one with -ss and -i)
    const calls = mockFFmpeg.exec.mock.calls;
    // Find the call that contains both -ss and -i
    const trimCall = calls.find((call: string[][]) => {
      const args = call[0] as string[];
      return args.includes('-ss') && args.includes('-i');
    });
    expect(trimCall).toBeDefined();
    const args = trimCall![0] as string[];
    const ssIndex = args.indexOf('-ss');
    const iIndex = args.indexOf('-i');
    expect(ssIndex).toBeLessThan(iIndex);
  });

  it('includes -accurate_seek in the exec args', async () => {
    const file = new File(['test'], 'video.mp4', { type: 'video/mp4' });
    await trimVideo(file, 2.5);

    const calls = mockFFmpeg.exec.mock.calls;
    const trimCall = calls.find((call: string[][]) => {
      const args = call[0] as string[];
      return args.includes('-accurate_seek');
    });
    expect(trimCall).toBeDefined();
  });

  it('does NOT include -t or -to flags in the output args (full remaining footage)', async () => {
    const file = new File(['test'], 'video.mp4', { type: 'video/mp4' });
    await trimVideo(file, 2.5);

    const calls = mockFFmpeg.exec.mock.calls;
    // Check the fallback call (which produces the final output)
    const trimCall = calls.find((call: string[][]) => {
      const args = call[0] as string[];
      return args.includes('-ss') && args.includes('-i') && args.includes('-c:v');
    });
    expect(trimCall).toBeDefined();
    const args = trimCall![0] as string[];
    expect(args).not.toContain('-t');
    expect(args).not.toContain('-to');
  });

  it('cleans up all WASM FS files in finally block', async () => {
    const file = new File(['test'], 'video.mp4', { type: 'video/mp4' });
    await trimVideo(file, 2.5);

    // Should clean up: input, start segment, rest segment, concat list, output
    expect(mockFFmpeg.deleteFile).toHaveBeenCalledTimes(5);
  });

  it('cleans up WASM FS even when exec throws', async () => {
    mockFFmpeg.exec.mockRejectedValue(new Error('FFmpeg crashed'));

    const file = new File(['test'], 'video.mp4', { type: 'video/mp4' });
    await expect(trimVideo(file, 2.5)).rejects.toThrow('FFmpeg crashed');

    // deleteFile should still be called in finally for all 5 files
    expect(mockFFmpeg.deleteFile).toHaveBeenCalledTimes(5);
  });

  it('registers progress handler with on("progress") and removes with off("progress")', async () => {
    const file = new File(['test'], 'video.mp4', { type: 'video/mp4' });
    const onProgress = vi.fn();
    await trimVideo(file, 2.5, onProgress);

    expect(mockFFmpeg.on).toHaveBeenCalledWith('progress', expect.any(Function));
    expect(mockFFmpeg.off).toHaveBeenCalledWith('progress', expect.any(Function));

    // The same progress handler should be registered and deregistered
    const progressOnCall = mockFFmpeg.on.mock.calls.find((c: string[]) => c[0] === 'progress');
    const progressOffCall = mockFFmpeg.off.mock.calls.find((c: string[]) => c[0] === 'progress');
    expect(progressOnCall).toBeDefined();
    expect(progressOffCall).toBeDefined();
    expect(progressOnCall![1]).toBe(progressOffCall![1]);
  });

  it('removes progress handler even when exec throws', async () => {
    mockFFmpeg.exec.mockRejectedValue(new Error('FFmpeg crashed'));

    const file = new File(['test'], 'video.mp4', { type: 'video/mp4' });
    await expect(trimVideo(file, 2.5, vi.fn())).rejects.toThrow();

    expect(mockFFmpeg.off).toHaveBeenCalledWith('progress', expect.any(Function));
  });

  it('calls onProgress with time/1_000_000 when progress event fires with time > 0', async () => {
    const onProgress = vi.fn();

    // Capture the progress handler when on() is called
    mockFFmpeg.on.mockImplementation((event: string, handler: (data: { progress: number; time: number }) => void) => {
      if (event === 'progress') {
        // Simulate a progress event during the exec
        handler({ progress: -3406300, time: 5_000_000 });
      }
    });

    const file = new File(['test'], 'video.mp4', { type: 'video/mp4' });
    await trimVideo(file, 2.5, onProgress);

    expect(onProgress).toHaveBeenCalledWith(5); // 5_000_000 / 1_000_000
  });

  it('does NOT call onProgress when time is 0 or negative', async () => {
    const onProgress = vi.fn();

    mockFFmpeg.on.mockImplementation((event: string, handler: (data: { progress: number; time: number }) => void) => {
      if (event === 'progress') {
        handler({ progress: -100, time: 0 });
        handler({ progress: -100, time: -500 });
      }
    });

    const file = new File(['test'], 'video.mp4', { type: 'video/mp4' });
    await trimVideo(file, 2.5, onProgress);

    expect(onProgress).not.toHaveBeenCalled();
  });

  it('returns a Uint8Array when trimSeconds > 0', async () => {
    const file = new File(['test'], 'video.mp4', { type: 'video/mp4' });
    const result = await trimVideo(file, 2.5);

    expect(result).toBeInstanceOf(Uint8Array);
    expect(result!.length).toBeGreaterThan(0);
  });

  it('passes the correct trim seconds value as string to -ss', async () => {
    const file = new File(['test'], 'video.mp4', { type: 'video/mp4' });
    await trimVideo(file, 3.75);

    const calls = mockFFmpeg.exec.mock.calls;
    const trimCall = calls.find((call: string[][]) => {
      const args = call[0] as string[];
      return args.includes('-ss') && args.includes('-i');
    });
    const args = trimCall![0] as string[];
    const ssIndex = args.indexOf('-ss');
    expect(args[ssIndex + 1]).toBe('3.75');
  });
});
