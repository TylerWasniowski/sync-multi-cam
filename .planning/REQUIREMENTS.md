# Requirements: Sync Multi-Cam

**Defined:** 2026-03-02
**Core Value:** Accurately sync multiple camera angles by audio so users get aligned video files without installing any software

## v2.0 Requirements

Requirements for synced playback and composite export. Each maps to roadmap phases.

### Grid Layout

- [x] **GRID-01**: User sees all synced videos in a dynamic grid that packs tiles to minimize blank space based on video count and aspect ratios
- [x] **GRID-02**: User can toggle between "preserve aspect ratio" (letterbox) and "fill tiles" (crop) display modes
- [x] **GRID-03**: Grid layout responds to container resize without requiring manual refresh

### Synchronized Playback

- [x] **PLAY-01**: User can play/pause all synced videos simultaneously with a single transport control
- [x] **PLAY-02**: All videos maintain frame-level sync during playback via drift-corrected sync loop
- [x] **PLAY-03**: User can seek to any point and all videos jump to the correct offset position
- [x] **PLAY-04**: Waveform tracks remain interactive immediately after sync completes while video previews load in background

### Audio

- [x] **AUD-01**: All camera audio tracks play mixed together by default during preview
- [x] **AUD-02**: User can mute/unmute individual camera audio tracks via per-track toggle buttons
- [x] **AUD-03**: Audio selection persists during playback session (survives seek/pause/play)

### Waveform Integration

- [x] **WAVE-01**: User can click anywhere on a waveform track to seek all videos to that time position
- [x] **WAVE-02**: User can drag along a waveform track to scrub playback position in real time
- [x] **WAVE-03**: An animated playhead cursor tracks current playback position across all waveform tracks
- [x] **WAVE-04**: Panning requires Shift+drag (changed from bare drag); a visible UI hint communicates this
- [ ] **WAVE-05**: Waveform zoom/pan and video playback position stay synchronized

### Composite Export

- [ ] **EXP-01**: User can download a single MP4 (H.264) containing all camera angles composited in the grid layout
- [ ] **EXP-02**: User can select export resolution: 4K (default), 1080p, or 720p
- [ ] **EXP-03**: Export shows frame-level progress indicator
- [ ] **EXP-04**: User can select which audio track(s) to include in the exported video

### Polish

- [ ] **POL-01**: Camera filename labels display on tiles during preview (not baked into export)
- [ ] **POL-02**: User can click a tile to expand it fullscreen, click again to return to grid
- [ ] **POL-03**: Keyboard shortcuts work for transport: space (play/pause), arrow keys (seek)

## Future Requirements

Deferred beyond v2.0. Tracked but not in current roadmap.

### Advanced Export

- **AEXP-01**: NLE project file export (FCP XML / Premiere XML)
- **AEXP-02**: Export bitrate/quality control (CRF slider)
- **AEXP-03**: WebCodecs-based GPU export pipeline (when Safari VideoEncoder coverage is solid)

### Advanced Playback

- **APLAY-01**: Per-tile color grading (exposure, white balance per camera)
- **APLAY-02**: Loop region with in/out markers on waveform

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Real-time canvas compositing during playback | Fights browser compositor, degrades quality -- use native `<video>` elements |
| Camera labels baked into export | User explicitly requested labels in preview only |
| WebCodecs export for v2.0 | Firefox H.264 encoder broken, Safari pre-26 absent -- defer to v3+ |
| More than 8 cameras in export | FFmpeg WASM memory constraint -- sync supports 30 files but export caps at 8 |
| Video editing (cuts, effects, transitions) | Out of scope -- sync, preview, and composite export only |
| Audio drift compensation | Extremely complex, only matters for 30+ min recordings |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| GRID-01 | Phase 5 | Complete |
| GRID-02 | Phase 5 | Complete |
| GRID-03 | Phase 5 | Complete |
| PLAY-01 | Phase 5 | Complete |
| PLAY-02 | Phase 5 | Complete |
| PLAY-03 | Phase 5 | Complete |
| PLAY-04 | Phase 5 | Complete |
| AUD-01 | Phase 6 | Complete |
| AUD-02 | Phase 6 | Complete |
| AUD-03 | Phase 6 | Complete |
| WAVE-01 | Phase 7 | Complete |
| WAVE-02 | Phase 7 | Complete |
| WAVE-03 | Phase 7 | Complete |
| WAVE-04 | Phase 7 | Complete |
| WAVE-05 | Phase 7 | Pending |
| EXP-01 | Phase 8 | Pending |
| EXP-02 | Phase 8 | Pending |
| EXP-03 | Phase 8 | Pending |
| EXP-04 | Phase 8 | Pending |
| POL-01 | Phase 9 | Pending |
| POL-02 | Phase 9 | Pending |
| POL-03 | Phase 9 | Pending |

**Coverage:**
- v2.0 requirements: 22 total
- Mapped to phases: 22
- Unmapped: 0

---
*Requirements defined: 2026-03-02*
*Last updated: 2026-03-02 after roadmap creation*
