# Requirements: Sync Multi-Cam v2.3

**Defined:** 2026-03-28
**Core Value:** Accurately sync multiple camera angles by audio so users get aligned video files without installing any software

## v2.3 Requirements

Requirements for robust audio sync milestone. Each maps to roadmap phases.

### Algorithm

- [x] **ALG-01**: App uses GCC-PHAT (phase-normalized frequency-domain cross-correlation) instead of SynAudio Pearson correlation to compute sync offsets
- [x] **ALG-02**: Sync algorithm is robust to different recording devices (phone, DSLR, GoPro) producing different frequency responses of the same audio
- [x] **ALG-03**: Sync algorithm handles repetitive audio content (concerts, music) without silently locking onto the wrong beat
- [x] **ALG-04**: Sync algorithm uses Hann windowing and zero-padding for correct linear (not circular) cross-correlation
- [x] **ALG-05**: Sync algorithm uses parabolic peak interpolation for sub-sample offset accuracy

### Pipeline

- [ ] **PIPE-01**: Sync computation runs in a Web Worker using fft.js, not blocking the UI thread
- [ ] **PIPE-02**: SyncResult interface is preserved exactly ({offsetSeconds, offsetSamples, confidence, isReference}) — zero downstream code changes
- [ ] **PIPE-03**: SynAudio WASM dependency is removed and replaced with fft.js (pure JS, 5KB)
- [ ] **PIPE-04**: Audio buffers are transferred to the worker via Transferable objects (zero-copy for comparison buffers, copy for reference buffer)

### Confidence

- [x] **CONF-01**: Confidence score is based on peak-to-noise-floor ratio, not raw correlation magnitude — distinguishes "clear unique match" from "multiple ambiguous peaks"
- [ ] **CONF-02**: Low confidence results produce a visible warning in the UI indicating sync may be inaccurate
- [x] **CONF-03**: Silence or near-silent audio is detected and surfaced as a warning to the user
- [x] **CONF-04**: Clipping distortion is detected and surfaced as a warning to the user

### Progress

- [ ] **PROG-01**: Sync progress reports which camera pair is being processed (e.g., "Aligning camera 3 of 8")

### Validation

- [ ] **VAL-01**: Taylor Swift concert test videos sync correctly (previously failing case)
- [ ] **VAL-02**: Playing with Bruno test videos continue to sync correctly (regression check)

## Future Requirements

Deferred to v2.4+. Tracked but not in current roadmap.

### Scale Optimization

- **SCALE-01**: Coarse-to-fine two-stage search for faster processing of 30+ cameras
- **SCALE-02**: Landmark fingerprint pre-filter for O(N) vs O(N²) pairwise correlation
- **SCALE-03**: Multi-pair MST graph-based offset resolution for redundant pairwise consistency

### Polish

- **POL-01**: Confidence breakdown in UI tooltip showing why confidence is high/low
- **POL-02**: Adaptive frequency band selection auto-tuning per audio scenario

## Out of Scope

| Feature | Reason |
|---------|--------|
| Audio drift compensation | Extremely complex, only matters for 30+ min recordings, explicitly excluded in PROJECT.md |
| ML-based sync (neural embeddings) | Model weights (10-100MB), slow WASM inference, classical DSP is sufficient |
| Chromagram/MFCC correlation | Designed for content matching, not sample-accurate time alignment |
| WebGPU-accelerated FFT | Not available in Firefox, FFT sizes too small to benefit from GPU dispatch |
| User-configurable algorithm parameters | Sync should "just work" — no FFT size sliders |
| Full Shazam-style fingerprint database | We match N clips in-memory, not searching millions of songs |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ALG-01 | Phase 14 | Complete |
| ALG-02 | Phase 14 | Complete |
| ALG-03 | Phase 14 | Complete |
| ALG-04 | Phase 14 | Complete |
| ALG-05 | Phase 14 | Complete |
| CONF-01 | Phase 14 | Complete |
| PIPE-01 | Phase 15 | Pending |
| PIPE-02 | Phase 15 | Pending |
| PIPE-03 | Phase 15 | Pending |
| PIPE-04 | Phase 15 | Pending |
| CONF-02 | Phase 15 | Pending |
| CONF-03 | Phase 15 | Complete |
| CONF-04 | Phase 15 | Complete |
| PROG-01 | Phase 15 | Pending |
| VAL-01 | Phase 16 | Pending |
| VAL-02 | Phase 16 | Pending |

**Coverage:**
- v2.3 requirements: 16 total
- Mapped to phases: 16
- Unmapped: 0

---
*Requirements defined: 2026-03-28*
*Last updated: 2026-03-28 after roadmap creation*
