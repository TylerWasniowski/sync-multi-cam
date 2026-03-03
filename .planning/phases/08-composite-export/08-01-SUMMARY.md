---
phase: 08-composite-export
plan: 01
subsystem: export
tags: [webcodecs, mediabunny, web-worker, offscreen-canvas, h264, aac, mp4]

# Dependency graph
requires:
  - phase: 05-playback-grid
    provides: computeGridLayout() pure function for tile positioning
provides:
  - WebCodecs+Mediabunny export Worker (demux, decode, composite, encode, mux)
  - Main-thread export orchestration API (startExport, cancelExport, checkWebCodecsSupport)
  - Typed Worker message protocol (ExportWorkerCommand, ExportWorkerMessage)
  - Resolution presets with bitrates (EXPORT_RESOLUTIONS)
  - AudioConfig, ExportState with 'cancelled' in shared types
affects: [08-composite-export]

# Tech tracking
tech-stack:
  added: [mediabunny]
  patterns: [web-worker-message-protocol, offscreen-canvas-compositing, webcodecs-hw-encoding]

key-files:
  created:
    - src/lib/exportWorker.ts
  modified:
    - src/lib/exportComposite.ts
    - src/types/index.ts
    - src/lib/constants.ts
    - src/lib/ffmpeg.ts
    - package.json

key-decisions:
  - "Keep @ffmpeg/ffmpeg packages (still used by audioExtractor and videoTrimmer for sync pipeline)"
  - "Move FFmpeg constants from shared constants.ts to local scope in ffmpeg.ts"
  - "AudioConfig type defined in shared types/index.ts (not in exportComposite.ts)"
  - "VideoSample.close() in try/finally for GPU memory safety"
  - "Even dimension rounding via bitwise AND ~1 for H.264 compliance"
  - "Audio mixing via OfflineAudioContext at 48kHz stereo"

patterns-established:
  - "Web Worker message protocol: typed command/message discriminated unions via satisfies"
  - "CanvasSource.add() await pattern for encoder backpressure"
  - "Mediabunny Input/Output lifecycle: dispose inputs, cancel output on error"

requirements-completed: [EXP-01, EXP-02, EXP-03, EXP-04]

# Metrics
duration: 6min
completed: 2026-03-03
---

# Phase 8 Plan 1: WebCodecs Export Pipeline Summary

**WebCodecs+Mediabunny export Worker with OffscreenCanvas grid compositing, H.264+AAC encoding, and typed main-thread orchestration API**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-03T19:44:07Z
- **Completed:** 2026-03-03T19:50:43Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Installed mediabunny library for WebCodecs-based MP4 demux/mux, replacing FFmpeg WASM for the export path
- Built a complete Web Worker export pipeline: demux via BlobSource/Input, decode via VideoSampleSink, composite via OffscreenCanvas+computeGridLayout, encode H.264 via CanvasSource (hardware-accelerated), audio decode via AudioBufferSink, mix via OfflineAudioContext, encode AAC via AudioBufferSource, mux to MP4 via Mp4OutputFormat/BufferTarget
- Rewrote exportComposite.ts as a main-thread orchestration API with startExport/cancelExport/checkWebCodecsSupport and typed Worker message handling
- Added ExportWorkerCommand, ExportWorkerMessage, and AudioConfig types to shared types, plus 'cancelled' state to ExportState

## Task Commits

Each task was committed atomically:

1. **Task 1: Install mediabunny, remove FFmpeg from export, update types and constants** - `d97a772` (chore)
2. **Task 2: Build export Worker and main-thread orchestration module** - `ef67051` (feat)

## Files Created/Modified
- `src/lib/exportWorker.ts` - Web Worker: full WebCodecs+Mediabunny pipeline (demux, decode, composite, encode, mux)
- `src/lib/exportComposite.ts` - Main-thread API: startExport, cancelExport, checkWebCodecsSupport, EXPORT_RESOLUTIONS
- `src/types/index.ts` - ExportState with 'cancelled', ExportWorkerCommand, ExportWorkerMessage, AudioConfig types
- `src/lib/constants.ts` - Removed FFmpeg-specific constants (moved to ffmpeg.ts)
- `src/lib/ffmpeg.ts` - Moved FFmpeg CDN constants to local scope (still used by sync pipeline)
- `package.json` - Added mediabunny dependency
- `src/lib/exportComposite.test.ts` - Deleted (old FFmpeg filtergraph tests no longer applicable)

## Decisions Made
- Kept @ffmpeg/ffmpeg and @ffmpeg/util installed because audioExtractor.ts, videoTrimmer.ts, and App.tsx still use them for the sync pipeline (audio extraction, video trimming, FFmpeg preloading)
- Kept ffmpeg.ts alive with FFmpeg CDN constants moved from shared constants.ts to local scope
- AudioConfig type placed in shared types/index.ts rather than exportComposite.ts for cross-module access
- VideoSample.close() wrapped in try/finally to prevent GPU memory leaks even on draw errors
- Even dimension enforcement via bitwise AND ~1 on canvas dimensions
- Audio mixing at 48kHz stereo via OfflineAudioContext regardless of input sample rates

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Kept @ffmpeg/ffmpeg packages and ffmpeg.ts**
- **Found during:** Task 1 (Install mediabunny, remove FFmpeg)
- **Issue:** Plan called for `npm uninstall @ffmpeg/ffmpeg @ffmpeg/util` and deleting `ffmpeg.ts`, but these are still imported by `audioExtractor.ts`, `videoTrimmer.ts`, and `App.tsx` for the sync pipeline (non-export functionality). Removing them would break the entire app.
- **Fix:** Kept both packages installed and `ffmpeg.ts` alive. Moved FFmpeg CDN constants from shared `constants.ts` to local scope in `ffmpeg.ts`. Only removed FFmpeg usage from the export code path.
- **Files modified:** src/lib/constants.ts, src/lib/ffmpeg.ts
- **Verification:** `npx tsc -p tsconfig.app.json --noEmit` shows no new errors in sync pipeline files
- **Committed in:** d97a772 (Task 1 commit)

**2. [Rule 1 - Bug] Added null check for BufferTarget.buffer**
- **Found during:** Task 2 (Build export Worker)
- **Issue:** `BufferTarget.buffer` is typed as `ArrayBuffer | null` -- null before finalization. TypeScript caught the type mismatch with ExportWorkerMessage.data (which expects ArrayBuffer).
- **Fix:** Added null guard with descriptive error message after `output.finalize()`.
- **Files modified:** src/lib/exportWorker.ts
- **Verification:** `npx tsc -p tsconfig.app.json --noEmit` shows no errors in exportWorker.ts
- **Committed in:** ef67051 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both auto-fixes necessary for correctness. The FFmpeg retention is the most significant deviation -- the plan assumed FFmpeg was only used for export, but it's integral to the sync pipeline. No scope creep.

## Issues Encountered
- ExportPanel.tsx has 3 type errors from importing now-removed `exportComposite` function and `ExportConfig` type. This is expected per the plan and will be resolved in plan 08-02 when ExportPanel is updated for the new API.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Export Worker pipeline is complete and ready for UI integration
- ExportPanel.tsx needs updating to use new startExport/cancelExport API (plan 08-02)
- Cancel button needs to be added to ExportPanel UI (plan 08-02)
- WebCodecs browser support check (checkWebCodecsSupport) ready for UI integration

---
*Phase: 08-composite-export*
*Completed: 2026-03-03*
