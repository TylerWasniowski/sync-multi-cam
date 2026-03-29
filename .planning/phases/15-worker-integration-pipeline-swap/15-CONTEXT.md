# Phase 15: Worker Integration + Pipeline Swap - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Wrap the GCC-PHAT engine (fftEngine.ts from Phase 14) in a Web Worker, wire it into the existing sync pipeline replacing SynAudio, add per-pair progress reporting, detect and surface audio quality warnings (silence, clipping), and remove the SynAudio dependency. The SyncResult interface is preserved exactly — zero downstream code changes.

</domain>

<decisions>
## Implementation Decisions

### Worker message protocol
- **D-01:** Follow the existing `exportWorker.ts` / `exportComposite.ts` pattern: typed message unions via `postMessage`, Vite module Worker (`new Worker(new URL('./spectralSyncWorker.ts', import.meta.url), { type: 'module' })`)
- **D-02:** Message types: `init` (send reference PCM, worker caches reference FFT), `compare` (send comparison PCM, worker runs GCC-PHAT against cached reference), `progress` (worker reports per-pair completion), `result` (offsetSamples + confidence), `error` (failure details)
- **D-03:** Reference buffer must be **copied** before transfer (original needed for all comparisons). Comparison buffers can be **transferred** (zero-copy via Transferable) since each is used only once per STACK.md spec (PIPE-04)
- **D-04:** Worker is created when `syncAudioTracks()` is called and terminated after all comparisons complete, freeing FFT buffers (~275MB)

### Audio quality detection
- **D-05:** Pre-sync analysis on PCM Float32Array before sending to worker: RMS below threshold detects silence/near-silence (CONF-03), percentage of samples at ±1.0 detects clipping/distortion (CONF-04)
- **D-06:** Detection runs on the main thread before worker init — catches issues early and surfaces warnings before sync begins
- **D-07:** Detection results are per-track: each track gets a `warnings: string[]` array appended to SyncResult or surfaced separately

### Warning UI design
- **D-08:** Inline warnings displayed per-track in the existing results area (where waveform offsets show). Yellow/amber styling for warnings
- **D-09:** Warnings are non-blocking — sync proceeds regardless. Text indicates results "may be unreliable" or "may be affected" rather than failing
- **D-10:** Low confidence results (CONF-02) also produce a visible warning — use the existing `getConfidenceLevel()` function's 'low' threshold

### Progress reporting
- **D-11:** Per-pair progress matching PROG-01: "Aligning camera N of M" where N is the current pair and M is total comparison count
- **D-12:** Update the existing `PipelineProgress` component's `correlating` stage message to show per-pair info instead of generic "Correlating track N of M"
- **D-13:** No sub-pair FFT stage reporting — unnecessary complexity for user-facing progress

### SynAudio removal
- **D-14:** Remove `synaudio` from package.json dependencies (PIPE-03)
- **D-15:** Remove SynAudio-specific constants from constants.ts (`CORRELATION_SAMPLE_SIZE`, `INITIAL_GRANULARITY`) and add GCC-PHAT-relevant constants if needed
- **D-16:** Preserve `SYNC_SAMPLE_RATE = 16000` — shared by both old and new engines

### Claude's Discretion
- Exact RMS threshold for silence detection
- Exact clipping percentage threshold
- Worker error handling and retry strategy
- Internal message type naming
- Whether warnings attach to SyncResult or are passed via a separate callback
- Exact wording of warning messages

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Algorithm and architecture
- `.planning/research/STACK.md` — Worker architecture, data transfer strategy, performance estimates, file structure (spectralSync.ts, spectralSyncWorker.ts)
- `.planning/research/ARCHITECTURE.md` — System architecture, integration boundaries
- `.planning/phases/14-dsp-foundation/14-CONTEXT.md` — Phase 14 decisions (fftEngine.ts module structure)

### Requirements
- `.planning/REQUIREMENTS.md` — PIPE-01 through PIPE-04, CONF-02 through CONF-04, PROG-01
- `.planning/ROADMAP.md` §Phase 15 — Success criteria (5 criteria that must be TRUE)

### Existing code to understand and modify
- `src/lib/audioSync.ts` — Current SynAudio-based sync, `syncAudioTracks()` function to replace internals
- `src/lib/exportComposite.ts` — Existing Worker pattern to follow (typed messages, lifecycle)
- `src/lib/exportWorker.ts` — Existing Worker implementation pattern
- `src/types/index.ts` — `SyncResult`, `AudioData`, `PipelineProgress` interfaces
- `src/lib/constants.ts` — Sync constants
- `src/components/App.tsx` — Pipeline orchestration, progress state, where syncAudioTracks is called
- `src/components/PipelineProgress.tsx` — Progress display component

### Phase 14 output (dependency)
- `src/lib/fftEngine.ts` — GCC-PHAT engine (`gccPhat()` and `applyHannWindow()` exports)
- `src/lib/__tests__/fftEngine.test.ts` — Test patterns and synthetic signal utilities

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `exportComposite.ts` + `exportWorker.ts`: Complete Worker pattern with typed messages, lifecycle management, Vite module Worker URL — directly replicable for sync worker
- `fftEngine.ts`: GCC-PHAT engine from Phase 14 — `gccPhat(reference, comparison, sampleRate, maxOffsetSeconds?)` returns `{ offsetSamples, confidence }`
- `getConfidenceLevel()` in `audioSync.ts`: Classifies confidence into high/medium/low — reuse for warning threshold (CONF-02)
- `PipelineProgress` component: Already displays `correlating` stage with current/total counts

### Established Patterns
- Typed message unions for Worker communication (`ExportWorkerCommand`, `ExportWorkerMessage`)
- Worker created via `new Worker(new URL('./file.ts', import.meta.url), { type: 'module' })`
- Worker terminated after use (not pooled)
- Progress via `setSyncProgress()` state updates in App.tsx

### Integration Points
- `syncAudioTracks()` in `audioSync.ts` — replace SynAudio internals with worker-based GCC-PHAT, same signature
- `App.tsx` line ~108 — calls `syncAudioTracks()` with progress callback, this stays unchanged
- `PipelineProgress.tsx` — update `correlating` message format for per-pair reporting
- `package.json` — remove `synaudio`, already has `fft.js` from Phase 14

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. Follow the existing exportWorker pattern for consistency.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 15-worker-integration-pipeline-swap*
*Context gathered: 2026-03-29*
