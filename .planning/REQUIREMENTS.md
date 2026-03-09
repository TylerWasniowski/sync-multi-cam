# Requirements: Sync Multi-Cam

**Defined:** 2026-03-08
**Core Value:** Accurately sync multiple camera angles by audio so users get aligned video files without installing any software

## v2.2 Requirements

Requirements for milestone v2.2 Cursor Fixes & UI Cleanup.

### Playback

- [ ] **PLAY-01**: Cursor state matches cursor preview position 1:1 in audio tracks (GH#1)
- [ ] **PLAY-02**: Play starts from cursor position if user has seeked, or from sync start point if no cursor set (GH#2)

### UI Cleanup

- [ ] **UI-01**: Sync Results download area is removed from the UI (GH#4)
- [ ] **UI-02**: Waveform tracks display offset with millisecond precision and NLE timecode format (e.g., `+1.234s (00:00:01:07 @ 30fps)`) (GH#4)

## Future Requirements

### Export

- **EXP-01**: Per-cell aspect ratios in export instead of using first video's AR for all cells

## Out of Scope

| Feature | Reason |
|---------|--------|
| Frame-accurate sub-ms offsets | NLEs work in frame units; millisecond precision already exceeds single-frame granularity |
| Replacing individual synced file downloads | Export composite covers the main use case; individual trimmed files stay via existing ZIP flow if re-added later |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PLAY-01 | Phase 12 | Pending |
| PLAY-02 | Phase 12 | Pending |
| UI-01 | Phase 13 | Pending |
| UI-02 | Phase 13 | Pending |

**Coverage:**
- v2.2 requirements: 4 total
- Mapped to phases: 4
- Unmapped: 0

---
*Requirements defined: 2026-03-08*
*Last updated: 2026-03-08 after roadmap creation*
