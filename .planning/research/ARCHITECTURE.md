# Architecture: Spectral Cross-Correlation Audio Sync Engine

**Domain:** Replacing Pearson correlation with frequency-domain audio synchronization
**Researched:** 2026-03-28
**Confidence:** HIGH (algorithm design, integration points), MEDIUM (FFT library performance in workers)

---

## How v2.3 Integrates With the Existing System

The sync pipeline has a clean seam. The app calls `syncAudioTracks()` which returns `SyncResult[]`. Everything upstream (audio extraction) and downstream (playback, export) is unchanged. The v2.3 work replaces the **internals** of the sync step while preserving the interface contract.

### What v2.3 Replaces

```
CURRENT (v2.2):
  extractAudio() -> Float32Array (16kHz mono PCM)
      |
      v
  SynAudio.syncWorker(reference, comparison)  <-- Pearson correlation in WASM Worker
      |
      v
  { sampleOffset, correlation } -> SyncResult

NEW (v2.3):
  extractAudio() -> Float32Array (16kHz mono PCM)  <-- UNCHANGED
      |
      v
  spectralSync(reference, comparison)  <-- GCC-PHAT in dedicated Web Worker
      |
      v
  { offsetSamples, confidence } -> SyncResult  <-- SAME interface contract
```

### What Does NOT Change

| Component | Status | Reason |
|-----------|--------|--------|
| `audioExtractor.ts` | Unchanged | 16kHz mono PCM is the correct input for spectral sync |
| `types/index.ts` | Unchanged | `AudioData`, `SyncResult` interfaces stay the same |
| `App.tsx` pipeline | Unchanged | Calls `syncAudioTracks()`, consumes `SyncResult[]` |
| `waveformPeaks.ts` | Unchanged | Operates on raw PCM, independent of sync method |
| All UI components | Unchanged | Consume `SyncResult[]` exactly as before |
| `constants.ts` | Modified | New spectral constants added, old SynAudio ones deprecated |

### The Interface Contract (preserved exactly)

```typescript
// This signature does not change:
export async function syncAudioTracks(
  tracks: { fileId: string; fileName: string; audio: AudioData }[],
  onProgress?: (progress: number) => void
): Promise<SyncResult[]>

// AudioData stays the same:
interface AudioData {
  channelData: Float32Array[];  // [0] = mono channel
  samplesDecoded: number;
  sampleRate: number;           // 16000
}

// SyncResult stays the same:
interface SyncResult {
  fileId: string;
  fileName: string;
  offsetSeconds: number;
  offsetSamples: number;
  confidence: number;  // 0-100
  isReference: boolean;
}
```

---

## The Algorithm: GCC-PHAT (Generalized Cross-Correlation with Phase Transform)

### Why GCC-PHAT Over Other Approaches

| Approach | Robustness | Speed | Complexity | Verdict |
|----------|-----------|-------|------------|---------|
| Pearson correlation (current) | Poor with reverb/clipping | Fast (WASM SIMD) | Low | Fails on concerts, distance |
| Standard frequency-domain XC | Moderate | Medium | Medium | Dominated by loud frequencies |
| GCC-PHAT | Excellent for reverb, distance | Medium | Medium | **Recommended** |
| Chromaprint fingerprinting | Overkill (designed for song ID) | Slow | High | Wrong problem domain |
| Neural approaches (SyncNet) | Best possible | Slow, needs model | Very high | Impractical in browser |

GCC-PHAT is the standard algorithm for TDOA (Time Delay of Arrival) estimation in acoustics research. It works because:

1. **Phase normalization eliminates amplitude bias.** Pearson correlation is dominated by the loudest frequency bands. A bass-heavy concert recording will correlate on bass transients and miss high-frequency timing cues. GCC-PHAT normalizes every frequency bin to unit magnitude, so quiet clicks contribute equally to loud booms.

2. **Robust to reverb and room effects.** Reverb adds delayed copies of the signal at reduced amplitude. Pearson correlation gets confused by these echoes. GCC-PHAT's phase-only approach suppresses reverb peaks because reflected signals have similar phase relationships but different amplitudes.

3. **Handles different microphone frequency responses.** Two cameras at different distances have different frequency roll-off. Pearson correlation sees these as different signals. GCC-PHAT normalizes magnitude away, keeping only timing information.

### Algorithm Steps (what we implement)

```
Input: reference PCM (Float32Array), comparison PCM (Float32Array)
Output: { offsetSamples: number, confidence: number }

Step 1: WINDOWING
  - Apply Hann window to both signals (prevents spectral leakage at boundaries)

Step 2: FFT
  - Compute FFT of both signals
  - FFT size = next power of 2 >= (len_ref + len_comp)
  - This ensures linear (not circular) correlation

Step 3: CROSS-POWER SPECTRUM WITH PHASE TRANSFORM
  - G(f) = FFT(ref) * conj(FFT(comp))     // cross-power spectrum
  - W(f) = G(f) / |G(f)|                   // phase transform (normalize magnitude to 1)
  - Handle |G(f)| = 0 bins: set W(f) = 0 (avoid division by zero)

Step 4: INVERSE FFT
  - gcc_phat(t) = IFFT(W(f))               // correlation function in time domain

Step 5: FIND PEAK
  - offset = argmax(|gcc_phat(t)|)          // sample offset with highest correlation
  - Constrain search to plausible range (e.g., +/- max_offset_samples)

Step 6: CONFIDENCE SCORING
  - peak_value = gcc_phat[offset]
  - Confidence from peak sharpness: ratio of peak to mean of correlation
  - Higher ratio = sharper peak = more confident alignment
```

### Why 16kHz Mono PCM Is Still Correct

The existing `audioExtractor.ts` outputs 16kHz mono Float32Array. This is the right input:

- **16kHz captures all timing information.** Audio sync cares about temporal alignment, not high-frequency content. 16kHz retains frequencies up to 8kHz (Nyquist), which covers speech fundamentals, transients, and most musical content. Higher rates waste compute without improving sync accuracy.
- **Mono collapses stereo phase artifacts.** Stereo mic pickup patterns vary between devices. Mono averaging eliminates this variable.
- **Lower sample rate = smaller FFT = faster.** A 5-minute clip at 16kHz = 4.8M samples. At 44.1kHz it would be 13.2M samples, requiring 3x larger FFT with no sync benefit.

---

## New Module Design

### Module 1: `src/lib/spectralSync.ts` (NEW)

The public API module. Drop-in replacement for SynAudio correlation logic inside `audioSync.ts`.

```typescript
// src/lib/spectralSync.ts

export interface SpectralSyncResult {
  offsetSamples: number;
  confidence: number;  // 0.0 - 1.0
}

/**
 * Compute time offset between two audio signals using GCC-PHAT.
 * Runs FFT computation in a dedicated Web Worker to avoid blocking UI.
 *
 * @param reference  - Float32Array of reference audio (longest track)
 * @param comparison - Float32Array of comparison audio
 * @param sampleRate - Sample rate (16000)
 * @param maxOffsetSeconds - Maximum plausible offset to search (default: 300s = 5 min)
 * @returns Promise<SpectralSyncResult>
 */
export async function computeSpectralSync(
  reference: Float32Array,
  comparison: Float32Array,
  sampleRate: number,
  maxOffsetSeconds?: number,
): Promise<SpectralSyncResult>;
```

### Module 2: `src/lib/spectralSyncWorker.ts` (NEW)

Web Worker that performs the CPU-intensive FFT + GCC-PHAT computation off the main thread.

```typescript
// src/lib/spectralSyncWorker.ts
// Runs as a Web Worker (instantiated via new Worker(new URL(...), import.meta.url))

// Message protocol:
type WorkerCommand = {
  type: 'compute';
  reference: Float32Array;    // transferred, not copied
  comparison: Float32Array;   // transferred, not copied
  sampleRate: number;
  maxOffsetSamples: number;
  fftSize: number;
};

type WorkerResult = {
  type: 'result';
  offsetSamples: number;
  confidence: number;
} | {
  type: 'error';
  message: string;
};
```

### Module 3: `src/lib/fftEngine.ts` (NEW)

Pure computational module containing FFT operations. Imported by the worker. No DOM dependencies.

```typescript
// src/lib/fftEngine.ts
// Pure functions for FFT, windowing, and GCC-PHAT core math
// Uses fft.js library (indutny/fft.js) for Radix-4 FFT

export function applyHannWindow(signal: Float32Array): Float32Array;
export function gccPhat(
  refFFT: Float32Array,    // complex interleaved [re, im, re, im, ...]
  compFFT: Float32Array,   // complex interleaved
  fftSize: number,
): Float32Array;           // correlation function (real values)
export function findPeak(
  correlation: Float32Array,
  maxOffset: number,
  fftSize: number,
): { offset: number; peakValue: number; confidence: number };
export function nextPowerOf2(n: number): number;
```

### Module 4: `src/lib/audioSync.ts` (MODIFIED)

Replace SynAudio import with `computeSpectralSync`. Everything else stays.

```typescript
// BEFORE:
import SynAudio from 'synaudio';
// ...
const synAudio = new SynAudio({ correlationSampleSize, initialGranularity });
const { sampleOffset, correlation } = await synAudio.syncWorker(ref, comp);

// AFTER:
import { computeSpectralSync } from './spectralSync.ts';
// ...
const { offsetSamples, confidence } = await computeSpectralSync(
  reference.audio.channelData[0],
  track.audio.channelData[0],
  SYNC_SAMPLE_RATE,
);
```

### Module 5: `src/lib/constants.ts` (MODIFIED)

```typescript
// Keep for backward compatibility / other uses:
export const SYNC_SAMPLE_RATE = 16000;

// Remove (SynAudio-specific, no longer used):
// export const CORRELATION_SAMPLE_SIZE = 11025;
// export const INITIAL_GRANULARITY = 16;

// Add:
export const SPECTRAL_FFT_WINDOW = 2048;    // FFT size for spectrogram (if needed for future features)
export const MAX_SYNC_OFFSET_SECONDS = 300;  // 5 minutes max plausible offset between cameras
export const GCC_CONFIDENCE_THRESHOLD = 0.15; // Below this, sync is unreliable
```

---

## Data Flow: Full Pipeline With Spectral Sync

```
User clicks "Sync"
    |
    v
[App.tsx: handleSync()]
    |
    |-- Phase 1: Extract audio (UNCHANGED)
    |   for each file:
    |     extractAudio(file) -> AudioData { channelData: [Float32Array], samplesDecoded, sampleRate }
    |     computeMultiResolutionPeaks() for waveform display
    |
    |-- Phase 2: Correlate (CHANGED INTERNALS)
    |   syncAudioTracks(tracks, onProgress) -> SyncResult[]
    |
    v
[audioSync.ts: syncAudioTracks()]
    |
    |-- Select longest track as reference (UNCHANGED)
    |-- For each comparison track (sequential):
    |
    v
[spectralSync.ts: computeSpectralSync(ref, comp, 16000)]
    |
    |-- Create Web Worker (spectralSyncWorker.ts)
    |-- Transfer Float32Array buffers to worker (zero-copy)
    |
    v
[spectralSyncWorker.ts: inside Web Worker]
    |
    |-- 1. Compute FFT size = nextPowerOf2(ref.length + comp.length)
    |-- 2. Apply Hann window to both signals
    |-- 3. Zero-pad both to FFT size
    |-- 4. FFT(ref) using fft.js realTransform
    |-- 5. FFT(comp) using fft.js realTransform
    |-- 6. Cross-power spectrum: G = FFT(ref) * conj(FFT(comp))
    |-- 7. Phase transform: W = G / |G|
    |-- 8. IFFT(W) -> correlation function
    |-- 9. Find peak within +/- maxOffsetSamples
    |-- 10. Compute confidence from peak sharpness
    |
    |-- Post result back to main thread
    |
    v
[spectralSync.ts: receives result]
    |
    |-- Return { offsetSamples, confidence }
    |
    v
[audioSync.ts: builds SyncResult]
    |
    |-- offsetSeconds = offsetSamples / SYNC_SAMPLE_RATE
    |-- confidence = Math.round(confidence * 100)  // 0-100 scale
    |
    v
[App.tsx: receives SyncResult[] - UNCHANGED from here]
    |-- setSyncResults(...)
    |-- Pipeline complete
```

---

## Memory Analysis

### Per-Pair Computation (in Web Worker)

For a pair of 5-minute audio files at 16kHz:

| Data | Size | Notes |
|------|------|-------|
| Reference PCM | 19.2 MB | 5 * 60 * 16000 * 4 bytes |
| Comparison PCM | 19.2 MB | Same |
| FFT size | 2^23 = 8,388,608 | Next power of 2 >= (4.8M + 4.8M) |
| Reference FFT (complex) | 67.1 MB | fftSize * 2 * 4 bytes (interleaved re/im) |
| Comparison FFT (complex) | 67.1 MB | Same |
| Cross-power spectrum | 67.1 MB | Same shape |
| Correlation output | 33.6 MB | fftSize * 4 bytes (real only) |
| **Peak worker memory** | **~275 MB** | All arrays simultaneously |

This is feasible in a Web Worker. Browser workers typically have 1-4 GB of addressable memory. The key insight: **we process pairs sequentially**, so only one pair's worth of FFT buffers exists at a time.

### Optimization: Reuse Allocated Buffers

```typescript
// In the worker, pre-allocate once for the session:
let fft: FFT | null = null;
let refSpectrum: Float32Array | null = null;
let compSpectrum: Float32Array | null = null;
let crossSpectrum: Float32Array | null = null;

// On first 'compute' message, allocate. On subsequent, reuse if fftSize matches.
// This avoids GC pressure when syncing many tracks against the same reference.
```

### Comparison: Current vs New Memory Usage

| Metric | SynAudio (current) | GCC-PHAT (new) |
|--------|-------------------|----------------|
| Input data | ~38 MB per pair (2x 19MB PCM) | ~38 MB per pair (same input) |
| Working memory | ~20-40 MB (WASM heap) | ~275 MB (FFT buffers) |
| Peak total | ~60-80 MB | ~310 MB |
| Duration in memory | Entire sync phase | Per-pair, freed between |

The new approach uses ~4x more working memory per pair. This is acceptable because:
- It runs in a Web Worker (separate heap from main thread)
- Buffers can be reused across pairs (reference FFT computed once)
- 310 MB is well within browser worker limits
- Sequential processing means only one pair at a time

### Critical Optimization: Compute Reference FFT Once

The reference track is compared against every other track. Its FFT should be computed once and reused:

```
Reference FFT: computed once (67 MB, persists across all pairs)
Per comparison: FFT(comp) + cross-power + IFFT + peak find
Savings: (N-1) * FFT(reference) computations eliminated
```

This means the worker should accept a `mode: 'init-reference' | 'compare'` protocol:

```typescript
// First message: compute and cache reference FFT
{ type: 'init-reference', reference: Float32Array, sampleRate: number, fftSize: number }

// Subsequent messages: compare against cached reference
{ type: 'compare', comparison: Float32Array, maxOffsetSamples: number }
```

---

## Confidence Scoring: New Approach

The current system uses raw Pearson correlation magnitude (0.0 to 1.0 mapped to 0-100%). This is problematic because Pearson correlation values are hard to interpret -- a 0.4 correlation might be excellent for noisy audio or poor for clean audio.

### GCC-PHAT Confidence: Peak Sharpness Ratio

GCC-PHAT produces a correlation function where the peak should be a sharp spike at the correct offset. Confidence is measured by how much the peak stands out from the noise floor:

```typescript
function computeConfidence(correlation: Float32Array, peakIndex: number, searchRange: number): number {
  const peakValue = Math.abs(correlation[peakIndex]);

  // Compute mean of correlation values (excluding peak neighborhood)
  const peakNeighborhood = 50; // +/- 50 samples around peak
  let sum = 0;
  let count = 0;
  for (let i = 0; i < searchRange; i++) {
    if (Math.abs(i - peakIndex) > peakNeighborhood) {
      sum += Math.abs(correlation[i]);
      count++;
    }
  }
  const meanNoise = count > 0 ? sum / count : 0;

  // Peak-to-mean ratio, clamped to 0-1
  if (meanNoise === 0) return peakValue > 0 ? 1.0 : 0.0;
  const ratio = peakValue / meanNoise;

  // Map ratio to 0-1 confidence:
  // ratio < 2: very low confidence (peak barely above noise)
  // ratio 2-5: low-medium confidence
  // ratio 5-15: medium-high confidence
  // ratio > 15: high confidence (sharp, unambiguous peak)
  return Math.min(1.0, Math.max(0.0, (ratio - 2) / 13));
}
```

### Confidence Level Interpretation (updated thresholds)

The existing `getConfidenceLevel()` function in `audioSync.ts` maps 0-100 to high/medium/low. The thresholds may need adjustment for GCC-PHAT since confidence distribution differs from Pearson:

```typescript
// May need tuning after testing, but start with existing thresholds:
// high >= 70: Sharp, unambiguous peak
// medium 40-69: Clear peak but some ambiguity
// low < 40: Flat or multi-peaked correlation -- unreliable
```

---

## Web Worker Architecture

### Why a Web Worker (not main thread)

FFT of a 10M-point signal takes 200-500ms in JavaScript. For N=30 files, that is N-1 = 29 FFT pairs. Total: 6-15 seconds of CPU time. Running on the main thread would freeze the UI for the entire duration. The current SynAudio already uses a Web Worker via `syncWorker` mode.

### Worker Lifecycle

```
syncAudioTracks() called
    |
    v
Create worker: new Worker(new URL('./spectralSyncWorker.ts', import.meta.url))
    |
    |-- Send 'init-reference': transfer reference Float32Array buffer
    |-- Worker computes reference FFT, caches it
    |
    |-- For each comparison track:
    |   |-- Send 'compare': transfer comparison Float32Array buffer
    |   |-- Worker computes comparison FFT
    |   |-- Worker runs GCC-PHAT
    |   |-- Worker posts back { offsetSamples, confidence }
    |   |-- Main thread builds SyncResult
    |
    |-- Send 'terminate'
    |-- Worker self-terminates, memory freed
    v
Return SyncResult[]
```

### Transferable Objects for Zero-Copy

Float32Array buffers are **transferred** (not copied) to the worker:

```typescript
// In spectralSync.ts:
worker.postMessage(
  { type: 'init-reference', reference: refArray, sampleRate, fftSize },
  [refArray.buffer]  // transfer list -- zero-copy, buffer ownership moves to worker
);
```

**Important:** After transfer, the original Float32Array on the main thread becomes a detached, zero-length buffer. Since `audioSync.ts` processes tracks sequentially and the reference channelData is needed for all comparisons, we must **copy** the reference before transfer:

```typescript
// Copy reference data before transferring to worker
const refCopy = new Float32Array(reference.audio.channelData[0]);
worker.postMessage({ type: 'init-reference', reference: refCopy, ... }, [refCopy.buffer]);

// For comparison tracks: each is used once, transfer is safe
worker.postMessage({ type: 'compare', comparison: track.audio.channelData[0], ... },
  [track.audio.channelData[0].buffer]);
```

Wait -- but `channelData[0]` is also used by `computeMultiResolutionPeaks()` earlier in the pipeline. By the time `syncAudioTracks()` runs, peaks are already computed. So transferring comparison buffers is safe as long as no downstream code re-reads them. Checking the pipeline in `App.tsx`: peaks are computed during extraction, sync runs after. The `audioTracks` array holds references but nothing reads `channelData` after sync returns. **Transfer is safe for comparison tracks. Copy only the reference.**

### fft.js Inside Web Worker

`fft.js` is a pure JavaScript library with no DOM dependencies. It can be imported directly in a Web Worker module:

```typescript
// spectralSyncWorker.ts (worker module)
import FFT from 'fft.js';

// fft.js uses standard ArrayBuffer operations -- fully Worker-compatible
const fft = new FFT(fftSize);
const spectrum = fft.createComplexArray();
fft.realTransform(spectrum, paddedSignal);
fft.completeSpectrum(spectrum);  // fill conjugate half
```

The `realTransform` method is ~40% faster than full complex FFT for real-valued input (which PCM audio is). This is the optimal path.

---

## Component Boundaries

```
+-----------------------------------------------------------------------+
|                        UI Layer (UNCHANGED)                           |
|  App.tsx -> syncAudioTracks() -> SyncResult[]                        |
+-----------------------------------------------------------------------+
|                     Sync Interface (UNCHANGED)                        |
|                                                                       |
|  audioSync.ts                                                         |
|    syncAudioTracks(tracks, onProgress) -> SyncResult[]               |
|    formatOffset(), formatNLETimecode(), getConfidenceLevel()         |
|                                                                       |
+-----------------------------------------------------------------------+
|                  Sync Engine (NEW - replaces SynAudio)                |
|                                                                       |
|  spectralSync.ts         spectralSyncWorker.ts      fftEngine.ts     |
|  (main thread API)       (Web Worker)               (pure math)      |
|                                                                       |
|  - Creates worker        - Receives PCM data         - Hann window   |
|  - Transfers buffers     - Runs FFT via fft.js       - GCC-PHAT     |
|  - Returns Promise       - Computes GCC-PHAT         - Peak finding  |
|  - Manages lifecycle     - Posts results back         - Confidence    |
|                                                                       |
+-----------------------------------------------------------------------+
|                    Dependencies                                       |
|                                                                       |
|  fft.js (npm)            Float32Array / ArrayBuffer                  |
|  (Radix-4 FFT, 5KB)     (Transferable objects)                      |
|                                                                       |
+-----------------------------------------------------------------------+
```

### Communication Between Components

| Boundary | Mechanism | Direction | Data |
|----------|-----------|-----------|------|
| App -> audioSync | Function call | Down | `{ fileId, fileName, audio: AudioData }[]` |
| audioSync -> spectralSync | Function call | Down | `Float32Array, Float32Array, sampleRate` |
| spectralSync -> Worker | postMessage + transfer | Down | `Float32Array` buffers (zero-copy) |
| Worker -> spectralSync | postMessage | Up | `{ offsetSamples, confidence }` |
| spectralSync -> audioSync | Promise resolution | Up | `SpectralSyncResult` |
| audioSync -> App | Promise resolution | Up | `SyncResult[]` |

---

## File Structure (v2.3 changes only)

```
src/
  lib/
    audioSync.ts          MODIFIED  - Replace SynAudio with spectralSync import
    spectralSync.ts       NEW       - Main-thread API, worker management
    spectralSyncWorker.ts NEW       - Web Worker, FFT + GCC-PHAT computation
    fftEngine.ts          NEW       - Pure math functions (window, GCC-PHAT, peak)
    constants.ts          MODIFIED  - Add spectral constants, deprecate SynAudio ones
    [all other lib/*.ts]  UNCHANGED
  types/
    index.ts              UNCHANGED - AudioData, SyncResult stay the same
  components/
    [all components]      UNCHANGED - They consume SyncResult[], which is identical
  lib/__tests__/
    audioSync.test.ts     MODIFIED  - Mock spectralSync instead of SynAudio
    spectralSync.test.ts  NEW       - Test worker creation, result shape
    fftEngine.test.ts     NEW       - Unit tests for windowing, GCC-PHAT math, peak finding
```

---

## Build Order (Dependency Chain)

Each step depends on the one above it. Steps at the same level are parallelizable.

```
1. fftEngine.ts + fftEngine.test.ts
   Pure math module. No dependencies except fft.js.
   Test with known signals (synthetic sine waves at known offsets).
   ↓

2. spectralSyncWorker.ts
   Imports fftEngine.ts. Handles postMessage protocol.
   Test by posting synthetic audio pairs and verifying offsets.
   ↓

3. spectralSync.ts + spectralSync.test.ts
   Main-thread wrapper. Creates worker, manages lifecycle.
   Test end-to-end: synthetic audio in -> correct offset out.
   ↓

4. audioSync.ts modification
   Replace SynAudio import with spectralSync.
   Update audioSync.test.ts mocks.
   ↓

5. constants.ts cleanup
   Remove CORRELATION_SAMPLE_SIZE, INITIAL_GRANULARITY.
   Add new spectral constants.
   ↓

6. package.json: remove synaudio dependency, add fft.js
   ↓

7. Integration testing with real audio files
   Edge CDP tests with actual multi-camera recordings.
   Validate confidence scoring thresholds.
```

**Critical path:** Steps 1-4 are strictly sequential. Steps 5-6 can happen alongside step 4. Step 7 requires all others complete.

---

## Patterns to Follow

### Pattern 1: Worker-Per-Sync-Session (Not Persistent Worker)

**What:** Create a new Web Worker when `syncAudioTracks()` is called. Terminate it when sync completes. Do not keep a persistent worker idle between syncs.

**Why:** The worker holds ~275 MB of FFT buffers during computation. A persistent worker would keep this memory allocated even when the user is just watching playback. Create-on-demand, terminate-after-use keeps memory clean.

**Implementation:**
```typescript
export async function computeSpectralSync(ref, comp, sampleRate, maxOffset) {
  const worker = new Worker(
    new URL('./spectralSyncWorker.ts', import.meta.url),
    { type: 'module' }
  );
  try {
    // ... send messages, await result ...
    return result;
  } finally {
    worker.terminate();
  }
}
```

**Refinement for multi-track:** Since `syncAudioTracks()` loops through all comparison tracks, the worker should persist for the entire loop (to reuse the cached reference FFT), then terminate after the loop:

```typescript
// In audioSync.ts:
const syncEngine = await createSpectralSyncSession(reference.audio.channelData[0], SYNC_SAMPLE_RATE);
try {
  for (const track of comparisons) {
    const result = await syncEngine.compare(track.audio.channelData[0]);
    // build SyncResult...
  }
} finally {
  syncEngine.terminate();  // worker dies, ~275 MB freed
}
```

### Pattern 2: Compute Reference FFT Once, Compare Many

**What:** The reference track (longest) is compared against all other tracks. Its FFT (67 MB, ~100ms to compute) should be computed once and cached in the worker.

**Why:** For 30 tracks, this saves 29 redundant reference FFT computations (~3 seconds).

**Protocol:**
```
Session start:
  main -> worker: { type: 'init', reference, sampleRate, fftSize }
  worker: computes FFT(ref), stores in module-level variable

Per comparison:
  main -> worker: { type: 'compare', comparison, maxOffsetSamples }
  worker: computes FFT(comp), runs GCC-PHAT against cached ref FFT
  worker -> main: { type: 'result', offsetSamples, confidence }

Session end:
  main: worker.terminate()
```

### Pattern 3: Hann Window Applied In-Place

**What:** Apply the Hann window by multiplying each sample before zero-padding and FFT.

**Why:** Prevents spectral leakage at signal boundaries. Without windowing, the abrupt start/end of audio clips creates broadband spectral artifacts that contaminate the cross-correlation.

```typescript
export function applyHannWindow(signal: Float32Array): Float32Array {
  const N = signal.length;
  const windowed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    // Hann window: 0.5 * (1 - cos(2*pi*i / (N-1)))
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
    windowed[i] = signal[i] * w;
  }
  return windowed;
}
```

### Pattern 4: Constrained Peak Search

**What:** Only search for the correlation peak within a plausible offset range, not the entire FFT output.

**Why:** For multi-camera sync, the maximum realistic offset is a few minutes (cameras started at different times). Searching the entire FFT output (which wraps around due to circular correlation) can find false peaks at implausible offsets.

```typescript
// maxOffsetSamples = MAX_SYNC_OFFSET_SECONDS * sampleRate
// For 5 minutes at 16kHz: 4,800,000 samples

// Search only [0, maxOffset] and [fftSize - maxOffset, fftSize]
// (positive and negative offsets due to FFT wrapping)
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Running FFT on Main Thread

**What:** Computing FFT inline in `audioSync.ts` without a Web Worker.

**Why bad:** A single FFT of a 5-minute signal at 16kHz (4.8M samples, padded to 8M) takes 200-500ms. With 29 pairs, that's 12-15 seconds of main thread blocking. The UI freezes completely -- no progress updates, no cancel button response.

**Instead:** All FFT computation happens in the Web Worker. Main thread only sends/receives messages.

### Anti-Pattern 2: Full Spectrogram Computation

**What:** Computing a full time-frequency spectrogram (STFT) for each audio track, then correlating spectrogram frames.

**Why bad for this use case:** A spectrogram is useful when you need time-frequency analysis (e.g., identifying specific sounds). For time-delay estimation, GCC-PHAT on the full signal is both faster and more accurate. A spectrogram adds a hop-size quantization error (typically 10-20ms) and uses similar memory for no benefit.

**Instead:** Use GCC-PHAT directly on the full-length PCM. It gives sub-sample accuracy without the frame-hopping overhead of STFT.

### Anti-Pattern 3: Not Handling the Circular Correlation Wrap

**What:** Treating the IFFT output as a simple linear array where index 0 = offset 0, index 1 = offset +1, etc.

**Why bad:** FFT-based correlation is circular. The output has positive offsets at low indices and negative offsets at high indices (wrapping around). Index `fftSize - 1` corresponds to offset -1, not offset `fftSize - 1`.

**Instead:** Map indices correctly:
```typescript
// For index i in the correlation output:
// if i < fftSize/2: offset = +i samples (comparison is LATER than reference)
// if i >= fftSize/2: offset = i - fftSize samples (comparison is EARLIER)
```

### Anti-Pattern 4: Transferring Buffers You Still Need

**What:** Using `postMessage(data, [data.buffer])` (transferable) for the reference audio buffer, then trying to read it again for the next comparison.

**Why bad:** After transfer, the original TypedArray becomes zero-length. Subsequent reads fail silently with empty data.

**Instead:** Copy the reference buffer before the first transfer. Comparison buffers can be transferred directly since each is used only once.

---

## Dependency Changes

### Add

| Package | Version | Purpose | Size |
|---------|---------|---------|------|
| `fft.js` | `^4.0.4` | Radix-4 FFT implementation | 5 KB minified |

### Remove

| Package | Version | Reason |
|---------|---------|--------|
| `synaudio` | `^0.4.0` | Replaced by GCC-PHAT implementation |

### Unchanged

All other dependencies remain. `@ffmpeg/ffmpeg`, `@ffmpeg/util`, etc. are used by audio extraction and export -- unrelated to the sync algorithm.

```bash
npm uninstall synaudio
npm install fft.js
```

**Note:** `fft.js` has TypeScript types available. Verify `@types/fft.js` exists or check if types are bundled. If not, a small `.d.ts` declaration file is needed:

```typescript
// src/types/fft.js.d.ts (if needed)
declare module 'fft.js' {
  export default class FFT {
    constructor(size: number);
    size: number;
    createComplexArray(): Float32Array;
    toComplexArray(input: Float32Array, storage?: Float32Array): Float32Array;
    fromComplexArray(complex: Float32Array, storage?: Float32Array): Float32Array;
    realTransform(output: Float32Array, input: Float32Array): void;
    completeSpectrum(spectrum: Float32Array): void;
    transform(output: Float32Array, input: Float32Array): void;
    inverseTransform(output: Float32Array, input: Float32Array): void;
  }
}
```

---

## Performance Estimates

### Per-Pair Timing (5-minute clips at 16kHz)

| Step | Estimated Time | Notes |
|------|---------------|-------|
| Hann window (2x) | ~5 ms | Simple multiply loop on 4.8M floats |
| Zero-pad to FFT size | ~2 ms | TypedArray allocation + copy |
| FFT reference | ~100-200 ms | 8M-point real FFT via fft.js |
| FFT comparison | ~100-200 ms | Same |
| Cross-power + phase transform | ~30 ms | Element-wise complex multiply + normalize |
| IFFT | ~100-200 ms | 8M-point inverse FFT |
| Peak finding | ~5 ms | Linear scan of constrained range |
| **Total per pair** | **~350-650 ms** | |

### Full Sync Session

| Scenario | Pairs | Estimated Total | Notes |
|----------|-------|----------------|-------|
| 2 cameras, 5 min | 1 | ~0.5-0.7 s | Reference FFT + 1 comparison |
| 4 cameras, 5 min | 3 | ~1.0-1.5 s | Reference FFT computed once |
| 8 cameras, 5 min | 7 | ~2.5-4.0 s | |
| 30 cameras, 5 min | 29 | ~10-18 s | |

The current SynAudio approach takes roughly similar time. The performance trade-off is not speed -- it is **accuracy and robustness**. GCC-PHAT will produce correct results in scenarios where Pearson correlation fails entirely.

### Comparison With Current Performance

| Metric | SynAudio (Pearson) | GCC-PHAT |
|--------|-------------------|----------|
| Speed per pair | ~200-400 ms (WASM SIMD) | ~350-650 ms (JS FFT) |
| Memory per pair | ~40 MB | ~275 MB |
| Accuracy (clean audio) | Excellent | Excellent |
| Accuracy (reverb/distance) | Poor | Excellent |
| Accuracy (repetitive content) | Poor | Good |
| Accuracy (different mics) | Moderate | Excellent |
| Confidence meaning | Correlation magnitude (hard to interpret) | Peak sharpness (intuitive) |

---

## Edge Cases and Robustness

### Very Short Audio (<1 second)

For clips shorter than 16,000 samples (1 second at 16kHz), the FFT size would be small enough (~32K with padding) that computation is near-instant. No special handling needed, but confidence will be low due to limited data.

### Very Long Audio (>30 minutes)

FFT size doubles: 2^24 = 16M points. Memory ~550 MB in worker. Still feasible but approaching limits. The `MAX_SYNC_OFFSET_SECONDS` constraint limits the search range, not the FFT size (which must accommodate the full signal length for correct correlation). For recordings over 30 minutes, consider chunking: correlate a 5-minute segment from the middle of each recording rather than the full duration. This is a future optimization, not needed for v2.3 MVP.

### Silent or Near-Silent Audio

If one track is nearly silent, all FFT magnitudes are near-zero. The phase transform division `G(f) / |G(f)|` amplifies noise. Detection: if the RMS of a track is below a threshold (e.g., -60 dB), skip spectral sync and report confidence = 0 with offset = 0.

```typescript
function isEffectivelySilent(signal: Float32Array, threshold = 0.001): boolean {
  let sumSq = 0;
  for (let i = 0; i < signal.length; i++) sumSq += signal[i] * signal[i];
  return Math.sqrt(sumSq / signal.length) < threshold;
}
```

### Numerical Stability in Phase Transform

Division by `|G(f)|` when `|G(f)|` is very small amplifies noise. Use a small epsilon:

```typescript
// In GCC-PHAT core:
const magnitude = Math.sqrt(re * re + im * im);
const scale = magnitude > 1e-10 ? 1.0 / magnitude : 0.0;
// Apply scale to normalize
```

---

## Testing Strategy

### Unit Tests (fftEngine.test.ts)

1. **Hann window:** Verify window values at boundaries (0 at edges, 1 at center for odd length)
2. **Known-offset synthetic signals:** Generate sine wave, delay by N samples, verify GCC-PHAT finds offset N
3. **Circular wrap handling:** Verify negative offsets are correctly decoded
4. **Silent input handling:** Verify graceful degradation (confidence = 0)
5. **Numerical stability:** Verify no NaN/Infinity with near-zero signals

### Integration Tests (spectralSync.test.ts)

1. **Worker creation and termination:** Verify worker is created and terminated cleanly
2. **Correct offset for known delay:** Synthetic audio pairs with known sample offsets
3. **Multiple comparisons reuse reference FFT:** Verify consistency across pairs
4. **Progress reporting:** Verify onProgress callback fires for each pair

### Acceptance Tests (real audio via Edge CDP)

1. **Clean speech, same room:** Should match current SynAudio accuracy
2. **Concert audio, different positions:** Should improve over current approach
3. **Different devices (phone + camera):** Should produce reliable sync
4. **Very different start times (>1 min offset):** Should find correct alignment

---

## Sources

- [GCC-PHAT explanation and Python implementation](https://github.com/xiongyihui/tdoa/blob/master/gcc_phat.py) -- reference implementation of the algorithm (MEDIUM confidence, verified against academic sources)
- [GCC-PHAT academic reference](https://xavieranguera.com/phdthesis/node92.html) -- phase weighting mathematical foundation (HIGH confidence)
- [fft.js (indutny)](https://github.com/indutny/fft.js/) -- Radix-4 FFT, API docs, performance benchmarks (HIGH confidence, verified via npm and GitHub)
- [KISS FFT vs fft.js benchmarks](https://toughengineer.github.io/demo/dsp/fft-perf/) -- performance comparison data (MEDIUM confidence)
- [Cross-Correlation in Spectral Audio Processing](https://www.dsprelated.com/freebooks/sasp/Cross_Correlation.html) -- theoretical foundation (HIGH confidence)
- [Coarse-to-fine audio sync combining fingerprints and GCC-PHAT](https://www.researchgate.net/publication/263925127_Fast_second_screen_TV_synchronization_combining_audio_fingerprint_technique_and_generalized_cross_correlation) -- two-stage approach reference (MEDIUM confidence)
- [MDN Transferable Objects](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects) -- zero-copy buffer transfer to workers (HIGH confidence)
- [Chrome: Transferable Objects Lightning Fast](https://developer.chrome.com/blog/transferable-objects-lightning-fast) -- performance characteristics of transfers (HIGH confidence)
- [Web Worker Performance Analysis](https://www.jameslmilner.com/posts/web-worker-performance/) -- postMessage overhead measurements (MEDIUM confidence)
- [Google Research: Temporal Synchronization of Multiple Audio Signals](https://research.google.com/pubs/archive/42193.pdf) -- multi-signal sync approach from Google (HIGH confidence)

---

*Architecture research for: v2.3 Robust Audio Sync -- Spectral Cross-Correlation Engine*
*Researched: 2026-03-28*
