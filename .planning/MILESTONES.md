# Milestones

## v2.2 Cursor Fixes & UI Cleanup (Shipped: 2026-03-29)

**Delivered:** Fixed waveform cursor/playback position bugs and replaced the standalone Sync Results panel with professional-grade inline offset display (milliseconds + NLE timecode) on waveform tracks. Removed entire trimming/ZIP pipeline as composite export covers the use case.

**Phases completed:** 2 phases, 2 plans, 5 tasks
**Timeline:** 20 days (2026-03-08 → 2026-03-28)
**Codebase:** 5,791 LOC TypeScript
**Requirements:** 4/4 shipped

**Key accomplishments:**
1. Fixed cursor/playhead position mismatch via dynamic label offset measurement
2. Fixed play-from-beginning bug — playback starts from cursor position or sync start point
3. Removed SyncResults download area and entire trimming/ZIP pipeline (-649 lines, 5 files deleted)
4. Added NLE timecode offset display on waveform tracks (`+1.234s`, `00:00:01:07 @ 30fps`)
5. Simplified sync pipeline: extract audio → correlate → done (no trimming/ZIP stages)

**Archive:** `milestones/v2.2-ROADMAP.md`, `milestones/v2.2-REQUIREMENTS.md`

---

## v2.1 UI Polish (Shipped: 2026-03-08)

**Delivered:** Visual polish for muted track feedback, privacy messaging, and export controls redesign. Clearer visual hierarchy and better UX flow.

**Phases completed:** 2 phases, 2 plans, 5 tasks
**Timeline:** 1 day (2026-03-07)
**Codebase:** 6,664 LOC TypeScript
**Requirements:** 6/6 shipped

**Key accomplishments:**
1. Muted waveform rows dim with grayscale + opacity and smooth 300ms CSS transitions
2. Mute button stays bright via structural isolation outside dimmed container
3. Privacy message with shield icon prominently displayed in file drop zone
4. Centered export bar with enlarged, visually dominant export button
5. Persistent completion state with "Export Another" flow (user-approved UX improvement)

**Archive:** `milestones/v2.1-ROADMAP.md`, `milestones/v2.1-REQUIREMENTS.md`

---

## v2.0 Synced Playback & Export (Shipped: 2026-03-04)

**Delivered:** Synced multi-camera video playback in a dynamic grid with GPU-accelerated composite export. Watch all angles simultaneously, seek via waveforms, and download a single MP4 with all cameras composited.

**Phases completed:** 5 phases, 9 plans
**Timeline:** 2 days (2026-03-02 → 2026-03-03)
**Codebase:** 6,445 LOC TypeScript, 73 commits
**Requirements:** 21/22 shipped (POL-02 click-to-expand dropped per user preference)

**Key accomplishments:**
1. Dynamic grid layout with aspect-ratio-aware tile packing and fill/letterbox display modes
2. Synchronized multi-camera playback via standalone rAF timeline clock with offset-based shared timeline
3. Web Audio API mixer with per-track mute/unmute GainNode graph
4. Interactive waveform scrubbar: click-to-seek, drag-to-scrub, Shift+drag-to-pan, animated playhead with auto-follow
5. WebCodecs + Mediabunny GPU-accelerated composite export producing single H.264 MP4 at 4K/1080p/720p
6. Camera filename labels and keyboard shortcuts (Space, arrows) for playback polish

**Known Gaps:**
- POL-02: Click-to-expand fullscreen tile — removed per user feedback after implementation

**Archive:** `milestones/v2.0-ROADMAP.md`, `milestones/v2.0-REQUIREMENTS.md`

---

## v1.0 MVP (Shipped: 2026-03-02)

**Delivered:** Browser-based multi-camera video synchronization tool — drop files, sync by audio, download trimmed results. Zero install, fully client-side.

**Phases completed:** 4 phases, 11 plans
**Timeline:** 2 days (2026-03-01 → 2026-03-02)
**Codebase:** 3,334 LOC TypeScript, 72 commits
**Git range:** `7ac5912` → `2afd7b7`

**Key accomplishments:**
1. Deployed zero-install app on Cloudflare Pages with COOP/COEP headers enabling SharedArrayBuffer
2. Built audio cross-correlation sync engine using FFmpeg WASM extraction + SynAudio WASM SIMD correlation with confidence scoring
3. Implemented one-click pipeline: extract → correlate → trim → zip triggered by single button press
4. Stream-copy video trimming via mp4box.js keyframe index + FFmpeg `-c copy` preserving original HEVC/HDR codecs
5. Interactive multi-resolution waveform visualization with linked zoom/pan/cursor across all tracks and sync-point markers

**Audit:** passed (20/20 requirements, 3/3 E2E flows)
**Archive:** `milestones/v1.0-ROADMAP.md`, `milestones/v1.0-REQUIREMENTS.md`

---

