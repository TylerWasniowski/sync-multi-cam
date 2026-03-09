# Roadmap: Sync Multi-Cam

## Milestones

- ✅ **v1.0 MVP** — Phases 1-4 (shipped 2026-03-02)
- ✅ **v2.0 Synced Playback & Export** — Phases 5-9 (shipped 2026-03-04)
- ✅ **v2.1 UI Polish** — Phases 10-11 (shipped 2026-03-08)
- **v2.2 Cursor Fixes & UI Cleanup** — Phases 12-13 (in progress)

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

<details>
<summary>v1.0 MVP (Phases 1-4) — SHIPPED 2026-03-02</summary>

- [x] Phase 1: Foundation and File Input (3/3 plans) — completed 2026-03-02
- [x] Phase 2: Audio Sync Engine (2/2 plans) — completed 2026-03-02
- [x] Phase 3: Video Trimming and Output (2/2 plans) — completed 2026-03-02
- [x] Phase 4: Waveform Visualization (4/4 plans) — completed 2026-03-02

</details>

<details>
<summary>v2.0 Synced Playback & Export (Phases 5-9) — SHIPPED 2026-03-04</summary>

- [x] Phase 5: Video Grid & Synchronized Playback (3/3 plans) — completed 2026-03-02
- [x] Phase 6: Audio Mixing (1/1 plan) — completed 2026-03-02
- [x] Phase 7: Waveform Scrubbar Integration (2/2 plans) — completed 2026-03-03
- [x] Phase 8: Composite Export (2/2 plans) — completed 2026-03-03
- [x] Phase 9: Polish (1/1 plan) — completed 2026-03-03

</details>

<details>
<summary>v2.1 UI Polish (Phases 10-11) — SHIPPED 2026-03-08</summary>

- [x] Phase 10: Visual Feedback Polish (1/1 plan) — completed 2026-03-07
- [x] Phase 11: Export Bar Redesign (1/1 plan) — completed 2026-03-07

</details>

### v2.2 Cursor Fixes & UI Cleanup

- [x] **Phase 12: Playback Cursor Fixes** - Fix cursor state mismatch and play-from-cursor behavior (completed 2026-03-09)
- [ ] **Phase 13: UI Cleanup** - Remove Sync Results area and add precise offset display on waveform tracks

## Phase Details

### Phase 12: Playback Cursor Fixes
**Goal**: Cursor and playhead position are consistent and reliable -- what the user sees is where playback starts
**Depends on**: Nothing (first phase of v2.2)
**Requirements**: PLAY-01, PLAY-02
**Success Criteria** (what must be TRUE):
  1. User clicks a position on the waveform and the cursor preview line stays at that exact position across all audio tracks
  2. User clicks a waveform position then presses Play, and playback begins from that clicked position (not from the beginning)
  3. User presses Play without having clicked anywhere, and playback starts from the sync start point (beginning of the synced timeline)
  4. After pausing and resuming, playback continues from the paused position
**Plans**: 1 plan

Plans:
- [ ] 12-01-PLAN.md — Fix cursor position mismatch and play-from-beginning bugs

### Phase 13: UI Cleanup
**Goal**: Offset information moves from a separate results panel to inline display on waveform tracks with professional-grade precision
**Depends on**: Phase 12
**Requirements**: UI-01, UI-02
**Success Criteria** (what must be TRUE):
  1. The Sync Results download area is no longer visible anywhere in the UI after sync completes
  2. Each waveform track displays its sync offset in milliseconds (e.g., `+1.234s`)
  3. Each waveform track displays its offset in NLE timecode format (e.g., `00:00:01:07 @ 30fps`)
  4. The offset display is visible without user interaction (no hover or expand needed)
**Plans**: TBD

Plans:
- [ ] 13-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 12 -> 13

| Phase | Milestone | Plans | Status | Completed |
|-------|-----------|-------|--------|-----------|
| 1. Foundation and File Input | v1.0 | 3/3 | Complete | 2026-03-02 |
| 2. Audio Sync Engine | v1.0 | 2/2 | Complete | 2026-03-02 |
| 3. Video Trimming and Output | v1.0 | 2/2 | Complete | 2026-03-02 |
| 4. Waveform Visualization | v1.0 | 4/4 | Complete | 2026-03-02 |
| 5. Video Grid & Synchronized Playback | v2.0 | 3/3 | Complete | 2026-03-02 |
| 6. Audio Mixing | v2.0 | 1/1 | Complete | 2026-03-02 |
| 7. Waveform Scrubbar Integration | v2.0 | 2/2 | Complete | 2026-03-03 |
| 8. Composite Export | v2.0 | 2/2 | Complete | 2026-03-03 |
| 9. Polish | v2.0 | 1/1 | Complete | 2026-03-03 |
| 10. Visual Feedback Polish | v2.1 | 1/1 | Complete | 2026-03-07 |
| 11. Export Bar Redesign | v2.1 | 1/1 | Complete | 2026-03-07 |
| 12. Playback Cursor Fixes | 1/1 | Complete    | 2026-03-09 | - |
| 13. UI Cleanup | v2.2 | 0/? | Not started | - |
