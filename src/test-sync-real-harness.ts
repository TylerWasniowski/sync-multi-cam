/**
 * Test harness for the GCC-PHAT sync pipeline with REAL video files.
 *
 * Playwright sets files on the hidden <input type="file">, then this harness
 * reads them and runs the full sync pipeline to verify offset and confidence
 * values against real multi-camera recordings.
 *
 * Pipeline mirrors App.tsx exactly:
 *   1. extractAudio() for each file (FFmpeg WASM)
 *   2. detectAudioWarnings() for each track (silence/clipping)
 *   3. syncAudioTracks() with progress callback (GCC-PHAT Web Worker)
 *   4. getConfidenceLevel() for each result
 *
 * Results reported via DOM elements:
 *   #status  — WAITING | RUNNING | COMPLETE | FAIL: <reason>
 *   #results — JSON array of sync results with confidenceLevel
 *   #warnings — JSON object keyed by fileName with warning arrays
 *   #log     — Human-readable log of all steps
 */

import { extractAudio } from './lib/audioExtractor.ts';
import { syncAudioTracks, getConfidenceLevel } from './lib/audioSync.ts';
import { detectAudioWarnings, type AudioWarning } from './lib/audioQuality.ts';
import type { AudioData } from './types/index.ts';

const logEl = document.getElementById('log')!;
const statusEl = document.getElementById('status')!;
const resultsEl = document.getElementById('results')!;
const warningsEl = document.getElementById('warnings')!;
const fileInput = document.getElementById('file-input') as HTMLInputElement;

function log(msg: string): void {
  logEl.textContent += msg + '\n';
  console.log('[test-sync-real]', msg);
}

async function runSyncTest(files: File[]): Promise<void> {
  const startTime = performance.now();

  try {
    log(`Got ${files.length} video file(s):`);
    for (const f of files) {
      log(`  > ${f.name}: ${(f.size / 1024 / 1024).toFixed(1)} MB, type="${f.type}"`);
    }

    // Phase 1: Extract audio from each file (same as App.tsx)
    const audioTracks: { fileId: string; fileName: string; audio: AudioData }[] = [];
    for (let i = 0; i < files.length; i++) {
      log(`Extracting audio (${i + 1}/${files.length}): ${files[i].name}...`);
      const extractStart = performance.now();
      const audio = await extractAudio(files[i]);
      const extractMs = (performance.now() - extractStart).toFixed(0);
      log(`  Extracted: ${audio.samplesDecoded} samples @ ${audio.sampleRate}Hz in ${extractMs}ms`);
      audioTracks.push({
        fileId: files[i].name,
        fileName: files[i].name,
        audio,
      });
    }

    // Phase 1.5: Detect audio quality issues (same as App.tsx per D-06)
    const allWarnings: Record<string, AudioWarning[]> = {};
    for (const track of audioTracks) {
      const warnings = detectAudioWarnings(track.audio.channelData[0]);
      if (warnings.length > 0) {
        allWarnings[track.fileName] = warnings;
        log(`Warnings for ${track.fileName}: ${JSON.stringify(warnings)}`);
      } else {
        log(`Warnings for ${track.fileName}: none`);
      }
    }

    // Write warnings to DOM for Playwright
    warningsEl.textContent = JSON.stringify(allWarnings);

    // Phase 2: Run sync (same as App.tsx)
    log('Running sync via GCC-PHAT...');
    const syncStart = performance.now();
    const results = await syncAudioTracks(audioTracks, ({ current, total }) => {
      log(`  Aligning camera ${current} of ${total}...`);
    });
    const syncMs = (performance.now() - syncStart).toFixed(0);
    log(`Sync complete in ${syncMs}ms`);

    // Phase 3: Enrich results with confidence level and report
    const enrichedResults = results.map(r => ({
      fileName: r.fileName,
      offsetSeconds: r.offsetSeconds,
      offsetSamples: r.offsetSamples,
      confidence: r.confidence,
      isReference: r.isReference,
      confidenceLevel: getConfidenceLevel(r.confidence),
    }));

    for (const r of enrichedResults) {
      log(`  ${r.fileName}: offset=${r.offsetSeconds.toFixed(3)}s samples=${r.offsetSamples} confidence=${r.confidence.toFixed(1)} (${r.confidenceLevel}) ref=${r.isReference}`);
    }

    // Write structured results for Playwright
    resultsEl.textContent = JSON.stringify(enrichedResults);

    const totalMs = (performance.now() - startTime).toFixed(0);
    log(`Total duration: ${totalMs}ms`);

    statusEl.textContent = 'COMPLETE';
    log('SYNC TEST COMPLETE');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`FAILED: ${msg}`);
    if (err instanceof Error && err.stack) {
      log(err.stack);
    }
    statusEl.textContent = 'FAIL: ' + msg;
  }
}

// Listen for files from Playwright's file loading
fileInput.addEventListener('change', () => {
  const files = Array.from(fileInput.files ?? []);
  if (files.length > 0) {
    statusEl.textContent = 'RUNNING';
    runSyncTest(files);
  }
});

// Signal to Playwright that harness is ready
log('Harness ready - waiting for files...');
