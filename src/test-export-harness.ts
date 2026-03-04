/**
 * Test harness for the WebCodecs export pipeline.
 * Creates small test videos in-browser via MediaRecorder, then exercises
 * the full export path: demux → decode → composite → encode → mux.
 *
 * Opened by Playwright at /test-export.html.
 * Result reported via #status element: PASS | FAIL: <reason> | SKIP: <reason>
 */

import {
  startExport,
  checkWebCodecsSupport,
} from './lib/exportComposite.ts';
import type { AudioConfig } from './types/index.ts';

const logEl = document.getElementById('log')!;
const statusEl = document.getElementById('status')!;

function log(msg: string): void {
  logEl.textContent += msg + '\n';
  console.log('[test-export]', msg);
}

// ---------------------------------------------------------------------------
// Create a short test video using MediaRecorder (WebM VP8+Opus)
// ---------------------------------------------------------------------------

async function createTestVideo(
  label: string,
  color: string,
  frequency: number,
  durationMs: number,
): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 240;
  const ctx = canvas.getContext('2d')!;

  // Draw a colored rectangle with a label
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 320, 240);
  ctx.fillStyle = 'white';
  ctx.font = '24px monospace';
  ctx.fillText(label, 20, 130);

  const stream = canvas.captureStream(30);

  // Add audio: oscillator at the given frequency
  // Resume AudioContext to handle autoplay policy in real browsers.
  // resume() hangs if autoplay blocked, so race with a timeout.
  const audioCtx = new AudioContext();
  await Promise.race([audioCtx.resume(), new Promise<void>(r => setTimeout(r, 500))]);
  const hasAudio = audioCtx.state === 'running';

  let oscillator: OscillatorNode | null = null;
  if (hasAudio) {
    oscillator = audioCtx.createOscillator();
    oscillator.frequency.value = frequency;
    const gain = audioCtx.createGain();
    gain.gain.value = 0.3;
    const dest = audioCtx.createMediaStreamDestination();
    oscillator.connect(gain).connect(dest);
    oscillator.start();
    stream.addTrack(dest.stream.getAudioTracks()[0]);
  }

  const mimeType = hasAudio ? 'video/webm; codecs=vp8,opus' : 'video/webm; codecs=vp8';
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 500_000,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  return new Promise((resolve) => {
    recorder.onstop = () => {
      if (oscillator) oscillator.stop();
      audioCtx.close();
      const blob = new Blob(chunks, { type: 'video/webm' });
      const file = new File([blob], `test-${label}.webm`, { type: 'video/webm' });
      resolve(file);
    };
    recorder.start(100); // collect data every 100ms
    setTimeout(() => recorder.stop(), durationMs);
  });
}

// ---------------------------------------------------------------------------
// Run the export test
// ---------------------------------------------------------------------------

async function runTest(): Promise<void> {
  try {
    // 1. Check WebCodecs support
    const check = checkWebCodecsSupport();
    log(`WebCodecs supported: ${check.supported}`);
    if (!check.supported) {
      statusEl.textContent = 'SKIP: ' + check.reason;
      return;
    }

    // 2. Create two 2-second test videos
    log('Creating test video 1 (red, 440Hz)...');
    const video1 = await createTestVideo('CAM-1', '#c00', 440, 2000);
    log(`  → ${video1.name}: ${video1.size} bytes`);

    log('Creating test video 2 (blue, 660Hz)...');
    const video2 = await createTestVideo('CAM-2', '#00c', 660, 2000);
    log(`  → ${video2.name}: ${video2.size} bytes`);

    // 3. Run export
    log('Starting export at 640x480 30fps for 2s...');
    const startTime = performance.now();

    const audioConfig: AudioConfig = { mode: 'mix', trackIndices: [0, 1] };

    const result = await new Promise<ArrayBuffer>((resolve, reject) => {
      startExport(
        {
          type: 'start',
          files: [video1, video2],
          offsets: [0, 0],
          resolution: { width: 640, height: 480 },
          fps: 30,
          bitrate: 1_000_000,
          audioConfig,
          totalDurationSeconds: 2,
          tileAspectRatio: 4 / 3,
          displayMode: 'fill',
        },
        {
          onProgress: (ratio) => {
            const pct = Math.round(ratio * 100);
            log(`  progress: ${pct}%`);
          },
          onComplete: (data) => {
            resolve(data);
          },
          onError: (msg) => {
            reject(new Error(msg));
          },
          onCancelled: () => {
            reject(new Error('Export was cancelled'));
          },
        },
      );
    });

    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
    log(`Export complete: ${result.byteLength} bytes in ${elapsed}s`);

    if (result.byteLength < 100) {
      throw new Error(`Output too small: ${result.byteLength} bytes`);
    }

    // 4. Basic MP4 validation: check ftyp box
    const header = new Uint8Array(result, 0, 12);
    const ftyp = String.fromCharCode(header[4], header[5], header[6], header[7]);
    log(`Output ftyp: "${ftyp}"`);
    if (ftyp !== 'ftyp') {
      throw new Error(`Invalid MP4: expected ftyp at offset 4, got "${ftyp}"`);
    }

    statusEl.textContent = 'PASS';
    log('TEST PASSED');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`FAILED: ${msg}`);
    if (err instanceof Error && err.stack) {
      log(err.stack);
    }
    statusEl.textContent = 'FAIL: ' + msg;
  }
}

runTest();
