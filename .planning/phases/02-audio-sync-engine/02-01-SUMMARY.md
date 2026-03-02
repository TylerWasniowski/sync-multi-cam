---
phase: 02-audio-sync-engine
plan: 01
subsystem: audio-sync
tags: [synaudio, ffmpeg-wasm, cross-correlation, pcm, wasm-simd, pearson-correlation]

# Dependency graph
requires:
  - phase: 01-foundation-and-file-input
    provides: FFmpeg WASM singleton (getFFmpeg), COOP/COEP headers for SharedArrayBuffer, VideoFile types
provides:
  - Audio extraction from video files to Float32Array PCM via FFmpeg WASM (extractAudio)
  - Cross-correlation engine using SynAudio WASM SIMD (syncAudioTracks)
  - Time offset and confidence scoring for multi-cam synchronization
  - Utility functions formatOffset and getConfidenceLevel for UI display
  - AudioData, SyncResult, SyncStage, SyncProgress type definitions
affects: [02-02-sync-ui, 03-output-generation]

# Tech tracking
tech-stack:
  added: [synaudio ^0.4.0, vitest ^4.0.18]
  patterns: [TDD with vitest, FFmpeg WASM FS cleanup in try/finally, SynAudio syncWorkerConcurrent for non-blocking correlation]

key-files:
  created:
    - src/lib/audioExtractor.ts
    - src/lib/audioSync.ts
    - src/lib/__tests__/audioExtractor.test.ts
    - src/lib/__tests__/audioSync.test.ts
  modified:
    - src/types/index.ts
    - src/lib/constants.ts
    - package.json
    - vite.config.ts

key-decisions:
  - "Used syncWorkerConcurrent (per-pair Web Worker) over syncOneToMany for simpler debugging and equivalent performance"
  - "SynAudio initialized with shared: true leveraging COOP/COEP headers from Phase 1"
  - "Installed vitest as test framework for TDD workflow"

patterns-established:
  - "TDD with vitest: RED (failing tests) -> GREEN (implementation) -> commit cycle"
  - "FFmpeg WASM filesystem cleanup pattern: try/finally with deleteFile().catch(() => {}) for both input and output"
  - "SynAudio mock pattern: class-based mock with shared state for constructor and method tracking"

requirements-completed: [SYNC-01, SYNC-02, SYNC-03, SYNC-05]

# Metrics
duration: 8min
completed: 2026-03-02
---

# Phase 2 Plan 1: Audio Sync Engine Summary

**FFmpeg-to-SynAudio pipeline: extract mono 16kHz PCM audio from videos and cross-correlate via WASM SIMD Pearson correlation to produce time offsets and confidence scores**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-02T04:19:42Z
- **Completed:** 2026-03-02T04:27:52Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- Audio extraction module converts any video format to mono 16kHz Float32Array PCM via FFmpeg WASM with automatic FS cleanup
- Cross-correlation engine selects longest track as reference and uses SynAudio WASM SIMD for non-blocking Pearson correlation
- Complete type system (AudioData, SyncResult, SyncStage, SyncProgress) and constants (SYNC_SAMPLE_RATE, CORRELATION_SAMPLE_SIZE) for the sync pipeline
- 22 passing tests covering extraction, correlation, utilities, and edge cases (TDD workflow)

## Task Commits

Each task was committed atomically:

1. **Task 1: Install SynAudio and define types and constants** - `1ecbc16` (feat)
2. **Task 2: Create audio extraction module** - `2e8653b` (test/RED), `68175b2` (feat/GREEN)
3. **Task 3: Create audio sync correlation module** - `0599060` (test/RED), `46d86a1` (feat/GREEN)

_Note: TDD tasks have separate test and implementation commits_

## Files Created/Modified

- `src/lib/audioExtractor.ts` - FFmpeg-based audio extraction: video File -> mono 16kHz Float32Array PCM
- `src/lib/audioSync.ts` - SynAudio cross-correlation: Float32Array tracks -> SyncResult[] with offsets and confidence
- `src/lib/__tests__/audioExtractor.test.ts` - 8 tests for extraction, WAV parsing, cleanup, progress
- `src/lib/__tests__/audioSync.test.ts` - 14 tests for correlation, reference selection, formatOffset, getConfidenceLevel
- `src/types/index.ts` - Added AudioData, SyncResult, SyncStage, SyncProgress interfaces
- `src/lib/constants.ts` - Added SYNC_SAMPLE_RATE (16000), CORRELATION_SAMPLE_SIZE (11025), INITIAL_GRANULARITY (16)
- `package.json` - Added synaudio dependency, vitest devDependency, test scripts
- `vite.config.ts` - Added vitest test configuration

## Decisions Made

- Used `syncWorkerConcurrent()` (per-pair Web Worker correlation) instead of `syncOneToMany()` -- simpler to debug, each call already parallelizes internally across CPU cores
- SynAudio initialized with `shared: true` to leverage SharedArrayBuffer via COOP/COEP headers validated in Phase 1
- Installed vitest (^4.0.18) as test framework -- natural fit for Vite projects, zero additional config needed
- Used `crypto.randomUUID()` for unique WASM FS filenames -- prevents collisions in defensive coding

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed SynAudio mock in audioSync tests**
- **Found during:** Task 3 (TDD GREEN phase)
- **Issue:** `vi.fn().mockImplementation()` creates a factory function, not a constructor -- vitest 4 rejects `new` on non-class mocks
- **Fix:** Rewrote mock to use a class-based mock (`class MockSynAudio`) with shared state tracking via module-level arrays
- **Files modified:** `src/lib/__tests__/audioSync.test.ts`
- **Verification:** All 14 tests pass
- **Committed in:** `46d86a1` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Test mock pattern corrected for vitest 4 compatibility. No scope creep.

## Issues Encountered

None - plan executed as specified with only the mock compatibility fix noted above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Audio extraction and correlation modules are complete and tested
- Ready for Plan 02-02: Sync UI components (SyncButton, SyncProgress, SyncResults)
- Types (SyncResult, SyncProgress, SyncStage) are ready for UI consumption
- Utility functions (formatOffset, getConfidenceLevel) ready for display formatting

---
*Phase: 02-audio-sync-engine*
*Completed: 2026-03-02*
