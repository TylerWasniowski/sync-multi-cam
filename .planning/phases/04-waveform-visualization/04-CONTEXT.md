# Phase 4: Waveform Visualization - Context

**Gathered:** 2026-03-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Render audio waveforms with sync point markers so users can visually verify alignment accuracy. Waveforms display in the results view after sync completes. This phase covers rendering, markers, and interaction — not audio playback or re-syncing.

</domain>

<decisions>
## Implementation Decisions

### Interaction behavior
- Fully interactive: zoom, pan, and linked scrolling across all waveforms
- Linked scrolling: when user zooms/pans one waveform, all waveforms move together — makes it easy to compare the same moment across tracks
- Zoom/pan controls: mouse scroll to zoom in/out, click-drag to pan horizontally. Touch: pinch-to-zoom + swipe
- Hover: thin vertical cursor line that spans across all waveforms (linked), showing the time position at cursor

### Claude's Discretion
- Waveform appearance: style (mirrored, filled, bars), color scheme, height/density, how it fits the dark theme
- Sync marker display: how alignment points and offsets are visually indicated on the waveforms
- Layout and placement: where waveforms appear relative to SyncResults, stacked vs inline, overall composition
- Zoom range limits and default zoom level
- How waveform data is downsampled for rendering performance

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AudioData` type (`Float32Array[]` channelData, 16kHz mono): already extracted during pipeline — waveform rendering can use this data directly
- `SyncResult` type: has `offsetSeconds`, `offsetSamples`, `confidence`, `isReference` per file — these drive marker positions
- `DownloadableResult` type: extends SyncResult with `trimSeconds` — shows how much was trimmed, useful for marker context
- `PipelineProgress` component: example of a multi-stage status component — pattern to follow for progressive rendering

### Established Patterns
- Component per feature: FileDropZone, FileList, PipelineProgress, SyncResults — waveform should be its own component(s)
- State lives in App.tsx, passed as props to child components
- Tailwind CSS for all styling, dark theme (gray-950 bg, gray-900 cards, gray-800 borders, blue-600 accents)
- No existing canvas or visualization code — this phase establishes the pattern

### Integration Points
- Waveform component(s) render inside or alongside `SyncResults` in App.tsx
- Audio data (`Float32Array[]`) is available after extraction phase in `handleSync` — needs to be stored in state or passed through
- Sync offsets from `SyncResult[]` drive marker positioning
- Currently audio data is not persisted in state after pipeline completes — will need to retain it for visualization

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-waveform-visualization*
*Context gathered: 2026-03-02*
