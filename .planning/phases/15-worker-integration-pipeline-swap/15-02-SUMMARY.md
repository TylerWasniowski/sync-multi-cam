---
phase: 15-worker-integration-pipeline-swap
plan: 02
subsystem: audio-sync
tags: [web-worker, gcc-phat, fft, postmessage, transferable, vitest]

# Dependency graph
requires:
  - phase: 14-dsp-foundation
    provides: gccPhat() function in fftEngine.ts
provides:
  - spectralSyncWorker.ts Web Worker wrapping GCC-PHAT
  - Rewritten syncAudioTracks() using Worker-based GCC-PHAT instead of SynAudio
  - Per-pair progress callback with {current, total} format
  - SynAudio dependency fully removed
affects: [15-03-PLAN, App.tsx correlating progress display]

# Tech tracking
tech-stack:
  added: []
  removed: [synaudio]
  patterns: [worker-rpc-promise, discriminated-union-worker-messages, transferable-buffer-management]

key-files:
  created:
    - src/lib/spectralSyncWorker.ts
  modified:
    - src/lib/audioSync.ts
    - src/lib/constants.ts
    - src/lib/__tests__/audioSync.test.ts
    - src/components/App.tsx
    - package.json

key-decisions:
  - "workerRPC() helper uses addEventListener/removeEventListener for one-shot promise resolution rather than onmessage assignment"
  - "Reference buffer copied via .slice() then transferred; comparison buffers transferred zero-copy"
  - "try/finally ensures worker.terminate() even on error paths"

patterns-established:
  - "SyncWorkerCommand/SyncWorkerMessage discriminated union types for typed worker communication"
  - "workerRPC() promise wrapper for sequential worker message exchange"
  - "MockWorker test pattern: vi.stubGlobal with queueMicrotask for async response simulation"

requirements-completed: [PIPE-01, PIPE-02, PIPE-03, PIPE-04, PROG-01]

# Metrics
duration: 4min
completed: 2026-03-29
---

# Phase 15 Plan 02: Worker Integration + Pipeline Swap Summary

**GCC-PHAT sync engine running in Web Worker via spectralSyncWorker.ts, SynAudio fully removed, zero interface changes to SyncResult**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-29T08:02:23Z
- **Completed:** 2026-03-29T08:06:42Z
- **Tasks:** 2/2
- **Files modified:** 6

## Accomplishments
- Created spectralSyncWorker.ts: Web Worker that receives PCM audio via postMessage and runs gccPhat() from fftEngine.ts
- Rewrote syncAudioTracks() to create/terminate a Worker per sync run with typed RPC, replacing all SynAudio internals
- Implemented Transferable buffer strategy: reference copied before transfer, comparison buffers transferred zero-copy (PIPE-04)
- Changed onProgress callback from percentage (0-100) to per-pair {current, total} format (PROG-01)
- Completely removed synaudio dependency from package.json and all source files (PIPE-03)
- Rewrote audioSync.test.ts with 17 tests using MockWorker pattern instead of SynAudio mocks

## Task Commits

Each task was committed atomically:

1. **Task 1: Create spectralSyncWorker.ts and rewrite audioSync.ts** - `33186bc` (feat)
2. **Task 2: Remove SynAudio dependency and rewrite audioSync tests** - `3e089b6` (feat)

## Files Created/Modified
- `src/lib/spectralSyncWorker.ts` - New Web Worker: receives PCM via postMessage, runs gccPhat() from fftEngine, returns {offsetSamples, confidence}
- `src/lib/audioSync.ts` - Rewritten: SyncWorkerCommand/SyncWorkerMessage types, workerRPC() helper, Worker-based syncAudioTracks()
- `src/lib/constants.ts` - Removed CORRELATION_SAMPLE_SIZE and INITIAL_GRANULARITY, added MAX_SYNC_OFFSET_SECONDS = 300
- `src/lib/__tests__/audioSync.test.ts` - Rewritten: MockWorker via vi.stubGlobal, 17 tests covering Worker lifecycle, RPC, progress, errors
- `src/components/App.tsx` - Updated onProgress callback to destructure {current, total} instead of percentage
- `package.json` - Removed synaudio dependency

## Decisions Made
- Used addEventListener/removeEventListener in workerRPC() rather than direct onmessage assignment, matching the pattern that supports multiple concurrent listeners and clean cleanup
- Wrapped worker lifecycle in try/finally to guarantee worker.terminate() even when comparisons throw errors
- Used queueMicrotask in MockWorker test helper for deterministic async response simulation

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated App.tsx onProgress callback to match new signature**
- **Found during:** Task 1 (audioSync.ts rewrite)
- **Issue:** App.tsx called syncAudioTracks with onProgress expecting a number (0-100), but new signature sends {current, total}
- **Fix:** Updated App.tsx callback to destructure {current, total} and use values directly for PipelineProgress
- **Files modified:** src/components/App.tsx
- **Verification:** TypeScript compiles cleanly
- **Committed in:** 33186bc (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential fix to avoid runtime crash. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Worker-based GCC-PHAT sync pipeline is complete and tested
- SyncResult interface preserved exactly (PIPE-02) -- downstream components need zero changes
- Ready for Plan 03: audio quality detection (silence/clipping warnings) and UI integration
- The spectralSyncWorker.ts + audioSync.ts pattern can serve as reference for any future Worker additions

## Self-Check: PASSED

All 6 files verified present. Both task commits (33186bc, 3e089b6) verified in git log.

---
*Phase: 15-worker-integration-pipeline-swap*
*Completed: 2026-03-29*
