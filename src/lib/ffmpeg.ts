import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import { FFMPEG_CORE_VERSION, FFMPEG_CDN_BASE } from './constants.ts';

let ffmpegInstance: FFmpeg | null = null;

export function isMultiThreadSupported(): boolean {
  return typeof SharedArrayBuffer !== 'undefined';
}

export function getFFmpegMode(): 'multi-thread' | 'single-thread' {
  return isMultiThreadSupported() ? 'multi-thread' : 'single-thread';
}

export async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;

  const ffmpeg = new FFmpeg();

  ffmpeg.on('log', ({ message }) => {
    console.log('[FFmpeg]', message);
  });

  const isMultiThread = isMultiThreadSupported();
  const pkg = isMultiThread ? '@ffmpeg/core-mt' : '@ffmpeg/core';
  const baseURL = `${FFMPEG_CDN_BASE}/${pkg}@${FFMPEG_CORE_VERSION}/dist/esm`;

  const coreURL = await toBlobURL(
    `${baseURL}/ffmpeg-core.js`,
    'text/javascript',
  );
  const wasmURL = await toBlobURL(
    `${baseURL}/ffmpeg-core.wasm`,
    'application/wasm',
  );

  const loadConfig: {
    coreURL: string;
    wasmURL: string;
    workerURL?: string;
  } = { coreURL, wasmURL };

  if (isMultiThread) {
    loadConfig.workerURL = await toBlobURL(
      `${baseURL}/ffmpeg-core.worker.js`,
      'text/javascript',
    );
  }

  await ffmpeg.load(loadConfig);
  ffmpegInstance = ffmpeg;
  return ffmpeg;
}
