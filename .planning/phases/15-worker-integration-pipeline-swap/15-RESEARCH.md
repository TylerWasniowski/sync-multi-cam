# Phase 15: Worker Integration + Pipeline Swap - Research

**Researched:** 2026-03-29
**Domain:** Web Worker integration, audio pipeline replacement, audio quality detection, progress reporting
**Confidence:** HIGH

## Summary

Phase 15 wraps the existing `fftEngine.ts` GCC-PHAT algorithm (from Phase 14) in a Web Worker, wires it into the sync pipeline replacing SynAudio, adds per-pair progress reporting, detects audio quality issues (silence, clipping), and removes the SynAudio dependency. The SyncResult interface is preserved exactly, meaning zero downstream code changes.

The project already has a complete, working Worker pattern (`exportComposite.ts` + `exportWorker.ts`) that Phase 15 replicates for the sync worker. The existing `audioSync.ts` provides the seam: `syncAudioTracks()` keeps its signature but replaces its SynAudio internals with worker-based GCC-PHAT calls. Audio quality detection (silence via RMS, clipping via sample saturation counting) runs on the main thread before the worker is initialized, producing per-track warnings. PipelineProgress already supports a `correlating` stage with current/total counts -- Phase 15 updates the message format for per-pair reporting ("Aligning camera N of M").

**Primary recommendation:** Follow the exportWorker pattern exactly: typed message unions via `postMessage`, Vite module Worker instantiation, worker created per sync run and terminated after completion. Implement audio quality detection as a pure function that analyzes Float32Array PCM before worker init. Update existing tests (audioSync.test.ts) to mock the worker instead of SynAudio.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Follow the existing `exportWorker.ts` / `exportComposite.ts` pattern: typed message unions via `postMessage`, Vite module Worker (`new Worker(new URL('./spectralSyncWorker.ts', import.meta.url), { type: 'module' })`)
- **D-02:** Message types: `init` (send reference PCM, worker caches reference FFT), `compare` (send comparison PCM, worker runs GCC-PHAT against cached reference), `progress` (worker reports per-pair completion), `result` (offsetSamples + confidence), `error` (failure details)
- **D-03:** Reference buffer must be **copied** before transfer (original needed for all comparisons). Comparison buffers can be **transferred** (zero-copy via Transferable) since each is used only once per STACK.md spec (PIPE-04)
- **D-04:** Worker is created when `syncAudioTracks()` is called and terminated after all comparisons complete, freeing FFT buffers (~275MB)
- **D-05:** Pre-sync analysis on PCM Float32Array before sending to worker: RMS below threshold detects silence/near-silence (CONF-03), percentage of samples at +/-1.0 detects clipping/distortion (CONF-04)
- **D-06:** Detection runs on the main thread before worker init -- catches issues early and surfaces warnings before sync begins
- **D-07:** Detection results are per-track: each track gets a `warnings: string[]` array appended to SyncResult or surfaced separately
- **D-08:** Inline warnings displayed per-track in the existing results area (where waveform offsets show). Yellow/amber styling for warnings
- **D-09:** Warnings are non-blocking -- sync proceeds regardless. Text indicates results "may be unreliable" or "may be affected" rather than failing
- **D-10:** Low confidence results (CONF-02) also produce a visible warning -- use the existing `getConfidenceLevel()` function's 'low' threshold
- **D-11:** Per-pair progress matching PROG-01: "Aligning camera N of M" where N is the current pair and M is total comparison count
- **D-12:** Update the existing `PipelineProgress` component's `correlating` stage message to show per-pair info instead of generic "Correlating track N of M"
- **D-13:** No sub-pair FFT stage reporting -- unnecessary complexity for user-facing progress
- **D-14:** Remove `synaudio` from package.json dependencies (PIPE-03)
- **D-15:** Remove SynAudio-specific constants from constants.ts (`CORRELATION_SAMPLE_SIZE`, `INITIAL_GRANULARITY`) and add GCC-PHAT-relevant constants if needed
- **D-16:** Preserve `SYNC_SAMPLE_RATE = 16000` -- shared by both old and new engines

### Claude's Discretion
- Exact RMS threshold for silence detection
- Exact clipping percentage threshold
- Worker error handling and retry strategy
- Internal message type naming
- Whether warnings attach to SyncResult or are passed via a separate callback
- Exact wording of warning messages

### Deferred Ideas (OUT OF SCOPE)
None.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PIPE-01 | Sync computation runs in a Web Worker using fft.js, not blocking the UI thread | Worker pattern from exportComposite.ts/exportWorker.ts; `@vitest/web-worker` for testing; fftEngine.ts imports cleanly in worker context |
| PIPE-02 | SyncResult interface is preserved exactly ({offsetSeconds, offsetSamples, confidence, isReference}) -- zero downstream code changes | `syncAudioTracks()` signature unchanged; worker returns raw `{ offsetSamples, confidence }` and main thread maps to SyncResult; types/index.ts unchanged |
| PIPE-03 | SynAudio WASM dependency is removed and replaced with fft.js (pure JS, 5KB) | `npm uninstall synaudio`; remove `import SynAudio from 'synaudio'` from audioSync.ts; remove SynAudio-specific constants; fft.js already installed |
| PIPE-04 | Audio buffers are transferred to the worker via Transferable objects (zero-copy for comparison buffers, copy for reference buffer) | `postMessage(data, [transferable])` pattern; `Float32Array.buffer` as Transferable; `.slice()` to copy reference before transfer |
| CONF-02 | Low confidence results produce a visible warning in the UI indicating sync may be inaccurate | `getConfidenceLevel()` already classifies <40 as 'low'; add warning display in WaveformTrack when confidence is low |
| CONF-03 | Silence or near-silent audio is detected and surfaced as a warning to the user | RMS calculation on Float32Array PCM; threshold ~-50dB (RMS < 0.003); pre-sync main thread analysis |
| CONF-04 | Clipping distortion is detected and surfaced as a warning to the user | Count samples at +/-1.0 (within epsilon); threshold ~0.5% of total samples; pre-sync main thread analysis |
| PROG-01 | Sync progress reports which camera pair is being processed (e.g., "Aligning camera 3 of 8") | Worker posts `progress` messages; main thread updates PipelineProgress with per-pair counts |
</phase_requirements>

## Standard Stack

### Core (already installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fft.js | ^4.0.4 | FFT computation inside worker | Already installed (Phase 14). Pure JS, 5KB, works in Workers without WASM instantiation |
| vitest | ^4.0.18 | Test runner | Already installed. Supports `@vitest/web-worker` plugin for Worker testing |

### Supporting (new dev dependency)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @vitest/web-worker | ^4.1.1 | Web Worker support in Vitest tests | Required for testing `spectralSyncWorker.ts` in node environment. Must match vitest major version |

### Removed

| Library | Version | Reason |
|---------|---------|--------|
| synaudio | ^0.4.0 | Replaced by fft.js + custom GCC-PHAT engine. `npm uninstall synaudio` |

**Installation:**
```bash
npm install -D @vitest/web-worker
npm uninstall synaudio
```

**Note:** `@vitest/web-worker` version MUST match the vitest major version (both v4.x). The project uses `vitest ^4.0.18`, so `@vitest/web-worker ^4.1.1` is compatible.

## Architecture Patterns

### File Structure (new and modified files)

```
src/
  lib/
    fftEngine.ts              # EXISTS (Phase 14) -- pure GCC-PHAT math
    audioSync.ts              # MODIFY -- replace SynAudio internals with worker calls
    audioQuality.ts           # NEW -- silence/clipping detection (pure functions)
    spectralSyncWorker.ts     # NEW -- Web Worker: receives PCM, runs fftEngine
    constants.ts              # MODIFY -- remove SynAudio constants, add GCC-PHAT constants
    __tests__/
      audioSync.test.ts       # MODIFY -- re-mock for new worker-based implementation
      audioQuality.test.ts    # NEW -- unit tests for silence/clipping detection
      fftEngine.test.ts       # EXISTS (Phase 14) -- unchanged
  types/
    index.ts                  # MODIFY -- add AudioWarning type and warnings field
  components/
    WaveformTrack.tsx         # MODIFY -- display per-track warnings inline
    PipelineProgress.tsx      # MODIFY -- update correlating message format
    App.tsx                   # MODIFY -- integrate audio quality detection, pass warnings
```

### Pattern 1: Worker Message Protocol (replicating exportWorker pattern)

**What:** Typed discriminated union messages between main thread and worker.
**When to use:** All communication with spectralSyncWorker.ts.
**Example:**
```typescript
// Types for worker communication (in audioSync.ts or types/index.ts)
type SyncWorkerCommand =
  | { type: 'init'; referenceBuffer: Float32Array; sampleRate: number }
  | { type: 'compare'; comparisonBuffer: Float32Array; maxOffsetSeconds: number }
  | { type: 'terminate' };

type SyncWorkerMessage =
  | { type: 'ready' }
  | { type: 'result'; offsetSamples: number; confidence: number }
  | { type: 'error'; message: string };
```

### Pattern 2: Worker Lifecycle (per D-04)

**What:** Worker created for each sync run, terminated after all comparisons complete.
**When to use:** Inside the rewritten `syncAudioTracks()`.
**Example:**
```typescript
// Inside audioSync.ts syncAudioTracks()
const worker = new Worker(
  new URL('./spectralSyncWorker.ts', import.meta.url),
  { type: 'module' }
);

// Send reference (COPIED, not transferred -- D-03)
const refCopy = reference.audio.channelData[0].slice();
worker.postMessage(
  { type: 'init', referenceBuffer: refCopy, sampleRate: SYNC_SAMPLE_RATE },
  [refCopy.buffer]  // transfer the copy
);

// For each comparison (TRANSFERRED, zero-copy -- D-03)
const compBuffer = track.audio.channelData[0];
worker.postMessage(
  { type: 'compare', comparisonBuffer: compBuffer, maxOffsetSeconds: MAX_SYNC_OFFSET_SECONDS },
  [compBuffer.buffer]  // transfer (original detached, but not needed again)
);

// After all comparisons
worker.terminate();
```

### Pattern 3: Buffer Transfer vs Copy

**What:** Reference buffer is copied before transfer (needed for all comparisons). Comparison buffers are transferred directly (used once).
**When to use:** All `postMessage` calls to the sync worker.
**Critical detail:** `postMessage(data, [data.buffer])` transfers ownership -- the sending thread can no longer access `data`. For the reference, we `.slice()` first to keep the original. For comparisons, we transfer directly since each comparison PCM is used only once during sync (waveform peaks are already computed earlier in the pipeline, per App.tsx lines 91-92).

### Pattern 4: Audio Quality Detection (pure functions)

**What:** Analyze Float32Array PCM for silence and clipping before sync.
**When to use:** In App.tsx after audio extraction, before calling syncAudioTracks.
**Example:**
```typescript
// src/lib/audioQuality.ts
export interface AudioWarning {
  type: 'silence' | 'clipping' | 'low-confidence';
  message: string;
}

export function detectAudioWarnings(pcm: Float32Array): AudioWarning[] {
  const warnings: AudioWarning[] = [];

  // Silence detection: RMS below threshold
  const rms = computeRMS(pcm);
  if (rms < SILENCE_RMS_THRESHOLD) {
    warnings.push({
      type: 'silence',
      message: 'Audio is silent or near-silent -- sync may be unreliable',
    });
  }

  // Clipping detection: percentage of samples at +/-1.0
  const clipRatio = computeClipRatio(pcm);
  if (clipRatio > CLIPPING_RATIO_THRESHOLD) {
    warnings.push({
      type: 'clipping',
      message: 'Audio has clipping distortion -- sync may be affected',
    });
  }

  return warnings;
}
```

### Anti-Patterns to Avoid

- **Reusing worker across sync runs:** D-04 specifies create-per-run and terminate after. Pooling would leak ~275MB of FFT buffers.
- **Transferring reference buffer without copy:** The reference is needed for ALL comparison pairs. Transferring detaches it from the main thread, making subsequent comparisons impossible.
- **Running quality detection in the worker:** D-06 specifies main thread before worker init so warnings appear immediately before sync begins.
- **Modifying SyncResult interface:** PIPE-02 explicitly forbids this. Warnings should be tracked separately (parallel data structure or separate state).
- **Blocking on worker messages with synchronous waits:** Use Promise-based wrappers around `postMessage`/`onmessage`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Worker testing in node env | Custom Worker mock | `@vitest/web-worker` | Provides `Worker` constructor shim that Vitest handles correctly. Simulates Workers in the same thread for testing. |
| FFT computation | Any FFT implementation | fft.js (already in project) | Proven, 5KB, already typed and tested in Phase 14 |
| Structured clone for transfers | Manual array copying | `postMessage(data, [transferable])` | Browser-native Transferable API handles zero-copy buffer transfer |
| RMS calculation | External library | ~5 lines of inline math | `sqrt(sum(x^2) / N)` is trivial for Float32Array |

## Common Pitfalls

### Pitfall 1: Transferable Detaches the Source Buffer
**What goes wrong:** After `postMessage(data, [data.buffer])`, the original `Float32Array` becomes zero-length and unusable on the sending thread. If the reference PCM is transferred without copy, all subsequent comparisons fail with empty arrays.
**Why it happens:** Transferable objects move ownership between threads -- the source ArrayBuffer is detached (neutered).
**How to avoid:** Always `.slice()` the reference buffer before transferring. Only transfer comparison buffers (used once). Per D-03.
**Warning signs:** `Float32Array.byteLength === 0` after postMessage, or comparisons returning offset 0 with confidence 0.

### Pitfall 2: Worker URL Resolution with Vite
**What goes wrong:** Worker file not found at runtime, or Vite doesn't bundle worker dependencies.
**Why it happens:** Incorrect URL pattern or missing `{ type: 'module' }`.
**How to avoid:** Use exactly: `new Worker(new URL('./spectralSyncWorker.ts', import.meta.url), { type: 'module' })`. This is the pattern already working in `exportComposite.ts` line 53.
**Warning signs:** Worker creation throws, or worker `import` statements fail at runtime.

### Pitfall 3: Worker onmessage Race Condition
**What goes wrong:** Main thread sends `compare` before worker has finished processing `init` (caching reference FFT).
**Why it happens:** `postMessage` is async fire-and-forget. No built-in sequencing.
**How to avoid:** Worker sends a `ready` message after processing `init`. Main thread waits for `ready` before sending first `compare`. Use a Promise wrapper.
**Warning signs:** Worker tries to use undefined reference FFT for comparison.

### Pitfall 4: @vitest/web-worker Version Mismatch
**What goes wrong:** Tests crash with module resolution errors or Worker constructor not found.
**Why it happens:** `@vitest/web-worker` must match the vitest major version.
**How to avoid:** Project uses `vitest ^4.0.18` -- install `@vitest/web-worker@^4.1.1`.
**Warning signs:** `ReferenceError: Worker is not defined` in tests, or import resolution failures.

### Pitfall 5: fft.js Float64Array Compatibility in Worker
**What goes wrong:** fft.js documentation shows `Float32Array` but fftEngine.ts uses `Float64Array` for precision.
**Why it happens:** fft.js accepts `ArrayLike<number>` internally (per the type declarations), so both Float32Array and Float64Array work. But the type declarations use `ArrayLike<number>` which may need attention.
**How to avoid:** fftEngine.ts already handles this correctly -- it creates Float64Array intermediates and passes them to fft.js. The existing fftEngine.test.ts proves this works. No changes needed to fftEngine.ts.
**Warning signs:** None expected -- Phase 14 tests already validate this.

### Pitfall 6: Comparison Buffer Detachment Before Waveform Peaks
**What goes wrong:** If comparison PCM is transferred to the worker before waveform peaks are computed, the peaks computation gets an empty buffer.
**Why it happens:** Transfer detaches the ArrayBuffer.
**How to avoid:** In App.tsx, waveform peaks are already computed during the extraction loop (line 92) BEFORE `syncAudioTracks()` is called (line 108). This ordering is safe -- peaks are computed from the original PCM, then the buffer can be transferred to the worker later.
**Warning signs:** Empty waveform display despite successful audio extraction.

### Pitfall 7: SynAudio Mock in Existing Tests
**What goes wrong:** After removing SynAudio, `audioSync.test.ts` breaks because it mocks `synaudio` module.
**Why it happens:** Tests import and mock `synaudio` which no longer exists.
**How to avoid:** Rewrite audioSync.test.ts to mock the Worker constructor or the worker module instead. The test structure changes from mocking SynAudio constructor + syncWorker to mocking Worker postMessage/onmessage.
**Warning signs:** `Cannot find module 'synaudio'` in test output.

## Code Examples

### Worker Implementation (spectralSyncWorker.ts)

```typescript
// src/lib/spectralSyncWorker.ts
import { gccPhat } from './fftEngine';
import type { SyncWorkerCommand, SyncWorkerMessage } from './audioSync';

let cachedRefFFTData: Float32Array | null = null;
let sampleRate = 16000;

self.onmessage = (e: MessageEvent<SyncWorkerCommand>) => {
  const { data } = e;

  switch (data.type) {
    case 'init': {
      // Cache reference data for reuse across all comparisons
      cachedRefFFTData = data.referenceBuffer;
      sampleRate = data.sampleRate;
      // Note: We store the raw PCM, not pre-computed FFT, because
      // gccPhat() handles FFT internally. Caching the reference
      // avoids re-transferring it for each comparison.
      const msg: SyncWorkerMessage = { type: 'ready' };
      self.postMessage(msg);
      break;
    }

    case 'compare': {
      if (!cachedRefFFTData) {
        const msg: SyncWorkerMessage = {
          type: 'error',
          message: 'Worker not initialized -- call init first',
        };
        self.postMessage(msg);
        return;
      }

      try {
        const { offsetSamples, confidence } = gccPhat(
          cachedRefFFTData,
          data.comparisonBuffer,
          sampleRate,
          data.maxOffsetSeconds,
        );
        const msg: SyncWorkerMessage = { type: 'result', offsetSamples, confidence };
        self.postMessage(msg);
      } catch (err) {
        const msg: SyncWorkerMessage = {
          type: 'error',
          message: err instanceof Error ? err.message : 'GCC-PHAT failed',
        };
        self.postMessage(msg);
      }
      break;
    }
  }
};
```

### Modified syncAudioTracks (audioSync.ts core loop)

```typescript
// Key change: replace SynAudio with worker-based GCC-PHAT
// Worker sends 'init' with reference, then 'compare' for each pair

function createSyncWorker(): Worker {
  return new Worker(
    new URL('./spectralSyncWorker.ts', import.meta.url),
    { type: 'module' },
  );
}

function workerRPC(
  worker: Worker,
  command: SyncWorkerCommand,
  transferables: Transferable[] = [],
): Promise<SyncWorkerMessage> {
  return new Promise((resolve, reject) => {
    const handler = (e: MessageEvent<SyncWorkerMessage>) => {
      worker.removeEventListener('message', handler);
      if (e.data.type === 'error') {
        reject(new Error(e.data.message));
      } else {
        resolve(e.data);
      }
    };
    worker.addEventListener('message', handler);
    worker.onerror = (e) => {
      worker.removeEventListener('message', handler);
      reject(new Error(e.message || 'Worker crashed'));
    };
    worker.postMessage(command, transferables);
  });
}
```

### Audio Quality Detection (audioQuality.ts)

```typescript
// src/lib/audioQuality.ts

/** RMS threshold: -50dB ~ 0.00316. Using 0.003 for round threshold */
const SILENCE_RMS_THRESHOLD = 0.003;

/** Clipping: if >0.5% of samples are at +/-1.0 (within epsilon) */
const CLIPPING_RATIO_THRESHOLD = 0.005;

/** Epsilon for clipping boundary detection */
const CLIP_EPSILON = 0.001;

export interface AudioWarning {
  type: 'silence' | 'clipping' | 'low-confidence';
  message: string;
}

export function detectAudioWarnings(pcm: Float32Array): AudioWarning[] {
  const warnings: AudioWarning[] = [];
  const N = pcm.length;
  if (N === 0) return warnings;

  // RMS for silence detection
  let sumSq = 0;
  let clipCount = 0;
  for (let i = 0; i < N; i++) {
    const s = pcm[i];
    sumSq += s * s;
    if (Math.abs(s) >= 1.0 - CLIP_EPSILON) {
      clipCount++;
    }
  }

  const rms = Math.sqrt(sumSq / N);
  if (rms < SILENCE_RMS_THRESHOLD) {
    warnings.push({
      type: 'silence',
      message: 'Audio is silent or near-silent \u2014 sync may be unreliable',
    });
  }

  const clipRatio = clipCount / N;
  if (clipRatio > CLIPPING_RATIO_THRESHOLD) {
    warnings.push({
      type: 'clipping',
      message: 'Audio has clipping distortion \u2014 sync may be affected',
    });
  }

  return warnings;
}
```

### Warning Display in WaveformTrack

```typescript
// Added to WaveformTrack.tsx props:
// warnings?: AudioWarning[];

// Rendered inline, amber/yellow, non-blocking (per D-08, D-09):
{warnings && warnings.length > 0 && (
  <div className="flex flex-col gap-0.5 mt-1">
    {warnings.map((w, i) => (
      <span key={i} className="text-[10px] text-amber-400">
        {w.message}
      </span>
    ))}
  </div>
)}
```

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest ^4.0.18 |
| Config file | `vite.config.ts` (inline `test` block, environment: 'node') |
| Quick run command | `npx vitest run src/lib/__tests__/audioSync.test.ts src/lib/__tests__/audioQuality.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PIPE-01 | Sync runs in Web Worker (UI not blocked) | unit (worker mock) | `npx vitest run src/lib/__tests__/audioSync.test.ts -t "worker"` | Needs rewrite (Wave 0) |
| PIPE-02 | SyncResult interface preserved | unit | `npx vitest run src/lib/__tests__/audioSync.test.ts -t "SyncResult"` | Needs rewrite (Wave 0) |
| PIPE-03 | SynAudio removed | unit (import check) | `npx vitest run` (build would fail if synaudio imported) | N/A (removal verification) |
| PIPE-04 | Buffers transferred via Transferable | unit (mock verification) | `npx vitest run src/lib/__tests__/audioSync.test.ts -t "transfer"` | Needs rewrite (Wave 0) |
| CONF-02 | Low confidence warning visible | unit | `npx vitest run src/lib/__tests__/audioQuality.test.ts` | New file (Wave 0) |
| CONF-03 | Silence detection | unit | `npx vitest run src/lib/__tests__/audioQuality.test.ts -t "silence"` | New file (Wave 0) |
| CONF-04 | Clipping detection | unit | `npx vitest run src/lib/__tests__/audioQuality.test.ts -t "clipping"` | New file (Wave 0) |
| PROG-01 | Per-pair progress reporting | unit | `npx vitest run src/lib/__tests__/audioSync.test.ts -t "progress"` | Needs rewrite (Wave 0) |

### Sampling Rate

- **Per task commit:** `npx vitest run src/lib/__tests__/audioSync.test.ts src/lib/__tests__/audioQuality.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/lib/__tests__/audioSync.test.ts` -- must be rewritten to mock Worker instead of SynAudio
- [ ] `src/lib/__tests__/audioQuality.test.ts` -- new file covering CONF-02, CONF-03, CONF-04
- [ ] `@vitest/web-worker` dev dependency -- install to support Worker testing in node environment
- [ ] `vite.config.ts` test.setupFiles -- may need `@vitest/web-worker` added if Worker constructor is used directly in tests

### Testing Strategy Notes

**Option A (recommended): Mock the Worker in audioSync.test.ts.** Since the worker is created inside `syncAudioTracks()`, tests can mock `Worker` constructor to intercept `postMessage` and reply with synthetic results. This tests the orchestration logic without requiring actual FFT computation in tests.

**Option B: Use @vitest/web-worker for integration tests.** The `@vitest/web-worker` package provides a real Worker shim that runs the worker file in the same thread. This would test the actual worker + fftEngine pipeline but requires the setup file. Best for a separate integration test file.

**Recommendation:** Use Option A for `audioSync.test.ts` (fast, focused on orchestration) and keep the existing `fftEngine.test.ts` for algorithm correctness. A separate integration test is optional since Phase 16 (validation) will test the full pipeline with real audio files.

## Recommended Thresholds (Claude's Discretion Areas)

### Silence RMS Threshold
**Recommendation:** `0.003` (approximately -50dB)

Rationale: Digital silence is 0.0 RMS. Background noise in a typical room recording is -40dB to -30dB (RMS 0.01 to 0.03). A threshold of 0.003 (-50dB) catches genuinely silent or near-silent tracks (mic off, no audio stream) while avoiding false positives on quiet recordings. This threshold is conservative -- it flags tracks that are essentially unusable for sync.

### Clipping Percentage Threshold
**Recommendation:** `0.005` (0.5% of total samples)

Rationale: Even heavily clipped audio typically has <5% of samples at the rails. A threshold of 0.5% catches moderate to severe clipping while ignoring occasional isolated peaks. The clipping boundary should be `|sample| >= 0.999` (1.0 minus small epsilon) to account for floating-point representation.

### Worker Error Handling Strategy
**Recommendation:** No retry. If the worker reports an error for a comparison pair, propagate it as a failed sync for that pair. Rationale: GCC-PHAT errors are deterministic (short signal, zero signal) -- retrying produces the same error. The error message should be surfaced to the user.

### Warning Attachment Strategy
**Recommendation:** Parallel data structure, not modified SyncResult.

Store warnings as `Map<string, AudioWarning[]>` (keyed by fileId) alongside `SyncResult[]`. This preserves PIPE-02 exactly (SyncResult interface unchanged) while allowing the UI to display warnings per track. Low-confidence warnings (CONF-02) are added after sync completes by checking each result's confidence via `getConfidenceLevel()`.

```typescript
// In App.tsx state
const [audioWarnings, setAudioWarnings] = useState<Map<string, AudioWarning[]>>(new Map());
```

## Constants Changes

### Remove from constants.ts
```typescript
// DELETE: SynAudio-specific
export const CORRELATION_SAMPLE_SIZE = 11025;
export const INITIAL_GRANULARITY = 16;
```

### Add to constants.ts (or keep in audioSync.ts)
```typescript
// GCC-PHAT configuration
export const MAX_SYNC_OFFSET_SECONDS = 300; // 5 minutes max offset
```

### Preserve
```typescript
export const SYNC_SAMPLE_RATE = 16000; // Shared by old and new engines
```

## Integration Sequence

The sync pipeline in `App.tsx` handleSync currently has two phases: extract and correlate. Phase 15 adds an audio quality check between them:

```
1. Extract audio (unchanged -- loop over files, extractAudio + computeMultiResolutionPeaks)
2. NEW: Detect audio quality (loop over extracted tracks, detectAudioWarnings per track)
3. NEW: Set audioWarnings state (display warnings immediately, before sync starts)
4. Correlate (rewritten -- syncAudioTracks uses worker instead of SynAudio)
5. NEW: Add low-confidence warnings after sync completes
6. Display results (unchanged -- syncResults + waveformPeaks + NEW audioWarnings)
```

The key insight: quality detection (step 2) runs BEFORE sync (step 4) per D-06, so warnings appear immediately while sync is computing. Low-confidence warnings (step 5) can only be determined after sync completes.

## Progress Reporting Detail

Current App.tsx (line 108-115):
```typescript
const results = await syncAudioTracks(audioTracks, (progress) => {
  const completed = Math.round((progress / 100) * (files.length - 1));
  setSyncProgress({
    stage: 'correlating',
    current: completed,
    total: files.length - 1,
    message: `Correlating track ${completed} of ${files.length - 1}...`,
  });
});
```

New approach: The progress callback parameter changes from a percentage (0-100) to pair-level info. Internally, `syncAudioTracks` calls `onProgress` after each worker `result` message:

```typescript
// Inside rewritten syncAudioTracks:
onProgress?.({ current: i + 1, total: comparisons.length });
```

App.tsx updates the message:
```typescript
message: `Aligning camera ${current} of ${total}...`
```

PipelineProgress.tsx message line already displays `progress.message` -- no change needed to the component itself, only to the message string set in App.tsx.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SynAudio Pearson WASM | GCC-PHAT pure JS in Worker | Phase 14-15 (v2.3) | Robust to different mics, reverb, repetitive content |
| SynAudio syncWorker (internal worker) | Explicit Worker with typed messages | Phase 15 (v2.3) | Full control over lifecycle, progress, error handling |
| No audio quality warnings | Pre-sync silence/clipping detection | Phase 15 (v2.3) | Users warned before unreliable sync |

## Open Questions

1. **Progress callback signature change**
   - What we know: Current `onProgress` takes `(progress: number)` where progress is 0-100 percentage. New implementation needs per-pair info.
   - What's unclear: Whether to change the callback signature or keep it as percentage and compute pair info in App.tsx.
   - Recommendation: Change to `(info: { current: number; total: number }) => void` for clarity, and update App.tsx accordingly. This is an internal API -- no downstream consumers besides App.tsx.

2. **@vitest/web-worker setup vs per-file import**
   - What we know: Can be configured globally in `vite.config.ts` test.setupFiles or imported per-test.
   - What's unclear: Whether the global setup affects other existing tests.
   - Recommendation: Import per-test file (`import '@vitest/web-worker'` at top of audioSync.test.ts) to avoid side effects on other tests. This is the safer approach.

3. **Worker reference caching optimization**
   - What we know: STACK.md mentions caching the reference FFT in the worker. fftEngine.ts `gccPhat()` computes the reference FFT from scratch each call.
   - What's unclear: Whether to refactor fftEngine.ts to accept pre-computed reference FFT.
   - Recommendation: Do NOT refactor fftEngine.ts. The reference is stored as raw PCM in the worker and `gccPhat()` is called per pair. The FFT recomputation per pair adds ~100-200ms but avoids complexity. This is acceptable for the typical 3-7 pair use case. Optimization deferred to SCALE-01 if needed.

## Sources

### Primary (HIGH confidence)
- Project source code: `src/lib/exportComposite.ts`, `src/lib/exportWorker.ts` -- existing Worker pattern
- Project source code: `src/lib/fftEngine.ts` -- GCC-PHAT engine from Phase 14
- Project source code: `src/lib/audioSync.ts` -- current SynAudio-based sync to replace
- Project source code: `src/components/App.tsx` -- pipeline orchestration
- [MDN Transferable Objects](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects) -- postMessage transfer semantics
- [vitest-dev/vitest packages/web-worker](https://github.com/vitest-dev/vitest/tree/main/packages/web-worker) -- @vitest/web-worker setup and usage

### Secondary (MEDIUM confidence)
- [@vitest/web-worker npm](https://www.npmjs.com/package/@vitest/web-worker) -- version 4.1.1 confirmed via web search
- [GitHub cwilso/volume-meter](https://github.com/cwilso/volume-meter) -- clip detection pattern for Web Audio
- [DSPRelated: Audio Clipping Algorithm](https://www.dsprelated.com/showthread/comp.dsp/339611-1.php) -- RMS and crest factor for clipping detection

### Tertiary (LOW confidence)
- None -- all findings verified against project code or official documentation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- only change is adding @vitest/web-worker dev dependency and removing synaudio. Both verified.
- Architecture: HIGH -- directly replicating existing exportWorker pattern with well-understood modifications.
- Pitfalls: HIGH -- identified from direct code inspection (buffer transfer semantics, Worker URL pattern, test mock structure).
- Audio quality detection: HIGH for approach, MEDIUM for exact thresholds (thresholds are discretionary and may need tuning).

**Research date:** 2026-03-29
**Valid until:** 2026-04-28 (stable domain, no fast-moving dependencies)
