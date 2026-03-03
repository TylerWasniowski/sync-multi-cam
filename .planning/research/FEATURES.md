# Feature Research

**Domain:** Browser-based synced multi-cam video grid playback and GPU-accelerated composite export
**Researched:** 2026-03-02
**Confidence:** HIGH (stack), MEDIUM (UX patterns — limited browser-based multi-cam player prior art)

---

## Context: v2.0 Adds On Top of v1.0

v1.0 is shipped and complete. This research covers ONLY the new v2.0 milestone:
synced video grid playback with dynamic packing, waveform-as-scrubbar integration,
audio mixing, and GPU-accelerated composite MP4 export. All v1.0 features (upload,
sync pipeline, trimmed file downloads, waveform visualization) remain in place.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features a multi-cam playback and export tool must have. Missing any of these makes
the feature feel broken or incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Synchronized playback (all cameras play together) | The entire point of a multi-cam player. If cameras drift during playback, the feature is worthless. | HIGH | `requestVideoFrameCallback()` is the modern approach (available Chrome/Edge/Firefox since 2024, Safari 2025+). Use rAF drift correction loop: every ~500ms check `video.currentTime` against master clock and seek if delta > 1 frame. Not frame-accurate but visually acceptable for review. |
| Play / pause / seek controls | Universal media player expectation. Users need a single shared transport that controls all cameras simultaneously. | MEDIUM | Single transport bar controlling all `<video>` elements together. Clicking seek sets all `video.currentTime` to the new offset. Must account for per-camera sync offsets from v1.0 pipeline (`SyncResult.offsetSeconds`). |
| Video grid layout (all cameras visible) | Users want to see all angles simultaneously, not tab through them. | MEDIUM | CSS Grid baseline is fine for equal-sized grid. Dynamic packing for mixed aspect ratios requires a packing algorithm. Start with simple N-up grid, upgrade to packing algorithm. |
| Show camera labels / filenames | Users need to know which angle they are watching, especially with 4+ cameras. | LOW | Overlay filename or user-defined label on each video tile. Subtle but required for production review work. |
| Fullscreen single-camera mode | Users need to focus on one angle at a time. Click-to-expand a single tile is universally expected in multi-view players. | MEDIUM | Click any tile to expand it to fullscreen or replace the grid with a single large view. Clicking again returns to grid. |
| Keyboard shortcuts (space = play/pause) | Space bar for play/pause is muscle memory for video workers. Any media player without it feels broken. | LOW | Space = play/pause. Left/right arrows = seek ±5s. These three are non-negotiable minimum. |
| Export progress feedback | Video export is the heaviest operation in the app (potentially minutes). A spinner with no progress = users think it crashed. | MEDIUM | Show frame-level progress (e.g., "Encoding frame 450 / 2400"). Ideally show estimated time remaining. WebCodecs encoding is synchronous per-frame in the render loop so progress is trackable. |
| Export downloads as MP4 | Users expect H.264 MP4 as the output format. It's the universal playback format. | MEDIUM | WebCodecs `VideoEncoder` + Mediabunny muxer → H.264 MP4. Browser codec string: `avc1.4d0034` for high profile. Must include audio track. |

### Differentiators (Competitive Advantage)

Features that are not universally expected but add meaningful value.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Dynamic aspect-ratio-aware grid packing | Most multi-cam players use a rigid NxM grid that wastes space when cameras have mixed aspect ratios (16:9 + 9:16 + 1:1). Packing algorithm maximizes canvas utilization. | HIGH | Pure JavaScript rectangle packing. RectanglePacker (aslamhus/RectanglePacker on GitHub) handles same-AR tiles. For mixed ARs, custom shelf-packing: sort tiles by height descending, place on next shelf when row overflows. Target: < 10% wasted space. Runs in < 5ms for ≤ 30 tiles. |
| Two display modes: Letterbox (preserve AR) vs Fill (crop) | Professional video workers need letterbox for accurate framing review. Fill mode is better for presentation or social exports. A toggle is a meaningful power user feature. | MEDIUM | Letterbox: `object-fit: contain` on `<video>` elements, padding fills with black. Fill: `object-fit: cover`, clips to tile boundaries. For export: letterbox = black bars composited on canvas; fill = CSS transform equivalent computed for canvas `drawImage()`. |
| Waveform as scrubbar / click-to-seek | The waveform panel is already built. Reusing it as a timeline scrubbar means users can click audio events (claps, speech) to jump precisely to sync points. Eliminates need for a separate timeline widget. | MEDIUM | Add `onClick` handler to existing `WaveformPanel` that converts click position to time and calls `seek(time)` on all video elements. The existing `ViewState.cursorTime` is already tracked — wire it to video playback position during play. |
| Audio track selection (all mixed / per-camera solo) | During review, users often want to listen to one camera's audio in isolation (e.g., lavalier on camera 2 vs room mic on camera 1). | MEDIUM | Web Audio API: one `MediaElementAudioSourceNode` per `<video>` element, each fed through a `GainNode`, all merged into `AudioContext.destination`. UI dropdown/button set to solo one gain (set others to 0) or mix all equally. Pitfall: only one `AudioContext` per tab; each `<video>` can only be connected to one `MediaElementSourceNode` per context. |
| GPU-accelerated canvas composite export | Off-loads frame rendering to GPU via `OffscreenCanvas` + WebCodecs `VideoEncoder`. 5-10x faster than FFmpeg WASM re-encode approach. Runs in a Web Worker so main thread stays responsive during export. | HIGH | Architecture: Web Worker owns `OffscreenCanvas`, draws each camera's `VideoFrame` at computed positions, calls `VideoEncoder.encode()`, Mediabunny muxes chunks to ArrayBuffer. Main thread sends per-frame seek commands and transfers `ImageBitmap` data to worker. Export pipeline must be separate from playback pipeline. |
| Resolution presets (4K / 1080p / 720p) | Users expect to choose output quality. 4K for archival, 1080p as default, 720p for quick review sharing. | LOW | Parameter passed to `VideoEncoder` config: width/height determine canvas size. Grid layout algorithm runs once per export with the chosen canvas dimensions. Bitrate scales proportionally (4K: ~20 Mbps, 1080p: ~8 Mbps, 720p: ~4 Mbps for H.264). |
| Progressive loading: waveforms interactive before video loads | The waveform panel is already populated during v1.0 sync pipeline. Video file buffering should not block scrubbar interaction. | MEDIUM | `<video>` elements use `preload="metadata"` initially. Full video data loads in the background (`preload="auto"` after waveforms are ready). Playback becomes available when `video.readyState >= HAVE_ENOUGH_DATA`. Show a loading indicator per tile until ready. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Real-time multi-stream canvas composite during playback | Users want to see the composited grid "as it will export" | Rendering N video streams to a canvas in real-time at 30fps each stresses the GPU and causes playback drift. HTML `<video>` elements use the browser's GPU-accelerated compositor — fighting it with canvas overlays during live playback degrades quality. | Use native `<video>` elements in a CSS grid for playback (browser compositor handles it efficiently). Canvas composite is only for export, run faster-than-realtime by seeking frame-by-frame in the worker. |
| Frame-accurate multi-stream sync during browser playback | Video editors expect frame-perfect sync | HTML `<video>` `currentTime` is not frame-accurate; `timeupdate` fires every 15-250ms; drift between streams is guaranteed at some level. No browser API provides frame-locked multi-stream playback without WebCodecs decode-to-canvas, which is prohibitively complex for a playback UI. | `requestVideoFrameCallback()` + periodic drift correction keeps visual sync within ~1 frame for review purposes. Document that for frame-accurate verification, users should import the aligned files into their NLE. |
| Trimming/cutting within the playback UI | Natural extension: "I can see all angles, let me pick the best moment" | Clip editing is a separate product domain. Adds enormous complexity (in/out points, multicam cut editing, timeline). Competes with DaVinci Resolve. | Export aligned files → user edits in their NLE. That is the intended workflow. |
| Streaming export (show preview while exporting) | Users want to watch the composite as it encodes | Export runs faster-than-realtime (seeking frame-by-frame). You cannot "watch" a faster-than-realtime render. Attempting to stream causes frame timing issues in the export. | Show frame count progress. Allow cancellation. |
| Support for more than 30 videos in the grid | Power users push limits | 30 videos × even 720p decode buffers = multi-GB GPU memory. Browser tabs have strict memory ceilings. Grid layout becomes unusable past ~9 tiles at standard monitor resolutions. | Keep MAX_FILES = 30 (already enforced). For export, warn if tile count > 9 that individual tiles will be very small in the output frame. |
| WebGPU-based compositing pipeline | Maximum GPU performance for complex effects | WebGPU is unsupported in Firefox stable (2026-03-02). Adds WGSL shader complexity. Canvas 2D `drawImage()` from `VideoFrame` is sufficient for grid compositing without effects. | OffscreenCanvas + Canvas 2D API for compositing. WebGPU is relevant only if per-tile effects (color grading, overlays) are added in a future milestone. |
| Audio export via WebAudio capture (MediaStreamDestination) | Capture mixed audio as a stream | `MediaStreamDestination` → `MediaRecorder` cannot be synchronized with frame-by-frame video export. Audio and video end up out of sync in the resulting file. | Extract audio from the original trimmed files using FFmpeg WASM (already in-project), mix using FFmpeg's `amix` filter, attach as audio track during mux. This keeps audio/video sync guaranteed. |

---

## Feature Dependencies

```
[v1.0 sync pipeline: SyncResult with offsetSeconds per file]
    |
    +--requires--> [Synced video grid player]
    |                   |
    |                   +--requires--> [<video> elements loaded with trimmed file URLs or original files]
    |                   |
    |                   +--requires--> [Shared transport (play/pause/seek)]
    |                   |
    |                   +--enhances--> [Waveform panel as scrubbar]
    |                                       (cursor time drives video seek)
    |
    +--requires--> [GPU composite export]
                        |
                        +--requires--> [Grid layout algorithm] (computes tile positions)
                        |
                        +--requires--> [OffscreenCanvas + WebCodecs VideoEncoder]
                        |
                        +--requires--> [Mediabunny muxer] (wraps encoded chunks into MP4)
                        |
                        +--requires--> [Audio mix from trimmed files] (FFmpeg WASM amix)
                        |
                        +--enhances--> [Resolution presets] (canvas dimensions + bitrate)

[Web Audio API audio mixer]
    +--enhances--> [Synced video grid player] (per-camera solo / all-mix)
    +--conflicts--> [Audio export via MediaStreamDestination] (sync problems)

[Dynamic grid packing algorithm]
    +--enhances--> [Synced video grid player] (tile layout)
    +--enhances--> [GPU composite export] (same algorithm reused for canvas layout)

[Display mode: Letterbox vs Fill]
    +--enhances--> [Synced video grid player] (CSS object-fit)
    +--enhances--> [GPU composite export] (drawImage crop/letterbox math)
```

### Dependency Notes

- **Video player requires sync offsets from v1.0 pipeline:** The `SyncResult.offsetSeconds` values produced by the audio cross-correlation pipeline are used to set `video.currentTime` correctly so all cameras play from the equivalent real-world moment.
- **Export pipeline is separate from playback pipeline:** Playback uses native `<video>` elements. Export uses `VideoFrame` objects decoded by seeking `<video>` elements frame-by-frame and drawing to `OffscreenCanvas`. These two pipelines share the grid layout algorithm but should not share state.
- **Audio export depends on existing FFmpeg WASM:** The cleanest path for mixed audio in the exported composite is to run `ffmpeg -i cam1.mp4 -i cam2.mp4 ... -filter_complex amix=inputs=N` via the existing FFmpeg WASM instance. This produces a mixed audio blob that Mediabunny can attach alongside the video.
- **Mediabunny replaces mp4-muxer/webm-muxer:** Both predecessor libraries are deprecated (2025). Mediabunny (github.com/Vanilagy/mediabunny) is the current recommendation — zero dependencies, pure TypeScript, WebCodecs-native, H.264 + AAC output. The CanvasSource API directly accepts canvas frames.
- **Grid layout algorithm is shared infrastructure:** The same function that computes tile positions for the CSS grid is called again at export time with canvas pixel dimensions. It must accept both CSS pixel inputs (for display) and export pixel dimensions (for rendering).
- **Waveform scrubbar requires bidirectional binding:** Currently `ViewState.cursorTime` is hover-only. For scrubbar integration, clicking the waveform must drive `video.currentTime`, and `video.currentTime` during playback must update `cursorTime` (so the cursor moves during play). This is a bidirectional sync that needs care to avoid feedback loops.

---

## MVP Definition

### Launch With (v2.0)

Minimum viable feature set for the v2.0 milestone.

- [ ] **Synced video grid player** — all trimmed videos play/pause/seek together, offsets applied per-camera
- [ ] **Dynamic grid layout** — aspect-ratio-aware packing for up to 9 tiles (simple shelf packing is acceptable)
- [ ] **Two display modes** — Letterbox (preserve AR) / Fill (crop to tile)
- [ ] **Waveform-as-scrubbar** — click waveform to seek all videos; cursor tracks playhead during playback
- [ ] **Audio mixing** — all tracks mixed by default; dropdown to solo one camera's audio
- [ ] **GPU export pipeline** — WebCodecs VideoEncoder + OffscreenCanvas composite + Mediabunny mux → H.264 MP4
- [ ] **Resolution presets** — 720p / 1080p / 4K canvas size options at export
- [ ] **Export progress** — frame-level progress bar during encoding

### Add After v2.0 Validation

- [ ] **Per-tile camera label overlay** — drawn onto canvas at playback and baked into export
- [ ] **Click-to-fullscreen single tile** — expand any camera to fill available space
- [ ] **Export bitrate control** — expose CRF/bitrate slider for advanced users
- [ ] **Keyboard shortcuts** — space, arrow keys wired to transport

### Future Consideration (v3+)

- [ ] **NLE project export** — FCP XML / Premiere XML with grid layout as multicam sequence
- [ ] **Per-tile color grading** — exposure/white balance per camera angle before export
- [ ] **Loop region** — set in/out markers on waveform for looping a clip segment
- [ ] **WebGPU compositing** — if per-tile GPU effects are needed (milestone adds real complexity)

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Synced grid playback with shared transport | HIGH | HIGH | P1 |
| Waveform-as-scrubbar (click-to-seek) | HIGH | MEDIUM | P1 |
| Dynamic grid layout algorithm | HIGH | MEDIUM | P1 |
| Two display modes (letterbox / fill) | MEDIUM | LOW | P1 |
| Audio mixing (all / solo) | MEDIUM | MEDIUM | P1 |
| GPU export (WebCodecs + Mediabunny) | HIGH | HIGH | P1 |
| Resolution presets (720p/1080p/4K) | HIGH | LOW | P1 |
| Export progress indicator | HIGH | LOW | P1 |
| Per-tile camera labels | MEDIUM | LOW | P2 |
| Click-to-fullscreen tile | MEDIUM | MEDIUM | P2 |
| Keyboard shortcuts | MEDIUM | LOW | P2 |
| Export bitrate/quality control | LOW | LOW | P3 |
| NLE project file export | MEDIUM | HIGH | P3 |

**Priority key:**
- P1: Must have for v2.0 launch
- P2: Add when core is solid
- P3: Defer — high effort or unclear demand

---

## UX Behavior Expectations

Reference patterns from tools users already know.

### Playback Behavior

| Behavior | Expected | Rationale |
|----------|----------|-----------|
| All cameras start at time 0 (sync-adjusted) | Yes | Time 0 = common start point from v1.0 pipeline |
| Clicking play starts all cameras simultaneously | Yes | Single transport, no per-tile controls |
| Clicking pause freezes all cameras simultaneously | Yes | Unified transport |
| Seeking via waveform click updates all cameras | Yes | Waveform is the timeline |
| Camera audio is heard during playback | Yes | Default: all mixed equally |
| Scrubbing (drag on waveform) updates all videos | Partial | Update on pointer up only — continuous seek during drag is too expensive for multiple video elements |
| Drift correction during long playback | Yes (silent) | Check every ~500ms and re-sync any camera that has drifted > 1 frame |

### Grid Layout Behavior

| Behavior | Expected | Rationale |
|----------|----------|-----------|
| All cameras visible simultaneously | Yes | Core value of a grid player |
| Grid reflows when window resizes | Yes | Responsive layout standard |
| Tile size maximized within available space | Yes | Packing algorithm goal |
| Black background behind letterboxed videos | Yes | Professional video review standard |
| Camera labels visible on tiles | Yes (v2.0 P2) | Distinguish angles at a glance |

### Export Behavior

| Behavior | Expected | Rationale |
|----------|----------|-----------|
| Output is a single composite MP4 | Yes | Main deliverable — all angles in one file |
| Same grid layout as playback view | Yes | WYSIWYG — export matches what user saw |
| H.264 codec, AAC audio | Yes | Universal playback compatibility |
| Export does not block playback UI | Yes | User should be able to navigate away or cancel |
| Download triggered automatically when complete | Yes | File lands in browser downloads folder |
| Export faster than realtime | Yes (silent expectation) | WebCodecs enables 5-10x faster than realtime; 1080p grid of 4 cameras at 30fps should export in < 2 min for 10-min footage |

---

## Complexity Flags for Roadmap Phases

| Feature Area | Complexity Driver | Mitigation |
|--------------|-------------------|------------|
| Synchronized playback | Browser `<video>` currentTime imprecision; drift over time | `requestVideoFrameCallback()` per video; periodic drift correction loop |
| Grid packing algorithm | Mixed aspect ratios with 2-30 tiles | Shelf-packing heuristic sufficient; no NP-hard exact solver needed |
| Web Audio graph teardown | AudioContext nodes leak if not disconnected on reset | Explicit `disconnect()` calls in cleanup; single shared AudioContext lifecycle |
| WebCodecs export pipeline | `VideoEncoder` queue backpressure; memory pressure from simultaneous decode+encode | `encodeQueueSize` guard; process one frame at a time in worker; `VideoFrame.close()` immediately after encode |
| Mediabunny (new library) | v1.0 used mp4box.js; Mediabunny is different API; needs evaluation | Read Mediabunny docs carefully before implementation; check `canEncodeVideo()` for H.264 on target browsers |
| Audio export sync | Mixed audio must be sample-accurate with video | FFmpeg WASM `amix` filter on pre-trimmed files; offset the audio by the same `offsetSeconds` values used for video |
| OffscreenCanvas transfer | Cannot use DOM video elements in a worker | Use `video.captureStream()` + `MediaStreamTrackProcessor` in main thread, transfer `VideoFrame` to worker via `postMessage` with transfer list |
| 4K export memory pressure | 4096x2160 canvas framebuffer is 36 MB per frame | Process and immediately encode one frame at a time; never buffer more than 2 frames in memory |

---

## Sources

- [WebCodecs API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API) — HIGH confidence (official)
- [Video processing with WebCodecs — Chrome for Developers](https://developer.chrome.com/docs/web-platform/best-practices/webcodecs) — HIGH confidence (official)
- [Mediabunny — github.com/Vanilagy/mediabunny](https://github.com/Vanilagy/mediabunny) — HIGH confidence (current recommended muxer, successor to mp4-muxer and webm-muxer)
- [Mediabunny Introduction](https://mediabunny.dev/guide/introduction) — HIGH confidence (official docs)
- [mp4-muxer deprecated notice](https://github.com/Vanilagy/mp4-muxer) — HIGH confidence (deprecation confirmed in README)
- [How to save HTML canvas to MP4 using WebCodecs — devtails.xyz](https://devtails.xyz/adam/how-to-save-html-canvas-to-mp4-using-web-codecs-api) — MEDIUM confidence (tutorial, verified against official APIs)
- [RectanglePacker — github.com/aslamhus/RectanglePacker](https://github.com/aslamhus/RectanglePacker) — MEDIUM confidence (library, same-AR tiles; custom logic needed for mixed ARs)
- [requestVideoFrameCallback — MDN](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback) — HIGH confidence (official)
- [WebCodecs browser support — caniuse.com](https://caniuse.com/webcodecs) — HIGH confidence (Chrome/Edge/Firefox full, Safari 2025+)
- [HTML5 Video: Synchronizing Playback of Two Videos — Bocoup](https://www.bocoup.com/blog/html5-video-synchronizing-playback-of-two-videos) — MEDIUM confidence (dated but foundational; patterns still apply)
- [MasterSelects WebGPU compositor — Hacker News](https://news.ycombinator.com/item?id=46959456) — MEDIUM confidence (prior art for GPU video compositor in browser; confirms feasibility)
- [WebAudio API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) — HIGH confidence (official)

---
*Feature research for: Synced multi-cam video grid playback and GPU-accelerated composite export (v2.0 milestone)*
*Researched: 2026-03-02*
