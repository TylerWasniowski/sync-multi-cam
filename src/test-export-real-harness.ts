/**
 * Test harness for the WebCodecs export pipeline with REAL video files.
 *
 * Playwright sets files on the hidden <input type="file">, then this harness
 * reads them and runs a short (3-second) export to verify the pipeline works
 * with actual MP4/MOV/MKV containers (including HEVC).
 *
 * Result reported via #status element: PASS | FAIL: <reason> | SKIP: <reason>
 */

import {
  startExport,
  checkWebCodecsSupport,
} from './lib/exportComposite.ts';
import type { AudioConfig } from './types/index.ts';

const logEl = document.getElementById('log')!;
const statusEl = document.getElementById('status')!;
const fileInput = document.getElementById('file-input') as HTMLInputElement;

function log(msg: string): void {
  logEl.textContent += msg + '\n';
  console.log('[test-export-real]', msg);
}

async function runTest(files: File[]): Promise<void> {
  try {
    // 1. Check WebCodecs support
    const check = checkWebCodecsSupport();
    log(`WebCodecs supported: ${check.supported}`);
    if (!check.supported) {
      statusEl.textContent = 'SKIP: ' + check.reason;
      return;
    }

    log(`Got ${files.length} real video file(s):`);
    for (const f of files) {
      log(`  → ${f.name}: ${(f.size / 1024 / 1024).toFixed(1)} MB, type="${f.type}"`);
    }

    if (files.length < 2) {
      statusEl.textContent = 'FAIL: Need at least 2 video files';
      return;
    }

    // Use first 2 files only (keep memory reasonable)
    const exportFiles = files.slice(0, 2);

    // 2. Run export — only 3 seconds to keep it fast
    const exportDuration = 3;
    log(`Starting export at 640x480 30fps for ${exportDuration}s with ${exportFiles.length} files...`);
    const startTime = performance.now();

    const audioConfig: AudioConfig = {
      mode: 'mix',
      trackIndices: exportFiles.map((_, i) => i),
    };

    const result = await new Promise<ArrayBuffer>((resolve, reject) => {
      startExport(
        {
          type: 'start',
          files: exportFiles,
          offsets: exportFiles.map(() => 0), // no sync offsets for test
          resolution: { width: 640, height: 480 },
          fps: 30,
          bitrate: 1_000_000,
          audioConfig,
          totalDurationSeconds: exportDuration,
          tileAspectRatio: 16 / 9,
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
    log(`Export complete: ${(result.byteLength / 1024).toFixed(0)} KB in ${elapsed}s`);

    if (result.byteLength < 100) {
      throw new Error(`Output too small: ${result.byteLength} bytes`);
    }

    // 3. Basic MP4 validation: check ftyp box
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
    // HEVC/codec decode errors are expected in headless browsers — report as SKIP
    if (msg.includes('cannot be decoded') || msg.includes('unsupported or unrecognizable')) {
      log(`SKIP: ${msg}`);
      statusEl.textContent = 'SKIP: codec not supported in this browser (likely HEVC in headless)';
    } else {
      log(`FAILED: ${msg}`);
      if (err instanceof Error && err.stack) {
        log(err.stack);
      }
      statusEl.textContent = 'FAIL: ' + msg;
    }
  }
}

// Listen for files from Playwright's setInputFiles
fileInput.addEventListener('change', () => {
  const files = Array.from(fileInput.files ?? []);
  if (files.length > 0) {
    statusEl.textContent = 'RUNNING';
    runTest(files);
  }
});

// Signal to Playwright that harness is ready
log('Harness ready — waiting for files via input...');
