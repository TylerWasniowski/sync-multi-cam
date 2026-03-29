# Roadmap: Sync Multi-Cam

## Milestones

- ✅ **v1.0 MVP** — Phases 1-4 (shipped 2026-03-02)
- ✅ **v2.0 Synced Playback & Export** — Phases 5-9 (shipped 2026-03-04)
- ✅ **v2.1 UI Polish** — Phases 10-11 (shipped 2026-03-08)
- ✅ **v2.2 Cursor Fixes & UI Cleanup** — Phases 12-13 (shipped 2026-03-29)
- 🚧 **v2.3 Robust Audio Sync** — Phases 14-16 (in progress)

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

<details>
<summary>v2.2 Cursor Fixes & UI Cleanup (Phases 12-13) — SHIPPED 2026-03-29</summary>

- [x] Phase 12: Playback Cursor Fixes (1/1 plan) — completed 2026-03-09
- [x] Phase 13: UI Cleanup (1/1 plan) — completed 2026-03-29

</details>

### 🚧 v2.3 Robust Audio Sync (In Progress)

**Milestone Goal:** Replace SynAudio waveform correlation with GCC-PHAT spectral cross-correlation for robust sync across diverse audio scenarios.

- [x] **Phase 14: DSP Foundation** — GCC-PHAT algorithm engine with unit tests on synthetic signals (completed 2026-03-29)
- [x] **Phase 15: Worker Integration + Pipeline Swap** — Web Worker wrapping, pipeline wiring, SynAudio removal, user-facing warnings and progress (completed 2026-03-29)
- [x] **Phase 16: Validation + Confidence Tuning** — Real-world audio validation via Edge CDP tests, confidence threshold calibration (completed 2026-03-29)

## Phase Details

### Phase 14: DSP Foundation
**Goal**: The GCC-PHAT algorithm correctly computes time-delay offsets and confidence scores, proven by unit tests against synthetic signals at known offsets
**Depends on**: Nothing (first phase of v2.3)
**Requirements**: ALG-01, ALG-02, ALG-03, ALG-04, ALG-05, CONF-01
**Success Criteria** (what must be TRUE):
  1. Unit tests pass for synthetic sine waves with known offsets (positive, negative, zero) and the computed offset matches within sub-sample accuracy
  2. Unit tests pass for signals recorded through different simulated frequency responses (high-pass, low-pass filtered versions of the same signal) and the offset is still correct
  3. Unit tests pass for repetitive signals (looped waveforms) and confidence score drops to reflect ambiguity rather than silently returning a wrong offset
  4. Confidence score clearly distinguishes a single sharp correlation peak (high confidence) from multiple similar-height peaks or flat noise floor (low confidence)
**Plans**: 1 plan

Plans:
- [x] 14-01: TBD

### Phase 15: Worker Integration + Pipeline Swap
**Goal**: Users click Sync and get results from the new GCC-PHAT engine running in a Web Worker, with per-pair progress reporting, audio quality warnings, and the exact same SyncResult interface — SynAudio dependency fully removed
**Depends on**: Phase 14
**Requirements**: PIPE-01, PIPE-02, PIPE-03, PIPE-04, CONF-02, CONF-03, CONF-04, PROG-01
**Success Criteria** (what must be TRUE):
  1. User clicks Sync and the UI remains responsive throughout the entire sync computation (no freezing or jank)
  2. During sync, the progress indicator shows which camera pair is being processed (e.g., "Aligning camera 3 of 8")
  3. After sync completes, SyncResult objects contain offsetSeconds, offsetSamples, confidence, and isReference — all downstream features (waveform offsets, NLE timecodes, playback alignment, export) work without any code changes
  4. If a video has silent or near-silent audio, a visible warning appears indicating sync may be unreliable for that file
  5. If a video has clipped/distorted audio, a visible warning appears indicating sync may be affected
**Plans**: 3 plans

Plans:
- [x] 15-01-PLAN.md — Audio quality detection module (TDD: silence + clipping detection)
- [x] 15-02-PLAN.md — Web Worker + pipeline swap (spectralSyncWorker, audioSync rewrite, SynAudio removal)
- [x] 15-03-PLAN.md — UI integration (warnings display, per-pair progress, end-to-end verification)

### Phase 16: Validation + Confidence Tuning
**Goal**: The new sync engine produces correct offsets for real multi-camera recordings that previously failed, without regressing on recordings that already worked
**Depends on**: Phase 15
**Requirements**: VAL-01, VAL-02
**Success Criteria** (what must be TRUE):
  1. Taylor Swift concert test videos (previously failing case with repetitive music) sync to the correct offset as verified by visual/audible alignment in the grid player
  2. Playing with Bruno test videos (dialogue/ambient content that already worked) continue to sync correctly — no regression from the algorithm change
  3. Confidence scores for both test cases are meaningful: high confidence for clear matches, lower confidence with warnings for ambiguous matches
**Plans**: 2 plans

Plans:
- [x] 16-01-PLAN.md — Edge CDP sync test infrastructure (harness page, browser-side logic, Playwright spec)
- [x] 16-02-PLAN.md — Discovery run, offset calibration, confidence tuning, final validation

## Progress

**Execution Order:**
Phases execute in numeric order: 14 → 15 → 16

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
| 12. Playback Cursor Fixes | v2.2 | 1/1 | Complete | 2026-03-09 |
| 13. UI Cleanup | v2.2 | 1/1 | Complete | 2026-03-29 |
| 14. DSP Foundation | v2.3 | 1/1 | Complete    | 2026-03-29 |
| 15. Worker Integration + Pipeline Swap | v2.3 | 3/3 | Complete    | 2026-03-29 |
| 16. Validation + Confidence Tuning | v2.3 | 2/2 | Complete    | 2026-03-29 |
