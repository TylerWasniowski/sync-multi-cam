# Pitfalls Research

**Domain:** Browser-based synced multi-cam playback + GPU-accelerated composite video export
**Researched:** 2026-03-02
**Confidence:** HIGH (verified across MDN, W3C WebCodecs spec issues, Chromium/Firefox bug trackers, community post-mortems)

> **Scope:** This document covers v2.0 pitfalls — adding synced video grid playback and GPU-rendered composite export to an existing app. v1.0 pitfalls (FFmpeg WASM memory, COOP/COEP, cross-correlation accuracy, stream-copy performance) are documented in the prior research cycle and already addressed in the shipped codebase.

---

## Critical Pitfalls

### Pitfall 1: Video Element Sync Drifts Without Active Correction

**What goes wrong:**
Starting multiple `HTMLVideoElement` instances at the same time via `play()` does not keep them synchronized. Within seconds, visible drift accumulates. The `timeupdate` event fires "every 15 to 250ms, or whenever the MediaController's media controller position changes" — it is not frame-accurate and it is not consistent across elements. Using `timeupdate` to nudge lagging videos creates visible jank without correcting drift reliably.

The root problem: HTML5 does not impose a shared clock across media elements. Two `<video>` elements playing simultaneously may follow different internal clocks. Over 10+ minutes, they can diverge by several frames — and there is no event that signals this drift is occurring.

**Why it happens:**
Developers assume that `video.play()` called on multiple elements simultaneously means they stay in lockstep. They do not. Each element's playback rate is also subject to buffering stalls, decode backpressure, and OS scheduler preemption. Short test clips look fine; long clips drift.

**How to avoid:**
- Do not use `timeupdate` for sync. Use `requestVideoFrameCallback()` or `requestAnimationFrame()` to run a continuous sync loop.
- Each frame callback: compare all secondary videos' `currentTime` against the primary (master) video. If drift exceeds one frame duration (e.g., 33ms at 30fps), force-correct with `video.currentTime = master.currentTime`.
- Only correct when drift exceeds threshold — constant micro-corrections cause their own jank. A good threshold is 1–2 frame durations.
- For seeking (waveform scrubbar click): call `video.currentTime = targetTime` on all elements simultaneously in one synchronous block. Do not use `Promise.all([video.play()])` — the async nature introduces ordering delays.
- Mute all secondary video elements. Route audio through Web Audio API from a single primary element (or a selected audio source). This removes audio sync as a compounding variable.

**Warning signs:**
- Lips visibly out of sync with audio after 30–60 seconds of playback.
- Different cameras appear to be at different moments on the same frame.
- `currentTime` values diverge by > 100ms across elements.
- Sync looks fine in Chrome but drifts in Firefox (different decode scheduling).

**Phase to address:**
Synced playback phase. This is the foundational constraint — the sync loop architecture must be decided before any other playback work is built on top of it.

---

### Pitfall 2: requestVideoFrameCallback Is Best-Effort, Not Guaranteed

**What goes wrong:**
`requestVideoFrameCallback()` (rVFC) fires "as a best effort" synchronized to video frames. The spec explicitly states it may fire "one vsync late relative to when a video frame was rendered." For a 60Hz display showing 30fps video, that means the callback could fire 16ms after the frame actually appeared on screen.

More critically: **rVFC is not available in Firefox as of early 2026** and has inconsistent behavior in Safari. A sync loop built exclusively on rVFC will silently degrade or break in non-Chromium browsers.

Additionally, rVFC runs on the main thread — if any synchronous main-thread work takes >16ms, the callback is delayed, causing missed frames in the sync loop.

**Why it happens:**
The API is elegant and purpose-built for this use case, so developers adopt it without checking the "best effort" caveat or browser support matrix. The fallback to `requestAnimationFrame` is not obvious.

**How to avoid:**
- Feature-detect rVFC before using it: `if ('requestVideoFrameCallback' in HTMLVideoElement.prototype)`.
- Fall back to `requestAnimationFrame` for the sync loop when rVFC is unavailable. rAF-based sync is slightly less tight but works everywhere.
- Never assume rVFC fires in the same vsync as the frame it reports on. Use `metadata.expectedDisplayTime` to detect if the frame is already stale before acting on it.
- Keep the sync loop callback lightweight (< 2ms). Do not perform layout reads, WebGL operations, or heavy computation inside it.

**Warning signs:**
- App works correctly in Chrome but sync loop does not execute in Firefox.
- Sync loop fires intermittently under load (main thread is busy).
- Canvas overlay or waveform cursor visually lags behind video playback.

**Phase to address:**
Synced playback phase. Feature detection must be in the initial implementation, not added as a later compatibility fix.

---

### Pitfall 3: Multiple Decoded Video Streams Cause GPU Memory Exhaustion

**What goes wrong:**
Each active `<video>` element with a decoded stream consumes GPU memory for its decoded frame buffer. On Firefox and Chrome, HD video elements with `preload="auto"` consume 30–80MB of GPU-committed memory each. With 10–30 video elements active simultaneously — as this app supports — total GPU memory consumption can reach 300MB–2.4GB before any WebGL compositing textures are allocated.

Browsers do not reliably free GPU memory when a video element is paused, muted, or hidden. There are known unfixed Chromium and Firefox bugs where GPU memory from video elements accumulates across a session and is not released until the tab is closed.

Additionally: creating a WebGL texture from a video element (`gl.texImage2D(target, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, videoElement)`) uploads the decoded frame to GPU memory as a texture — but does NOT free the video element's own GPU memory allocation. You now hold two GPU copies.

**Why it happens:**
Developers think about video elements as lightweight DOM nodes. The `<video>` element itself is lightweight; its decoded frame buffer is not. With many concurrent active video elements, the GPU memory budget is consumed before compositing even starts.

**How to avoid:**
- Apply `preload="metadata"` to all video elements initially. Only switch to `preload="auto"` for the subset visible in the current grid layout.
- Limit simultaneously decoded video streams. For >8 cameras, consider pausing and unloading off-screen videos (those not visible in the current grid page), keeping only the active grid's worth decoding.
- After uploading a frame to a WebGL texture, do not hold the video element in an active-play state if it is not visible. Use `video.pause()` on off-screen elements.
- Explicitly call `video.src = ''` and `video.load()` on elements removed from the DOM to release browser resources.
- Do not use `URL.revokeObjectURL()` until the video element has fully loaded its data — call it in `loadeddata` or `canplay`, not immediately after setting `src`.

**Warning signs:**
- Chrome Task Manager shows GPU Memory climbing continuously during playback.
- Browser becomes sluggish or crashes after 5–10 minutes of playback with many cameras.
- WebGL operations start returning `OUT_OF_MEMORY` errors.
- Tab crashes without a JavaScript error (silent GPU OOM).

**Phase to address:**
Synced playback phase (initial loading strategy), and grid layout phase (managing which videos are actively decoded based on visible grid).

---

### Pitfall 4: VideoFrame.close() Omission Causes Unrecoverable GPU Memory Leaks

**What goes wrong:**
When capturing frames from `<video>` elements for WebGL or WebCodecs processing, the `VideoFrame` object (created via `new VideoFrame(videoElement)`) holds actual GPU memory. JavaScript's garbage collector cannot reliably free GPU resources — `VideoFrame` objects must be explicitly closed via `videoFrame.close()`. Missing a single `close()` call in an error path or loop means that GPU memory accumulates permanently for the session.

The same applies to `ImageBitmap` objects created via `createImageBitmap(videoElement)`. Unreleased `ImageBitmap`s are a slower leak but just as real.

**Why it happens:**
JavaScript developers are not accustomed to manual resource management. The fact that a JS object must be explicitly `close()`d — and that forgetting to do so causes non-GC-able leaks — is a paradigm from C++, not idiomatic JavaScript. The WebCodecs spec requires it, but the failure mode is silent and delayed.

**How to avoid:**
- Treat every `VideoFrame` and `ImageBitmap` like a file handle: open it, use it, close it — always in a try/finally block.
- Never pass `VideoFrame` objects across async boundaries without tracking ownership. Establish a clear rule: the creator closes it, or ownership is explicitly transferred.
- In the render loop: create frame → upload to GPU → immediately `frame.close()`. Do not store frames in arrays for later processing.
- Add a debug counter in development: increment on `new VideoFrame()`, decrement on `.close()`. Log the count at the end of each render loop. Any non-zero count is a leak.

**Warning signs:**
- GPU memory climbs monotonically during export or canvas rendering even when the content is not changing.
- Export pipeline runs fine for short durations but crashes or slows severely for long exports.
- `console.memory` heap size is stable but GPU memory (visible in Task Manager) grows continuously.

**Phase to address:**
GPU compositing and export phases. Must be enforced from first implementation — retrofitting correct `close()` calls into an existing pipeline requires auditing every frame path.

---

### Pitfall 5: WebCodecs H.264 Encoder Unavailable or Broken in Non-Chrome Browsers

**What goes wrong:**
The WebCodecs API `VideoEncoder` with H.264 has incomplete and inconsistent support across browsers as of early 2026:

- **Chrome/Edge:** Full support, hardware-accelerated H.264 encoding works reliably.
- **Firefox:** `VideoEncoder.isConfigSupported()` reports H.264 as supported, but the actual encoder returns "codec not supported" at runtime — a known Firefox bug. This means feature detection produces false positives.
- **Safari:** `VideoEncoder` (encoding) is not supported as of mid-2025. `VideoDecoder` is supported but `VideoEncoder` is absent.

A pipeline that uses `VideoEncoder` without a fallback silently fails or throws uncaught exceptions in ~30% of browsers.

**Why it happens:**
Developers check `VideoEncoder.isConfigSupported()` and trust the result. Firefox's false positive breaks this pattern. Safari is commonly tested for decoding workflows and assumed to have equivalent encoding support.

**How to avoid:**
- Do not rely solely on `isConfigSupported()`. After configuring the encoder, wrap the first `encode()` call in a try/catch to detect runtime failures.
- Implement a graceful degradation path: if WebCodecs VideoEncoder fails, fall back to FFmpeg WASM encoding for export (slower but universally available given the app already has it).
- Show browser compatibility notice before export: "GPU-accelerated export requires Chrome or Edge. Export will use software encoding in your browser."
- Structure the export pipeline as an interface with two implementations: `WebCodecsExporter` and `FFmpegExporter`. The orchestrator selects based on capability detection.

**Warning signs:**
- Export works in Chrome but silently fails or produces no output in Firefox/Safari.
- `VideoEncoder` constructor throws in Safari with no clear error message.
- `isConfigSupported()` returns `{supported: true}` in Firefox but encoding immediately errors.

**Phase to address:**
Export phase. Capability detection and the fallback architecture must be in place before shipping export to users.

---

### Pitfall 6: WebCodecs Encoder Queue Overflow Corrupts or Drops Frames

**What goes wrong:**
`VideoEncoder.encode()` is asynchronous and non-blocking — it queues frames for encoding without waiting for completion. If you encode frames faster than the encoder processes them (e.g., rendering a WebGL composite at 60fps into an encoder targeting 30fps), `encodeQueueSize` grows without bound. When the queue overflows, frames are silently dropped or the encoder enters an error state.

Additionally, calling `encoder.flush()` too frequently — or inside the render loop — forces the encoder to emit a new keyframe after each flush, dramatically increasing file size and reducing quality. The spec states flush "should only be called once all desired work is queued" and "is not intended to force progress at regular intervals."

**Why it happens:**
Developers treat `encode()` like a synchronous write, expecting back-pressure. There is none by default. The `flush()` pattern from streaming contexts (where you flush periodically to get output) is actively harmful here.

**How to avoid:**
- Monitor `encoder.encodeQueueSize` before each `encode()` call. If it exceeds a threshold (2–4 frames), drop the current frame rather than encoding it.
- Never call `flush()` inside the render/export loop. Call it exactly once at the very end of the export, after all frames are queued.
- Target a fixed output framerate (e.g., 30fps) and render composite frames at exactly that rate — do not render at display refresh rate and encode every frame.
- Set a reasonable keyframe interval. WebCodecs defaults to 10,000 (effectively keyframe-only-on-first-frame), which produces large P-frame chains that may not seek well. Explicitly force keyframes every 2–5 seconds: `encoder.encode(frame, { keyFrame: frameIndex % (fps * 2) === 0 })`.

**Warning signs:**
- Exported video has unexpected file size (too large: unnecessary keyframes; too small: frames silently dropped).
- Export "completes" quickly but the output video is shorter than expected (frames were dropped).
- Browser becomes unresponsive during export (encode queue is backing up and consuming memory).
- Encoder enters error state with "EncodingError" after running for several seconds.

**Phase to address:**
Export phase. The encoding loop architecture — rate limiting, queue monitoring, keyframe scheduling — must be designed correctly from the start.

---

### Pitfall 7: MP4 Muxer Timestamp Discontinuities Corrupt Playback

**What goes wrong:**
WebCodecs provides encoded `EncodedVideoChunk` objects but no container muxer. Third-party muxers (mp4-muxer, Mediabunny) must be used to package chunks into a playable MP4. These muxers are strict about timestamp monotonicity and continuity:

- Timestamps must be strictly increasing (no duplicate or out-of-order timestamps).
- The timescale used for encoding must match the timescale configured in the muxer.
- MP4 works in a timescale (typically 90,000 ticks/second) while WebCodecs works in microseconds. Conversion precision errors produce timestamp jitter that some players (particularly QuickTime) reject.
- Audio and video timestamps must be synchronized in the muxed container. If audio chunks are muxed at different timestamps than video chunks, A/V sync in the output file is broken.

**Why it happens:**
Developers compute timestamps as `frameIndex * (1_000_000 / fps)` with integer math, which accumulates rounding error. At 30fps after 1 minute (1800 frames), the accumulated error can be 30+ microseconds — enough to confuse strict muxers.

**Why `mp4-muxer` matters:** As of early 2026, mp4-muxer has been deprecated in favor of Mediabunny. New implementations should use Mediabunny. Projects inheriting mp4-muxer will not receive bug fixes.

**How to avoid:**
- Use Mediabunny (the maintained successor to mp4-muxer) for new implementations.
- Compute timestamps using the same formula as the encoder clock to avoid drift: `timestamp = frameIndex * frameDurationMicroseconds` where `frameDurationMicroseconds = Math.round(1_000_000 / fps)`. Compute once, reuse — do not recalculate per frame.
- Encode audio from the same source that plays during the composite (the selected audio track from the Web Audio API mix) with matching timestamps.
- Test exported files in QuickTime (macOS), Windows Media Player, and VLC — these three players cover the spectrum from most-strict to most-lenient timestamp handling.

**Warning signs:**
- Exported MP4 plays in Chrome but fails to open in QuickTime or Windows Media Player.
- Video plays but audio is offset by a constant duration.
- Video duration in the exported file is wrong (too long or too short).
- Muxer throws an error about "timestamp must be greater than previous."

**Phase to address:**
Export phase. Muxer selection and timestamp computation must be locked in before building the full encoding pipeline.

---

### Pitfall 8: Canvas 2D drawImage Is Too Slow for 4K Composite at 30fps

**What goes wrong:**
`CanvasRenderingContext2D.drawImage(videoElement, ...)` is the naive approach for compositing a video grid. It works for low resolutions or a small number of cameras, but has a hard ceiling:

- At 4K (3840×2160) with 4+ camera tiles, each `drawImage` requires a CPU-side pixel blit if the video element is in a different memory space (GPU texture) than the canvas. This round-trip (GPU → CPU → GPU) for each video element costs ~5ms per frame per video on high-end hardware.
- With 8 cameras at 4K export, Canvas 2D compositing takes 40+ ms per frame — slower than the 33ms budget for 30fps. Export produces <30fps output or falls behind in real time.

WebGL compositing avoids this by keeping video frames as GPU textures and compositing directly on the GPU, reducing the per-frame cost from ~5ms to ~0.1ms per video at comparable resolutions.

**Why it happens:**
Canvas 2D drawImage is the obvious, documented approach. It works fine in demos and at 1080p with 2-4 cameras. The performance cliff at 4K or with many cameras is not obvious until the export pipeline is built and measured.

**How to avoid:**
- Use WebGL for the compositing canvas from the start. The API is more complex, but the performance characteristics scale correctly.
- Specifically: create an `OffscreenCanvas` with a WebGL context, upload each camera's current frame as a texture using `gl.texImage2D(target, ..., videoElement)`, render a full-screen quad for each camera tile, then read the result.
- Use `OffscreenCanvas` in a Web Worker to move compositing off the main thread, keeping the UI responsive during export.
- Do not support 4K export with Canvas 2D — explicitly limit Canvas 2D compositing to 1080p or use it only as a fallback when WebGL is unavailable.

**Warning signs:**
- Canvas compositing takes longer per frame than the target frame duration (measure with `performance.now()` around each drawImage block).
- Export framerate drops below target (output video is shorter than expected with fewer frames).
- Main thread is saturated (DevTools profiler shows long tasks blocking user interaction).

**Phase to address:**
GPU compositing phase. Technology choice must be made before building the compositing layer — retrofitting WebGL onto a Canvas 2D compositing pipeline is effectively a rewrite.

---

### Pitfall 9: OffscreenCanvas Cannot Be Transferred Back to Main Thread After Use

**What goes wrong:**
`OffscreenCanvas` transferred to a Web Worker with `canvas.transferControlToOffscreen()` is **permanently owned by the worker**. It cannot be sent back to the main thread. This seems obvious in hindsight, but common patterns break because of it:

- You cannot render composited frames on a worker-owned `OffscreenCanvas` and then display them in the main thread by transferring the canvas back.
- The correct pattern is: render on the worker's `OffscreenCanvas`, use `transferToImageBitmap()` to get an `ImageBitmap`, `postMessage` it to the main thread with transfer ownership, then `drawImage(imageBitmap, ...)` on the visible canvas.
- Each `ImageBitmap` transfer (even with structured clone) temporarily holds two copies in memory: the worker-side source and the main-thread destination. For a 4K frame at RGBA, that is 33MB per frame transfer. At 30fps, that is 1GB/sec of transfer pressure — likely causing GC pauses and memory spikes.

**Why it happens:**
The pattern `canvas.transferControlToOffscreen()` → worker → main thread looks like it should round-trip. The spec forbids the return trip and developers discover this only when building the preview/playback feedback loop.

**How to avoid:**
- For export: keep compositing entirely in the worker. The muxer also runs in the worker. The main thread only receives progress updates via `postMessage`.
- For real-time preview (playback): do not try to move compositing to a worker. Use WebGL on the main thread (or `requestAnimationFrame` with Canvas 2D for lower-resolution preview). The export worker is separate from the preview renderer.
- If you must transfer frames from worker to main thread for preview: use `ImageBitmap` transfer, but limit preview to 1/4 resolution (960×540) to keep transfer size manageable (~1MB per frame at 30fps = 30MB/sec — acceptable).

**Warning signs:**
- `transferControlToOffscreen()` throws a `DOMException` when called a second time on the same canvas.
- Main thread canvas shows a blank/black frame after the worker starts rendering (the canvas is in a broken state).
- Attempting to get a 2D or WebGL context on the main thread after transferring to a worker fails silently.

**Phase to address:**
GPU compositing phase (architecture decision). The preview vs. export rendering architecture must be decided before any OffscreenCanvas code is written.

---

### Pitfall 10: Audio Track Selection Breaks if Web Audio API Autoplay Policy Blocks Context Resume

**What goes wrong:**
The Web Audio API's `AudioContext` is suspended by default until a user gesture. When the app creates a MediaElementAudioSourceNode for each video element (to enable the "all tracks mixed / single track selected" audio feature), the AudioContext may be in a suspended state if not properly resumed. The result: video plays but there is no audio, with no error message.

Additionally, connecting the same `<video>` element to a `MediaElementAudioSourceNode` takes over its audio output. If you then want the video to also produce its own audio (for the non-Web-Audio path), you cannot — the audio is now fully routed through the AudioContext and the element's `volume` property no longer controls what the user hears.

A second pitfall: creating a `MediaElementAudioSourceNode` for the same `<video>` element more than once throws an `InvalidStateError`. If the component mounts/unmounts (e.g., grid layout changes), you must track which elements already have a source node.

**Why it happens:**
Autoplay policies have become stricter over time. The specific rule that `AudioContext` starts suspended is not always handled in tutorials, which show examples where a user click implicitly resumes the context. In a video player, the "play" button click should resume the context — but if play state is set programmatically (e.g., after seeking), no user gesture is recorded.

**How to avoid:**
- Call `audioContext.resume()` explicitly in the user gesture handler (play button click, seek scrubbar click).
- Wrap all audio graph operations in a check: `if (audioContext.state === 'suspended') await audioContext.resume()`.
- Track MediaElementAudioSourceNode instances in a Map keyed by video element. Before creating a new node, check if one already exists for that element.
- Mute video elements at the HTMLElement level (`video.muted = true`) and manage all volume exclusively through the Web Audio API gain nodes. This avoids dual-control confusion.

**Warning signs:**
- Video plays but no audio on first load (context suspended).
- `InvalidStateError: MediaElementAudioSourceNode already created for this element` in console.
- Switching from "all tracks" to "single track" mode produces no change in audio output.
- Audio cuts out after navigating away and back to the page (context suspended again on navigation).

**Phase to address:**
Audio mixing feature within the synced playback phase. Must be implemented with correct AudioContext lifecycle management from the start.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Canvas 2D drawImage for compositing | Simple API, works immediately | Hard performance ceiling at 4K/8+ cameras; requires rewrite to use WebGL | Only for 1080p playback preview; never for 4K export |
| No VideoFrame.close() calls in happy path | Less boilerplate | Silent GPU memory leak that grows throughout session; catastrophic during long export | Never |
| timeupdate for multi-video sync | Event-driven, reactive | Drift accumulates; jitter causes visible desync; misses frames | Never — use rAF/rVFC sync loop |
| Single VideoEncoder path without FFmpeg fallback | Simpler export code | Export broken in Firefox and Safari; ~30% of browser market | Never for public release |
| mp4-muxer instead of Mediabunny | Familiar library, pre-existing docs | Unmaintained, no bug fixes, will fall behind browser changes | Only if migrating from an existing mp4-muxer codebase with known-good behavior |
| preload="auto" for all video elements | Faster initial play | 30–80MB GPU memory per element; 30 cameras = 900MB–2.4GB before compositing | Acceptable for ≤4 cameras; never for large grids |
| Export audio directly from Web Audio context | Avoids separate audio pipeline | Web Audio context output is difficult to capture as raw PCM for muxing | Avoid — use MediaStreamAudioDestinationNode or encode audio separately via WebCodecs AudioEncoder |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| FFmpeg WASM + WebCodecs | Using FFmpeg WASM for the export encode step (re-encodes the composite) | Use WebGL for compositing + WebCodecs VideoEncoder for GPU-accelerated H.264 encoding. FFmpeg WASM remains for upstream pipeline (extraction, trim) only. |
| Web Audio API + video elements | Calling `video.volume = 0` expecting silence after connecting to Web Audio graph | Once connected to a MediaElementAudioSourceNode, the element's audio is routed through the graph. Control gain via GainNode only; `volume` has no effect. |
| WebGL texture from video | Calling `gl.texImage2D` with a video element that is not currently decoded | If the video is paused on the first frame or still loading, texImage2D uploads a black or corrupt frame. Always check `video.readyState >= HAVE_CURRENT_DATA` before texture upload. |
| WebCodecs encoder + muxer | Passing `EncodedVideoChunk` directly to muxer without checking chunk type | Only `key` chunks can appear at the start of a segment. If the first chunk is a `delta`, the muxer or player will reject it. Force `keyFrame: true` on the first encoded frame. |
| OffscreenCanvas + React | Creating OffscreenCanvas inside a React component's render/effect cycle | OffscreenCanvas must be created once and transferred exactly once. React's strict mode and HMR can cause double-mount, double-transfer errors. Create outside React lifecycle or protect with a ref guard. |
| Blob URLs + video elements | Calling `URL.revokeObjectURL(url)` immediately after setting `video.src = url` | The browser has not loaded the resource yet. Revoke only after `video.loadeddata` or `video.canplay` fires. Premature revoke causes a network error loading the video. |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Canvas 2D drawImage at 4K | Export framerate drops below 30fps; main thread saturated | Use WebGL compositing; measure compositing time per frame during development | Any resolution above 1080p with >4 cameras, or >8 cameras at any resolution |
| Uploading video texture on every rAF tick | GPU memory bandwidth saturated; frame drops | Upload texture only when `video.currentTime` has changed (check via rVFC metadata or comparison) | Immediately with 8+ cameras at HD resolution |
| Encoding at display framerate into muxer | Encoder queue grows unbounded; eventual OOM or encoder error | Tick export at fixed output framerate; drop frames when encoder queue is backed up | Any export longer than ~10 seconds |
| Allocating new ImageBitmap per frame for preview | GC pauses every few seconds (10–30ms pause per large ImageBitmap allocation) | Reuse a fixed-size canvas for preview; avoid ImageBitmap allocation in the hot path | As soon as export or real-time preview is enabled |
| Holding all video Blob URLs simultaneously | Memory holds all original video files (could be gigabytes) plus decoded GPU buffers | Revoke Blob URLs for videos not currently being played if under memory pressure | >10 cameras with >200MB files each |

## Security Mistakes

This project runs entirely client-side with no server. The relevant concerns are user-experience trust, not data exfiltration.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Exporting to a user-specified filename without sanitization | Malformed filename causes a broken download or unexpected browser behavior | Use `encodeURIComponent` on user-supplied filenames. Validate the export filename against a safe character set. |
| WebGL errors surfaced to users verbatim | GL error codes are confusing and may reveal browser/GPU information | Catch WebGL errors in the compositing loop; surface as "Compositing failed — try a lower resolution." |
| Allowing export at extremely high resolutions without a cap | Could cause OOM or GPU driver crash | Enforce a maximum export resolution (e.g., 4K = 3840×2160). Reject or downsample beyond that limit. |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No progress feedback during export | A 30-second 4K export feels like a hang; user closes tab | Show per-frame progress: "Encoding frame 450 of 900 (50%)" with time remaining estimate. |
| Export button active before videos are buffered | User exports immediately; first N frames are black or corrupted (video not yet decoded) | Disable export until all grid videos report `readyState >= HAVE_ENOUGH_DATA`. Show loading indicator per camera tile. |
| Grid layout changes during playback without pausing | Removing/adding video elements while the sync loop is running causes race conditions | Pause all playback before changing grid configuration; rebuild sync loop state; then resume. |
| Audio selection dropdown with no perceptible change | User selects "Camera 3 audio" but still hears all cameras because AudioContext is suspended | Visually confirm audio selection with a VU meter or peak indicator. Resume AudioContext on dropdown interaction. |
| Export produces a file the user cannot play | WebCodecs may produce H.264 Baseline when user expects Main or High profile | Document the export codec/profile. Consider offering "compatible" (Baseline) vs. "quality" (High) profile options. |
| No way to abort a running export | User starts a 4K export, waits 2 minutes, realizes they chose wrong settings — no cancel | Implement export cancellation. Track the export worker's state; `postMessage({ type: 'cancel' })` and terminate the encoder cleanly. |

## "Looks Done But Isn't" Checklist

- [ ] **Video sync loop:** Often missing drift correction threshold — verify that a 10-minute playback session results in < 1 frame of drift across all cameras (check `Math.max(...videos.map(v => Math.abs(v.currentTime - master.currentTime)))` at 10-min mark).
- [ ] **requestVideoFrameCallback fallback:** Often missing — verify the sync loop runs correctly in Firefox (where rVFC is absent) using requestAnimationFrame fallback.
- [ ] **VideoFrame.close() completeness:** Often missing in error paths — verify no GPU memory leak by running export, cancelling partway through, and confirming GPU memory returns to baseline in Chrome Task Manager.
- [ ] **WebCodecs encoder fallback:** Often missing for Firefox/Safari — verify the app offers working export (FFmpeg WASM) in Firefox and Safari, not a broken or missing export button.
- [ ] **First frame keyframe enforcement:** Often missing — verify the exported MP4 opens correctly in QuickTime by confirming the first encoded chunk is a `key` chunk.
- [ ] **MP4 timestamp monotonicity:** Often broken by re-renders — verify the exported MP4 has correct duration (`videoElement.duration === expected`) and plays back at the correct speed.
- [ ] **AudioContext resume on play:** Often missing — verify audio plays immediately when the play button is clicked (not just after a second click or user interaction).
- [ ] **MediaElementAudioSourceNode dedup:** Often missing — verify that mounting/unmounting the grid (or resizing it) does not throw `InvalidStateError` about duplicate source nodes.
- [ ] **Blob URL revocation timing:** Often wrong — verify that `URL.revokeObjectURL()` is called after `loadeddata`, not immediately after `video.src = url`.
- [ ] **GPU memory ceiling:** Often discovered too late — verify the app runs for 20+ minutes with 8+ cameras without the tab crashing (Chrome Task Manager GPU memory should plateau, not climb).

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Video sync drift (timeupdate-based) | HIGH | Rewrite sync loop to use rAF/rVFC. Cannot be patched incrementally — the sync architecture must change. |
| VideoFrame.close() memory leak | MEDIUM | Audit every VideoFrame allocation site. Wrap in try/finally. Run Chrome Task Manager during export to confirm memory stabilizes. |
| Canvas 2D performance ceiling | HIGH | Rewrite compositing layer to use WebGL. This is a significant effort if Canvas 2D is already integrated with export. |
| WebCodecs unsupported in browser | LOW | Add FFmpeg WASM fallback exporter. The FFmpeg pipeline already exists; wrapping it as an export path is low effort. |
| MP4 timestamp corruption | MEDIUM | Audit timestamp computation formula. Replace float arithmetic with integer microsecond arithmetic. Re-test with QuickTime. |
| Encoder queue overflow / frame drops | MEDIUM | Add `encodeQueueSize` check before each `encode()` call. Implement frame drop logic. Adjust render loop rate to match encoder throughput. |
| AudioContext suspended silently | LOW | Add `audioContext.resume()` call to all user gesture handlers. One-line fix per gesture handler. |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Multi-video sync drift | Synced playback phase | Play 8 cameras for 10 minutes; measure max `currentTime` divergence < 33ms |
| rVFC unavailability in Firefox | Synced playback phase | Run sync loop in Firefox; confirm no broken behavior; check console for errors |
| GPU memory from many video elements | Synced playback + grid layout phases | Open Chrome Task Manager; load 10+ cameras; GPU memory should plateau under 1GB |
| VideoFrame.close() leaks | GPU compositing + export phases | Export 60-second composite; confirm GPU memory returns to baseline after export completes |
| WebCodecs H.264 unavailable in Firefox/Safari | Export phase | Attempt export in Firefox and Safari; confirm fallback path activates with clear UX |
| Encoder queue overflow | Export phase | Export 5-minute composite; confirm framerate of output matches target fps with no dropped frames |
| MP4 timestamp discontinuities | Export phase | Open exported MP4 in QuickTime; confirm correct duration and smooth playback |
| Canvas 2D performance at 4K | GPU compositing phase | Measure compositing time per frame at 4K with 4 cameras; must be <10ms per frame |
| OffscreenCanvas transfer semantics | GPU compositing phase | Confirm preview canvas remains interactive while export worker runs |
| AudioContext autoplay block | Audio mixing feature | Click play on first load; confirm audio starts immediately without second interaction required |

## Sources

- [MDN: HTMLVideoElement.requestVideoFrameCallback()](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback) — best-effort semantics, vsync timing caveat (HIGH confidence)
- [web.dev: requestVideoFrameCallback](https://web.dev/articles/requestvideoframecallback-rvfc) — use cases and expectedDisplayTime comparison pattern (HIGH confidence)
- [Bocoup: HTML5 Video Synchronizing Playback of Two Videos](https://www.bocoup.com/blog/html5-video-synchronizing-playback-of-two-videos) — timeupdate unreliability; rAF-based continuous correction (HIGH confidence)
- [W3C: Frame accurate seeking issue](https://github.com/w3c/media-and-entertainment/issues/4) — currentTime precision limitations (HIGH confidence)
- [W3C: Media Synchronization on the Web (PDF)](https://www.w3.org/community/webtiming/files/2018/05/arntzen_mediasync_web_author_edition.pdf) — clock drift across media elements (HIGH confidence)
- [MDN: WebCodecs API](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API) — flush() semantics, encodeQueueSize, close() requirement (HIGH confidence)
- [W3C WebCodecs GitHub: Add GOP length to VideoEncoderConfig #444](https://github.com/w3c/webcodecs/issues/444) — keyframe interval limitations (HIGH confidence)
- [W3C WebCodecs GitHub: encoding h264 issue #394](https://github.com/w3c/webcodecs/issues/394) — H.264 Firefox false-positive isConfigSupported (HIGH confidence)
- [Mozilla Bugzilla: WebCodecs VideoDecoder fails on H.264 #1918769](https://bugzilla.mozilla.org/show_bug.cgi?id=1918769) — Firefox H.264 encoder/decoder bugs (HIGH confidence)
- [caniuse: WebCodecs API](https://caniuse.com/webcodecs) — browser support matrix (HIGH confidence)
- [Chromium Bug: HTML5 video memory leak #969049](https://bugs.chromium.org/p/chromium/issues/detail?id=969049) — GPU memory not freed after video replay (HIGH confidence)
- [Mozilla Bug: HTML5 video memory too aggressive #1054170](https://bugzilla.mozilla.org/show_bug.cgi?id=1054170) — GPU memory per video element (HIGH confidence)
- [Three.js GitHub: Texture from video leaks memory #9440](https://github.com/mrdoob/three.js/issues/9440) — WebGL texture + video element double GPU allocation (HIGH confidence)
- [webrtcHacks: Video Frame Processing on the Web](https://webrtchacks.com/video-frame-processing-on-the-web-webassembly-webgpu-webgl-webcodecs-webnn-and-webtransport/) — GPU copy costs, WebCodecs memory opacity (HIGH confidence)
- [Remotion: Clearing up WebCodecs misconceptions](https://www.remotion.dev/docs/webcodecs/misconceptions) — WebCodecs vs WebAssembly vs FFmpeg clarifications (HIGH confidence)
- [Vanilagy/mp4-muxer → Mediabunny migration guide](https://vanilagy.github.io/mp4-muxer/MIGRATION-GUIDE.html) — mp4-muxer deprecation status (HIGH confidence)
- [MDN: OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas) — transferControlToOffscreen one-way transfer restriction (HIGH confidence)
- [Evil Martians: OffscreenCanvas + Web Workers](https://evilmartians.com/chronicles/faster-webgl-three-js-3d-graphics-with-offscreencanvas-and-web-workers) — worker rendering patterns; ImageBitmap transfer memory cost (MEDIUM confidence)
- [W3C WebCodecs GitHub: VideoFrame from WebGPU #83](https://github.com/w3c/webcodecs/issues/83) — GPU texture integration complexity (MEDIUM confidence)
- [MDN: HTMLMediaElement preload](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/preload) — preload=auto memory implications (HIGH confidence)

---
*Pitfalls research for: Browser synced multi-cam playback + GPU composite video export (v2.0)*
*Researched: 2026-03-02*
