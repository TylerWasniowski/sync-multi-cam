# Phase 4: Waveform Visualization - Research

**Researched:** 2026-03-02
**Domain:** Canvas-based audio waveform rendering with interactive zoom/pan
**Confidence:** HIGH

## Summary

Phase 4 requires rendering audio waveforms on HTML Canvas elements for each video file, with sync point markers, and fully interactive linked zoom/pan across all waveforms. The audio data is already available as `Float32Array[]` at 16kHz mono from the extraction phase -- the challenge is downsampling this to drawable peaks, rendering efficiently on canvas, and implementing smooth linked interaction across up to 30 waveform tracks.

After evaluating wavesurfer.js (the dominant waveform library) against a custom Canvas implementation, the recommendation is **custom Canvas rendering**. Wavesurfer.js is designed as an audio *player* with waveform visualization -- it has no native support for linked scrolling across independent waveform instances, requires workarounds to render from raw Float32Array without an audio source, and would add ~30KB+ of bundle weight for features we don't need (playback, streaming, regions). The project's requirements (visualization-only, multi-track linked interaction, data already in memory) are better served by ~200-300 lines of focused Canvas drawing code.

**Primary recommendation:** Build a custom `WaveformCanvas` React component using HTML5 Canvas 2D API with min/max peak downsampling, shared zoom/pan state via React context or lifted state, and `requestAnimationFrame`-gated redraws.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Fully interactive: zoom, pan, and linked scrolling across all waveforms
- Linked scrolling: when user zooms/pans one waveform, all waveforms move together -- makes it easy to compare the same moment across tracks
- Zoom/pan controls: mouse scroll to zoom in/out, click-drag to pan horizontally. Touch: pinch-to-zoom + swipe
- Hover: thin vertical cursor line that spans across all waveforms (linked), showing the time position at cursor

### Claude's Discretion
- Waveform appearance: style (mirrored, filled, bars), color scheme, height/density, how it fits the dark theme
- Sync marker display: how alignment points and offsets are visually indicated on the waveforms
- Layout and placement: where waveforms appear relative to SyncResults, stacked vs inline, overall composition
- Zoom range limits and default zoom level
- How waveform data is downsampled for rendering performance

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SYNC-06 | App renders audio waveforms on canvas with sync point markers for visual verification | Custom Canvas rendering with min/max peak downsampling, sync offset markers drawn as vertical lines, linked zoom/pan interaction across all tracks |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| HTML5 Canvas 2D API | (browser native) | Waveform rendering | Zero dependency, full control over pixel-level drawing, ideal for this data density |
| React (existing) | 19.2.0 | Component structure, state management | Already in project |
| Tailwind CSS (existing) | 4.2.1 | Styling container/labels | Already in project |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none needed) | - | - | The entire visualization can be built with native Canvas API + React hooks |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom Canvas | wavesurfer.js v7.12.1 | Designed for audio playback + waveform; no native linked multi-track scrolling; requires workarounds for Float32Array-only rendering; adds ~30KB+ bundle; overkill for visualization-only |
| Custom Canvas | peaks.js (BBC) | Better for zoomable waveforms but opinionated about dual-view (overview + detail); expects audiowaveform binary format; linked multi-track not native |
| Custom Canvas | WebGL/WebGPU | Overkill for 2D line drawing; Canvas 2D is plenty fast for waveform peaks at any realistic zoom level |

**Installation:**
```bash
# No new dependencies needed -- uses native Canvas API
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── components/
│   ├── WaveformPanel.tsx       # Container: stacked waveforms + shared controls
│   ├── WaveformTrack.tsx       # Single track: label + canvas + markers
│   └── WaveformCanvas.tsx      # Pure canvas renderer (no state, just draws)
├── lib/
│   └── waveformPeaks.ts        # Downsample Float32Array -> peaks, pure function
└── types/
    └── index.ts                # Add WaveformPeaks type
```

### Pattern 1: Min/Max Peak Downsampling
**What:** Convert raw Float32Array audio samples into a compact array of (min, max) pairs per time bucket. Each bucket represents one horizontal pixel at a given zoom level.
**When to use:** Before rendering -- compute once from raw audio, re-bucket on zoom change.
**Example:**
```typescript
// Source: Standard waveform rendering algorithm
// https://www.w3tutorials.net/blog/algorithm-to-draw-waveform-from-audio/
interface WaveformPeaks {
  min: Float32Array;  // min amplitude per bucket
  max: Float32Array;  // max amplitude per bucket
  length: number;     // number of buckets
  sampleRate: number; // original sample rate (16000)
  duration: number;   // total duration in seconds
}

function computePeaks(
  samples: Float32Array,
  bucketCount: number,
): { min: Float32Array; max: Float32Array } {
  const samplesPerBucket = Math.max(1, Math.floor(samples.length / bucketCount));
  const min = new Float32Array(bucketCount);
  const max = new Float32Array(bucketCount);

  for (let i = 0; i < bucketCount; i++) {
    const start = i * samplesPerBucket;
    const end = Math.min(start + samplesPerBucket, samples.length);
    let lo = Infinity;
    let hi = -Infinity;
    for (let j = start; j < end; j++) {
      const v = samples[j];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    min[i] = lo;
    max[i] = hi;
  }
  return { min, max };
}
```

### Pattern 2: Shared Zoom/Pan State (Lifted State)
**What:** A single zoom/pan state object lives in the parent `WaveformPanel` component and is passed to all `WaveformTrack` children. Any track's interaction events update the shared state, causing all tracks to re-render in sync.
**When to use:** Always -- this is the core of the "linked scrolling" requirement.
**Example:**
```typescript
// Zoom/pan state
interface ViewState {
  samplesPerPixel: number; // controls zoom level
  scrollOffset: number;    // in samples, horizontal scroll position
  cursorTime: number | null; // hover position in seconds, null when not hovering
}

// In WaveformPanel:
const [viewState, setViewState] = useState<ViewState>({
  samplesPerPixel: defaultSamplesPerPixel,
  scrollOffset: 0,
  cursorTime: null,
});

// Pass to all tracks:
{tracks.map(track => (
  <WaveformTrack
    key={track.fileId}
    peaks={track.peaks}
    syncResult={track.syncResult}
    viewState={viewState}
    onViewChange={setViewState}
  />
))}
```

### Pattern 3: Canvas Drawing with devicePixelRatio
**What:** Scale the canvas backing store by `window.devicePixelRatio` to render crisp lines on Retina/HiDPI displays, while keeping CSS size unchanged.
**When to use:** Every canvas setup.
**Example:**
```typescript
// Source: https://web.dev/articles/canvas-hidipi
function setupCanvas(canvas: HTMLCanvasElement, width: number, height: number) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  return ctx;
}
```

### Pattern 4: requestAnimationFrame-Gated Redraws
**What:** When handling rapid mouse/wheel events, gate canvas redraws through `requestAnimationFrame` to avoid drawing faster than the display refresh rate.
**When to use:** All interactive event handlers (wheel zoom, drag pan, mousemove cursor).
**Example:**
```typescript
const rafRef = useRef<number>(0);

const scheduleRedraw = useCallback(() => {
  cancelAnimationFrame(rafRef.current);
  rafRef.current = requestAnimationFrame(() => {
    drawWaveform(canvasRef.current!, peaks, viewState);
  });
}, [peaks, viewState]);
```

### Anti-Patterns to Avoid
- **Re-computing peaks on every render:** Peaks should be memoized (useMemo) and only recomputed when zoom level changes significantly enough to need different bucket sizes.
- **Storing raw Float32Array in React state:** Float32Array at 16kHz for long videos is massive. Compute peaks immediately after extraction, discard raw data, store only peaks.
- **Using setState for cursor position during mousemove:** This causes React re-renders at 60Hz+. Use refs for cursor position and draw directly on canvas.
- **Drawing full waveform then CSS-clipping for scroll:** Draw only the visible viewport. With 30 tracks, every pixel counts.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Waveform rendering | Full-featured waveform player library | Custom Canvas 2D drawing (native API) | Libraries like wavesurfer.js add playback, streaming, regions, plugins -- all unnecessary here. Custom code is ~200 lines and gives full control over linked multi-track interaction |
| Touch gesture detection | Raw touchstart/touchmove/touchend handling | Pointer Events API (`onPointerDown`, `onPointerMove`, `onPointerUp`) + wheel events | Pointer Events unify mouse and touch; the browser handles pointer capture. Pinch-to-zoom detected via `wheel` event with `ctrlKey` (trackpad) or two-pointer distance tracking |
| Peak downsampling | Complex DSP library | Simple min/max loop over Float32Array | Audio is already 16kHz mono -- a single loop computing min/max per bucket is O(n) and runs in <1ms for any realistic file |

**Key insight:** This phase is about *drawing* data we already have, not processing audio. The Canvas 2D API is the right level of abstraction -- no library needed.

## Common Pitfalls

### Pitfall 1: Raw Audio Data Memory Explosion
**What goes wrong:** Keeping all `Float32Array[]` data from extraction in React state for visualization. A 5-min video at 16kHz = 4.8M samples = 18.3MB. With 30 files, that's ~550MB of Float32Array sitting in memory.
**Why it happens:** The audio data is already available from the extraction phase -- it seems natural to just keep it around.
**How to avoid:** Compute peaks (min/max downsampled data) immediately after extraction, then let the raw Float32Array get garbage collected. At 50,000 peak pairs per track (enough for extreme zoom), each track's peaks are only ~400KB. 30 tracks = ~12MB total -- manageable.
**Warning signs:** Browser tab using >1GB memory, page becoming unresponsive after sync completes.

### Pitfall 2: Blurry Canvas on Retina Displays
**What goes wrong:** Canvas looks fuzzy/blurry on HiDPI screens (Retina MacBooks, 4K monitors).
**Why it happens:** Canvas defaults to 1:1 pixel ratio. On a 2x display, the browser upscales the canvas bitmap, causing blur.
**How to avoid:** Always multiply canvas width/height by `window.devicePixelRatio`, then use CSS to display at logical size. Apply `ctx.scale(dpr, dpr)` before drawing.
**Warning signs:** Waveform lines look thicker/softer than surrounding Tailwind UI elements.

### Pitfall 3: Jank During Zoom/Pan on Multiple Tracks
**What goes wrong:** Zooming or panning causes visible stuttering, especially with 10+ tracks.
**Why it happens:** Each wheel/pointermove event triggers React state update -> 30 component re-renders -> 30 canvas redraws, all synchronously.
**How to avoid:** (1) Use `requestAnimationFrame` to coalesce redraws. (2) Store transient interaction state (current cursor, mid-drag offset) in refs, not React state. (3) Only trigger React re-render when interaction *completes* (pointerup) or at rAF cadence. (4) Draw only visible viewport pixels, not the entire waveform.
**Warning signs:** Dropped frames visible in DevTools Performance panel during zoom interaction.

### Pitfall 4: Wheel Event Hijacking Page Scroll
**What goes wrong:** Mouse wheel over waveform zooms the waveform AND scrolls the page simultaneously, or prevents page scrolling when user just wants to scroll past the waveforms.
**Why it happens:** Wheel events bubble to the document. Calling `preventDefault()` too aggressively locks the page.
**How to avoid:** Only `preventDefault()` when the wheel event has `ctrlKey` (pinch-to-zoom on trackpad) or when the waveform is the explicit interaction target with a modifier. For vertical scroll without modifiers, let the event propagate naturally. Consider a "zoom mode" or requiring Ctrl+scroll to zoom.
**Warning signs:** Users complain they can't scroll past the waveform section, or zoom doesn't work on trackpad.

### Pitfall 5: Peak Bucket Mismatch at Different Zoom Levels
**What goes wrong:** Waveform looks blocky at high zoom because peaks were computed for a lower zoom level, or computation is too slow when zooming rapidly.
**Why it happens:** Using a fixed number of peak buckets regardless of zoom. At high zoom, each bucket covers too many samples and detail is lost.
**How to avoid:** Pre-compute a hierarchy of peak resolutions (e.g., 3 levels: overview at ~1000 buckets, medium at ~10,000, detail at ~50,000). Select the appropriate level based on current `samplesPerPixel`. This avoids recomputation during zoom -- just pick the closest pre-computed level.
**Warning signs:** Waveform looks like rectangular blocks instead of smooth curves when zoomed in.

## Code Examples

### Waveform Drawing on Canvas
```typescript
// Draw a mirrored (symmetric) waveform from peaks
function drawWaveform(
  ctx: CanvasRenderingContext2D,
  peaks: { min: Float32Array; max: Float32Array },
  viewState: ViewState,
  canvasWidth: number,
  canvasHeight: number,
  color: string,
) {
  const { samplesPerPixel, scrollOffset } = viewState;
  const sampleRate = 16000;
  const halfHeight = canvasHeight / 2;

  // Which peak index corresponds to the visible viewport
  const startPeak = Math.floor(scrollOffset / samplesPerPixel);
  const endPeak = Math.min(startPeak + canvasWidth, peaks.length);

  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  ctx.fillStyle = color;
  ctx.beginPath();

  for (let i = startPeak; i < endPeak; i++) {
    const x = i - startPeak;
    const minVal = peaks.min[i];
    const maxVal = peaks.max[i];

    // Draw vertical line from min to max amplitude
    const yMin = halfHeight - maxVal * halfHeight; // max goes up
    const yMax = halfHeight - minVal * halfHeight; // min goes down
    ctx.rect(x, yMin, 1, Math.max(1, yMax - yMin));
  }

  ctx.fill();
}
```

### Wheel Zoom Handler
```typescript
// Zoom centered on cursor position
function handleWheel(e: WheelEvent, viewState: ViewState, canvasWidth: number): ViewState {
  // Only zoom on Ctrl+wheel or pinch gesture
  if (!e.ctrlKey && !e.metaKey) return viewState;

  e.preventDefault();

  const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
  const newSamplesPerPixel = Math.max(
    MIN_SAMPLES_PER_PIXEL,
    Math.min(MAX_SAMPLES_PER_PIXEL, viewState.samplesPerPixel * zoomFactor)
  );

  // Keep cursor position stable during zoom
  const cursorSample = viewState.scrollOffset + e.offsetX * viewState.samplesPerPixel;
  const newScrollOffset = cursorSample - e.offsetX * newSamplesPerPixel;

  return {
    ...viewState,
    samplesPerPixel: newSamplesPerPixel,
    scrollOffset: Math.max(0, newScrollOffset),
  };
}
```

### Sync Marker Drawing
```typescript
// Draw sync offset marker as a vertical dashed line
function drawSyncMarker(
  ctx: CanvasRenderingContext2D,
  offsetSeconds: number,
  viewState: ViewState,
  canvasHeight: number,
  sampleRate: number,
) {
  const offsetSamples = offsetSeconds * sampleRate;
  const x = (offsetSamples - viewState.scrollOffset) / viewState.samplesPerPixel;

  if (x < 0 || x > ctx.canvas.width) return; // Off-screen

  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = '#3b82f6'; // blue-500
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, canvasHeight);
  ctx.stroke();
  ctx.setLineDash([]);
}
```

### Linked Cursor Line
```typescript
// Draw cursor line spanning all waveforms at the hover time position
function drawCursor(
  ctx: CanvasRenderingContext2D,
  cursorTime: number | null,
  viewState: ViewState,
  canvasHeight: number,
  sampleRate: number,
) {
  if (cursorTime === null) return;

  const cursorSample = cursorTime * sampleRate;
  const x = (cursorSample - viewState.scrollOffset) / viewState.samplesPerPixel;

  if (x < 0 || x > ctx.canvas.width) return;

  ctx.strokeStyle = '#9ca3af'; // gray-400
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, canvasHeight);
  ctx.stroke();
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Web Audio API AnalyserNode for real-time FFT | Pre-computed peaks from raw samples | Always was standard for static waveforms | AnalyserNode is for live audio analysis; pre-computed peaks are correct for displaying already-recorded audio |
| wavesurfer.js v6 (multiple canvas elements) | wavesurfer.js v7 (Shadow DOM, TypeScript) | v7 released 2023 | Better encapsulation, but still oriented toward single-track audio playback |
| SVG waveforms | Canvas 2D | Always for large datasets | SVG creates DOM nodes per data point, Canvas draws pixels directly -- for >1000 points Canvas wins |

**Deprecated/outdated:**
- wavesurfer.js Markers plugin: Removed in v7, replaced by Regions plugin with `startTime` only
- `CanvasRenderingContext2D.mozDash` / `webkitLineDash`: Use standard `setLineDash()` instead (supported everywhere since ~2015)

## Design Recommendations (Claude's Discretion)

### Waveform Appearance
**Recommendation: Mirrored/symmetric filled waveform** -- this is the industry standard (Audacity, Adobe Audition, Pro Tools, wavesurfer.js default). Draw peaks above and below a center line. Color: `#3b82f6` (blue-600, matching the project's accent color) at ~60% opacity over the dark background. This provides visual density without overwhelming the dark theme.

### Sync Marker Display
**Recommendation: Vertical dashed line at offset position + colored region overlay.** Each waveform shows a vertical marker at its sync offset time. The reference track's marker is at t=0. Non-reference tracks show offset as a dashed vertical line in blue-500 with a label showing the offset value (e.g., "+1.234s"). The trimmed region (0 to offset) could be shown as a dimmed/grayed-out zone.

### Layout and Placement
**Recommendation: Stacked below SyncResults, full width.** Each track gets its own row with filename label on the left, waveform canvas filling the remaining width. The entire waveform panel is a collapsible section (default expanded) appearing after sync results. Track height: ~80px per waveform (40px above + 40px below center). This keeps the layout clean and scrollable.

### Zoom Range and Defaults
**Recommendation:**
- Default zoom: Show entire longest track's duration fitting the canvas width
- Min zoom (most zoomed out): 1 pixel = entire duration (everything visible)
- Max zoom (most zoomed in): 1 pixel = 1 sample (16kHz = 62.5 microseconds per pixel)
- In practice, useful zoom range is approximately 10x out to 1000x in from default

### Downsampling Strategy
**Recommendation: Multi-resolution peak cache (3 levels).**
Pre-compute peaks at three resolutions immediately after extraction:
1. **Overview** (~2,000 peaks): For most-zoomed-out view, one-time cost
2. **Medium** (~20,000 peaks): For moderate zoom, covers most interaction
3. **Detail** (~100,000 peaks): For deep zoom, computed only if user zooms in significantly

Select the appropriate level based on current `samplesPerPixel`. If zoomed in beyond the detail level, compute on-the-fly from raw data (only for the visible viewport -- a few thousand samples). This avoids keeping full Float32Array in memory while supporting smooth zoom.

**Memory budget per track:**
- Overview: 2,000 * 2 * 4 bytes = ~16KB
- Medium: 20,000 * 2 * 4 bytes = ~160KB
- Detail: 100,000 * 2 * 4 bytes = ~800KB
- Total per track: ~1MB, 30 tracks: ~30MB -- well within budget

## Open Questions

1. **Should waveform peaks be computed in a Web Worker?**
   - What we know: Peak computation is O(n) over the Float32Array and should complete in <50ms for a 5-min track at 16kHz. For 30 tracks sequentially, that's ~1.5 seconds.
   - What's unclear: Whether this latency is noticeable given it happens right after the much-slower extraction/correlation pipeline.
   - Recommendation: Start with main-thread computation. If profiling shows jank, move to a Worker. The algorithm is trivially parallelizable.

2. **How to retain audio data for peak computation?**
   - What we know: Currently in `handleSync`, audio is extracted then passed to `syncAudioTracks`, but the raw `Float32Array[]` is not stored in state. We need it (or derived peaks) for waveform rendering.
   - What's unclear: Exact integration point -- store peaks alongside `DownloadableResult`, or separately.
   - Recommendation: Compute peaks immediately after extraction (before correlation), store as separate state array. This way raw Float32Array can be GC'd after sync completes.

3. **Touch interaction complexity**
   - What we know: Pointer Events API unifies mouse and touch. Pinch-to-zoom on trackpads sends wheel events with `ctrlKey`. Two-finger pinch on touchscreens requires tracking two pointer IDs and computing distance delta.
   - What's unclear: How much effort the full touch support will take vs. mouse-only.
   - Recommendation: Implement mouse (wheel + drag) first, then add touch as enhancement. Wheel + ctrlKey covers trackpad users immediately.

## Sources

### Primary (HIGH confidence)
- HTML5 Canvas 2D API: MDN Web Docs - well-documented native API, no version concerns
- [web.dev Canvas HiDPI guide](https://web.dev/articles/canvas-hidipi) - devicePixelRatio scaling pattern
- [MDN Visualizations with Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Visualizations_with_Web_Audio_API) - confirmed Canvas 2D is standard approach
- Project source code: `src/types/index.ts`, `src/lib/audioExtractor.ts`, `src/components/App.tsx` - verified AudioData structure and pipeline flow

### Secondary (MEDIUM confidence)
- [wavesurfer.js v7.12.1](https://github.com/katspaugh/wavesurfer.js) - evaluated and rejected for this use case; confirmed via GitHub it requires audio source or workarounds for peaks-only rendering
- [w3tutorials waveform algorithm](https://www.w3tutorials.net/blog/algorithm-to-draw-waveform-from-audio/) - standard min/max peak downsampling algorithm
- [React Canvas pan/zoom gist](https://gist.github.com/robinovitch61/483190546bf8f0617d2cd510f3b4b86d) - TypeScript patterns for canvas interaction

### Tertiary (LOW confidence)
- Bundle size of wavesurfer.js: Could not verify exact number via Bundlephobia, estimated ~30KB+ gzipped based on npm metadata

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - using native Canvas 2D API (browser built-in), no external dependencies
- Architecture: HIGH - min/max peak downsampling is the universally standard approach for waveform rendering; linked state pattern follows established React patterns used elsewhere in this project
- Pitfalls: HIGH - memory explosion, HiDPI blur, and wheel event conflicts are well-documented and verified across multiple sources
- Design recommendations: MEDIUM - aesthetic choices based on industry convention (DAW interfaces), not empirically tested in this specific context

**Research date:** 2026-03-02
**Valid until:** 2026-04-02 (stable domain, no rapidly changing dependencies)
