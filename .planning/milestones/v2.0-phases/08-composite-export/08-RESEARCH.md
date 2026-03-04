# Phase 8: Composite Export (REWORK) - Research

**Researched:** 2026-03-03
**Domain:** WebCodecs API, Mediabunny mux/demux, OffscreenCanvas compositing in Web Workers
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Entire pipeline runs in a **Web Worker** (off main thread) -- UI stays fully responsive during export
- Decode -> composite -> encode -> mux all happen in the Worker
- Progress updates sent to main thread via postMessage
- File objects transferred to Worker for demuxing/decoding
- Use **Mediabunny** (successor to mp4-muxer/webm-muxer) for both demuxing HEVC sources and muxing H.264+AAC output to MP4
- Built-in WebCodecs abstractions simplify the pipeline
- Use **OffscreenCanvas** with Canvas2D `drawImage()` to composite decoded VideoFrames into grid layout
- Reuse existing `computeGridLayout()` for tile positioning (same pure function used by playback grid)
- **WebCodecs VideoEncoder** for H.264 output (hardware-accelerated)
- **WebCodecs AudioEncoder** for AAC output
- **WebCodecs VideoDecoder** for HEVC source decoding (hardware-accelerated)
- Keep current resolution presets: 720p / 1080p / 4K with CRF-based quality
- H.264 + AAC in MP4 container (universal playback)
- Respect current mute state from UI -- export includes/excludes tracks based on `mutedTracks` Set
- Mix unmuted tracks, or single track if only one unmuted
- Use OfflineAudioContext or WebCodecs AudioDecoder for audio processing
- Keep current progress bar from ExportPanel
- Add **cancel button** to abort export mid-process
- State machine: idle -> preparing -> encoding -> complete | error | cancelled
- **WebCodecs only, no fallback** -- show clear "unsupported browser" message if WebCodecs unavailable
- Target Chrome/Edge (excellent support). Firefox/Safari support is improving but not required.
- **Remove FFmpeg WASM entirely** -- delete ffmpeg.ts, FFmpeg-related code, and @ffmpeg packages

### Claude's Discretion
- Backpressure strategy (frame queue depth, decode pacing)
- Exact Worker message protocol design
- Mediabunny API integration details
- How to handle edge cases (single video, videos with no audio)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

## Summary

This is a complete rewrite of the Phase 8 export pipeline. The old approach used FFmpeg WASM with xstack + libx264 encoding, which was impractically slow for compositing 3x 1080p HEVC sources (minutes of waiting). The new approach leverages the WebCodecs API for hardware-accelerated decoding and encoding, OffscreenCanvas for GPU-assisted compositing, and Mediabunny for MP4 demuxing/muxing -- all running inside a Web Worker to keep the UI responsive.

The architecture is a frame-by-frame pipeline: Mediabunny demuxes each input MP4 file and provides `VideoSampleSink` / `EncodedPacketSink` to extract frames. Decoded `VideoSample` objects (wrapping WebCodecs `VideoFrame`) are drawn onto an `OffscreenCanvas` via `drawImage()` at positions computed by the existing `computeGridLayout()` function. The composited canvas frame is then fed to a Mediabunny `CanvasSource` which internally uses `VideoEncoder` for H.264 hardware-accelerated encoding and writes to `Mp4OutputFormat`. Audio is decoded via Mediabunny's `AudioBufferSink`, mixed with `OfflineAudioContext`, and written via `AudioBufferSource`. The entire pipeline runs in a dedicated Web Worker.

Mediabunny (v1.34.x) is a pure TypeScript library with zero dependencies that replaces both `@ffmpeg/ffmpeg` and `@ffmpeg/util`. It provides high-level abstractions over WebCodecs (VideoSampleSink, CanvasSource, AudioBufferSink, AudioBufferSource) that handle decoder/encoder configuration, backpressure, and resource cleanup. Its `Conversion` API is designed for single-input transcoding, so the multi-input compositing pipeline must be built manually using the lower-level read/write primitives.

**Primary recommendation:** Build a Web Worker that creates N Mediabunny `Input` instances (one per source file), uses `VideoSampleSink` to decode frames from each at synchronized timestamps, composites them onto an `OffscreenCanvas` using `computeGridLayout()` positions, feeds the composited canvas to a Mediabunny `CanvasSource` on an `Output`, and handles audio via `AudioBufferSink` + `OfflineAudioContext` + `AudioBufferSource`. Progress is reported via `postMessage` to the main thread.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| EXP-01 | User can download a single MP4 (H.264) containing all camera angles composited in the grid layout | Mediabunny `CanvasSource` with `codec: 'avc'` + `Mp4OutputFormat` produces H.264 MP4; `VideoSampleSink` decodes HEVC inputs; `OffscreenCanvas.drawImage()` composites at grid positions from `computeGridLayout()` |
| EXP-02 | User can select export resolution: 4K (default), 1080p, or 720p | `OffscreenCanvas` created at target resolution; `computeGridLayout()` called with export dimensions; `CanvasSource` encoding config specifies output width/height; existing `EXPORT_RESOLUTIONS` presets reused |
| EXP-03 | Export shows frame-level progress indicator | Frame counter incremented per composited frame; total frame count computed from `duration * fps`; ratio sent via `postMessage` to main thread; `Conversion.onProgress` available for single-input but manual pipeline uses frame count |
| EXP-04 | User can select which audio track(s) to include in the exported video | `AudioBufferSink` decodes audio from each unmuted track; `OfflineAudioContext` mixes multiple decoded `AudioBuffer` objects; `AudioBufferSource` with `codec: 'aac'` encodes mixed result; respects `mutedTracks` Set from UI |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| mediabunny | ^1.34.5 | MP4 demux (HEVC input) + MP4 mux (H.264+AAC output) + WebCodecs abstractions | Pure TS, zero deps, successor to mp4-muxer/webm-muxer, handles decoder/encoder config extraction, backpressure, and resource cleanup. Built specifically for WebCodecs workflows |
| WebCodecs API (browser) | Chrome 94+ | Hardware-accelerated HEVC decode + H.264 encode + AAC encode | Native browser API; leverages GPU encoders (NVENC, Quick Sync, VideoToolbox) for ~8x speedup over FFmpeg WASM software encoding |
| OffscreenCanvas (browser) | Chrome 69+ | Canvas2D compositing in Web Worker | Enables `drawImage(videoFrame)` off main thread; `VideoFrame` is a `CanvasImageSource` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| computeGridLayout (src/lib/gridLayout.ts) | existing | Generate tile positions at export resolution | Reuse for OffscreenCanvas compositing -- same algorithm, different container size |
| OfflineAudioContext (browser) | All browsers | Mix multiple decoded AudioBuffers into single mixed buffer | When more than one audio track is unmuted -- renders mix faster-than-realtime |
| triggerDownload (src/lib/downloadHelper.ts) | existing | Trigger browser file download from Uint8Array/Blob | Reuse existing download pattern for final MP4 |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Mediabunny for demux/mux | mp4box.js (already in deps) for demux + mp4-muxer for mux | mp4box can demux but is lower-level; mp4-muxer is deprecated in favor of Mediabunny; Mediabunny provides both in one library with WebCodecs integration |
| CanvasSource (Mediabunny) | Raw VideoEncoder + EncodedVideoPacketSource | More control but requires manual encoder config, backpressure, and keyframe management. CanvasSource handles all of this automatically |
| OfflineAudioContext for mixing | Manual Float32Array mixing | OfflineAudioContext handles channel upmix/downmix, sample rate conversion, and timing alignment automatically. Manual mixing is error-prone |
| Mediabunny VideoSampleSink | Raw VideoDecoder + EncodedPacketSink | VideoSampleSink handles decoder config, flush, resource lifecycle. Manual approach adds complexity without benefit |
| Web Worker (dedicated) | SharedWorker or main thread | Dedicated Worker is simplest; SharedWorker unnecessary for single export operation; main thread blocks UI |

**Installation:**
```bash
npm install mediabunny
npm uninstall @ffmpeg/ffmpeg @ffmpeg/util
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── lib/
│   ├── gridLayout.ts              # EXISTING -- reused for export resolution
│   ├── exportComposite.ts         # REWRITE -- WebCodecs pipeline types + orchestration
│   ├── exportWorker.ts            # NEW -- Web Worker: demux, decode, composite, encode, mux
│   ├── downloadHelper.ts          # EXISTING -- triggerDownload()
│   └── audioMixer.ts              # EXISTING -- reference for mute state pattern
├── components/
│   ├── ExportPanel.tsx            # MODIFIED -- add cancel button, 'cancelled' state
│   └── PlaybackSection.tsx        # EXISTING -- passes props to ExportPanel
├── types/
│   └── index.ts                   # MODIFIED -- add 'cancelled' to ExportState, add worker message types
└── lib/
    ├── ffmpeg.ts                  # DELETE -- no longer needed
    └── constants.ts               # MODIFIED -- remove FFMPEG_CORE_VERSION, FFMPEG_CDN_BASE
```

### Pattern 1: Web Worker Message Protocol
**What:** Typed message protocol between main thread and export worker. Main thread sends start/cancel commands with File handles; worker sends progress/complete/error messages back.
**When to use:** All worker communication. Type-safe messages prevent protocol drift.
**Example:**
```typescript
// Worker message types (src/types/index.ts)

/** Messages sent TO the worker */
export type ExportWorkerCommand =
  | {
      type: 'start';
      files: File[];
      offsets: number[];       // per-file offset in seconds (from sync)
      resolution: { width: number; height: number };
      fps: number;
      bitrate: number;
      audioConfig: AudioConfig;
      totalDurationSeconds: number;
      tileAspectRatio: number;
    }
  | { type: 'cancel' };

/** Messages sent FROM the worker */
export type ExportWorkerMessage =
  | { type: 'progress'; ratio: number }   // 0.0 to 1.0
  | { type: 'complete'; data: ArrayBuffer } // transferable MP4 data
  | { type: 'error'; message: string }
  | { type: 'cancelled' };
```

### Pattern 2: Frame-Synchronized Multi-Input Decode Loop
**What:** Iterate frames from all inputs at the same timestamp, draw each to its grid position on a shared OffscreenCanvas, then feed the composited frame to the encoder.
**When to use:** Core of the compositing pipeline.
**Example:**
```typescript
// Inside Web Worker (conceptual outline)
// Source: Mediabunny docs (VideoSampleSink, CanvasSource)

import {
  Input, Output, MP4,
  BlobSource, BufferTarget,
  Mp4OutputFormat, CanvasSource,
  VideoSampleSink, AudioBufferSink,
  AudioBufferSource,
} from 'mediabunny';
import { computeGridLayout } from './gridLayout';

// 1. Create Input per source file
const inputs = files.map(file => new Input({
  formats: [MP4],
  source: new BlobSource(file),
}));

// 2. Get video tracks and create sinks
const videoTracks = await Promise.all(
  inputs.map(input => input.getPrimaryVideoTrack())
);
const videoSinks = videoTracks.map(track =>
  track ? new VideoSampleSink(track) : null
);

// 3. Set up output with CanvasSource
const canvas = new OffscreenCanvas(resolution.width, resolution.height);
const ctx = canvas.getContext('2d')!;

const output = new Output({
  format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
  target: new BufferTarget(),
});

const videoSource = new CanvasSource(canvas, {
  codec: 'avc',
  bitrate: bitrate,
  hardwareAcceleration: 'prefer-hardware',
});
output.addVideoTrack(videoSource, { frameRate: fps });

// 4. Compute grid layout at export resolution
const layout = computeGridLayout(
  resolution.width, resolution.height,
  files.length, tileAspectRatio,
);

await output.start();

// 5. Frame loop: decode from all inputs, composite, encode
const frameDuration = 1 / fps;
for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
  const timestamp = frameIdx * frameDuration;

  // Clear canvas to black
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, resolution.width, resolution.height);

  // Draw each input's frame at its grid position
  for (let i = 0; i < videoSinks.length; i++) {
    const sink = videoSinks[i];
    if (!sink) continue;

    // Get the frame closest to this timestamp
    const localTime = timestamp - offsets[i];
    if (localTime < 0) continue;

    const sample = await sink.getSample(localTime);
    if (sample) {
      const tile = layout.tiles[i];
      sample.draw(ctx, tile.x, tile.y, tile.width, tile.height);
      sample.close(); // CRITICAL: release VideoFrame resources
    }
  }

  // Feed composited canvas to encoder (await for backpressure)
  await videoSource.add(timestamp, frameDuration);

  // Report progress
  self.postMessage({ type: 'progress', ratio: (frameIdx + 1) / totalFrames });
}

videoSource.close();
await output.finalize();

// 6. Transfer result back to main thread
const result = output.target.buffer;
self.postMessage(
  { type: 'complete', data: result },
  { transfer: [result] },
);
```

### Pattern 3: Audio Decode + Mix + Encode
**What:** Decode audio from each unmuted input via `AudioBufferSink`, mix using `OfflineAudioContext`, encode mixed result via `AudioBufferSource`.
**When to use:** When audio is included in the export (not all tracks muted).
**Example:**
```typescript
// Audio mixing pipeline (conceptual)
// Source: Mediabunny AudioBufferSink docs + Web Audio API OfflineAudioContext

async function mixAudio(
  inputs: Input[],
  unmutedIndices: number[],
  offsets: number[],
  totalDuration: number,
  sampleRate: number,
): Promise<AudioBuffer> {
  // Decode audio from each unmuted track
  const audioBuffers: { buffer: AudioBuffer; offset: number }[] = [];

  for (const idx of unmutedIndices) {
    const audioTrack = await inputs[idx].getPrimaryAudioTrack();
    if (!audioTrack) continue;

    const sink = new AudioBufferSink(audioTrack);
    const chunks: AudioBuffer[] = [];

    for await (const { buffer } of sink.buffers()) {
      chunks.push(buffer);
    }

    // Concatenate chunks into single AudioBuffer
    // (or process chunk-by-chunk if memory is a concern)
    audioBuffers.push({
      buffer: concatenateAudioBuffers(chunks, sampleRate),
      offset: offsets[idx],
    });
  }

  // Mix using OfflineAudioContext
  const channels = 2; // stereo output
  const frameCount = Math.ceil(totalDuration * sampleRate);
  const offlineCtx = new OfflineAudioContext(channels, frameCount, sampleRate);

  for (const { buffer, offset } of audioBuffers) {
    const source = offlineCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(offlineCtx.destination);
    source.start(offset); // start at the track's offset
  }

  return await offlineCtx.startRendering();
}
```

### Pattern 4: Export State Machine with Cancel
**What:** Extended state machine supporting cancellation. Worker receives cancel command, aborts in-progress operations, cleans up resources.
**When to use:** ExportPanel component and worker lifecycle.
**Example:**
```typescript
// Updated ExportState type
export type ExportState =
  | 'idle'
  | 'preparing'
  | 'encoding'
  | 'complete'
  | 'error'
  | 'cancelled';

// State transitions:
// idle -> preparing (user clicks export)
// preparing -> encoding (worker starts frame loop)
// encoding -> complete (worker sends complete message)
// encoding -> cancelled (user clicks cancel, worker confirms)
// encoding -> error (worker sends error)
// preparing -> error (demux/decode config fails)
// complete -> idle (after download + brief display)
// cancelled -> idle (after brief display)
// error -> idle (user clicks retry)
```

### Anti-Patterns to Avoid
- **Not closing VideoSample/VideoFrame after use:** Every decoded frame holds GPU memory. Failing to call `sample.close()` causes VRAM exhaustion and decoder stalls. Close immediately after drawing to canvas.
- **Feeding frames faster than encoder can process (no backpressure):** Always `await videoSource.add()` before decoding the next frame. Mediabunny's `CanvasSource.add()` returns a promise that respects encoder backpressure.
- **Creating OffscreenCanvas on the main thread:** The canvas must be created inside the Worker (not transferred from main thread) since compositing happens in the Worker. Use `new OffscreenCanvas(width, height)` directly in worker code.
- **Transferring File objects to Worker:** `File` objects are not transferable but are cloneable via structured clone (postMessage). They work fine -- just pass them in the message data, not the transfer list.
- **Using Mediabunny's Conversion API for multi-input compositing:** `Conversion` takes a single `Input` and a single `Output`. For multi-input compositing, use the lower-level read (Input + VideoSampleSink) and write (Output + CanvasSource) primitives directly.
- **Forgetting to dispose Mediabunny Input/Output objects:** Use `input.dispose()` / `output.cancel()` in error/cancel paths to free decoders and file handles.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| MP4 demuxing to get encoded chunks | Manual MP4 box parsing | Mediabunny `Input` + `EncodedPacketSink` or `VideoSampleSink` | Handles ISOBMFF parsing, track selection, decoder config extraction, sample table navigation |
| WebCodecs decoder configuration | Manual codec string construction | Mediabunny `track.getDecoderConfig()` | Returns ready-to-use `VideoDecoderConfig` with codec string, description bytes, dimensions, color space |
| Video frame decoding lifecycle | Raw `VideoDecoder` with manual flush/close | Mediabunny `VideoSampleSink` | Handles decoder creation, configuration, flushing, error recovery, and produces `VideoSample` wrappers with `draw()` method |
| H.264 encoding with backpressure | Raw `VideoEncoder` with queue management | Mediabunny `CanvasSource` | Handles encoder config, keyframe interval, backpressure via async `add()`, and produces `EncodedPacket` for muxing |
| AAC encoding | Raw `AudioEncoder` | Mediabunny `AudioBufferSource` / `AudioSampleSource` | Handles codec config, sample format conversion, channel layout |
| MP4 muxing with faststart | Manual ISOBMFF box construction | Mediabunny `Output` + `Mp4OutputFormat` | Handles box ordering, faststart metadata relocation, interleaving, timing |
| Audio mixing from multiple tracks | Manual Float32Array channel-by-channel mixing | `OfflineAudioContext` | Built-in channel upmix/downmix, sample rate conversion, sub-sample timing precision |
| Grid tile coordinate computation | Custom layout algorithm | Existing `computeGridLayout()` | Already tested, handles incomplete last rows, centers grids |

**Key insight:** Mediabunny replaces the entire FFmpeg WASM stack (demux + decode + encode + mux) with a pure TypeScript library that wraps WebCodecs. The compositing (drawing frames to canvas at grid positions) is the only custom logic needed -- everything else is handled by Mediabunny abstractions or browser APIs.

## Common Pitfalls

### Pitfall 1: VideoFrame / VideoSample Resource Leaks
**What goes wrong:** Decoded video frames accumulate in GPU memory, eventually causing decoder stalls, encoder failures, or browser tab crashes.
**Why it happens:** `VideoFrame` (and Mediabunny's `VideoSample` wrapper) hold references to GPU texture memory. The garbage collector cannot reclaim them automatically -- explicit `.close()` is required.
**How to avoid:** Call `sample.close()` immediately after `sample.draw(ctx, ...)`. Use try/finally blocks to ensure close() is called even on errors. Monitor decoder queue depth.
**Warning signs:** Increasing memory usage during export, decoder `output` callback stops being called, encoder stalls.

### Pitfall 2: Backpressure Between Decode and Encode
**What goes wrong:** Frames are decoded much faster than they can be encoded, causing a "traffic jam" where hundreds of decoded frames queue up in memory.
**Why it happens:** Hardware decoders can output frames faster than hardware encoders can consume them, especially when canvas compositing adds latency.
**How to avoid:** Always `await videoSource.add(timestamp, duration)` before requesting the next frame from any decoder. Mediabunny's `CanvasSource.add()` returns a promise that resolves when the encoder is ready for more input.
**Warning signs:** Rapidly increasing memory usage, long pauses followed by bursts of progress.

### Pitfall 3: HEVC Decode Not Supported on All Platforms
**What goes wrong:** `VideoDecoder.isConfigSupported()` returns `{ supported: false }` for HEVC on some browsers/platforms.
**Why it happens:** HEVC decode support depends on OS-level codec availability. Edge on Windows requires HEVC Video Extensions from Microsoft Store. Firefox does not support HEVC via WebCodecs. Safari support varies.
**How to avoid:** Before starting export, call `VideoDecoder.isConfigSupported()` for each source file's codec. Show a clear error message if any input codec is unsupported. Consider falling back to re-muxing the source to H.264 first (but this is complex and out of scope for v2).
**Warning signs:** Decoder `error` callback fires immediately after `configure()`, or `isConfigSupported` returns false.

### Pitfall 4: H.264 Encoder Requires Even Dimensions
**What goes wrong:** `VideoEncoder.configure()` succeeds but encoder silently produces corrupted output, or fails with an opaque error.
**Why it happens:** H.264 requires width and height to be even numbers (divisible by 2). `computeGridLayout()` can produce odd tile dimensions via `Math.round()`.
**How to avoid:** Ensure the OffscreenCanvas dimensions use even width/height: `width & ~1, height & ~1`. The canvas itself determines the encoded frame size, so tile dimensions within the canvas do not need to be even individually -- only the total canvas dimensions matter.
**Warning signs:** Encoder error callback fires, output video has visual artifacts.

### Pitfall 5: Web Worker Cannot Access DOM APIs
**What goes wrong:** Worker code tries to use `document`, `HTMLVideoElement`, or other DOM APIs and crashes.
**Why it happens:** Web Workers run in a separate context without DOM access. Code that works on the main thread may fail in the worker.
**How to avoid:** All browser media APIs used in the worker must be worker-compatible: `OffscreenCanvas` (yes), `VideoDecoder`/`VideoEncoder` (yes), `OfflineAudioContext` (yes, as of Chrome 114+). Mediabunny's `BlobSource` works with `File` objects in workers. Do NOT try to create `<video>` elements in the worker.
**Warning signs:** `ReferenceError: document is not defined` in worker console.

### Pitfall 6: OfflineAudioContext Not Available in Workers (older browsers)
**What goes wrong:** `OfflineAudioContext` constructor throws `ReferenceError` in the worker.
**Why it happens:** `OfflineAudioContext` was historically only available in the main thread. Chrome 114+ supports it in workers, but some older browser versions do not.
**How to avoid:** Check for `OfflineAudioContext` availability in the worker. If unavailable, decode audio in the worker and postMessage raw AudioBuffer data back to main thread for mixing, then return mixed data to worker for encoding. For Chrome/Edge target (our browser scope), this should not be an issue.
**Warning signs:** `OfflineAudioContext is not defined` error in worker.

### Pitfall 7: Frame Timing Synchronization Across Inputs
**What goes wrong:** Videos appear out of sync in the export because different inputs have different frame rates or non-uniform frame timestamps.
**Why it happens:** Source videos may have variable frame rate (VFR), different frame rates (24fps vs 30fps), or irregular timestamps.
**How to avoid:** Use a fixed output frame rate (e.g., 30fps). For each output frame at timestamp T, use `videoSampleSink.getSample(T - offset)` to get the closest frame from each input. Mediabunny's `getSample(timestamp)` handles seeking to the nearest decoded frame.
**Warning signs:** Stuttering or jerky motion in one camera's output, or one camera's video runs faster/slower than others.

### Pitfall 8: Large MP4 Output Exceeds BufferTarget Memory
**What goes wrong:** Export of long videos at high resolution produces GB+ output that exhausts `BufferTarget`'s in-memory buffer.
**Why it happens:** `BufferTarget` stores the entire output in a single `ArrayBuffer` that grows automatically. For 4K H.264 at high bitrate, even a few minutes can produce hundreds of MB.
**How to avoid:** For typical multi-cam exports (2-10 minutes), `BufferTarget` should be fine. For longer exports, consider `StreamTarget` with the File System Access API (`showSaveFilePicker()`) to stream directly to disk. This is a potential future enhancement.
**Warning signs:** Browser tab memory climbing steadily, out-of-memory crash during finalization.

## Code Examples

Verified patterns from official sources:

### Checking WebCodecs Support
```typescript
// Source: Chrome Developers WebCodecs guide, MDN
function checkWebCodecsSupport(): { supported: boolean; reason?: string } {
  if (typeof VideoEncoder === 'undefined') {
    return { supported: false, reason: 'WebCodecs API is not available in this browser.' };
  }
  if (!self.isSecureContext) {
    return { supported: false, reason: 'WebCodecs requires a secure context (HTTPS).' };
  }
  return { supported: true };
}

// Check specific codec support before export
async function checkCodecSupport(
  decoderCodec: string,
  encoderWidth: number,
  encoderHeight: number,
): Promise<boolean> {
  // Check decoder support (for input HEVC)
  const decoderSupport = await VideoDecoder.isConfigSupported({
    codec: decoderCodec, // e.g., 'hev1.1.6.L153.B0'
    codedWidth: 1920,
    codedHeight: 1080,
  });

  // Check encoder support (for output H.264)
  const encoderSupport = await VideoEncoder.isConfigSupported({
    codec: 'avc1.42001f', // H.264 Baseline
    width: encoderWidth,
    height: encoderHeight,
    bitrate: 5_000_000,
    framerate: 30,
    hardwareAcceleration: 'prefer-hardware',
  });

  return decoderSupport.supported === true && encoderSupport.supported === true;
}
```

### Creating Mediabunny Input from File in Worker
```typescript
// Source: Mediabunny docs - Reading media files guide
import { Input, MP4, BlobSource } from 'mediabunny';

// File objects are cloneable via structured clone (postMessage)
// and work in Web Workers
const input = new Input({
  formats: [MP4],
  source: new BlobSource(file),
});

// Get video track info
const videoTrack = await input.getPrimaryVideoTrack();
const decoderConfig = await videoTrack.getDecoderConfig();
// Returns: { codec: 'hev1.1.6.L153.B0', codedWidth: 1920, codedHeight: 1080, ... }

const audioTrack = await input.getPrimaryAudioTrack();
const audioDecoderConfig = await audioTrack?.getDecoderConfig();
// Returns: { codec: 'mp4a.40.2', numberOfChannels: 2, sampleRate: 48000, ... }
```

### Decoding Video Frames with VideoSampleSink
```typescript
// Source: Mediabunny docs - Packets & samples guide
import { VideoSampleSink } from 'mediabunny';

const sink = new VideoSampleSink(videoTrack);

// Get a specific frame at a timestamp (seconds)
const sample = await sink.getSample(5.0);
if (sample) {
  // Draw to OffscreenCanvas at grid position
  sample.draw(ctx, tile.x, tile.y, tile.width, tile.height);
  sample.close(); // MUST close to release GPU memory
}

// Or iterate all frames in a range
for await (const sample of sink.samples(startTime, endTime)) {
  sample.draw(ctx, 0, 0);
  sample.close();
}
```

### Creating Mediabunny Output with CanvasSource
```typescript
// Source: Mediabunny docs - Writing media files guide, Media sources guide
import {
  Output, Mp4OutputFormat, BufferTarget,
  CanvasSource, AudioBufferSource,
} from 'mediabunny';

const canvas = new OffscreenCanvas(1920, 1080);
const ctx = canvas.getContext('2d')!;

const output = new Output({
  format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
  target: new BufferTarget(),
});

// Video: H.264 via hardware encoder
const videoSource = new CanvasSource(canvas, {
  codec: 'avc',
  bitrate: 8_000_000, // 8 Mbps for 1080p
  hardwareAcceleration: 'prefer-hardware',
  latencyMode: 'quality',
  keyFrameInterval: 2, // keyframe every 2 seconds
});
output.addVideoTrack(videoSource, { frameRate: 30 });

// Audio: AAC
const audioSource = new AudioBufferSource({
  codec: 'aac',
  bitrate: 192_000,
});
output.addAudioTrack(audioSource);

await output.start();

// Compositing loop
const frameDuration = 1 / 30;
for (let i = 0; i < totalFrames; i++) {
  const t = i * frameDuration;

  // Clear and composite all inputs
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, 1920, 1080);

  for (let j = 0; j < inputs.length; j++) {
    const sample = await videoSinks[j].getSample(t - offsets[j]);
    if (sample) {
      const tile = layout.tiles[j];
      sample.draw(ctx, tile.x, tile.y, tile.width, tile.height);
      sample.close();
    }
  }

  // Await for backpressure
  await videoSource.add(t, frameDuration);
}

// Add mixed audio
await audioSource.add(mixedAudioBuffer);

// Finalize
videoSource.close();
audioSource.close();
await output.finalize();

const mp4Data = output.target.buffer; // ArrayBuffer
```

### Audio Mixing with OfflineAudioContext
```typescript
// Source: MDN OfflineAudioContext, Mediabunny AudioBufferSink docs
import { AudioBufferSink } from 'mediabunny';

// Decode audio from each unmuted track
const decodedAudio: { buffer: AudioBuffer; startTime: number }[] = [];

for (const idx of unmutedTrackIndices) {
  const audioTrack = await inputs[idx].getPrimaryAudioTrack();
  if (!audioTrack) continue;

  const sink = new AudioBufferSink(audioTrack);
  const buffers: AudioBuffer[] = [];

  for await (const { buffer } of sink.buffers()) {
    buffers.push(buffer);
  }

  // OfflineAudioContext handles the concatenation + mixing
  decodedAudio.push({
    buffer: concatenateAudioBuffers(buffers, audioTrack.sampleRate),
    startTime: offsets[idx],
  });
}

// Mix with OfflineAudioContext
const sampleRate = 48000;
const totalSamples = Math.ceil(totalDuration * sampleRate);
const offlineCtx = new OfflineAudioContext(2, totalSamples, sampleRate);

for (const { buffer, startTime } of decodedAudio) {
  const source = offlineCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(offlineCtx.destination);
  source.start(startTime);
}

const mixedBuffer = await offlineCtx.startRendering();
// mixedBuffer is an AudioBuffer ready for AudioBufferSource.add()
```

### Web Worker Setup and Communication
```typescript
// Main thread (ExportPanel.tsx)
const worker = new Worker(
  new URL('../lib/exportWorker.ts', import.meta.url),
  { type: 'module' },
);

worker.onmessage = (e: MessageEvent<ExportWorkerMessage>) => {
  switch (e.data.type) {
    case 'progress':
      setProgress(e.data.ratio);
      break;
    case 'complete':
      triggerDownload(
        new Uint8Array(e.data.data),
        'composite.mp4',
        'video/mp4',
      );
      setExportState('complete');
      break;
    case 'error':
      setErrorMessage(e.data.message);
      setExportState('error');
      break;
    case 'cancelled':
      setExportState('cancelled');
      break;
  }
};

// Start export
worker.postMessage({
  type: 'start',
  files: results.map(r => r.originalFile),
  offsets: results.map(r => r.offsetSeconds),
  resolution: EXPORT_RESOLUTIONS[selectedResolution],
  fps: 30,
  bitrate: 8_000_000,
  audioConfig,
  totalDurationSeconds: duration,
  tileAspectRatio: 16 / 9,
} satisfies ExportWorkerCommand);

// Cancel export
worker.postMessage({ type: 'cancel' } satisfies ExportWorkerCommand);

// Clean up on unmount / completion
worker.terminate();
```

### Resolution and Bitrate Presets
```typescript
// Updated EXPORT_RESOLUTIONS with bitrate hints
export const EXPORT_RESOLUTIONS = {
  '4K': { width: 3840, height: 2160, label: '4K', bitrate: 20_000_000 },
  '1080p': { width: 1920, height: 1080, label: '1080p', bitrate: 8_000_000 },
  '720p': { width: 1280, height: 720, label: '720p', bitrate: 5_000_000 },
} as const;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| FFmpeg WASM xstack + libx264 (software) | WebCodecs VideoEncoder (hardware) + OffscreenCanvas | 2024-2025 (WebCodecs matured) | ~8x faster encoding; GPU acceleration instead of WASM-emulated x86 software encoding |
| FFmpeg WASM demux + decode | Mediabunny Input + VideoSampleSink | 2025 (Mediabunny released) | Pure TS, zero-dep, tree-shakable; replaces heavy WASM binary download |
| mp4-muxer for output muxing | Mediabunny Output + Mp4OutputFormat | 2025 (mp4-muxer deprecated) | Unified library for both demux and mux with WebCodecs integration |
| In-memory MEMFS file I/O | Direct File object demuxing via BlobSource | 2025 | No need to copy entire files into MEMFS; Mediabunny reads directly from File/Blob via random access |
| Main thread encoding | Dedicated Web Worker | Best practice since Workers existed | No UI jank during export |

**Deprecated/outdated:**
- `@ffmpeg/ffmpeg` + `@ffmpeg/util`: Replaced entirely by Mediabunny + WebCodecs. FFmpeg WASM is overkill for this use case and prohibitively slow for compositing.
- `mp4-muxer` / `webm-muxer` (by Vanilagy): Explicitly deprecated by the author in favor of Mediabunny.
- `progress` event parsing from FFmpeg WASM log lines: No longer relevant -- Mediabunny provides progress via frame counting.

## Open Questions

1. **VideoSampleSink.getSample() seeking performance for random access**
   - What we know: `getSample(timestamp)` seeks to the nearest frame at the given timestamp. For sequential access (frame 0, 1, 2, ...), this should be efficient. For random access patterns, seeking may require decoding from the nearest keyframe.
   - What's unclear: Whether calling `getSample()` at sequential timestamps in a loop (t=0.0, 0.033, 0.066, ...) is truly sequential under the hood, or whether each call involves re-seeking.
   - Recommendation: Test with a simple benchmark. If performance is poor, switch to iterating with `sink.samples(startTime, endTime)` and advancing a frame pointer manually. The `for await` pattern may be more efficient for sequential access.

2. **Bitrate vs CRF quality for WebCodecs VideoEncoder**
   - What we know: Mediabunny's `CanvasSource` accepts `bitrate` (number) or `QUALITY_*` constants. WebCodecs `VideoEncoder` supports `bitrateMode: 'variable'` but there is no CRF equivalent in the WebCodecs spec.
   - What's unclear: Whether Mediabunny's `QUALITY_HIGH` / `QUALITY_MEDIUM` etc. map to appropriate bitrates for composite video (which has more spatial detail than single-camera video).
   - Recommendation: Use explicit bitrate values derived from resolution (e.g., 8Mbps for 1080p, 20Mbps for 4K) rather than quality constants. Expose as a preset, not a user control. The old CRF-based approach does not translate directly to WebCodecs.

3. **OfflineAudioContext in Web Worker availability**
   - What we know: Chrome 114+ supports `OfflineAudioContext` in workers. Our target is Chrome/Edge.
   - What's unclear: Whether all current Chrome/Edge versions in the wild support this. Chrome 114 was released June 2023, so coverage should be near-universal by now (March 2026).
   - Recommendation: Use `OfflineAudioContext` in the worker. Add a runtime check and fall back to main-thread mixing if unavailable (low priority -- unlikely to be needed).

4. **Memory pressure with multiple simultaneous VideoDecoders**
   - What we know: Each `VideoSampleSink` internally creates a `VideoDecoder`. With 8 inputs, that's 8 simultaneous decoders in one worker.
   - What's unclear: Whether browsers limit the number of simultaneous hardware decoders, and what happens when the limit is exceeded.
   - Recommendation: If hardware decoder limits are hit, Mediabunny should fall back to software decoding transparently. Test with 8 simultaneous inputs. If issues arise, consider sequential decoding (decode all frames from input 1 for a time range, then input 2, etc.) at the cost of more seeking.

## Sources

### Primary (HIGH confidence)
- [Mediabunny docs - Reading media files](https://mediabunny.dev/guide/reading-media-files) - Input, VideoSampleSink, AudioBufferSink, BlobSource API
- [Mediabunny docs - Writing media files](https://mediabunny.dev/guide/writing-media-files) - Output, CanvasSource, AudioBufferSource, Mp4OutputFormat, BufferTarget API
- [Mediabunny docs - Media sources](https://mediabunny.dev/guide/media-sources) - CanvasSource.add(), VideoSampleSource, AudioBufferSource encoding config
- [Mediabunny docs - Packets & samples](https://mediabunny.dev/guide/packets-and-samples) - VideoSample.draw(), VideoSample.close(), EncodedPacket, AudioSample
- [Mediabunny docs - Converting media files](https://mediabunny.dev/guide/converting-media-files) - Conversion API with video process callback, progress, cancellation
- [Mediabunny docs - Supported formats & codecs](https://mediabunny.dev/guide/supported-formats-and-codecs) - AVC, HEVC, AAC support matrix
- [Mediabunny API - CanvasSource](https://mediabunny.dev/api/CanvasSource) - Constructor, add(), close()
- [Mediabunny API - VideoSample](https://mediabunny.dev/api/VideoSample) - draw(), close(), toVideoFrame(), properties
- [Mediabunny GitHub](https://github.com/Vanilagy/mediabunny) - Pure TypeScript, zero deps, MPL-2.0 license
- [Chrome Developers - Video processing with WebCodecs](https://developer.chrome.com/docs/web-platform/best-practices/webcodecs) - VideoEncoder/VideoDecoder config, backpressure, frame lifecycle
- [MDN - WebCodecs API](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API) - Browser support, API surface
- [MDN - VideoEncoder.isConfigSupported()](https://developer.mozilla.org/en-US/docs/Web/API/VideoEncoder/isConfigSupported_static) - Pre-flight codec check
- [MDN - OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas) - Worker-compatible canvas
- [MDN - OfflineAudioContext](https://developer.mozilla.org/en-US/docs/Web/API/OfflineAudioContext) - Faster-than-realtime audio mixing
- Existing codebase: `src/lib/gridLayout.ts` - `computeGridLayout()` returns `GridTile[]` with x, y, width, height
- Existing codebase: `src/components/ExportPanel.tsx` - Current UI with resolution picker, progress bar, state machine
- Existing codebase: `src/lib/downloadHelper.ts` - `triggerDownload()` for browser file download

### Secondary (MEDIUM confidence)
- [npm - mediabunny](https://www.npmjs.com/package/mediabunny) - Version 1.34.5, published March 2026
- [HEVC HW decoding guide](https://github.com/StaZhu/enable-chromium-hevc-hardware-decoding) - Chrome HEVC WebCodecs support matrix by platform
- [WebCodecs VideoEncoder performance issue #492](https://github.com/w3c/webcodecs/issues/492) - Hardware acceleration behavior details
- [web.dev - OffscreenCanvas](https://web.dev/articles/offscreen-canvas) - Performance benefits of worker-based rendering
- [webrtcHacks - WebCodecs pipelines](https://webrtchacks.com/real-time-video-processing-with-webcodecs-and-streams-processing-pipelines-part-1/) - Backpressure and pipeline throttling strategies

### Tertiary (LOW confidence)
- [SitePoint - Video processing with WebCodecs](https://www.sitepoint.com/video-processing-in-browser-with-Web-Codecs/) - General patterns (blog, not official)
- [Medium - Canvas recording with WebCodecs](https://medium.com/@chemsabd/how-to-recorded-canvas-in-react-without-browser-throttling-using-web-workers-and-webcodecs-792446d21f10) - OffscreenCanvas + WebCodecs in React pattern (single author, not verified)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Mediabunny is the officially recommended successor to mp4-muxer by the same author; WebCodecs API is stable in Chrome/Edge; all APIs verified in official docs
- Architecture: HIGH - Multi-input compositing with OffscreenCanvas + CanvasSource is a well-documented pattern; Mediabunny explicitly supports OffscreenCanvas in its CanvasSource constructor; Web Worker + postMessage is standard
- Pitfalls: MEDIUM - VideoFrame resource management is well-documented; multi-decoder memory pressure is less well-documented for 8+ simultaneous inputs; OfflineAudioContext worker support needs runtime verification

**Research date:** 2026-03-03
**Valid until:** 2026-04-03 (Mediabunny is actively developed -- check for breaking changes if version >1.35.x)
