# Requirements: Sync Multi-Cam

**Defined:** 2026-03-07
**Core Value:** Accurately sync multiple camera angles by audio so users get aligned video files without installing any software

## v2.1 Requirements

Requirements for UI polish release. Each maps to roadmap phases.

### Waveform Mute Visual

- [x] **MUTE-01**: User sees the entire waveform row dimmed/grayed when a track is muted
- [x] **MUTE-02**: Mute visual state transitions smoothly (not jarring)

### Privacy Messaging

- [x] **PRIV-01**: User sees the "files never leave your browser" privacy message prominently (not just small gray text in the header)

### Export Controls

- [ ] **EXPORT-01**: Export controls are centered in the bottom bar
- [ ] **EXPORT-02**: Export button is larger and more prominent than current small button
- [ ] **EXPORT-03**: Export bar layout is clean and well-organized with resolution options

## Future Requirements

- **EXPORT-04**: Mixed aspect ratio export — per-cell aspect ratios instead of using first video's AR for all cells

## Out of Scope

| Feature | Reason |
|---------|--------|
| New export formats | v2.1 is UI polish only |
| Mobile responsive | Desktop focus, FFmpeg WASM too memory-intensive |
| Video tile mute visual | User specified waveform row only |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| MUTE-01 | Phase 10 | Complete |
| MUTE-02 | Phase 10 | Complete |
| PRIV-01 | Phase 10 | Complete |
| EXPORT-01 | Phase 11 | Pending |
| EXPORT-02 | Phase 11 | Pending |
| EXPORT-03 | Phase 11 | Pending |

**Coverage:**
- v2.1 requirements: 6 total
- Mapped to phases: 6
- Unmapped: 0

---
*Requirements defined: 2026-03-07*
*Last updated: 2026-03-07 after roadmap creation*
