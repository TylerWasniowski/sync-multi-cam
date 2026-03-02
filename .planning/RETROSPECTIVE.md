# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — MVP

**Shipped:** 2026-03-02
**Phases:** 4 | **Plans:** 11 | **Sessions:** ~4

### What Was Built
- Zero-install multi-cam sync tool deployed on Cloudflare Pages
- Audio cross-correlation engine (FFmpeg WASM + SynAudio WASM SIMD)
- One-click pipeline: extract → correlate → trim → zip → download
- Stream-copy trimming via mp4box.js keyframe index (preserves HEVC/HDR)
- Interactive waveform visualization with multi-resolution peaks, linked zoom/pan/cursor

### What Worked
- Strict 4-phase dependency chain (foundation → sync → output → polish) kept each phase self-contained and unblocked the next cleanly
- TDD approach for core libraries (waveformPeaks, videoTrimmer, zipBuilder) caught bugs early
- Yolo mode + quality model profile delivered fast execution with high code quality
- Small focused plans (avg 6.7min) kept context manageable and commits atomic
- Phase 4's UAT cycle (test → diagnose → fix → re-verify) efficiently caught and closed 5 UX gaps

### What Was Inefficient
- Phase 3's smart rendering approach was fundamentally broken for iPhone HEVC — had to be fully replaced with stream-copy. Earlier research could have caught this.
- Phase 2 never got a formal VERIFICATION.md — the execute-phase workflow may not have generated it, or it was skipped. Process gap carried to audit.
- SUMMARY.md files lack `requirements_completed` frontmatter — the tooling expected it but plans didn't populate it

### Patterns Established
- mp4box.js for container-level keyframe reading without decoding — avoids the "decode to find keyframes" trap
- Panel-level event handlers for zoom/pan that cover gaps between child components
- Native `addEventListener` with `passive: false` for wheel events that need `preventDefault`
- Multi-resolution peak data (3 LOD levels) for zoom-responsive canvas rendering
- `calculateAlignedTrims()` for coordinated cross-file keyframe alignment

### Key Lessons
1. **Validate codec assumptions early.** Smart rendering assumed H.264 codec and broke on HEVC. Always test with real device footage (iPhone HEVC is the common case) during research, not after implementation.
2. **Stream-copy is the safe default for trimming.** Re-encoding is fragile (codec detection, quality settings, HDR handling). Stream-copy with keyframe snapping trades sub-GOP precision for universal compatibility.
3. **Canvas interaction handlers belong at the container level.** Track-level handlers create dead zones in gaps. Lift to parent and delegate.
4. **Float precision matters in sample-domain math.** `Math.floor` on `samplesPerBucket` caused progressive drift. Keep intermediate values as floats, only round at the final pixel step.

### Cost Observations
- Model mix: ~70% opus, ~25% sonnet (verifier/integration checker), ~5% haiku
- Sessions: ~4 sessions across 2 days
- Notable: Full MVP from zero to deployed in 2 calendar days, ~1.2 hours of plan execution time

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | ~4 | 4 | Initial project — established all patterns |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v1.0 | 51 | Core libs | 0 (all deps justified) |

### Top Lessons (Verified Across Milestones)

1. Test with real device footage (iPhone HEVC) during research phase, not after implementation
2. Stream-copy is the safe default for video trimming — re-encoding is fragile
