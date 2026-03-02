---
phase: 02-audio-sync-engine
plan: 02
subsystem: sync-ui
tags: [react, sync-pipeline, progress-ui, results-display]

# Dependency graph
requires:
  - phase: 02-audio-sync-engine
    plan: 01
    provides: extractAudio, syncAudioTracks, formatOffset, getConfidenceLevel, AudioData/SyncResult types
provides:
  - SyncButton component (trigger sync when 2+ files loaded)
  - SyncProgress component (extraction/correlation progress bar)
  - SyncResults component (offset + confidence display per file)
  - Full sync pipeline wired into App.tsx (extract -> correlate -> display)
affects: [03-video-trimming-and-output]

# Tech tracking
tech-stack:
  added: []
  patterns: [sequential audio extraction to stay within FFmpeg WASM memory limits, useCallback for async pipeline handler]

key-files:
  created:
    - src/components/SyncButton.tsx
    - src/components/SyncProgress.tsx
    - src/components/SyncResults.tsx
  modified:
    - src/components/App.tsx
    - src/lib/audioSync.ts
    - src/lib/audioExtractor.ts

key-decisions:
  - "Switched from syncWorkerConcurrent to syncWorker — avoids SynAudio thread-chunking bug where base audio chunks become smaller than comparison audio"
  - "Removed shared: true from SynAudio constructor — syncWorker doesn't need SharedArrayBuffer"
  - "Added robust WAV header parsing — scans for 'data' chunk ID instead of hardcoded 44-byte offset"
  - "Sequential audio extraction (not parallel) to stay within FFmpeg WASM 2GB memory limit"

patterns-established:
  - "WAV chunk parsing pattern: scan for chunk IDs instead of assuming fixed header size"

requirements-completed: [SYNC-04]

# Metrics
duration: ~25min (including bug investigation across sessions)
completed: 2026-03-02
---

# Phase 2 Plan 2: Sync UI Summary

**Wire the audio sync engine into the UI with SyncButton, SyncProgress, and SyncResults components — completing the user flow from file drop to sync results display**

## Performance

- **Duration:** ~25 min (tasks 1-2: ~10 min, task 3 bug investigation: ~15 min across sessions)
- **Tasks:** 3 (2 auto + 1 human-verify checkpoint)
- **Files created:** 3
- **Files modified:** 3

## Accomplishments

- SyncButton component with dynamic label ("Add N more files to sync" / "Sync Videos" / "Syncing...")
- SyncProgress component showing extraction and correlation stages with animated progress bar
- SyncResults component displaying per-file offsets, color-coded confidence, and reference badge
- Full pipeline orchestration in App.tsx: extract audio sequentially → correlate → display results
- Fixed critical SynAudio syncWorkerConcurrent bug (returned zero offsets with 4+ threads)
- Added robust WAV header parsing that handles extra metadata chunks

## Task Commits

1. **Task 1: Create SyncButton, SyncProgress, and SyncResults components** — `0d18be4`
2. **Task 2: Wire sync pipeline into App.tsx** — `f5c6f88`
3. **Task 3: Human verification** — bug found, fixed in `02d924d` (switch to syncWorker + WAV parsing fix)

## Files Created/Modified

- `src/components/SyncButton.tsx` — Sync trigger button, disabled when <2 files or syncing
- `src/components/SyncProgress.tsx` — Progress bar with stage labels and file counts
- `src/components/SyncResults.tsx` — Results table with offset, confidence, reference label
- `src/components/App.tsx` — Added sync state, handleSync pipeline, renders new components
- `src/lib/audioSync.ts` — Switched from syncWorkerConcurrent to syncWorker, removed shared option
- `src/lib/audioExtractor.ts` — Added robust WAV 'data' chunk parsing

## Decisions Made

- Switched `syncWorkerConcurrent()` → `syncWorker()` after discovering thread-chunking bug that returns zero offsets when base audio is split into pieces smaller than comparison audio
- Removed `shared: true` from SynAudio constructor — `syncWorker` uses a single Web Worker, no SharedArrayBuffer needed
- WAV header parsing now scans for 'data' chunk ID instead of assuming 44-byte offset — handles FFmpeg WAV files with LIST/INFO metadata chunks

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] SynAudio syncWorkerConcurrent zero-offset bug**
- **Found during:** Task 3 human verification
- **Issue:** `syncWorkerConcurrent` with 4+ threads chunks base audio into pieces smaller than comparison, breaking correlation (returns sampleOffset: 0)
- **Fix:** Switched to `syncWorker` (single Web Worker), removed `shared: true` option, added robust WAV parsing
- **Files modified:** `src/lib/audioSync.ts`, `src/lib/audioExtractor.ts`
- **Verification:** Works correctly with real multi-cam video files in browser
- **Committed in:** `02d924d`

---

**Total deviations:** 1 auto-fixed (1 bug in upstream SynAudio library)
**Impact on plan:** Required switching sync method; no scope creep.

## Issues Encountered

- SynAudio's `syncWorkerConcurrent()` has a thread-splitting bug with 4+ threads — documented for potential upstream report
- Initial debug session complicated by Vite HMR not reflecting code changes — resolved by hard refresh

## Next Phase Readiness

- Full sync pipeline is working end-to-end: drop files → click sync → see offsets and confidence
- Phase 2 success criteria met: audio extraction, cross-correlation, reference selection, confidence display
- Ready for Phase 3: Video Trimming and Output (use sync offsets to trim videos)

---
*Phase: 02-audio-sync-engine*
*Completed: 2026-03-02*
