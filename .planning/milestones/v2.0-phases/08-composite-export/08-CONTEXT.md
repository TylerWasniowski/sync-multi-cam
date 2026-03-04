# Phase 8: Composite Export - Context

**Gathered:** 2026-03-03
**Status:** Ready for planning (REWORK — replacing FFmpeg WASM with WebCodecs)

<domain>
## Phase Boundary

Composite multiple camera angles into a single grid-layout video with mixed audio, exported as MP4 — entirely client-side in the browser. This is a full rewrite of the export pipeline, replacing FFmpeg WASM (too slow) with WebCodecs API for hardware-accelerated encoding.

</domain>

<decisions>
## Implementation Decisions

### Pipeline Architecture
- Entire pipeline runs in a **Web Worker** (off main thread) — UI stays fully responsive during export
- Decode → composite → encode → mux all happen in the Worker
- Progress updates sent to main thread via postMessage
- File objects transferred to Worker for demuxing/decoding

### Demux & Mux Library
- Use **Mediabunny** (successor to mp4-muxer/webm-muxer) for both demuxing HEVC sources and muxing H.264+AAC output to MP4
- Built-in WebCodecs abstractions simplify the pipeline

### Video Compositing
- Use **OffscreenCanvas** with Canvas2D `drawImage()` to composite decoded VideoFrames into grid layout
- Reuse existing `computeGridLayout()` for tile positioning (same pure function used by playback grid)

### Encoding
- **WebCodecs VideoEncoder** for H.264 output (hardware-accelerated)
- **WebCodecs AudioEncoder** for AAC output
- **WebCodecs VideoDecoder** for HEVC source decoding (hardware-accelerated)

### Output Format & Quality
- Keep current resolution presets: 720p / 1080p / 4K with CRF-based quality
- H.264 + AAC in MP4 container (universal playback)

### Audio Handling
- Respect current mute state from UI — export includes/excludes tracks based on `mutedTracks` Set
- Mix unmuted tracks, or single track if only one unmuted
- Use OfflineAudioContext or WebCodecs AudioDecoder for audio processing

### Export UX
- Keep current progress bar from ExportPanel
- Add **cancel button** to abort export mid-process
- State machine: idle → preparing → encoding → complete | error | cancelled

### Browser Compatibility
- **WebCodecs only, no fallback** — show clear "unsupported browser" message if WebCodecs unavailable
- Target Chrome/Edge (excellent support). Firefox/Safari support is improving but not required.

### Cleanup
- **Remove FFmpeg WASM entirely** — delete ffmpeg.ts, FFmpeg-related code, and @ffmpeg packages
- Clean break, no deprecated code left behind

### Claude's Discretion
- Backpressure strategy (frame queue depth, decode pacing)
- Exact Worker message protocol design
- Mediabunny API integration details
- How to handle edge cases (single video, videos with no audio)

</decisions>

<specifics>
## Specific Ideas

- The existing FFmpeg WASM approach with xstack + libx264 encoding 3x 1080p HEVC was impractically slow (minutes of waiting)
- WebCodecs VideoEncoder should leverage GPU hardware encoding (NVENC, Quick Sync, VideoToolbox) for ~8x speedup
- User has never seen the export actually produce output with progress — needs to actually work visibly this time

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `computeGridLayout()` (src/lib/gridLayout.ts): Pure function returning pixel positions — use for OffscreenCanvas compositing at export resolution
- `ExportPanel.tsx`: UI component with resolution picker, progress bar, state machine — update for cancel button and new pipeline
- `audioMixer.ts`: Web Audio API GainNode graph with per-track mute — reference for mute state, but export audio path is separate
- `posterFrame.ts`: Already uses Canvas2D `drawImage(video)` — same pattern applies for compositing VideoFrames

### Established Patterns
- Blob URLs for video sources: `URL.createObjectURL(file)` in VideoTile
- Grid layout is resolution-agnostic — `computeGridLayout(count, containerWidth, containerHeight, aspectRatio)` works at any resolution
- Audio mute state tracked as `Set<number>` (mutedTracks) in PlaybackSection, passed to ExportPanel

### Integration Points
- ExportPanel receives: `results` (aligned files), `mutedTracks` Set, `duration` from PlaybackSection
- Export pipeline needs access to raw File objects (for Worker transfer) and track offsets (for timeline sync)
- Download trigger via Blob URL + anchor click (existing pattern)

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-composite-export*
*Context gathered: 2026-03-03*
