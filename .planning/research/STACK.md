# Technology Stack

**Project:** Sync Multi-Cam — v2.0 Additions (Synced Playback & GPU Export)
**Researched:** 2026-03-02
**Confidence:** HIGH (core export pipeline), MEDIUM (sync correction approach)

---

## Context: What the Existing Stack Already Covers

The following are already in place from v1.0 and do NOT need to be re-evaluated:

| Capability | Covered By |
|------------|-----------|
| Build, bundling, dev server | Vite ^7.3.1 |
| UI components and state | React ^19.2.0 + TypeScript ~5.9.3 |
| Styling | Tailwind CSS ^4.2.1 |
| Video file I/O (trim, remux, stream-copy) | @ffmpeg/ffmpeg ^0.12.15 + @ffmpeg/core-mt |
| ZIP archive generation | fflate ^0.8.2 |
| Keyframe index reading | mp4box ^2.3.0 |
| Audio cross-correlation | synaudio ^0.4.0 |
| COOP/COEP headers (required for SharedArrayBuffer) | Cloudflare Pages _headers file |

Everything below is **new** for v2.0.

---

## New Stack Additions for v2.0

### Core Technologies

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| Web Audio API (built-in) | N/A | Audio routing and mixing for multi-cam playback | `createMediaElementSource()` wraps each `<video>` element as an `AudioNode`. `GainNode` controls per-track volume. `AudioDestinationNode` provides final output. Route all to destination for "mix all", mute all but one for "per-camera" selection. Zero dependencies, universally supported. | HIGH |
| HTMLVideoElement (built-in) | N/A | Per-camera video playback element | Native browser video element. `src` set to `URL.createObjectURL(file)` for the synced files in memory. Offset-aware seek on load (`currentTime = offset / 1000`). `muted` to suppress native audio output (Web Audio API handles it). `playsInline` for consistent behavior. | HIGH |
| WebCodecs API (built-in) | N/A | GPU-accelerated composite export — canvas frame → H.264 encode | `VideoEncoder` with `codec: "avc1.4d002a"` (H.264 High Profile) encodes `VideoFrame` objects captured from composite canvas. Hardware-accelerated when available (browser decides). Check support with `VideoEncoder.isConfigSupported()` before use. Browser support: Chrome 94+, Firefox 130+, Safari 26.0+ (full); iOS Safari 16.4+ (partial, video-only). **Global coverage: ~94%.** | HIGH |
| mediabunny | ^1.34.5 | MP4 muxing — wraps H.264 encoded chunks into a valid MP4 container | Pure TypeScript, zero dependencies, ~5 kB gzipped, tree-shakable. Succeeds `mp4-muxer` (deprecated July 2025). WebCodecs-native: designed specifically for `VideoEncoder` / `AudioEncoder` output. Supports H.264/AVC, H.265/HEVC, AAC, MP4/MOV/WebM containers. Actively maintained (v1.34.5 as of March 2026). | HIGH |
| OffscreenCanvas (built-in) | N/A | Move grid compositing off the main thread during export | Transfers canvas rendering into a Worker via `transferControlToOffscreen()`. Keeps the UI responsive during 4K export (which can take minutes). Pair with `requestAnimationFrame` on a Worker for frame rendering. | MEDIUM |

### Supporting Libraries

| Library | Version | Purpose | When to Use | Confidence |
|---------|---------|---------|-------------|------------|
| requestVideoFrameCallback (built-in) | N/A | Precise per-frame sync correction during playback | Fires when each `<video>` delivers a new frame to the compositor. Use to detect drift between the "primary" video's presented frame time and the others, then apply micro-corrections via `currentTime` nudges. Chrome 83+, Safari 15.4+, Firefox 132+. | MEDIUM |

### What NOT to Add

| Do Not Add | Why | What Handles It Instead |
|------------|-----|------------------------|
| FFmpeg WASM for H.264 encode | FFmpeg WASM H.264 encoding is single-threaded WASM — slow and memory-capped at 2 GB. At 4K, frame buffers alone exceed practical WASM limits. WebCodecs uses hardware-accelerated encode, runs 10x+ faster. | WebCodecs `VideoEncoder` + mediabunny |
| MediaRecorder | Quality limitations, output is always WebM in Chrome (not MP4), adds FFmpeg WASM re-wrap step anyway. Cannot control bitrate or profile cleanly. | WebCodecs `VideoEncoder` |
| Three.js / WebGL library | Grid compositing is 2D blitting of video frames to canvas grid cells — no 3D, no shaders needed. A simple `OffscreenCanvas` + `2d` context with `drawImage()` is sufficient and avoids a large dependency. | Native Canvas 2D API |
| Remotion | Heavy React video framework. Adds 100+ KB to bundle and a distinct render model incompatible with the existing architecture. Overkill for a fixed grid composite. | Custom WebCodecs pipeline |
| video.js / hls.js | Stream-protocol players. Files are local Blobs, not HLS/DASH streams. No protocol support needed. | `HTMLVideoElement` with `URL.createObjectURL()` |
| mp4-muxer | Deprecated July 2025 in favor of mediabunny. Still works but receives no new features or bug fixes. | mediabunny |

---

## Architecture of the New Pipeline

### Playback (Runtime)

```
File (Blob) → URL.createObjectURL() → <video muted>
                                           ↓
                        MediaElementAudioSourceNode (Web Audio API)
                                           ↓
                                       GainNode (volume 0 or 1)
                                           ↓
                                  AudioDestinationNode (speakers)

Primary video drives time → requestVideoFrameCallback → check all videos'
currentTime vs expected → nudge lagging videos (currentTime += delta)
```

### Export (Composite MP4)

```
<video> elements (paused, seeking frame-by-frame)
         ↓
OffscreenCanvas (grid layout via Canvas 2D drawImage)
         ↓
VideoFrame (new VideoFrame(canvas, { timestamp }))
         ↓
VideoEncoder (codec: "avc1.4d002a", hardware-accelerated)
         ↓
EncodedVideoChunk callbacks → mediabunny MP4 muxer
         ↓
ArrayBuffer → Blob → URL.createObjectURL() → <a download>
```

### Dynamic Grid Layout

The grid layout algorithm is custom, not a library. Given N videos with known aspect ratios and a container width/height:

1. Compute optimal number of columns `c` that minimizes wasted space
2. For "preserve AR" mode: render each cell at its natural aspect ratio within its grid cell, with letterboxing
3. For "fill tiles" mode: CSS `object-fit: cover` on `<video>` element clipped to cell bounds
4. Grid cell sizes computed once on mount and on resize (ResizeObserver)

No external bin-packing library is needed. The uniform-column approach (like video conferencing UIs — Zoom, Google Meet) is proven, simple, and produces predictable layouts. True bin-packing (mixed cell sizes) is complex to implement correctly and rarely improves visual quality for < 8 videos.

---

## Alternatives Considered

| Recommended | Alternative | When Alternative Makes Sense |
|-------------|-------------|-------------------------------|
| WebCodecs + mediabunny | FFmpeg WASM re-encode | If the user needs server-side quality control or extremely wide codec support. NOT in-browser at 4K. |
| WebCodecs + mediabunny | MediaRecorder | Never for this use case — MediaRecorder produces WebM-only in Chrome and has no frame-by-frame seek control for offline export. |
| HTMLVideoElement sync | WebCodecs VideoDecoder for playback | WebCodecs VideoDecoder is appropriate for frame-accurate scrubbing (no buffering). For continuous playback, native `<video>` elements are simpler and handle codec/container diversity (HEVC, HDR, H.264) automatically. Reserve WebCodecs decode for the export path only if needed. |
| Simple column-count grid | External bin-packing library | If layouts need masonry or mixed portrait/landscape arrangements. The Zoom/Meet column-grid approach handles up to ~9 cameras well. |
| OffscreenCanvas (Worker) | Main-thread canvas | Only needed for export. Playback rendering happens in the DOM (CSS handles layout), so main-thread canvas is fine for previewing the composite. |

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| mediabunny ^1.34.5 | WebCodecs API (native browser) | No npm peers needed. WebCodecs is the only dependency — must check `VideoEncoder.isConfigSupported()` at runtime. |
| @ffmpeg/ffmpeg ^0.12.15 | mediabunny (no conflict) | FFmpeg handles trim/stream-copy; WebCodecs+mediabunny handles composite export. The two pipelines are independent. |
| WebCodecs VideoEncoder | Firefox 130+ for H.264 encode | **Caveat:** Firefox 130 has known bugs where `isConfigSupported()` returns `true` for H.264 but the encoder then fails. Mitigation: catch encoder errors and surface a "please use Chrome" fallback message. |

---

## Installation

```bash
# Only new package needed for v2.0
npm install mediabunny
```

Web Audio API, WebCodecs, HTMLVideoElement, OffscreenCanvas, and `requestVideoFrameCallback` are all browser-native — no npm packages required.

---

## Browser Requirements (v2.0 additions)

| Feature | Minimum Version | Notes |
|---------|----------------|-------|
| WebCodecs VideoEncoder (H.264) | Chrome 94+, Edge 94+, Firefox 130+, Safari 26.0+ | ~94% global coverage as of March 2026. Firefox has known H.264 encoder bugs — detect and warn. |
| requestVideoFrameCallback | Chrome 83+, Safari 15.4+, Firefox 132+ | Fallback: `requestAnimationFrame` + `currentTime` polling for sync correction (acceptable, ~16ms resolution). |
| OffscreenCanvas | Chrome 69+, Firefox 105+, Safari 16.4+ | Export can fall back to main-thread canvas if not available (degraded UX but functional). |
| Web Audio API createMediaElementSource | All modern browsers | Universally supported. No concern. |

---

## Sources

- [MDN WebCodecs API](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API) — Browser support, VideoEncoder/VideoDecoder APIs (HIGH confidence)
- [Chrome Developers: Video processing with WebCodecs](https://developer.chrome.com/docs/web-platform/best-practices/webcodecs) — VideoFrame + Canvas integration patterns (HIGH confidence)
- [Can I use: WebCodecs](https://caniuse.com/webcodecs) — 94.03% global coverage confirmed, Safari 26.0 full support (HIGH confidence)
- [Can I use: requestVideoFrameCallback](https://caniuse.com/mdn-api_htmlvideoelement_requestvideoframecallback) — Chrome 83+, Safari 15.4+, Firefox 132+ (HIGH confidence)
- [devtails: Canvas to MP4 via WebCodecs](https://devtails.xyz/adam/how-to-save-html-canvas-to-mp4-using-web-codecs-api) — Export pipeline pattern, 10x realtime performance (MEDIUM confidence)
- [mediabunny npm](https://www.npmjs.com/package/mediabunny) — v1.34.5, 5 kB gzipped, zero dependencies (HIGH confidence)
- [mediabunny: Supported formats & codecs](https://mediabunny.dev/guide/supported-formats-and-codecs) — H.264/AVC confirmed, MP4 write confirmed (HIGH confidence)
- [mp4-muxer GitHub](https://github.com/Vanilagy/mp4-muxer) — Deprecated v5.2.2, migrated to mediabunny (HIGH confidence)
- [MDN MediaElementAudioSourceNode](https://developer.mozilla.org/en-US/docs/Web/API/MediaElementAudioSourceNode) — Multi-video Web Audio routing (HIGH confidence)
- [MDN HTMLVideoElement requestVideoFrameCallback](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback) — Frame-accurate sync callbacks (HIGH confidence)
- [Bugzilla 1918769](https://bugzilla.mozilla.org/show_bug.cgi?id=1918769) — Firefox H.264 VideoDecoder/Encoder bug (HIGH confidence, documented defect)
- [ffmpegwasm discussions #516, #755, #224](https://github.com/ffmpegwasm/ffmpeg.wasm/discussions/516) — 2 GB file limit, 4K memory issues (HIGH confidence)
- [WebGPU hits critical mass](https://www.webgpu.com/news/webgpu-hits-critical-mass-all-major-browsers/) — All major browsers ship WebGPU as of Nov 2025 (MEDIUM confidence — noted but not chosen; Canvas 2D is sufficient)

---
*Stack research for: synced multi-cam video playback and GPU-accelerated composite export*
*Researched: 2026-03-02*
