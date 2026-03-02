---
phase: 01-foundation-and-file-input
plan: 02
subsystem: ui
tags: [react, typescript, tailwindcss, drag-and-drop, file-validation, dark-theme]

# Dependency graph
requires:
  - phase: 01-foundation-and-file-input
    plan: 01
    provides: "Vite + React + TypeScript scaffold with Tailwind CSS v4"
provides:
  - "VideoFile type definition"
  - "File validation logic with MIME type + extension fallback"
  - "Constants for accepted formats, file limits, CDN URLs"
  - "FileDropZone component with drag-and-drop and browse fallback"
  - "FileList component with file size display and removal"
  - "PrivacyBanner component with shield icon"
  - "Dark-themed App shell with header and state management"
affects: [01-03-PLAN, 02-01-PLAN, all-ui-plans]

# Tech tracking
tech-stack:
  added: []
  patterns: [native-drag-drop-with-dragcounter, mime-plus-extension-validation, crypto-randomuuid-for-ids]

key-files:
  created: [src/types/index.ts, src/lib/constants.ts, src/lib/fileValidation.ts, src/components/PrivacyBanner.tsx, src/components/FileDropZone.tsx, src/components/FileList.tsx, src/components/App.tsx]
  modified: [src/main.tsx]

key-decisions:
  - "Used inline SVGs for shield and X icons to avoid icon library dependency"
  - "Allowed incremental file adds (1 at a time) with count indicator rather than requiring 2+ in a single drop"
  - "Silently filter non-video files from mixed drops, only error when ALL files invalid"

patterns-established:
  - "Native HTML5 drag-and-drop with dragCounter ref to prevent flickering"
  - "MIME type + extension fallback for file validation (critical for MKV browser compatibility)"
  - "crypto.randomUUID() for generating unique file IDs"
  - "Components in src/components/, logic in src/lib/, types in src/types/"

requirements-completed: [FILE-01, FILE-02, FILE-03, FILE-04, UX-01, UX-02, UX-05]

# Metrics
duration: 2min
completed: 2026-03-02
---

# Phase 1 Plan 02: File Input UI and Validation Summary

**Dark-themed app shell with drag-and-drop file zone, MIME+extension video validation, file list with removal, and privacy banner**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-02T02:13:08Z
- **Completed:** 2026-03-02T02:14:50Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Built complete dark-themed UI with header, privacy messaging, and centered max-w-4xl layout
- Implemented drag-and-drop file zone with visual feedback, dragCounter anti-flicker, and Browse Files fallback
- Created file validation with MIME type check + extension fallback (handles MKV browser MIME quirks)
- Built file list with human-readable sizes, truncated names, and per-file remove buttons
- Enforced 4-file maximum with clear error messages and count indicator

## Task Commits

Each task was committed atomically:

1. **Task 1: Create type definitions, constants, and file validation logic** - `1af4872` (feat)
2. **Task 2: Build all UI components and wire into App shell** - `6126df5` (feat)

## Files Created/Modified
- `src/types/index.ts` - VideoFile interface with id, file, name, size, type fields
- `src/lib/constants.ts` - Accepted MIME types, extensions, file count limits, FFmpeg CDN base URL
- `src/lib/fileValidation.ts` - validateFiles() with MIME + extension fallback, count validation
- `src/components/PrivacyBanner.tsx` - Shield SVG icon with "Files never leave your browser" text
- `src/components/FileDropZone.tsx` - Drag-and-drop zone with visual feedback, Browse Files button, error display
- `src/components/FileList.tsx` - File list with formatted sizes, truncated names, X remove buttons
- `src/components/App.tsx` - Root layout with dark theme, files state, accepts/remove handlers
- `src/main.tsx` - Updated import path from ./App to ./components/App

## Decisions Made
- Used inline SVGs for shield and X icons to avoid adding an icon library dependency
- Allowed incremental file adds (1 at a time) with a count indicator ("X of 4 files added") rather than requiring 2+ files in a single drop -- this is more user-friendly per research recommendation
- Silently filter non-video files from mixed drops; only show error when ALL dropped files are invalid
- Removed scaffolded src/App.tsx and moved App component to src/components/App.tsx to match project structure from research

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All UI components built and wired, ready for FFmpeg WASM integration (Plan 03)
- VideoFile type and file state management in place for FFmpeg to consume
- File validation ensures only supported video formats reach processing pipeline
- Constants module provides FFmpeg CDN URLs for lazy loading in Plan 03

## Self-Check: PASSED

All 8 created/modified files verified on disk. Both task commits (1af4872, 6126df5) verified in git log. SUMMARY.md exists.

---
*Phase: 01-foundation-and-file-input*
*Completed: 2026-03-02*
