# Phase 5: Video Grid & Synchronized Playback - Context

**Gathered:** 2026-03-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can watch all synced cameras playing together in a responsive grid layout. Covers: dynamic grid layout (GRID-01, GRID-02, GRID-03), synchronized playback with transport controls (PLAY-01, PLAY-02, PLAY-03), and waveform interactivity during video loading (PLAY-04). Audio mixing, waveform scrubbing, export, and polish are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Grid layout algorithm
- Custom layout algorithm that computes tile positions for a given canvas size — NOT CSS Grid auto-fit
- The preview grid must match the export grid exactly, so the same algorithm is reused by both the preview renderer and the FFmpeg xstack filtergraph (Phase 8)
- Algorithm should tightly pack tiles to minimize blank space for 2-8 cameras at various aspect ratios
- Zero gap between tiles — tiles touch edge-to-edge, seamless mosaic

### Display mode
- Default mode: **fill** (crop to fill tiles, no black bars)
- Toggle available to switch to letterbox (preserve aspect ratio, show black bars)
- Grid updates immediately on toggle

### Page layout after sync
- Keep the existing max-w-4xl single-column layout — do not widen to full viewport
- SyncResults table stays in its current position (above the playback section)
- File input area (drop zone, file list, sync button) stays visible above everything — matches v1.0 behavior
- The current "Audio Waveforms" section gets repurposed into a combined playback section: video grid above, waveform tracks below, within the same container
- Section will need a new name (no longer just "Audio Waveforms")

### Video loading & placeholder tiles
- Each tile shows a poster frame (first frame of the video) with a loading spinner overlay while the video element loads
- When the user scrubs on the waveform, the poster frame updates to show the frame at the scrubbed position — even before full playback is ready
- Transport controls (play/pause) are disabled until ALL video elements report ready — guarantees sync from first play
- Waveform tracks remain fully interactive (zoom, pan) during video loading per PLAY-04

### Claude's Discretion
- Letterbox/fill toggle placement (in transport bar vs floating corner of grid vs elsewhere)
- Transport controls design: position, visual style, what info is shown (timecode, seek bar, etc.)
- Play/pause button style
- Transport bar visibility behavior (always visible vs auto-hide)
- Loading spinner visual style
- Poster frame extraction method
- Drift correction approach for maintaining frame-level sync during playback (PLAY-02)
- Combined section naming

</decisions>

<specifics>
## Specific Ideas

- "I want to make sure the preview layout looks basically the same as the exported one the user can download" — the grid layout algorithm is a shared module, not just CSS
- Poster frame should update on waveform scrub even before full playback is ready — gives visual feedback during loading
- Zero-gap seamless mosaic aesthetic, like a security camera wall or broadcast multiview

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `WaveformPanel` + `WaveformTrack` + `WaveformCanvas`: Existing waveform visualization with zoom/pan/cursor. Will be placed below the video grid in the combined section.
- `ViewState` type (`samplesPerPixel`, `scrollOffset`, `cursorTime`): Shared view coordination across waveform tracks. May need extension for playhead time.
- `SyncResults` component: Table of results with download buttons. Stays as-is in this phase.
- `DownloadableResult` type: Has `originalFile` (File object) which can be used for `<video>` src via `URL.createObjectURL()`, plus `trimSeconds` and `offsetSeconds` for sync offsets.
- ResizeObserver pattern: Used in WaveformPanel and WaveformTrack for responsive sizing — same pattern can be used for grid container.

### Established Patterns
- Tailwind CSS dark theme: `bg-gray-900` cards, `bg-gray-950` page, `border-gray-800` borders, blue accents
- State managed in App.tsx, passed down as props (no context providers, no routing)
- rAF gating for high-frequency updates (used in WaveformPanel for view state)
- `src/components/` flat structure, `src/lib/` for business logic
- `max-w-4xl mx-auto` layout constraint in App.tsx

### Integration Points
- App.tsx renders `<WaveformPanel>` after sync completes — the new combined section replaces this render
- `syncResults` (DownloadableResult[]) provides file references and sync offsets for video elements
- `waveformPeaks` (Map<string, MultiResolutionPeaks>) provides peak data — already computed during extraction pipeline
- New shared layout algorithm module in `src/lib/` will be consumed by both the preview grid component and the future export filtergraph (Phase 8)

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-video-grid-synchronized-playback*
*Context gathered: 2026-03-02*
