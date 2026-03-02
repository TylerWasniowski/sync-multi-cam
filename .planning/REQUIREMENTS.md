# Requirements: Sync Multi-Cam

**Defined:** 2026-03-01
**Core Value:** Accurately sync multiple camera angles by audio so users get aligned video files without installing any software

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### File Input

- [x] **FILE-01**: User can drag-and-drop video files onto a drop zone with visual feedback
- [x] **FILE-02**: User can browse to select video files as a fallback to drag-and-drop
- [x] **FILE-03**: App accepts common video formats (MP4, MOV, MKV, WebM)
- [x] **FILE-04**: App supports up to 30 video files simultaneously

### Audio Sync

- [x] **SYNC-01**: App extracts audio from uploaded videos using FFmpeg WASM
- [x] **SYNC-02**: App cross-correlates audio waveforms to detect time offsets between videos
- [x] **SYNC-03**: App auto-selects reference file (longest or first) with no user input required
- [ ] **SYNC-04**: App displays detected timecode offsets per video in the results UI
- [x] **SYNC-05**: App displays sync confidence score (correlation strength as percentage) per video
- [ ] **SYNC-06**: App renders audio waveforms on canvas with sync point markers for visual verification

### Output

- [x] **OUT-01**: App trims videos to align start points using stream-copy (no re-encode) via FFmpeg WASM
- [x] **OUT-02**: App keeps full remaining footage per video after trim (no forced end cut)
- [ ] **OUT-03**: UI presents individual synced videos in a list with offset info and per-file download buttons
- [x] **OUT-04**: App auto-downloads a zip of all synced/trimmed video files
- [ ] **OUT-05**: App shows multi-stage progress indicator during processing (loading, extracting, analyzing, trimming)

### UX

- [x] **UX-01**: App has a dark, modern, professional UI theme
- [x] **UX-02**: App prominently displays "files never leave your browser" privacy messaging
- [x] **UX-03**: App runs entirely client-side with no server dependencies
- [x] **UX-04**: App can be deployed as a static site on Cloudflare Pages
- [x] **UX-05**: App requires zero configuration — smart defaults for everything, just drop files and go

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Sync Refinement

- **SYNC-07**: User can manually adjust offsets by frames after auto-sync
- **SYNC-08**: User can select which video is the reference file (override auto-selection)

### Output Enhancement

- **OUT-06**: App offers re-encode mode toggle for frame-exact trim precision
- **OUT-07**: App exports NLE project file (FCP XML / Premiere XML) with pre-aligned clips

### Reliability

- **REL-01**: App detects and warns about audio clock drift in long recordings
- **REL-02**: App validates file sizes upfront and warns when approaching browser memory limits

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Real-time synced playback/preview | Massive memory/CPU usage, complex multi-stream sync — users verify in their NLE |
| Video editing (cut, merge, transitions) | Scope creep into NLE territory — sync and trim only |
| Multi-camera angle switching editor | Separate product entirely — export aligned files instead |
| Server-side processing | Contradicts client-side premise, adds cost/privacy concerns |
| Mobile support | FFmpeg WASM too memory-intensive for mobile browsers |
| Account system / cloud storage | Users want stateless tool — no signup, no tracking |
| Support for >30 videos | Memory scales linearly, correlation scales quadratically — desktop tools for larger setups |
| Audio drift compensation | Extremely complex, only matters for 30+ min recordings — defer to v2+ |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FILE-01 | Phase 1: Foundation and File Input | Complete |
| FILE-02 | Phase 1: Foundation and File Input | Complete |
| FILE-03 | Phase 1: Foundation and File Input | Complete |
| FILE-04 | Phase 1: Foundation and File Input | Complete |
| UX-01 | Phase 1: Foundation and File Input | Complete |
| UX-02 | Phase 1: Foundation and File Input | Complete |
| UX-03 | Phase 1: Foundation and File Input | Complete (01-01) |
| UX-04 | Phase 1: Foundation and File Input | Complete (01-01) |
| UX-05 | Phase 1: Foundation and File Input | Complete |
| SYNC-01 | Phase 2: Audio Sync Engine | Complete |
| SYNC-02 | Phase 2: Audio Sync Engine | Complete |
| SYNC-03 | Phase 2: Audio Sync Engine | Complete |
| SYNC-04 | Phase 2: Audio Sync Engine | Pending |
| SYNC-05 | Phase 2: Audio Sync Engine | Complete |
| OUT-01 | Phase 3: Video Trimming and Output | Complete |
| OUT-02 | Phase 3: Video Trimming and Output | Complete |
| OUT-03 | Phase 3: Video Trimming and Output | Pending |
| OUT-04 | Phase 3: Video Trimming and Output | Complete |
| OUT-05 | Phase 3: Video Trimming and Output | Pending |
| SYNC-06 | Phase 4: Waveform Visualization | Pending |

**Coverage:**
- v1 requirements: 20 total
- Mapped to phases: 20
- Unmapped: 0

---
*Requirements defined: 2026-03-01*
*Last updated: 2026-03-02 after 01-01-PLAN completion*
