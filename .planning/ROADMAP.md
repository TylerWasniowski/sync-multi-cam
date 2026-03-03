# Roadmap: Sync Multi-Cam

## Milestones

- v1.0 MVP -- Phases 1-4 (shipped 2026-03-02)
- v2.0 Synced Playback & Export -- Phases 5-9 (in progress)

## Phases

<details>
<summary>v1.0 MVP (Phases 1-4) -- SHIPPED 2026-03-02</summary>

- [x] Phase 1: Foundation and File Input (3/3 plans) -- completed 2026-03-02
- [x] Phase 2: Audio Sync Engine (2/2 plans) -- completed 2026-03-02
- [x] Phase 3: Video Trimming and Output (2/2 plans) -- completed 2026-03-02
- [x] Phase 4: Waveform Visualization (4/4 plans) -- completed 2026-03-02

</details>

### v2.0 Synced Playback & Export

- [x] **Phase 5: Video Grid & Synchronized Playback** - Dynamic grid layout with synced multi-camera playback and transport controls (3/3 plans complete)
- [x] **Phase 6: Audio Mixing** - Web Audio API per-track mute/unmute with GainNode graph (1/1 plans complete)
- [ ] **Phase 7: Waveform Scrubbar Integration** - Click/drag to seek/scrub, Shift+drag to pan, animated playhead
- [ ] **Phase 8: Composite Export** - FFmpeg WASM xstack composite to single H.264 MP4 at selectable resolutions
- [ ] **Phase 9: Polish** - Camera labels, fullscreen tile, keyboard shortcuts

## Phase Details

### Phase 5: Video Grid & Synchronized Playback
**Goal**: Users can watch all synced cameras playing together in a responsive grid layout
**Depends on**: Phase 4 (v1.0 pipeline provides trimmed video data and waveform peaks)
**Requirements**: GRID-01, GRID-02, GRID-03, PLAY-01, PLAY-02, PLAY-03, PLAY-04
**Success Criteria** (what must be TRUE):
  1. User sees all synced videos arranged in a space-efficient grid that adapts tile sizes to video count and aspect ratios
  2. User can toggle between letterbox (preserve aspect ratio) and fill (crop) display modes and the grid updates immediately
  3. User can play, pause, and seek all videos simultaneously with a single set of transport controls
  4. All videos stay visually in sync during playback -- no visible drift between camera angles
  5. Waveform tracks from v1.0 remain interactive immediately after sync completes while video elements load in the background
**Plans**: 3 plans

Plans:
- [x] 05-01-PLAN.md -- Grid layout algorithm (TDD): pure computeGridLayout function with tile positioning
- [x] 05-02-PLAN.md -- Video grid & PlaybackSection UI: VideoTile, VideoGrid, PlaybackSection components
- [x] 05-03-PLAN.md -- Sync engine & transport controls: leader-follower sync, play/pause/seek, App.tsx integration

### Phase 6: Audio Mixing
**Goal**: Users hear audio during playback and can choose which camera's audio to listen to
**Depends on**: Phase 5 (video elements must exist for Web Audio API routing)
**Requirements**: AUD-01, AUD-02, AUD-03
**Success Criteria** (what must be TRUE):
  1. User hears all camera audio tracks mixed together by default when playback starts
  2. User can select a single camera's audio from a dropdown and only that camera's audio plays
  3. Audio selection persists across seek, pause, and play actions within a session
**Plans**: 1 plan

Plans:
- [x] 06-01-PLAN.md -- Audio mixer module + per-track mute toggles + human verification

### Phase 7: Waveform Scrubbar Integration
**Goal**: Waveform tracks serve as a visual scrubbar that stays synchronized with video playback
**Depends on**: Phase 5 (playheadTime state), Phase 6 (audio must work for full integration testing)
**Requirements**: WAVE-01, WAVE-02, WAVE-03, WAVE-04, WAVE-05
**Success Criteria** (what must be TRUE):
  1. User can click anywhere on a waveform track and all videos seek to that time position
  2. User can drag along a waveform track to scrub playback position in real time
  3. An animated playhead line moves across all waveform tracks in real time during playback
  4. Bare click/drag = seek/scrub; Shift+drag = pan; a visible UI hint communicates the Shift-to-pan modifier
  5. Waveform zoom and pan stay coordinated with the playhead -- zooming in centers on the current playback position
**Plans**: 2 plans

Plans:
- [ ] 07-01-PLAN.md -- Interaction model inversion + playhead rendering (click-to-seek, drag-to-scrub, Shift-to-pan, playhead line)
- [ ] 07-02-PLAN.md -- Playhead-aware viewport follow mode + zoom anchoring + human verification

### Phase 8: Composite Export
**Goal**: Users can download a single MP4 containing all camera angles composited in the grid layout
**Depends on**: Phase 5 (grid layout algorithm provides tile coordinates for xstack filtergraph)
**Requirements**: EXP-01, EXP-02, EXP-03, EXP-04
**Success Criteria** (what must be TRUE):
  1. User can trigger export and receive a single MP4 file with all cameras composited in the grid layout
  2. User can select export resolution (4K, 1080p, or 720p) before exporting
  3. Export shows a progress indicator that updates at frame level so the user knows how far along the encode is
  4. User can select which audio track to include in the exported video (matches playback audio selection options)
**Plans**: TBD

Plans:
- [ ] 08-01: TBD
- [ ] 08-02: TBD

### Phase 9: Polish
**Goal**: Quality-of-life improvements that make the playback experience feel complete
**Depends on**: Phases 5-8 (all core functionality complete)
**Requirements**: POL-01, POL-02, POL-03
**Success Criteria** (what must be TRUE):
  1. Each video tile displays the camera's filename as a label overlay during preview
  2. User can click any tile to expand it fullscreen and click again to return to the grid view
  3. User can control playback with keyboard shortcuts: space for play/pause, arrow keys for seeking
**Plans**: TBD

Plans:
- [ ] 09-01: TBD

## Progress

**Execution Order:** Phases 5 -> 6 -> 7 -> 8 -> 9

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation and File Input | v1.0 | 3/3 | Complete | 2026-03-02 |
| 2. Audio Sync Engine | v1.0 | 2/2 | Complete | 2026-03-02 |
| 3. Video Trimming and Output | v1.0 | 2/2 | Complete | 2026-03-02 |
| 4. Waveform Visualization | v1.0 | 4/4 | Complete | 2026-03-02 |
| 5. Video Grid & Synchronized Playback | v2.0 | 3/3 | Complete | 2026-03-02 |
| 6. Audio Mixing | v2.0 | Complete    | 2026-03-03 | 2026-03-02 |
| 7. Waveform Scrubbar Integration | v2.0 | 0/2 | Planned | - |
| 8. Composite Export | v2.0 | 0/? | Not started | - |
| 9. Polish | v2.0 | 0/? | Not started | - |
