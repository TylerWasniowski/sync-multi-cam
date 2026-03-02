---
phase: 03-video-trimming-and-output
plan: 01
subsystem: video-processing
tags: [ffmpeg-wasm, fflate, zip, video-trimming, smart-rendering, blob-download]

# Dependency graph
requires:
  - phase: 01-project-foundation
    provides: FFmpeg WASM singleton (getFFmpeg), audioExtractor pattern
provides:
  - trimVideo() function with smart rendering and full re-encode fallback
  - buildZip() function using fflate zipSync store mode (level 0)
  - triggerDownload() utility for browser blob downloads
  - PipelineStage, PipelineProgress, TrimResult, TrimmedFile types
affects: [03-02-PLAN, phase-04-polish]

# Tech tracking
tech-stack:
  added: [fflate ^0.8.2]
  patterns: [smart-rendering-with-fallback, store-mode-zip, blob-anchor-download]

key-files:
  created:
    - src/lib/videoTrimmer.ts
    - src/lib/zipBuilder.ts
    - src/lib/downloadHelper.ts
    - src/lib/__tests__/videoTrimmer.test.ts
    - src/lib/__tests__/zipBuilder.test.ts
    - src/lib/__tests__/downloadHelper.test.ts
  modified:
    - src/types/index.ts
    - package.json

key-decisions:
  - "Smart rendering with fallback: probe keyframes, re-encode only to first keyframe, stream-copy rest; fall back to full re-encode if probing fails"
  - "fflate zipSync at level 0 (store mode) for pre-compressed video -- no wasted CPU on already-compressed data"
  - "downloadHelper tests use globalThis DOM mocks instead of jsdom to keep node test environment"

patterns-established:
  - "Smart rendering pattern: try keyframe probe + partial re-encode + stream-copy + concat, catch -> full re-encode fallback"
  - "Progress via ffmpeg time field (not broken progress field) divided by 1_000_000 for seconds"
  - "WASM FS cleanup of ALL intermediate files (5 per trim) in finally block"

requirements-completed: [OUT-01, OUT-02, OUT-04]

# Metrics
duration: 5min
completed: 2026-03-02
---

# Phase 3 Plan 1: Video Trimming Engine Summary

**Smart-rendering video trimmer with fflate ZIP builder and blob download utility -- frame-precise cuts via FFmpeg WASM re-encode with keyframe-aware optimization**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-02T06:35:57Z
- **Completed:** 2026-03-02T06:40:39Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- trimVideo() with smart rendering: probes keyframes, re-encodes only from trim point to first keyframe, stream-copies rest, with automatic fallback to full re-encode
- buildZip() wraps fflate zipSync at level 0 (store mode) for bundling pre-compressed video Uint8Arrays
- triggerDownload() creates blob URL + anchor click for browser file downloads with proper URL lifecycle cleanup
- Extended type system with PipelineStage (7 stages), PipelineProgress, TrimResult, TrimmedFile
- 23 new unit tests all passing (13 videoTrimmer + 5 zipBuilder + 5 downloadHelper)

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend types and create videoTrimmer.ts** - `7ae2871` (feat)
2. **Task 2: Create zipBuilder.ts and downloadHelper.ts** - `683bc97` (feat)

_Note: TDD tasks had RED (fail) -> GREEN (pass) within each commit_

## Files Created/Modified
- `src/types/index.ts` - Added PipelineStage, PipelineProgress, TrimResult, TrimmedFile types
- `src/lib/videoTrimmer.ts` - trimVideo() with smart rendering + full re-encode fallback
- `src/lib/zipBuilder.ts` - buildZip() using fflate zipSync store mode
- `src/lib/downloadHelper.ts` - triggerDownload() blob URL + anchor click utility
- `src/lib/__tests__/videoTrimmer.test.ts` - 13 tests covering skip, args, cleanup, progress
- `src/lib/__tests__/zipBuilder.test.ts` - 5 tests including roundtrip unzip verification
- `src/lib/__tests__/downloadHelper.test.ts` - 5 tests with globalThis DOM mocks
- `package.json` - Added fflate dependency

## Decisions Made
- Smart rendering implemented with keyframe probing via `-skip_frame nokey` + showinfo filter log parsing; falls back cleanly to full re-encode when WASM FFmpeg cannot probe
- Used fflate over JSZip for smaller bundle (8kB) and faster ZIP creation with store mode
- downloadHelper tests use manual globalThis DOM stubs instead of switching to jsdom environment, keeping consistency with existing node test environment

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] downloadHelper test environment lacks DOM globals**
- **Found during:** Task 2 (downloadHelper tests)
- **Issue:** Test environment is `node` (from vite.config.ts), so `document` is not defined
- **Fix:** Rewrote tests to manually set up DOM globals on `globalThis` instead of relying on jsdom
- **Files modified:** src/lib/__tests__/downloadHelper.test.ts
- **Verification:** All 5 downloadHelper tests pass in node environment
- **Committed in:** 683bc97 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minor test adaptation. No scope creep. All functionality delivered as specified.

## Issues Encountered
- videoTrimmer test for progress handler equality initially compared wrong mock call indices (on/off calls include both 'progress' and 'log' events from smart rendering probe); fixed by filtering for 'progress' event specifically

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All three lib modules ready for UI wiring in Plan 03-02
- PipelineStage and PipelineProgress types ready for refactoring SyncProgress into generic PipelineProgress component
- TrimResult and TrimmedFile types ready for pipeline state management
- Offset calculation logic (maxOffset - fileOffset) documented in research but not yet wired -- Plan 03-02 handles this

---

## Post-Phase Rewrite (2026-03-01)

**videoTrimmer.ts was fully rewritten** to replace smart rendering with pure stream-copy:
- Added `mp4box` dependency for reading keyframe positions from container metadata (stss atom) — no frame decoding
- New `src/lib/keyframeIndex.ts` module wraps mp4box.js `getTrackSamplesInfo()` → filters `is_sync` samples
- `trimVideo()` now snaps to nearest keyframe >= trimSeconds and uses FFmpeg `-c copy` (no re-encode)
- Added `calculateAlignedTrims()` for coordinated cross-file keyframe alignment (minimizes inter-file drift)
- Removed all H.264 re-encoding (`-c:v libx264`, `-crf`, `-preset`, `-accurate_seek`, concat workflow)
- Preserves HEVC/HDR metadata that smart rendering destroyed
- WASM FS cleanup reduced from 5 files to 2 (input + output only)
- Tests rewritten: 15 tests for stream-copy behavior + 4 tests for keyframeIndex

**Reason:** Smart rendering was fundamentally broken for iPhone HEVC recordings — keyframe probe hung on 10-bit HEVC decoding in WASM, and H.264 re-encode + HEVC stream-copy concat produced broken output. Pure stream-copy trims a 332MB file in ~2 seconds.

---
*Phase: 03-video-trimming-and-output*
*Completed: 2026-03-02*
