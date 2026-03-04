# Phase 7: Waveform Scrubbar Integration - Research

**Researched:** 2026-03-02
**Domain:** Waveform interaction model (click-to-seek, drag-to-scrub, playhead animation), browser pointer events, canvas rendering coordination
**Confidence:** HIGH

## Summary

This phase transforms the existing waveform tracks from a view-only visualization into an interactive scrubbar that drives video playback. The current codebase already has all the building blocks: WaveformCanvas renders peak data with cursor lines and sync markers, WaveformTrack handles pointer events for drag-based panning, WaveformPanel coordinates zoom/scroll state across tracks, PlaybackSection manages playback state (`currentTime`, `isPlaying`) and owns `handleSeek()`, and the SyncEngine provides an `onFrame` callback that already updates `currentTime`. The work is primarily about rewiring existing interaction handlers and adding a playhead rendering layer -- not integrating new libraries.

The core change is an **interaction model inversion**: currently bare drag = pan and there is no seek-on-click. Phase 7 makes bare click = seek, bare drag = scrub (continuous seeking), and Shift+drag = pan. This is a breaking change to existing waveform interaction patterns that must be carefully coordinated across WaveformTrack (track-level pointer handlers), WaveformPanel (panel-level pointer handlers), and WaveformCanvas (must now render a playhead line in addition to the cursor line). The playhead position flows down from PlaybackSection's `currentTime` state, which is already updated at frame rate by the SyncEngine's `onFrame` callback.

**Primary recommendation:** Modify the existing WaveformTrack pointer handlers to detect Shift key for pan vs. bare click/drag for seek/scrub. Thread `playheadTime` from PlaybackSection through WaveformPanel into WaveformCanvas. Add a `drawPlayhead()` function to WaveformCanvas that renders a distinct colored vertical line (different from the gray cursor line). Wire `onSeek` callback from WaveformPanel up to PlaybackSection's existing `handleSeek()`. No new dependencies required.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| WAVE-01 | User can click anywhere on a waveform track to seek all videos to that time position | Convert pointer-down-without-drag on WaveformTrack canvas area into a seek call. Compute time from click x-position using `(scrollOffset + offsetX * samplesPerPixel) / sampleRate`. Propagate via `onSeek` callback to PlaybackSection's `handleSeek()`. |
| WAVE-02 | User can drag along a waveform track to scrub playback position in real time | Replace bare-drag panning with continuous seek: on each pointermove during drag (without Shift), compute time from pointer x and call `onSeek`. Throttle to ~30fps via rAF gating to avoid overwhelming the seek pipeline. |
| WAVE-03 | An animated playhead cursor tracks current playback position across all waveform tracks | Thread `playheadTime` (derived from PlaybackSection's `currentTime` + leader `trimSeconds`) down through WaveformPanel props into WaveformCanvas. Render a distinct playhead line (e.g., red/orange, 2px wide) using `drawPlayhead()` in WaveformCanvas's render effect. SyncEngine's `onFrame` callback already updates `currentTime` at video frame rate. |
| WAVE-04 | Panning requires Shift+drag (changed from bare drag); a visible UI hint communicates this | Check `e.shiftKey` in pointer-down handler: if true, enter pan mode (existing logic); if false, enter seek/scrub mode. Add a small text hint below waveform panel: "Shift + drag to pan" in muted text. Update cursor style: `crosshair` for normal, `grab`/`grabbing` for Shift+drag pan mode. |
| WAVE-05 | Waveform zoom/pan and video playback position stay synchronized | When zooming (wheel handler), center the view on `playheadTime` instead of the pointer position when a playhead is active. Ensure `scrollOffset` adjustment keeps the playhead visible after zoom. When playhead moves during playback, auto-scroll if playhead would leave the visible viewport (follow mode). |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React 19 | ^19.2.0 | Already in project -- component props threading, state management | Project standard |
| Pointer Events API | Browser API | Click/drag detection with `shiftKey` modifier, pointer capture | Already used in WaveformTrack/WaveformPanel. Native API provides `shiftKey`, `clientX`, `button`, `setPointerCapture` |
| Canvas 2D API | Browser API | Playhead line rendering in WaveformCanvas | Already used for waveform rendering, cursor line, sync markers |
| requestAnimationFrame | Browser API | Throttle scrub seek calls, playhead rendering sync | Already used throughout project for rAF gating |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None | - | - | No new dependencies needed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom playhead canvas rendering | CSS overlay div for playhead | Canvas is simpler -- WaveformCanvas already renders cursor lines with identical logic. CSS overlay would require z-index management and separate positioning math |
| Continuous seek during scrub | Debounced seek | Debouncing adds latency. rAF gating (already established pattern) provides ~60fps ceiling without extra delay. Video elements handle rapid seeks well since they snap to nearest keyframe |
| Shift+drag modifier for pan | Dedicated pan tool button | Modifier key is standard in audio/video editors (Logic Pro, Audacity, DaVinci Resolve). Avoids cluttering UI with mode toggles |

**Installation:**
```bash
# No new dependencies needed -- all browser APIs + existing project packages
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── lib/
│   └── videoSync.ts           # No changes needed -- onFrame callback already wired
├── components/
│   ├── PlaybackSection.tsx    # Thread playheadTime down; wire onWaveformSeek
│   ├── WaveformPanel.tsx      # Accept playheadTime + onSeek; thread to tracks
│   ├── WaveformTrack.tsx      # Rewrite pointer handlers: bare=seek, Shift=pan
│   └── WaveformCanvas.tsx     # Add drawPlayhead(); accept playheadTime prop
└── types/
    └── index.ts               # No changes needed -- ViewState already sufficient
```

### Pattern 1: Interaction Model Inversion (Bare Click/Drag = Seek, Shift+Drag = Pan)
**What:** In WaveformTrack's pointer handlers, check `e.shiftKey` to decide between seek/scrub mode and pan mode. The current bare-drag-to-pan logic moves to Shift+drag. Bare click (pointerdown + pointerup without significant movement) triggers a single seek. Bare drag (pointerdown + pointermove without Shift) triggers continuous scrub.
**When to use:** All pointer event handlers in WaveformTrack and WaveformPanel.
**Confidence:** HIGH -- standard modifier key pattern used in professional audio/video editors.

```typescript
// WaveformTrack pointer handler pattern (conceptual)
const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
  if (e.button !== 0) return;
  (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);

  if (e.shiftKey) {
    // Shift+drag: pan mode (existing behavior)
    isPanningRef.current = true;
    dragStartXRef.current = e.clientX;
    dragStartOffsetRef.current = viewState.scrollOffset;
  } else {
    // Bare click/drag: seek/scrub mode
    isScrubbingRef.current = true;
    dragStartXRef.current = e.clientX;
    // Immediately seek to click position
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const time = (viewState.scrollOffset + offsetX * viewState.samplesPerPixel) / peaks.sampleRate;
    onSeek?.(time);
  }
}, [viewState.scrollOffset, viewState.samplesPerPixel, peaks.sampleRate, onSeek]);

const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
  if (isPanningRef.current) {
    // Existing pan logic (shifted from bare drag)
    const deltaX = dragStartXRef.current - e.clientX;
    const deltaSamples = deltaX * viewState.samplesPerPixel;
    const newOffset = dragStartOffsetRef.current + deltaSamples;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      onViewStateChange({ scrollOffset: Math.max(0, newOffset) });
    });
  } else if (isScrubbingRef.current) {
    // Continuous scrub: seek to pointer position
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const time = (viewState.scrollOffset + offsetX * viewState.samplesPerPixel) / peaks.sampleRate;
    // Gate through rAF to limit seek rate
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      onSeek?.(time);
    });
  } else {
    // Hover cursor tracking (existing)
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const time = (viewState.scrollOffset + offsetX * viewState.samplesPerPixel) / peaks.sampleRate;
    onViewStateChange({ cursorTime: time });
  }
}, [/* deps */]);
```

### Pattern 2: Playhead Line Threading
**What:** The playback position flows from SyncEngine -> PlaybackSection state (`currentTime`) -> WaveformPanel prop (`playheadTime`) -> WaveformCanvas prop (`playheadTime`) -> canvas rendering (`drawPlayhead()`). The playhead is a visually distinct vertical line drawn on every canvas paint. During playback, the SyncEngine's `onFrame` callback triggers `setCurrentTime()` at video frame rate (~24-60fps), which naturally triggers React re-renders that repaint the canvas with the updated playhead position.
**When to use:** Always -- playhead must be visible whether playing or paused (shows last-seeked position when paused).
**Confidence:** HIGH -- follows existing cursorTime pattern exactly. WaveformCanvas already redraws on viewState changes.

```typescript
// WaveformCanvas: new playhead rendering (added to existing draw effect)
function drawPlayhead(
  ctx: CanvasRenderingContext2D,
  playheadTime: number | null,
  viewState: ViewState,
  sampleRate: number,
  canvasWidth: number,
  canvasHeight: number,
): void {
  if (playheadTime === null) return;

  const x = (playheadTime * sampleRate - viewState.scrollOffset) / viewState.samplesPerPixel;
  if (x < 0 || x > canvasWidth) return;

  ctx.save();
  ctx.strokeStyle = '#ef4444'; // red-500 -- distinct from blue sync markers and gray cursor
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, canvasHeight);
  ctx.stroke();
  ctx.restore();
}
```

### Pattern 3: Playhead-Aware Viewport Follow Mode
**What:** During playback, if the playhead position moves outside the visible viewport, auto-scroll to keep it visible. Center the playhead in the viewport when it exits. On zoom (wheel), anchor the zoom to the playhead position (instead of the pointer) when playback is active.
**When to use:** During active playback. When paused, zoom anchors to pointer (current behavior).
**Confidence:** HIGH -- standard DAW behavior (every audio editor auto-follows the playhead during playback).

```typescript
// In WaveformPanel: playhead follow mode
// On each playheadTime update during playback:
useEffect(() => {
  if (!isPlaying || playheadTime === null) return;

  const playheadSample = playheadTime * sampleRate;
  const viewStart = viewState.scrollOffset;
  const viewEnd = viewState.scrollOffset + canvasWidth * viewState.samplesPerPixel;

  if (playheadSample < viewStart || playheadSample > viewEnd) {
    // Playhead left viewport -- recenter
    const newOffset = playheadSample - (canvasWidth * viewState.samplesPerPixel) / 2;
    handleViewStateChange({ scrollOffset: Math.max(0, newOffset) });
  }
}, [playheadTime, isPlaying, sampleRate, viewState, canvasWidth]);
```

### Pattern 4: Time Coordinate Conversion
**What:** The waveform operates in "aligned time" -- time since the sync alignment point (where all videos are trimmed to start). This matches `PlaybackSection.currentTime` (0-based). The waveform's `scrollOffset` is in samples, and `samplesPerPixel` converts between pixel space and sample space. The formula `time = (scrollOffset + pixelX * samplesPerPixel) / sampleRate` converts pixel position to aligned time. No offset conversion needed because the waveform and playback both use the same 0-based time coordinate.
**When to use:** Every click-to-seek and drag-to-scrub computation.
**Confidence:** HIGH -- verified against existing cursor time calculation in WaveformTrack line 98.

### Anti-Patterns to Avoid
- **Seeking on every pointermove without throttling:** Video elements can handle seeks but each seek triggers an internal buffer flush. Throttle scrub seeks with rAF gating (one seek per animation frame, ~60fps max). The project already uses this pattern extensively.
- **Using `setTimeout` for scrub throttling:** setTimeout introduces minimum 4ms delay and doesn't align with render frames. rAF is the established project pattern.
- **Modifying ViewState.cursorTime for playhead:** The cursor (gray line, follows mouse hover) and playhead (red line, follows playback position) are conceptually different. Overloading `cursorTime` for the playhead would break hover behavior. Keep them as separate values.
- **Seeking during active playback without pausing first:** PlaybackSection's `handleSeek()` already handles the pause-seek-resume pattern correctly (Pitfall 3 from Phase 5). When scrubbing, the user likely wants to pause playback and scrub -- the initial seek call should pause if playing, subsequent scrub moves should NOT restart playback until the user releases the pointer.
- **Auto-scroll fighting user pan during playback:** If the user is manually panning (Shift+drag) during playback, do NOT auto-scroll to follow playhead. Disable follow mode when the user is actively interacting.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Click vs. drag discrimination | Custom distance-threshold timer logic | Pointer event sequence (pointerdown -> pointermove -> pointerup) | Both click (immediate seek on pointerdown) and drag (continuous seek on pointermove) can trigger seeks. No need to distinguish -- pointerdown seeks immediately, pointermove continues seeking. Simplifies logic vs. click threshold detection. |
| Modifier key detection | Custom key tracking state | `PointerEvent.shiftKey` property | Built into every pointer event. No keyboard listener needed. |
| Playhead animation timing | `setInterval` or manual timing loop | React re-render driven by `setCurrentTime()` in SyncEngine's `onFrame` callback | The SyncEngine already calls `onFrame` at video frame rate. `setCurrentTime()` triggers re-render -> WaveformCanvas redraws with new playhead position. No separate animation loop needed. |
| Seek throttling | Custom throttle/debounce utility | `requestAnimationFrame` gating (existing project pattern) | rAF provides natural frame-rate throttling aligned with browser paint. Already used in WaveformPanel and WaveformTrack. |

**Key insight:** This phase adds no new capabilities to the tech stack. Every piece of the implementation (pointer events, canvas drawing, rAF gating, seek coordination) already exists in the codebase. The work is rewiring existing pieces with changed interaction semantics.

## Common Pitfalls

### Pitfall 1: Scrub Seeks Triggering Play/Pause Toggle
**What goes wrong:** Each scrub seek call goes through `PlaybackSection.handleSeek()`, which pauses playback, seeks, then resumes if was playing. Rapid scrub calls create a pause-seek-resume-pause-seek-resume cycle that causes audio stutter and visual glitches.
**Why it happens:** The existing `handleSeek()` was designed for single discrete seek events (transport bar slider), not continuous scrub operations.
**How to avoid:** Create a separate `handleScrubSeek()` in PlaybackSection that pauses on the first scrub event, seeks without resuming during the drag, and only resumes (if was playing) when the pointer is released (scrub ends). Signal scrub start/end from WaveformPanel.
**Warning signs:** Audio clicks/pops during scrub, videos flickering between play and pause.

### Pitfall 2: Playhead Rendering Causing Excessive Canvas Redraws
**What goes wrong:** During playback, `currentTime` updates at ~24-60fps via SyncEngine. Each update triggers React state change -> WaveformCanvas re-render -> full canvas redraw (waveform, markers, cursor, playhead). With 4-8 tracks, this means 4-8 full canvas redraws per video frame.
**Why it happens:** WaveformCanvas redraws everything on any prop change (viewState, playheadTime).
**How to avoid:** Two strategies: (1) Use a separate overlay canvas for the playhead only -- the waveform canvas only redraws when viewState/zoom changes, the thin overlay canvas only redraws the playhead line on each frame. (2) If the single-canvas approach is fast enough (benchmark first), keep it simple -- the existing draw code is lightweight (no complex path operations). **Recommendation:** Start with single canvas, measure performance with 8 tracks. Only split to overlay canvas if rendering exceeds 4ms per frame.
**Warning signs:** Jank during playback visible in Performance tab, dropped frames.

### Pitfall 3: Time Coordinate Mismatch Between Waveform and Playback
**What goes wrong:** Clicking on a waveform position seeks to the wrong video time because the waveform time coordinates and the playback time coordinates use different reference points.
**Why it happens:** The waveform data is computed from the original (untrimmed) audio at 16kHz sample rate. The playback `currentTime` is 0-based (relative to trim point). The existing cursor time calculation in WaveformTrack (line 98) computes time as `(scrollOffset + offsetX * samplesPerPixel) / sampleRate` which gives time in the original audio's reference frame, NOT the 0-based playback time.
**How to avoid:** The waveform's time already represents "aligned time" because peaks were computed from extracted audio that starts at time 0. The sync offset markers in WaveformCanvas show where each track's trim point is. When seeking from a waveform click, the computed time IS the 0-based playback time (both reference the same aligned start). Verify this by checking: does clicking on the sync marker position (e.g., +2.5s for a non-reference track) seek to 2.5s? If so, coordinate systems match.
**Warning signs:** Clicking on a visible feature in the waveform doesn't navigate to the corresponding moment in the video.

### Pitfall 4: Pointer Capture Conflicts Between Scrub and Pan Modes
**What goes wrong:** Pointer capture set during a scrub drag prevents other UI elements from receiving pointer events. Or, releasing pointer capture at the wrong time causes the scrub to "drop" mid-drag.
**Why it happens:** `setPointerCapture` is already used in WaveformTrack for pan drags. Changing the interaction model means the same capture mechanism must serve both scrub and pan modes, and mode determination happens at pointerdown (checking shiftKey).
**How to avoid:** Set pointer capture on pointerdown regardless of mode. Release on pointerup/pointercancel. The mode flag (isPanningRef vs isScrubbingRef) determines which logic runs in pointermove. Clear both flags on pointerup.
**Warning signs:** Pointer drag "sticks" after releasing mouse button, or drag stops working mid-gesture.

### Pitfall 5: Auto-Follow Scroll Causing Visual Jumping
**What goes wrong:** During playback, the playhead reaches the viewport edge and auto-scroll jumps the view to re-center the playhead, causing a jarring visual discontinuity.
**Why it happens:** Snapping `scrollOffset` to center the playhead creates an instantaneous large offset change.
**How to avoid:** Instead of centering when the playhead exits, use a "page turn" approach: when the playhead exits the right edge, scroll forward by one viewport width (so playhead is now at the left edge). This mimics how DAWs like Logic Pro and Pro Tools handle playhead following. Alternatively, smoothly animate the scroll with a brief CSS transition on the canvas container -- but canvas doesn't support CSS transitions on its content, so the page-turn approach is simpler and standard.
**Warning signs:** Waveform view "jumps" during playback.

## Code Examples

### Playhead Time Derivation in PlaybackSection
```typescript
// PlaybackSection already has currentTime (0-based playback time) and leaderTrimSeconds.
// The playhead time for waveforms is simply currentTime (both use 0-based aligned time).
// No conversion needed.

// In PlaybackSection's render:
<WaveformPanel
  peaksMap={peaksMap}
  results={results}
  mutedTracks={mutedTracks}
  onToggleMute={handleToggleMute}
  onScrub={handleScrub}
  playheadTime={currentTime}     // NEW: pass playback position
  isPlaying={isPlaying}          // NEW: for follow mode
  onSeek={handleSeek}            // NEW: waveform click/scrub -> video seek
  onScrubStart={handleScrubStart}  // NEW: pause playback on scrub begin
  onScrubEnd={handleScrubEnd}      // NEW: resume playback on scrub end
/>
```

### Scrub Start/End Handlers in PlaybackSection
```typescript
// PlaybackSection: manage scrub state to avoid pause/resume cycling
const wasPlayingBeforeScrubRef = useRef(false);

const handleScrubStart = useCallback(() => {
  wasPlayingBeforeScrubRef.current = isPlaying;
  if (isPlaying) {
    // Pause without going through full handlePause (don't reset state)
    const refs = videoRefs.current;
    for (const video of refs) {
      if (video) video.pause();
    }
    syncEngineRef.current?.stop();
    setIsPlaying(false);
  }
}, [isPlaying]);

const handleScrubEnd = useCallback(() => {
  if (wasPlayingBeforeScrubRef.current) {
    handlePlay(); // Resume playback
  }
}, [handlePlay]);

// Scrub seek: just set currentTime without pause/resume cycling
const handleScrubSeek = useCallback((seekTime: number) => {
  const engine = syncEngineRef.current;
  if (!engine) return;
  const absoluteTime = seekTime + leaderTrimSeconds;
  engine.seek(absoluteTime);
  setCurrentTime(seekTime);
}, [leaderTrimSeconds]);
```

### Shift Key UI Hint
```typescript
// Below the WaveformPanel tracks area
<div className="px-4 py-1 text-[10px] text-gray-600 text-right select-none">
  Shift + drag to pan &middot; Scroll to zoom
</div>
```

### Dynamic Cursor Style Based on Modifier Key
```typescript
// In WaveformTrack: track whether Shift is held for cursor style
const [shiftHeld, setShiftHeld] = useState(false);

// Use keydown/keyup on document to track Shift state
useEffect(() => {
  const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Shift') setShiftHeld(true); };
  const onKeyUp = (e: KeyboardEvent) => { if (e.key === 'Shift') setShiftHeld(false); };
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  return () => {
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
  };
}, []);

// Cursor: crosshair when hovering (seek mode), grab when Shift held (pan mode)
const cursorStyle = isDragging
  ? (isPanning ? 'grabbing' : 'col-resize')
  : (shiftHeld ? 'grab' : 'crosshair');
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `mousedown`/`mousemove`/`mouseup` | Pointer Events API (`pointerdown`/`pointermove`/`pointerup`) | Baseline 2020+ | Unified mouse + touch + pen input. Pointer capture works reliably. Already used in project. |
| Separate canvas layers via stacked DOM elements | Single canvas with full redraw per frame | N/A (depends on complexity) | For simple overlays like a playhead line, single canvas is sufficient. Split to overlay canvas only if performance warrants it. |
| `e.which` / `e.keyCode` for modifier detection | `e.shiftKey` boolean property | Modern spec | Direct boolean check on any pointer/mouse/keyboard event. No key code lookup needed. |

**Deprecated/outdated:**
- `mousedown`/`mouseup` for drag handling: Pointer Events API is the standard. Already used in this project.
- `event.which` for button detection: Use `event.button` (already used in project -- `e.button !== 0`).

## Open Questions

1. **Scrub during playback: pause-then-scrub or live scrub?**
   - What we know: DAWs typically pause playback when the user clicks on the timeline, scrub as the user drags, and optionally resume on release. Some editors (like YouTube) keep playing while you drag the scrubbar.
   - What's unclear: The user hasn't specified a preference. Pausing on scrub start is more intuitive and avoids fighting between the sync engine trying to advance playback and the scrub trying to set position.
   - Recommendation: Pause on scrub start, seek on each drag move, resume on scrub end if was playing. This matches professional DAW behavior and avoids complexity.

2. **Canvas performance with 8 tracks at 60fps playhead updates**
   - What we know: Each WaveformCanvas redraws entirely on any prop change. During playback with 8 tracks, that's 8 full canvas redraws per video frame (~24-60fps). Each redraw iterates peak buckets, draws the waveform, markers, cursor, and now playhead.
   - What's unclear: Whether 8 simultaneous canvas redraws at 60fps cause visible jank. The existing draw code is lightweight (simple rect fills, no complex paths).
   - Recommendation: Start with single-canvas approach. Benchmark with 8 tracks. If frame time exceeds 4ms, split playhead to a thin overlay canvas (128px high, full width, transparent background, only draws the 2px red line).

3. **Waveform time reference vs. playback time reference**
   - What we know: Waveform peaks are computed from extracted 16kHz audio that starts at sample 0. Playback `currentTime` is 0-based relative to the leader's `trimSeconds`. The waveform cursor time formula `(scrollOffset + offsetX * samplesPerPixel) / sampleRate` produces a time in the waveform's own coordinate system.
   - What's unclear: Whether the waveform's time 0 == playback's time 0. The audio was extracted from the full original file, so waveform time 0 = start of original file. But playback time 0 = `trimSeconds` into the original file.
   - Recommendation: The playhead should be drawn at position `(playheadTime + leaderTrimSeconds) * sampleRate` in sample space -- but wait, the existing `handleScrub` callback in PlaybackSection adds `result.trimSeconds` per-video for poster extraction (line 358). The waveform time and playback time likely share the same 0-base because the cursor time is already used for poster scrub without an offset conversion. **Validation needed:** Click a known point in the waveform and verify the correct video frame appears. If there's an offset, add `leaderTrimSeconds` to the conversion.

## Sources

### Primary (HIGH confidence)
- **Project source code** - WaveformTrack.tsx, WaveformPanel.tsx, WaveformCanvas.tsx, PlaybackSection.tsx, videoSync.ts -- verified by reading the actual implementation
- **MDN: PointerEvent.shiftKey** - Boolean property available on all pointer events for modifier key detection
- **MDN: Element.setPointerCapture** - Pointer capture API already used in WaveformTrack and WaveformPanel

### Secondary (MEDIUM confidence)
- **DAW interaction patterns** - Logic Pro, Pro Tools, Audacity, DaVinci Resolve all use click-to-seek + modifier-to-pan as the standard timeline interaction model. Shift is the most common modifier for alternate mode.

### Tertiary (LOW confidence)
- None -- all findings are based on direct codebase analysis and well-established browser APIs.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new dependencies. All browser APIs already in use in the project.
- Architecture: HIGH - All building blocks exist. This is a rewiring exercise, not a new capability.
- Pitfalls: HIGH - Main risks (scrub/seek cycling, time coordinate mismatch, canvas perf) are well-understood and have clear mitigation strategies.

**Research date:** 2026-03-02
**Valid until:** 2026-04-02 (stable browser APIs, unlikely to change)
