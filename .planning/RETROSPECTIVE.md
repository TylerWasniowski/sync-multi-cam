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

## Milestone: v2.0 — Synced Playback & Export

**Shipped:** 2026-03-04
**Phases:** 5 | **Plans:** 9 | **Sessions:** ~6

### What Was Built
- Dynamic grid layout with aspect-ratio-aware tile packing and fill/letterbox modes
- Synchronized multi-camera playback via standalone rAF timeline clock
- Web Audio API per-track mute/unmute mixing with lazy AudioContext creation
- Interactive waveform scrubbar: click-to-seek, drag-to-scrub, Shift+drag-to-pan, animated playhead with auto-follow
- WebCodecs + Mediabunny GPU-accelerated composite export (H.264 MP4 at 4K/1080p/720p)
- Camera filename labels and keyboard shortcuts for playback polish

### What Worked
- Phased dependency chain (grid → audio → waveform → export → polish) allowed clean iteration on each subsystem
- WebCodecs rework of Phase 8 was the right call — FFmpeg WASM compositing would have been 10-100x slower
- Timeline clock replacing leader-follower sync (Phase 7) was a clean architecture upgrade that solved drift
- Small autonomous plans (avg 2-15min execution) kept context fresh and commits atomic
- User feedback loop on POL-02 (expand feature) caught a bad UX decision early — removed same session

### What Was Inefficient
- Phase 8 had two false starts: first FFmpeg WASM compositing (too slow), then WebCodecs demux errors from incorrect Mediabunny API usage. Better research into the specific library API would have saved a session.
- Roadmap progress table got out of sync for Phases 7 and 9 — the `roadmap update-plan-progress` CLI didn't always fire correctly. Had to fix manually at milestone completion.
- Phase 8 Playwright testing required WSL mirrored networking for Edge CDP — environment-specific blocker that consumed time without delivering value

### Patterns Established
- Standalone timeline clock: rAF + performance.now() wall-clock drives all videos equally (no leader/follower)
- Offset-based shared timeline: videos positioned by offsetSeconds on a unified timeline
- Scrub lifecycle pattern (start/seek/end): prevents rapid pause-seek-resume stutter during drag
- Lazy AudioContext creation in play handler (user gesture satisfies autoplay policy)
- WebCodecs Worker with typed message protocol for export pipeline isolation
- OfflineAudioContext for mixing audio tracks into export without playback

### Key Lessons
1. **WebCodecs > FFmpeg for compositing.** Hardware encoder access makes GPU-accelerated export 10-100x faster. FFmpeg WASM is still right for extraction and stream-copy, but not for pixel-level compositing.
2. **Replace sync models early.** Leader-follower sync worked for Phase 5 but accumulated drift. Phase 7's timeline clock was simpler and more correct. Don't wait for multiple phases of workarounds.
3. **User testing catches UX assumptions.** POL-02 (click-to-expand) seemed obvious in planning but didn't feel right in practice. Ship fast, get feedback, iterate.
4. **Environment-specific test infra is a time sink.** Edge CDP + WSL mirrored networking was fragile. Browser-based manual verification is faster for small projects.

### Cost Observations
- Model mix: ~65% opus, ~30% sonnet (verifier/checker), ~5% haiku
- Sessions: ~6 sessions across 2 days
- Notable: Full v2.0 (grid playback + export + polish) in 2 days, ~1 hour of plan execution time

---

## Milestone: v2.1 — UI Polish

**Shipped:** 2026-03-08
**Phases:** 2 | **Plans:** 2 | **Sessions:** 1

### What Was Built
- Muted waveform rows dim with grayscale + opacity and smooth 300ms CSS transitions
- Configurable waveform canvas bar color (gray when muted) via prop
- Privacy message with shield icon in file drop zone
- Centered export bar with enlarged, prominent export button
- Persistent completion state with "Export Another" flow

### What Worked
- Small milestone scope (2 phases, 2 plans) executed cleanly in a single session
- Human-verify checkpoints caught a UX issue (auto-reset confusion) before shipping
- Integration checker found a real bug (missing `disabled` prop on select) that would have shipped otherwise
- Quality model profile with opus executors produced clean, well-structured code

### What Was Inefficient
- SUMMARY.md `one_liner` field not populated by executors — had to read summaries manually for milestone completion
- Dev server instability in sandbox mode required multiple restarts and sandbox bypass

### Patterns Established
- Structural isolation for interactive controls inside dimmed containers (mute button outside opacity wrapper)
- Inline styles for CSS filter transitions (Tailwind transition-all doesn't cover filter property reliably)
- State-swapping centered layout: single flex-center container conditionally renders one state group at a time

### Key Lessons
1. **Checkpoint-driven UX iteration works.** Auto-reset vs persistent completion was only caught because the user tested during the checkpoint. Always include human-verify for UI changes.
2. **Integration checkers find real bugs.** The missing `disabled` on `<select>` was a genuine oversight — had Tailwind disabled classes but no disabled attribute. Automated cross-checking catches what humans miss.
3. **Small polish milestones are efficient.** 2 phases in 1 session with no false starts. Keeping scope tight avoids the research/rework overhead of larger milestones.

### Cost Observations
- Model mix: ~60% opus (executor), ~35% sonnet (verifier/checker), ~5% haiku
- Sessions: 1 session
- Notable: Entire milestone (plan → execute → verify → audit → complete) in a single session

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | ~4 | 4 | Initial project — established all patterns |
| v2.0 | ~6 | 5 | WebCodecs rework mid-phase, user feedback loop on UX |
| v2.1 | 1 | 2 | Smallest milestone — checkpoint-driven UX iteration, integration audit |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v1.0 | 51 | Core libs | 0 (all deps justified) |
| v2.0 | 51 | Core libs + export | 1 (mediabunny for WebCodecs mux) |
| v2.1 | 51 | Core libs + export | 0 (CSS/layout only) |

### Top Lessons (Verified Across Milestones)

1. Test with real device footage (iPhone HEVC) during research phase, not after implementation
2. Stream-copy is the safe default for video trimming — re-encoding is fragile
3. Research specific library APIs (not just concepts) before planning — FFmpeg WASM compositing and Mediabunny demux both had false starts from API misunderstanding
4. Ship UX features fast and get user feedback — assumptions about "obvious" interactions (expand tiles, smart rendering, auto-reset) were wrong across all milestones
5. Integration checkers catch prop-level bugs that manual review misses — always run before shipping
