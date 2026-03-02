import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractAudio } from '../audioExtractor.ts';
import { SYNC_SAMPLE_RATE } from '../constants.ts';

// Mock the ffmpeg module
vi.mock('../ffmpeg.ts', () => ({
  getFFmpeg: vi.fn(),
}));

// Mock @ffmpeg/util
vi.mock('@ffmpeg/util', () => ({
  fetchFile: vi.fn(),
}));

// Build a minimal WAV file: 44-byte header + PCM s16le data
function createMockWavData(int16Samples: number[]): Uint8Array {
  const headerSize = 44;
  const dataSize = int16Samples.length * 2;
  const buffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buffer);

  // RIFF header (simplified — just enough for our code which skips 44 bytes)
  // "RIFF"
  view.setUint8(0, 0x52);
  view.setUint8(1, 0x49);
  view.setUint8(2, 0x46);
  view.setUint8(3, 0x46);
  view.setUint32(4, 36 + dataSize, true);
  // "WAVE"
  view.setUint8(8, 0x57);
  view.setUint8(9, 0x41);
  view.setUint8(10, 0x56);
  view.setUint8(11, 0x45);
  // fmt sub-chunk
  view.setUint8(12, 0x66); // "fmt "
  view.setUint8(13, 0x6d);
  view.setUint8(14, 0x74);
  view.setUint8(15, 0x20);
  view.setUint32(16, 16, true); // Subchunk1Size
  view.setUint16(20, 1, true);  // AudioFormat (PCM)
  view.setUint16(22, 1, true);  // NumChannels (mono)
  view.setUint32(24, 16000, true); // SampleRate
  view.setUint32(28, 32000, true); // ByteRate
  view.setUint16(32, 2, true);  // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample
  // data sub-chunk
  view.setUint8(36, 0x64); // "data"
  view.setUint8(37, 0x61);
  view.setUint8(38, 0x74);
  view.setUint8(39, 0x61);
  view.setUint32(40, dataSize, true);

  // Write PCM samples
  for (let i = 0; i < int16Samples.length; i++) {
    view.setInt16(headerSize + i * 2, int16Samples[i], true);
  }

  return new Uint8Array(buffer);
}

describe('extractAudio', () => {
  let mockFFmpeg: {
    writeFile: ReturnType<typeof vi.fn>;
    exec: ReturnType<typeof vi.fn>;
    readFile: ReturnType<typeof vi.fn>;
    deleteFile: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.resetAllMocks();

    mockFFmpeg = {
      writeFile: vi.fn().mockResolvedValue(undefined),
      exec: vi.fn().mockResolvedValue(0),
      readFile: vi.fn().mockResolvedValue(createMockWavData([0, 16384, -16384, 32767])),
      deleteFile: vi.fn().mockResolvedValue(undefined),
    };

    const { getFFmpeg } = await import('../ffmpeg.ts');
    vi.mocked(getFFmpeg).mockResolvedValue(mockFFmpeg as never);

    const { fetchFile } = await import('@ffmpeg/util');
    vi.mocked(fetchFile).mockResolvedValue(new Uint8Array([1, 2, 3]));
  });

  it('returns AudioData with channelData[0] as Float32Array', async () => {
    const file = new File(['test'], 'video.mp4', { type: 'video/mp4' });
    const result = await extractAudio(file);

    expect(result.channelData).toHaveLength(1);
    expect(result.channelData[0]).toBeInstanceOf(Float32Array);
  });

  it('returns samplesDecoded matching float32 length', async () => {
    const file = new File(['test'], 'video.mp4', { type: 'video/mp4' });
    const result = await extractAudio(file);

    expect(result.samplesDecoded).toBe(result.channelData[0].length);
  });

  it('returns sampleRate = 16000', async () => {
    const file = new File(['test'], 'video.mp4', { type: 'video/mp4' });
    const result = await extractAudio(file);

    expect(result.sampleRate).toBe(SYNC_SAMPLE_RATE);
    expect(result.sampleRate).toBe(16000);
  });

  it('skips 44-byte WAV header and normalizes Int16 to Float32 [-1.0, 1.0]', async () => {
    // Samples: 0, 16384, -16384, 32767
    // Expected: 0, 0.5, -0.5, ~0.99997
    const file = new File(['test'], 'video.mp4', { type: 'video/mp4' });
    const result = await extractAudio(file);

    const data = result.channelData[0];
    expect(data.length).toBe(4);
    expect(data[0]).toBeCloseTo(0, 5);
    expect(data[1]).toBeCloseTo(0.5, 3);
    expect(data[2]).toBeCloseTo(-0.5, 3);
    expect(data[3]).toBeCloseTo(32767 / 32768, 3);
  });

  it('cleans up WASM filesystem after extraction (deleteFile called for input and output)', async () => {
    const file = new File(['test'], 'video.mp4', { type: 'video/mp4' });
    await extractAudio(file);

    expect(mockFFmpeg.deleteFile).toHaveBeenCalledTimes(2);
  });

  it('cleans up WASM filesystem even on FFmpeg exec error', async () => {
    mockFFmpeg.exec.mockRejectedValue(new Error('FFmpeg failed'));

    const file = new File(['test'], 'video.mp4', { type: 'video/mp4' });
    await expect(extractAudio(file)).rejects.toThrow('FFmpeg failed');

    // deleteFile should still be called due to try/finally
    expect(mockFFmpeg.deleteFile).toHaveBeenCalledTimes(2);
  });

  it('calls onProgress callback with stage strings', async () => {
    const onProgress = vi.fn();
    const file = new File(['test'], 'video.mp4', { type: 'video/mp4' });
    await extractAudio(file, onProgress);

    expect(onProgress).toHaveBeenCalledWith('Writing file to memory...');
    expect(onProgress).toHaveBeenCalledWith('Extracting audio...');
    expect(onProgress).toHaveBeenCalledWith('Reading audio data...');
  });

  it('calls FFmpeg exec with correct extraction flags', async () => {
    const file = new File(['test'], 'video.mp4', { type: 'video/mp4' });
    await extractAudio(file);

    const execArgs = mockFFmpeg.exec.mock.calls[0][0];
    expect(execArgs).toContain('-vn');
    expect(execArgs).toContain('-acodec');
    expect(execArgs).toContain('pcm_s16le');
    expect(execArgs).toContain('-ac');
    expect(execArgs).toContain('1');
    expect(execArgs).toContain('-ar');
    expect(execArgs).toContain(String(SYNC_SAMPLE_RATE));
  });
});
