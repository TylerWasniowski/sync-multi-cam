# Roadmap: Sync Multi-Cam

## Overview

This roadmap delivers a browser-based multi-camera video synchronization tool in four phases following the strict dependency chain: deploy infrastructure with file input first, then build the audio sync algorithm, then add video trimming and output delivery, and finally add visual waveform verification. Each phase delivers a coherent, verifiable capability that unblocks the next. The app runs entirely client-side via FFmpeg WASM and deploys as a static site on Cloudflare Pages.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation and File Input** - Deployable app shell with dark theme, file drop zone, and validated COOP/COEP headers on Cloudflare Pages
- [x] **Phase 2: Audio Sync Engine** - Extract audio from videos and cross-correlate to detect time offsets with confidence scoring
- [x] **Phase 3: Video Trimming and Output** - Trim videos to aligned start points and deliver downloadable synced files
- [x] **Phase 4: Waveform Visualization** - Render audio waveforms with sync point markers for visual verification of results

## Phase Details

### Phase 1: Foundation and File Input
**Goal**: Users can open the app in a browser, see a professional dark-themed interface, and load up to 30 video files via drag-and-drop or file browser -- with zero installation and clear privacy messaging
**Depends on**: Nothing (first phase)
**Requirements**: FILE-01, FILE-02, FILE-03, FILE-04, UX-01, UX-02, UX-03, UX-04, UX-05
**Success Criteria** (what must be TRUE):
  1. User can drag-and-drop video files (MP4, MOV, MKV, WebM) anywhere on the page and see them listed in the UI
  2. User can alternatively browse to select video files if drag-and-drop is not preferred
  3. App loads in a modern browser with a dark, professional UI theme and displays "files never leave your browser" privacy messaging
  4. App is deployed and accessible as a static site on Cloudflare Pages with SharedArrayBuffer enabled (COOP/COEP headers validated)
  5. FFmpeg WASM loads successfully in a Web Worker (verified by console or status indicator) with no server dependencies
**Plans**: 3 plans

Plans:
- [x] 01-01-PLAN.md -- Scaffold Vite project, configure COOP/COEP headers, deploy skeleton to Cloudflare Pages
- [x] 01-02-PLAN.md -- Build dark theme UI shell, file drop zone, file validation, file list, privacy banner
- [x] 01-03-PLAN.md -- Integrate FFmpeg WASM lazy loading, wire all components, final deploy and verify

### Phase 2: Audio Sync Engine
**Goal**: Users can trigger audio analysis on their loaded videos and see accurate time offsets and confidence scores -- the core algorithmic capability that makes the tool useful
**Depends on**: Phase 1
**Requirements**: SYNC-01, SYNC-02, SYNC-03, SYNC-04, SYNC-05
**Success Criteria** (what must be TRUE):
  1. App extracts audio tracks from all loaded videos using FFmpeg WASM without user intervention
  2. App cross-correlates audio waveforms and displays the detected timecode offset for each video relative to the reference
  3. App auto-selects a reference file (longest or first) and correlates all other files against it
  4. App displays a sync confidence score (correlation strength as percentage) for each video pair
**Plans**: 2 plans

Plans:
- [x] 02-01-PLAN.md -- Install SynAudio, define types/constants, create audio extraction and correlation engine modules
- [x] 02-02-PLAN.md -- Build SyncButton, SyncProgress, SyncResults components, wire sync pipeline into App.tsx, verify with real files

### Phase 3: Video Trimming and Output
**Goal**: Users get downloadable, synchronized video files trimmed to a common start point -- completing the core value proposition from input to output
**Depends on**: Phase 2
**Requirements**: OUT-01, OUT-02, OUT-03, OUT-04, OUT-05
**Success Criteria** (what must be TRUE):
  1. App trims each video using stream-copy (keyframe-aligned via mp4box.js, no re-encode) to align start points based on detected offsets, keeping full remaining footage
  2. UI presents synced videos in a list with offset info and individual per-file download buttons
  3. App provides a ZIP of all synced/trimmed video files with per-file and full-ZIP download buttons
  4. UI shows a multi-stage progress indicator during the entire pipeline (loading FFmpeg, extracting audio, analyzing, trimming)
**Plans**: 2 plans

Plans:
- [x] 03-01-PLAN.md -- Extend types, create videoTrimmer (stream-copy via mp4box.js keyframe index), zipBuilder (fflate), and downloadHelper modules
- [x] 03-02-PLAN.md -- Refactor SyncProgress into PipelineProgress, extend SyncResults with download buttons, wire full pipeline into App.tsx

### Phase 4: Waveform Visualization
**Goal**: Users can visually verify sync accuracy by seeing audio waveforms with alignment markers overlaid -- building confidence that the automated sync is correct
**Depends on**: Phase 2
**Requirements**: SYNC-06
**Success Criteria** (what must be TRUE):
  1. App renders audio waveforms for each video on canvas elements in the results view
  2. Waveforms display sync point markers showing where each video's audio aligns with the reference
**Plans**: 2 plans

Plans:
- [x] 04-01-PLAN.md -- Define waveform types, build peak downsampling library (TDD), create stateless WaveformCanvas renderer
- [x] 04-02-PLAN.md -- Build WaveformTrack/WaveformPanel with linked zoom/pan/cursor interaction, wire into App.tsx pipeline

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation and File Input | 3/3 | Complete | 2026-03-02 |
| 2. Audio Sync Engine | 2/2 | Complete | 2026-03-02 |
| 3. Video Trimming and Output | 2/2 | Complete | 2026-03-02 |
| 4. Waveform Visualization | 2/2 | Complete | 2026-03-02 |
