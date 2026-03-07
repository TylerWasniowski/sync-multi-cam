# Roadmap: Sync Multi-Cam

## Milestones

- ✅ **v1.0 MVP** — Phases 1-4 (shipped 2026-03-02)
- ✅ **v2.0 Synced Playback & Export** — Phases 5-9 (shipped 2026-03-04)
- 🚧 **v2.1 UI Polish** — Phases 10-11 (in progress)

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

### v2.1 UI Polish

- [x] **Phase 10: Visual Feedback Polish** — Dim muted waveform rows and make privacy messaging more prominent (completed 2026-03-07)
- [ ] **Phase 11: Export Bar Redesign** — Center export controls, enlarge export button, clean up bottom bar layout

## Phase Details

### Phase 10: Visual Feedback Polish
**Goal**: Users get clear visual feedback for muted tracks and see the privacy guarantee prominently
**Depends on**: Phase 9 (v2.0 complete)
**Requirements**: MUTE-01, MUTE-02, PRIV-01
**Success Criteria** (what must be TRUE):
  1. When a track is muted, the entire waveform row appears dimmed/grayed out (not just the mute icon)
  2. The mute/unmute visual transition is smooth — no abrupt flash or jarring color jump
  3. The "files never leave your browser" privacy message is prominently visible on the page without scrolling (not small gray text buried in the header)
**Plans**: 1 plan

Plans:
- [ ] 10-01-PLAN.md — Dim muted waveform rows, gray canvas bars, smooth transitions, and drop zone privacy message

### Phase 11: Export Bar Redesign
**Goal**: Users find the export controls intuitive with a clean, centered layout and a prominent export button
**Depends on**: Phase 10
**Requirements**: EXPORT-01, EXPORT-02, EXPORT-03
**Success Criteria** (what must be TRUE):
  1. Export controls are visually centered in the bottom bar
  2. The export button is noticeably larger and more prominent than surrounding controls
  3. Resolution options and export button are organized in a clean, uncluttered layout with clear visual hierarchy
**Plans**: TBD

Plans:
- [ ] 11-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 10 → 11

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation and File Input | v1.0 | 3/3 | Complete | 2026-03-02 |
| 2. Audio Sync Engine | v1.0 | 2/2 | Complete | 2026-03-02 |
| 3. Video Trimming and Output | v1.0 | 2/2 | Complete | 2026-03-02 |
| 4. Waveform Visualization | v1.0 | 4/4 | Complete | 2026-03-02 |
| 5. Video Grid & Synchronized Playback | v2.0 | 3/3 | Complete | 2026-03-02 |
| 6. Audio Mixing | v2.0 | 1/1 | Complete | 2026-03-02 |
| 7. Waveform Scrubbar Integration | v2.0 | 2/2 | Complete | 2026-03-03 |
| 8. Composite Export | v2.0 | 2/2 | Complete | 2026-03-03 |
| 9. Polish | v2.0 | 1/1 | Complete | 2026-03-03 |
| 10. Visual Feedback Polish | 1/1 | Complete   | 2026-03-07 | - |
| 11. Export Bar Redesign | v2.1 | 0/? | Not started | - |
