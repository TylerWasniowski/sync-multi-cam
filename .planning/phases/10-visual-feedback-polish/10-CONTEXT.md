# Phase 10: Visual Feedback Polish - Context

**Gathered:** 2026-03-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Make muted tracks visually obvious in the waveform panel and make the privacy messaging more prominent. No new capabilities — purely visual polish on existing features.

</domain>

<decisions>
## Implementation Decisions

### Muted waveform row look
- Grayscale + dim: waveform loses its blue color (goes gray) AND dims
- Whole row dims — label text, filename, offset all dim, not just the waveform canvas
- Mute icon stays red (unmuted stays gray) — it's the interactive element, should stay visible
- Transition should be smooth (CSS transition), not jarring

### Privacy message placement
- Add a prominent privacy message inside the file drop zone — visible on first interaction
- Keep the existing header privacy banner as-is (small gray text)
- Drop zone message should be more prominent: "Your files never leave your browser. All processing happens locally."
- Shield icon + clear messaging

### Claude's Discretion
- Exact opacity/dim values for muted state
- Whether to use CSS opacity, CSS filter (grayscale), or canvas-level color change for the waveform
- Drop zone privacy message styling (font size, color, spacing)
- Transition timing/easing for mute animation

</decisions>

<specifics>
## Specific Ideas

- User wants the muted state to be immediately obvious when scanning the waveform panel — not just a tiny icon change
- Privacy message should be visible at the moment users are about to trust the app with their files (the drop zone)

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `WaveformTrack.tsx`: Already receives `isMuted` prop, two-column layout (label w-40 + canvas flex-1)
- `WaveformCanvas.tsx`: Stateless canvas renderer with `WAVEFORM_COLOR = 'rgba(59, 130, 246, 0.6)'`
- `PrivacyBanner.tsx`: Existing shield SVG icon + "Files never leave your browser" text
- `WaveformPanel.tsx`: Wraps tracks in `<div className="px-4 py-1">` per track

### Established Patterns
- Tailwind CSS for all styling, `transition-colors` used on mute button already
- Canvas renders via useEffect on prop changes — changing a color prop would trigger re-draw
- Dark theme: gray-800/900 backgrounds, gray-300/400 text, blue-500 accents

### Integration Points
- `WaveformTrack.tsx:267`: The outer `<div className="flex items-center">` is where row-level styling goes
- `WaveformCanvas.tsx:14`: WAVEFORM_COLOR constant controls bar color — could accept a prop override
- `FileDropZone.tsx`: Where the privacy message should be added (the drop area component)
- `App.tsx:292`: Where PrivacyBanner currently renders in the header

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 10-visual-feedback-polish*
*Context gathered: 2026-03-07*
