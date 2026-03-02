---
phase: 03-video-trimming-and-output
plan: 02
subsystem: ui
tags: [react, pipeline, progress, download, zip, trimming, ffmpeg]

# Dependency graph
requires:
  - phase: 03-01
    provides: "trimVideo(), buildZip(), triggerDownload() modules"
  - phase: 02-audio-sync
    provides: "syncAudioTracks() correlation engine, SyncResult types"
provides:
  - "Full one-click pipeline: extract -> correlate -> trim -> zip -> auto-download"
  - "PipelineProgress component with multi-stage progress display"
  - "SyncResults with per-file download buttons and Download ZIP button"
  - "DownloadableResult type for UI-layer trim results"
affects: [04-polish]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Full pipeline wiring in single handleSync callback", "maxOffset alignment for trim calculation"]

key-files:
  created:
    - src/components/PipelineProgress.tsx
  modified:
    - src/components/App.tsx
    - src/components/SyncResults.tsx
    - src/components/SyncButton.tsx
    - src/types/index.ts
  deleted:
    - src/components/SyncProgress.tsx

key-decisions:
  - "Refactored SyncProgress into PipelineProgress rather than bolt-on approach"
  - "maxOffset alignment: trim = maxOffset - fileOffset so latest-starting file has trim 0"
  - "Individual trim failures are logged and skipped; pipeline continues unless all fail"
  - "Skipped files (trim 0) included as-is in ZIP with original filename"

patterns-established:
  - "Pipeline state driven by single PipelineProgressType state variable"
  - "DownloadableResult extends SyncResult with trim data for download layer"

requirements-completed: [OUT-03, OUT-04, OUT-05]

# Metrics
duration: 3min
completed: 2026-03-02
---

# Phase 3 Plan 2: Pipeline UI Wiring Summary

**Full one-click pipeline from Sync Videos to auto-downloaded ZIP, with PipelineProgress multi-stage indicator and per-file download buttons**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-02T06:43:59Z
- **Completed:** 2026-03-02T06:46:52Z
- **Tasks:** 2
- **Files modified:** 5 (1 created, 3 modified, 1 deleted)

## Accomplishments
- Replaced SyncProgress with generic PipelineProgress component covering all 6 stages (extracting, correlating, trimming, zipping, complete, error)
- Wired full pipeline into App.tsx handleSync: after correlation completes, trimming auto-starts, then ZIP builds, then auto-download fires
- Extended SyncResults with per-file download buttons (trimmed data or original for skipped files) and a Download ZIP fallback button
- Added DownloadableResult type to bridge sync results with trim data for the UI download layer

## Task Commits

Each task was committed atomically:

1. **Task 1: Refactor SyncProgress into PipelineProgress and extend SyncResults** - `72a7ea3` (feat)
2. **Task 2: Wire full pipeline into App.tsx** - `6e1c8c4` (feat)

**Plan metadata:** (pending final commit)

## Files Created/Modified
- `src/components/PipelineProgress.tsx` - Generic multi-stage pipeline progress component replacing SyncProgress
- `src/components/App.tsx` - Full pipeline: extract -> correlate -> trim -> zip -> auto-download in one handleSync
- `src/components/SyncResults.tsx` - Extended with per-file download buttons and Download ZIP button
- `src/components/SyncButton.tsx` - Label updated from "Syncing..." to "Processing..."
- `src/types/index.ts` - Removed old SyncStage/SyncProgress types; added DownloadableResult interface
- `src/components/SyncProgress.tsx` - Deleted (fully replaced by PipelineProgress)

## Decisions Made
- Refactored SyncProgress into PipelineProgress rather than adding stages to old component -- cleaner types and imports
- Used maxOffset alignment for trim calculation: trimSeconds = max(offsets) - fileOffset, so the latest-starting track gets trim 0
- Individual trim failures are caught, logged via console.warn, and skipped -- pipeline continues to produce partial output
- If ALL trims fail, pipeline enters error state instead of producing empty ZIP
- Skipped files (trim 0) are read from original File blob via arrayBuffer() for ZIP inclusion
- ZIP files use original filename for untrimmed files and "synced_" prefix for trimmed files

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Core value proposition is now fully functional: drop files, click once, get synced output
- Ready for Phase 4 polish (error UX improvements, loading states, edge cases)
- All 45 existing tests pass; TypeScript compiles cleanly; production build succeeds

---

## Post-Phase Updates (2026-03-01)

- **Removed auto-download of ZIP**: `triggerDownload()` call removed from App.tsx pipeline. Download buttons in SyncResults (per-file + full ZIP) are sufficient. The `triggerDownload` import was also removed from App.tsx (still used by SyncResults).
- **Coordinated trim alignment**: App.tsx now calls `calculateAlignedTrims()` before trimming to coordinate keyframe snap points across all files, minimizing inter-file drift.

---
*Phase: 03-video-trimming-and-output*
*Completed: 2026-03-02*
