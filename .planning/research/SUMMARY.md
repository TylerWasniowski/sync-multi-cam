# Project Research Summary

**Project:** Sync Multi-Cam — v2.0 (Synced Playback & GPU Composite Export)
**Domain:** Browser-based synced multi-camera video grid playback and composite export
**Researched:** 2026-03-02
**Confidence:** HIGH (playback architecture), HIGH (export approach), MEDIUM (WebCodecs browser coverage)

## Executive Summary

v2.0 adds two major capabilities on top of the shipped v1.0 sync pipeline: a synchronized multi-camera grid player and a GPU-accelerated composite export. Both features are well-understood in the browser media ecosystem, but each has specific failure modes that must be designed around from day one — not patched in afterward. The recommended architecture keeps these two pipelines clearly separated: native `<video>` elements in a CSS grid for playback (browser compositor handles GPU decode efficiently), and a dedicated FFmpeg WASM `xstack` filtergraph for export (reusing the existing singleton, no new dependencies). The stack requires only one new package — `mediabunny` (the maintained successor to the now-deprecated mp4-muxer) — and leverages Web Audio API, HTMLVideoElement, and browser-native layout APIs already available.

The highest-confidence recommendation for v2.0 export is FFmpeg WASM with the `xstack` composite filter rather than a WebCodecs pipeline. WebCodecs VideoEncoder has known H.264 encoder bugs in Firefox 130 and is absent in Safari before v26.0, meaning roughly 30% of browsers require a fallback anyway. FFmpeg WASM already exists in the project as a loaded singleton; adding composite export is a matter of building the filtergraph from the grid layout coordinates and calling `exec()`. This approach trades GPU-accelerated speed for near-universal browser support and dramatically lower integration complexity. WebCodecs-based export is the right long-term upgrade (v3+) once Safari VideoEncoder support is ubiquitous.

The primary architectural risk for the playback feature is sync drift: HTML5 `<video>` elements do not share a clock, and the `timeupdate` event is non-deterministic. The correct mitigation is a shared React state `playheadTime` updated by a single `requestAnimationFrame` / `requestVideoFrameCallback` loop reading the leader video, with follower videos only seeking when drift exceeds ~100ms. This must be the foundational decision — retrofitting the sync architecture after other playback features are built on top of it is a full rewrite. Similarly, the export pipeline's GPU memory management (sequential MEMFS writes, cleanup after exec) must be correct from first implementation because the FFmpeg singleton is shared with the upstream pipeline.

## Key Findings

### Recommended Stack

The v2.0 stack adds exactly one npm package to what v1.0 ships: `mediabunny ^1.34.5`. All other new capabilities — Web Audio API, HTMLVideoElement, OffscreenCanvas, WebCodecs, `requestVideoFrameCallback` — are browser-native with no install step. This keeps the dependency footprint minimal while covering all required functionality. `mediabunny` replaces the deprecated `mp4-muxer` library and is needed only if a WebCodecs export path is implemented in a future phase; for v2.0's FFmpeg WASM export path it is optional but should be installed now to avoid a later migration.

The export approach divides cleanly: FFmpeg WASM handles composite encode for v2.0 (universally supported, already loaded), while WebCodecs + mediabunny is reserved for a future performance upgrade. The two pipelines are independent — FFmpeg WASM's `xstack` filter handles compositing and H.264 encode in one command, while a WebCodecs path would require a separate canvas compositor and muxer chain.

**Core technologies:**
- `HTMLVideoElement` (native): per-camera video playback — controlled via shared `playheadTime` React state, `muted` to suppress native audio, sync-corrected via rAF loop
- Web Audio API (native): audio routing — one `MediaElementAudioSourceNode` per video, `GainNode` per track for solo/mix, single shared `AudioContext`
- FFmpeg WASM `@ffmpeg/ffmpeg ^0.12.15` (existing): composite export — `xstack` filtergraph from grid layout coordinates, reuse existing loaded singleton
- `mediabunny ^1.34.5` (new, one npm install): MP4 muxer for future WebCodecs export path — zero dependencies, pure TypeScript, WebCodecs-native, successor to deprecated mp4-muxer
- WebCodecs VideoEncoder (native): GPU-accelerated H.264 encode — deferred to v3+; Chrome/Edge ready, Firefox buggy, Safari pre-26 absent

### Expected Features

Research identified a clear MVP boundary for v2.0. All P1 features are achievable within the existing architecture with no new external services.

**Must have (v2.0 launch):**
- Synchronized video grid player — all cameras play/pause/seek together, offsets from v1.0 pipeline applied
- Dynamic aspect-ratio-aware grid layout — shelf-packing heuristic for up to 9 tiles, O(N²) max, negligible runtime
- Two display modes — Letterbox (`object-fit: contain`) and Fill (`object-fit: cover`), same algorithm drives both playback and export canvas
- Waveform-as-scrubbar — existing WaveformPanel extended with `playheadTime` prop and `onSeek` callback; bidirectional cursor binding
- Audio mixing — all tracks mixed equally by default; dropdown to solo one camera's audio via Web Audio API `GainNode`
- GPU composite export — FFmpeg WASM `xstack` filtergraph → H.264 MP4 download
- Resolution presets — 720p / 1080p / 4K canvas dimensions passed to export command
- Export progress — frame-level progress from FFmpeg `progress` event

**Should have (add after v2.0 validation):**
- Per-tile camera label overlays — filename drawn on tiles and baked into export canvas
- Click-to-fullscreen single tile — expand any camera angle to fill available space
- Keyboard shortcuts — space, arrow keys for transport
- Export bitrate/quality control — expose CRF slider for advanced users

**Defer (v3+):**
- NLE project file export (FCP XML / Premiere XML)
- Per-tile color grading (exposure, white balance per camera)
- Loop region with in/out markers on waveform
- WebCodecs-based compositing pipeline (GPU-accelerated performance when Safari VideoEncoder coverage is solid)

### Architecture Approach

v2.0 integrates additively after `stage === 'complete'`. The existing pipeline outputs `DownloadableResult[]` (trimmedData, offsetSeconds, originalFile per camera) and pre-computed waveform peaks — v2.0 consumes these without modifying the pipeline. Four existing components are modified (App.tsx adds playback state, WaveformPanel/WaveformTrack/WaveformCanvas add playhead rendering and seek events), four new components are created (VideoGridPlayer, VideoTile, PlaybackControls, ExportPanel), and two new lib modules are added (`lib/gridPacking.ts`, `lib/exportCompositor.ts`). The build order has a strict dependency chain with the export path parallelizable after grid layout is stable.

**Major components:**
1. `VideoGridPlayer` — container managing N VideoTile refs, hosts the `usePlaybackSync` rAF/rVFC loop, drives shared `playheadTime` from leader video
2. `VideoTile` — controlled component: one `<video>` element, seeks only when `|video.currentTime - playheadTime| > 0.1s`, always muted (Web Audio API handles audio), reports aspect ratio and ready state
3. `PlaybackControls` — play/pause/scrub bar + audio track selector; all callbacks bubble to App.tsx
4. `lib/gridPacking.ts` — aspect-ratio-aware shelf-packing; same function drives CSS layout (pixels) and export canvas layout (export dimensions)
5. `lib/exportCompositor.ts` — FFmpeg xstack filtergraph builder; sequential MEMFS writes; reuses `getFFmpeg()` singleton
6. `WaveformPanel` (modified) — adds `playheadTime` prop for animated cursor line + `onSeek` callback for click-to-seek; bidirectional with playback state

### Critical Pitfalls

1. **Multi-video sync drift via `timeupdate`** — Never use `timeupdate` for cross-element sync. Use a single rAF/rVFC loop reading the leader video's `currentTime` and writing to shared `playheadTime` React state. Follower videos only seek when drift > 100ms. This architectural decision must be made first.

2. **`requestVideoFrameCallback` unavailable in Firefox** — Feature-detect before use (`'requestVideoFrameCallback' in HTMLVideoElement.prototype`). Fall back to `requestAnimationFrame`. The sync loop must be correct in Firefox from the initial implementation, not added as a later compatibility patch.

3. **WebCodecs H.264 encoder broken in Firefox / absent in Safari pre-26** — `isConfigSupported()` returns false-positive in Firefox 130; Safari VideoEncoder absent until v26.0. Any WebCodecs export path needs a working FFmpeg WASM fallback. For v2.0, use FFmpeg WASM as primary and validate it works correctly in Firefox and Safari before shipping.

4. **GPU memory exhaustion with many video elements** — `preload="auto"` on all elements consumes 30–80MB GPU memory each; 10+ cameras can hit 800MB+. Start with `preload="metadata"`, switch per-tile only. Explicitly call `video.src = ''` + `video.load()` when removing tiles. Monitor GPU memory in Chrome Task Manager during development.

5. **FFmpeg WASM memory doubling during export** — `syncResults[i].trimmedData` Uint8Arrays are already in JS heap. Writing all to MEMFS simultaneously doubles memory. Write files to MEMFS sequentially, run export command, delete each MEMFS file after. Never initialize a second FFmpeg instance — `getFFmpeg()` returns the singleton.

6. **AudioContext autoplay policy** — `AudioContext` starts suspended. Call `audioContext.resume()` explicitly in every user gesture handler (play button click, seek click on waveform). Track `MediaElementAudioSourceNode` instances in a Map keyed by video element to prevent `InvalidStateError` on component remount.

7. **`VideoFrame.close()` omission in future WebCodecs path** — Any future WebCodecs export path must call `frame.close()` immediately after each `encode()` call, always in a `try/finally`. Omitting this causes non-GC-able GPU memory leaks that compound throughout the export session.

## Implications for Roadmap

Research reveals a clear dependency chain and two parallelizable workstreams after the foundation is laid. The build order is: object URLs → VideoTile → grid layout → VideoGridPlayer → sync loop → audio + waveform mods (can run in parallel) → export.

### Phase 1: Video Grid Foundation

**Rationale:** Object URL creation from trimmed data is the prerequisite for everything in v2.0. VideoTile and the grid layout algorithm must exist before any playback or export work is meaningful. No sync loop yet — just rendering videos in a grid with correct aspect ratios and responsive layout.
**Delivers:** N video tiles rendered in an aspect-ratio-aware CSS grid, responsive to container resize via ResizeObserver, display mode toggle (letterbox/fill). Play/pause state wired to all videos simultaneously.
**Addresses:** Synced grid player (layout half), dynamic grid layout (P1), two display modes (P1).
**Avoids:** Anti-pattern of computing layout on every render — memoize on `[containerDimensions, aspectRatios, displayMode]`, not `playheadTime` which updates at 60fps.

### Phase 2: Synchronized Playback + Transport

**Rationale:** Sync architecture must be decided and built correctly before any other playback features are layered on top. Building drift correction after the fact is a rewrite, not a patch.
**Delivers:** Play/pause/seek transport controlling all cameras simultaneously; rAF/rVFC sync loop with leader-follower pattern; follower videos seeking when drift > 100ms; feature detection for rVFC with rAF fallback.
**Addresses:** Synchronized playback (table stakes), shared transport (table stakes), play/pause/seek (table stakes).
**Avoids:** `timeupdate`-based sync (Pitfall 1), missing rVFC fallback for Firefox (Pitfall 2), sync loop doing layout reads or heavy computation (keep callback < 2ms).
**Needs research-phase:** No — the rAF/rVFC pattern with shared `playheadTime` state is fully documented and ARCHITECTURE.md contains implementation-ready code.

### Phase 3: Audio Mixing

**Rationale:** Audio is independent of video layout but depends on video elements existing (Phase 1). Build after basic playback works (Phase 2) so audio selection can be validated against a working player.
**Delivers:** Web Audio API graph with per-camera GainNode; "all mix" default; dropdown to solo one camera; correct AudioContext lifecycle management.
**Addresses:** Audio track selection (P1 differentiator), audio heard during playback (table stakes).
**Avoids:** AudioContext autoplay suspension (Pitfall 6), MediaElementAudioSourceNode deduplication errors on component remount, `video.volume` misuse after connecting to Web Audio graph (control gain via GainNode only).

### Phase 4: Waveform Scrubbar Integration

**Rationale:** WaveformPanel modifications are isolated to prop additions and a canvas draw extension. Depends on Phase 2 (playheadTime state exists) and Phase 1 (waveform component already built). Bidirectional binding (cursor follows playhead; click drives seek) needs care to avoid feedback loops.
**Delivers:** Animated playhead line on all waveform tracks during playback; click-to-seek from any waveform position; scrub-on-pointer-up (not continuous drag seek, too expensive for multiple video elements).
**Addresses:** Waveform-as-scrubbar (P1 differentiator), click-to-seek, playhead cursor tracking during playback.
**Avoids:** Feedback loop between playheadTime writes and rAF reads; triggering full waveform redraws on every rAF tick (use a separate lightweight canvas overlay for the playhead line, not the full waveform redraw).
**Needs research-phase:** No — existing coordinate math in WaveformCanvas is already documented and required prop changes are specified in ARCHITECTURE.md.

### Phase 5: Composite Export

**Rationale:** Export shares the grid layout algorithm with Phase 1 but is otherwise independent of the playback stack. Build after grid layout is stable so TileLayout coordinates can drive the xstack filtergraph without moving targets. FFmpeg WASM path is primary for v2.0.
**Delivers:** ExportPanel UI with resolution picker (720p/1080p/4K); FFmpeg xstack composite → H.264 MP4; frame-level progress display; download trigger; export blocked until all video tiles report `readyState >= HAVE_ENOUGH_DATA`.
**Addresses:** GPU composite export (P1), resolution presets (P1), export progress (P1), export as MP4 (table stakes).
**Avoids:** Creating a new FFmpeg instance (use `getFFmpeg()` singleton), memory doubling via simultaneous MEMFS writes (sequential write → exec → cleanup pattern), triggering export while sync pipeline is active (check existing `isSyncing` flag).
**Needs research-phase:** YES — FFmpeg `xstack` filter string generation from arbitrary `TileLayout[]` coordinates (variable x, y, w, h per tile) needs a working spike before full implementation. The architecture file shows the pattern for an equal 2x2 grid but the general case using `x_w` and `y_h` expressions requires validation. Also decide: for "all mix" audio selection at export time, use `amix` filter or pick reference camera track only.

### Phase 6: Polish and P2 Features

**Rationale:** Camera labels, fullscreen tile, and keyboard shortcuts are low-complexity additions that meaningfully improve the experience but do not unblock any core functionality. Add after v2.0 core is validated.
**Delivers:** Per-tile camera label overlays (DOM overlay + baked into export canvas); click-to-fullscreen single tile; space/arrow keyboard shortcuts.
**Addresses:** Camera labels (P2), fullscreen tile (P2), keyboard shortcuts (P2).
**Avoids:** Grid layout thrash during fullscreen toggle — pause all playback before changing grid configuration, rebuild sync loop state, then resume.

### Phase Ordering Rationale

- **Foundation before sync:** VideoTile and layout must exist for sync testing to be meaningful. A sync loop tested against placeholder tiles produces false confidence about real video behavior.
- **Sync before audio:** Audio isolation (solo one camera) only makes sense once playback is working. AudioContext lifecycle (suspend/resume) is easier to validate against a working transport.
- **Audio before waveform scrubbar:** The full scrubbar integration test requires clicking the waveform, seeing all videos seek, and hearing the correct audio. Audio should be complete before this test is meaningful.
- **Export after layout is stable:** The xstack filtergraph is generated from `TileLayout[]` coordinates. If the layout algorithm changes after export is built, the filtergraph generator changes too. Stabilize layout in Phase 1, build export in Phase 5.
- **Polish last:** Labels and keyboard shortcuts have no dependencies on each other or on later phases. They are appropriate for a final validation pass.

### Research Flags

Phases needing deeper research during planning:
- **Phase 5 (Export):** FFmpeg xstack filter string generation from arbitrary TileLayout coordinates needs a working prototype. The filter supports `x_w` and `y_h` position expressions — generating these correctly for non-uniform tile sizes requires validation. Recommend a spike against real footage before full implementation. Also: decide the audio strategy (reference track only vs. `amix` of all tracks) and validate the xstack command produces correctly synchronized A/V output.

Phases with well-documented patterns (skip research-phase):
- **Phase 1 (Grid Foundation):** CSS layout from computed pixel coordinates + Blob URL creation are standard browser patterns. Grid packing algorithm is custom but well-specified in ARCHITECTURE.md.
- **Phase 2 (Playback Sync):** rAF-based sync loop with shared state is fully documented. ARCHITECTURE.md contains implementation-ready TypeScript.
- **Phase 3 (Audio Mixing):** Web Audio API `MediaElementAudioSourceNode` + `GainNode` pattern is well-documented on MDN with no surprises.
- **Phase 4 (Waveform Scrubbar):** Isolated prop additions to existing components; coordinate math for pixel → time conversion already in place.
- **Phase 6 (Polish):** Labels, fullscreen, keyboard shortcuts are straightforward DOM work with no novel research needed.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | One new package (mediabunny), all others native or existing. Package choices verified against official sources and npm. mediabunny v1.34.5 confirmed as active, zero-dependency, mp4-muxer successor. |
| Features | HIGH (table stakes), MEDIUM (UX patterns) | Table stakes are clear and match user expectations from comparable tools (Zoom, Meet, DaVinci Resolve). Exact UX behaviors for browser-based multi-cam playback have limited direct prior art; patterns inferred from video conferencing tools. |
| Architecture | HIGH (playback), MEDIUM (export filtergraph) | Playback architecture fully specified with implementation-ready code. FFmpeg WASM `xstack` approach is architecturally correct; specific filter string generation for variable tile layouts needs prototyping. |
| Pitfalls | HIGH | All pitfalls sourced from official specs, Chromium/Firefox bug trackers, W3C GitHub issues, and MDN. No speculation — every pitfall has a documented failure mode and a verified mitigation. |

**Overall confidence:** HIGH

### Gaps to Address

- **FFmpeg xstack filter for variable tile layouts:** Architecture doc shows the xstack pattern for a uniform 2x2 grid, but the general case (arbitrary x/y/w/h from TileLayout[]) requires generating correct position expressions. Needs a prototyping spike before Phase 5 implementation begins.
- **Audio strategy for export:** When the active audio track is "all" at export time, the architecture recommends including audio from the active track selection only, but does not fully specify how to handle the "all mix" case. Options: pick reference camera track only (simpler), or use FFmpeg `amix` filter (more faithful to playback behavior). Decide during Phase 5 planning.
- **WebCodecs export path timing:** Research recommends deferring WebCodecs-based export to v3+. If Safari 26+ adoption accelerates (it shipped late 2025), revisit before v3 planning based on real-world browser share data.
- **Sync correction threshold validation:** The 100ms seek threshold for follower video drift correction is a documented starting point. Actual thresholds may need calibration against real footage, especially for mixed-framerate sessions (24fps + 30fps cameras). The "10-minute drift test" checklist item in PITFALLS.md should be a required verification gate before Phase 2 is marked complete.
- **Export camera count ceiling:** Architecture recommends capping composite export at 8 cameras (memory limit). This cap must be enforced in the ExportPanel UI with a clear explanation, distinct from the existing 30-file upload limit which applies only to the sync pipeline.

## Sources

### Primary (HIGH confidence)
- [MDN WebCodecs API](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API) — VideoEncoder API, flush semantics, encodeQueueSize, VideoFrame.close() requirement
- [MDN HTMLVideoElement.requestVideoFrameCallback](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback) — best-effort semantics, expectedDisplayTime, browser support
- [MDN MediaElementAudioSourceNode](https://developer.mozilla.org/en-US/docs/Web/API/MediaElementAudioSourceNode) — Web Audio routing from video elements
- [MDN OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas) — transferControlToOffscreen one-way restriction
- [Can I use: WebCodecs](https://caniuse.com/webcodecs) — 94% global coverage, Safari 26.0 full VideoEncoder support
- [Can I use: requestVideoFrameCallback](https://caniuse.com/mdn-api_htmlvideoelement_requestvideoframecallback) — Chrome 83+, Safari 15.4+, Firefox 132+
- [Chrome Developers: Video processing with WebCodecs](https://developer.chrome.com/docs/web-platform/best-practices/webcodecs) — VideoFrame + Canvas, export pipeline patterns
- [FFmpeg xstack filter docs](https://ffmpeg.org/ffmpeg-filters.html) — xstack layout syntax
- [mediabunny npm](https://www.npmjs.com/package/mediabunny) — v1.34.5, zero dependencies, WebCodecs-native
- [mediabunny: Supported formats & codecs](https://mediabunny.dev/guide/supported-formats-and-codecs) — H.264/AVC + MP4 write confirmed
- [W3C WebCodecs GitHub: encoding h264 issue #394](https://github.com/w3c/webcodecs/issues/394) — Firefox false-positive isConfigSupported for H.264
- [Mozilla Bugzilla #1918769](https://bugzilla.mozilla.org/show_bug.cgi?id=1918769) — Firefox H.264 VideoEncoder/Decoder bug confirmed
- [W3C: Media Synchronization on the Web](https://www.w3.org/community/webtiming/files/2018/05/arntzen_mediasync_web_author_edition.pdf) — clock drift across media elements
- [Chromium Bug #969049](https://bugs.chromium.org/p/chromium/issues/detail?id=969049) — GPU memory not freed after video element replay
- [Mozilla Bug #1054170](https://bugzilla.mozilla.org/show_bug.cgi?id=1054170) — GPU memory per video element

### Secondary (MEDIUM confidence)
- [devtails: Canvas to MP4 via WebCodecs](https://devtails.xyz/adam/how-to-save-html-canvas-to-mp4-using-web-codecs-api) — export pipeline pattern, 10x realtime performance observed
- [Bocoup: Synchronizing HTML5 Video](https://www.bocoup.com/blog/html5-video-synchronizing-playback-of-two-videos) — timeupdate unreliability; rAF-based drift correction (dated but foundational)
- [web.dev requestVideoFrameCallback article](https://web.dev/articles/requestvideoframecallback-rvfc) — canvas compositing patterns, expectedDisplayTime usage
- [Evil Martians: OffscreenCanvas + Web Workers](https://evilmartians.com/chronicles/faster-webgl-three-js-3d-graphics-with-offscreencanvas-and-web-workers) — worker rendering patterns, ImageBitmap transfer memory cost
- [RectanglePacker — github.com/aslamhus/RectanglePacker](https://github.com/aslamhus/RectanglePacker) — grid packing reference (custom shelf-packing implementation recommended for mixed ARs)
- [MasterSelects WebGPU compositor — HN](https://news.ycombinator.com/item?id=46959456) — prior art confirming feasibility of GPU video compositor in browser

### Tertiary (referenced for deprecation status)
- [mp4-muxer GitHub](https://github.com/Vanilagy/mp4-muxer) — deprecated July 2025; mediabunny confirmed as replacement
- [Remotion: Clearing up WebCodecs misconceptions](https://www.remotion.dev/docs/webcodecs/misconceptions) — WebCodecs vs FFmpeg WASM tradeoff analysis

---
*Research completed: 2026-03-02*
*Ready for roadmap: yes*
