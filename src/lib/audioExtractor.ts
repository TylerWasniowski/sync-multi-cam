import { getFFmpeg } from './ffmpeg.ts';
import { fetchFile } from '@ffmpeg/util';
import { SYNC_SAMPLE_RATE } from './constants.ts';
import type { AudioData } from '../types/index.ts';

export type { AudioData };

export async function extractAudio(
  file: File,
  onProgress?: (stage: string) => void
): Promise<AudioData> {
  const ffmpeg = await getFFmpeg();

  const inputName = `input_${crypto.randomUUID()}`;
  const outputName = `output_${crypto.randomUUID()}.wav`;

  try {
    onProgress?.('Writing file to memory...');
    await ffmpeg.writeFile(inputName, await fetchFile(file));

    onProgress?.('Extracting audio...');
    await ffmpeg.exec([
      '-i', inputName,
      '-vn',                          // No video
      '-acodec', 'pcm_s16le',        // 16-bit PCM
      '-ac', '1',                     // Mono
      '-ar', String(SYNC_SAMPLE_RATE), // 16000 Hz
      outputName,
    ]);

    onProgress?.('Reading audio data...');
    const outputData = await ffmpeg.readFile(outputName);
    const wavBytes = outputData as Uint8Array;

    // Parse WAV header to find the 'data' chunk rather than assuming 44-byte header.
    // WAV files can have extra metadata chunks (LIST, INFO, etc.) before the data chunk.
    let dataOffset = 12; // skip RIFF header (12 bytes)
    while (dataOffset + 8 < wavBytes.length) {
      const chunkId = String.fromCharCode(
        wavBytes[dataOffset], wavBytes[dataOffset + 1],
        wavBytes[dataOffset + 2], wavBytes[dataOffset + 3],
      );
      const chunkSize = wavBytes[dataOffset + 4]
        | (wavBytes[dataOffset + 5] << 8)
        | (wavBytes[dataOffset + 6] << 16)
        | (wavBytes[dataOffset + 7] << 24);

      if (chunkId === 'data') {
        dataOffset += 8; // skip chunk header to reach PCM data
        break;
      }
      dataOffset += 8 + chunkSize;
    }

    const pcmBytes = wavBytes.slice(dataOffset);
    const int16 = new Int16Array(
      pcmBytes.buffer,
      pcmBytes.byteOffset,
      pcmBytes.byteLength / 2
    );
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768.0;
    }

    return {
      channelData: [float32],
      samplesDecoded: float32.length,
      sampleRate: SYNC_SAMPLE_RATE,
    };
  } finally {
    // Always clean up WASM filesystem to prevent memory exhaustion
    await ffmpeg.deleteFile(inputName).catch(() => {});
    await ffmpeg.deleteFile(outputName).catch(() => {});
  }
}
