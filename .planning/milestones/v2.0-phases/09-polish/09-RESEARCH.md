# Phase 9: Polish - Research

**Researched:** 2026-03-03
**Domain:** React UI polish (overlays, expand/collapse, keyboard shortcuts)
**Confidence:** HIGH

## Summary

Phase 9 implements three independent quality-of-life features that enhance the playback preview experience: filename label overlays on video tiles, click-to-expand fullscreen mode for individual tiles, and keyboard shortcuts for transport controls. All three features are pure React + CSS + browser DOM API work -- no new libraries are needed.

The existing codebase is well-structured for these additions. `VideoTile` already receives the `File` object (which has `.name`), `VideoGrid` manages tile layout and click events, and `PlaybackSection` owns playback state (isPlaying, currentTime, duration) plus play/pause/seek handlers. The keyboard shortcut pattern already exists in `WaveformTrack` and `WaveformPanel` (document-level keydown/keyup listeners for Shift detection), so POL-03 follows established project conventions.

**Primary recommendation:** Implement all three features in a single plan. They are small, independent additions to existing components with no shared complexity.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| POL-01 | Camera filename labels display on tiles during preview (not baked into export) | Add label overlay div to `VideoTile` component using the existing `file.name` prop. CSS absolute positioning + text truncation. See Architecture Pattern 1. |
| POL-02 | User can click a tile to expand it fullscreen, click again to return to grid | Manage `expandedIndex` state in `PlaybackSection`/`VideoGrid`. Expanded tile renders as fixed-position overlay covering the grid. See Architecture Pattern 2. |
| POL-03 | Keyboard shortcuts work for transport: space (play/pause), arrow keys (seek) | Add `useEffect` with document-level `keydown` listener in `PlaybackSection`. Call existing `handlePlay`/`handlePause`/`handleSeek`. See Architecture Pattern 3. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | ^19.2.0 | UI components | Already in project |
| Tailwind CSS | ^4.2.1 | Styling | Already in project |

### Supporting

No additional libraries needed. All three features use browser-native APIs.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| CSS fixed overlay for fullscreen | Element.requestFullscreen() API | Browser fullscreen API exits on Escape (good), but changes OS-level window chrome, may conflict with transport controls. CSS overlay within the grid container is simpler and keeps all UI visible. |
| Document-level keydown listener | React `onKeyDown` on a focusable container | Would require managing focus state; document-level listener is simpler and matches existing WaveformTrack/WaveformPanel pattern. |

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Recommended Changes
```
src/
├── components/
│   ├── VideoTile.tsx       # ADD: filename label overlay div
│   ├── VideoGrid.tsx       # ADD: expandedIndex state, click handler, expanded tile overlay
│   └── PlaybackSection.tsx # ADD: keyboard shortcut useEffect, pass expand/click props
```

### Pattern 1: Filename Label Overlay (POL-01)
**What:** Semi-transparent label at bottom of each video tile showing the camera filename
**When to use:** Always visible during preview, not rendered during export

The `VideoTile` component already receives `file: File`. Use `file.name` for the label text. Position absolutely at bottom-left with a dark gradient background for readability over any video content.

**Example:**
```typescript
// In VideoTile.tsx - add inside the outer div, after the video element
<div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-gradient-to-t from-black/70 to-transparent">
  <span className="text-xs text-white truncate block">
    {file.name}
  </span>
</div>
```

**Key details:**
- `file.name` is already available as a prop in `VideoTile` (it receives `file: File`)
- Use `truncate` (Tailwind) for long filenames -- ellipsis prevents overflow
- Gradient background ensures text is readable regardless of video content brightness
- The label is part of the React DOM overlay, NOT baked into the video/canvas -- satisfies the "not baked into export" requirement
- The outer div already has `overflow: hidden` and `position: absolute` set in its style prop, so the label stays within tile bounds

### Pattern 2: Click-to-Expand Fullscreen Tile (POL-02)
**What:** Click a tile to expand it to fill the entire grid area; click again to collapse back
**When to use:** User wants to inspect a single camera angle in detail

**State management approach:**
- Add `expandedIndex: number | null` state to `VideoGrid` (or `PlaybackSection` if grid needs to stay out of layout flow)
- When a tile is clicked, set `expandedIndex` to that tile's index
- When the expanded tile is clicked, set `expandedIndex` back to `null`
- The expanded tile renders over the grid area using absolute positioning that fills the grid container

**Example:**
```typescript
// In VideoGrid.tsx
const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

const handleTileClick = useCallback((index: number) => {
  setExpandedIndex((prev) => (prev === index ? null : index));
}, []);

// In the render, conditionally override tile style for expanded tile:
const tileStyle = expandedIndex === index
  ? { left: 0, top: 0, width: '100%', height: '100%', zIndex: 10 }
  : { left: tile.x, top: tile.y, width: tile.width, height: tile.height };
```

**Key details:**
- The grid container (`div.relative.w-full.bg-black`) is already `position: relative`, so absolute positioning within it works for fullscreen overlay
- All other tiles remain rendered (just underneath the expanded tile) -- no unmount/remount, no video reload
- The expanded video element is the SAME element (not a copy), so playback and sync continue uninterrupted
- Add a close indicator (e.g., small X icon or visual hint) so the user knows how to exit
- CSS transition on the tile style change provides smooth expand/collapse animation
- The `onClick` handler must not interfere with the existing video `<video>` element default behavior (videos don't have `controls` attribute, so click doesn't toggle play)
- Escape key should also collapse the expanded tile (handled naturally in POL-03 keyboard handler)

**Interaction concern:** The click target is the tile's outer div, not the video element itself. Since the video element does not have the `controls` attribute and is not interactive (no click handlers on `<video>`), attaching `onClick` to the tile wrapper div is safe.

### Pattern 3: Keyboard Shortcuts (POL-03)
**What:** Document-level keyboard listener for transport controls
**When to use:** Whenever the PlaybackSection is mounted and videos are ready

**Existing pattern in codebase:**
```typescript
// From WaveformTrack.tsx lines 56-65 -- exact same pattern
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
```

**Implementation:**
```typescript
// In PlaybackSection.tsx
useEffect(() => {
  if (!allVideosReady) return;

  const handleKeyDown = (e: KeyboardEvent) => {
    // Don't capture keyboard events when user is in an input/textarea
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    switch (e.key) {
      case ' ':
        e.preventDefault(); // Prevent page scroll
        if (isPlaying) {
          handlePause();
        } else {
          handlePlay();
        }
        break;
      case 'ArrowLeft':
        e.preventDefault();
        handleSeek(Math.max(0, currentTime - 5)); // 5-second jump back
        break;
      case 'ArrowRight':
        e.preventDefault();
        handleSeek(Math.min(duration, currentTime + 5)); // 5-second jump forward
        break;
      case 'Escape':
        // Collapse expanded tile (if POL-02 expanded state is lifted)
        break;
    }
  };

  document.addEventListener('keydown', handleKeyDown);
  return () => document.removeEventListener('keydown', handleKeyDown);
}, [allVideosReady, isPlaying, currentTime, duration, handlePlay, handlePause, handleSeek]);
```

**Key details:**
- `e.preventDefault()` on Space is critical -- without it, the browser scrolls the page
- Guard against INPUT/TEXTAREA/SELECT to avoid capturing text input events
- Arrow key seek distance: 5 seconds is standard for video players (YouTube uses 5s)
- Clamp seek values to `[0, duration]` to prevent seeking past bounds
- The `useEffect` dependency array includes all handler functions and state -- this is correct because the handlers are wrapped in `useCallback` and are stable

### Anti-Patterns to Avoid
- **Rendering a second video element for fullscreen:** Creates a new decode pipeline, breaks sync, wastes memory. Use the SAME element with CSS repositioning.
- **Using tabIndex + onKeyDown on a wrapper div:** Requires explicit focus management, brittle when clicking other UI elements. Document-level listener is simpler and already the established pattern.
- **Hardcoding label text from `fileName` on DownloadableResult:** Use `file.name` from the `File` object -- it's already passed to `VideoTile` and is the canonical source of the filename.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Text truncation with ellipsis | Manual JS string slicing | Tailwind `truncate` class | Handles resize, RTL, variable-width fonts correctly |
| Gradient overlay for readability | Solid semi-transparent background | CSS `bg-gradient-to-t from-black/70 to-transparent` | Gradient looks more professional, doesn't obscure as much video |
| Smooth expand/collapse animation | Manual requestAnimationFrame | CSS `transition-all duration-200` | GPU-composited, no JS overhead, handles interruption gracefully |

**Key insight:** All three features are CSS + state management -- no computation, no async operations, no complex logic. Keep implementations minimal.

## Common Pitfalls

### Pitfall 1: Space Key Scrolls Page
**What goes wrong:** Pressing space to play/pause also scrolls the page down by one viewport height
**Why it happens:** Space is the browser's default "scroll down" key binding
**How to avoid:** Call `e.preventDefault()` in the keydown handler before toggling play/pause
**Warning signs:** Page jumps when pressing space during playback

### Pitfall 2: Keyboard Handler Stale Closures
**What goes wrong:** The keyboard handler captures stale `isPlaying` or `currentTime` values because the useEffect doesn't re-register when state changes
**Why it happens:** Missing dependencies in useEffect dependency array, or handler not using latest state
**How to avoid:** Include all referenced state and callbacks in the useEffect dependency array. Since `handlePlay`, `handlePause`, and `handleSeek` are already `useCallback`-wrapped, they are stable references and safe to include.
**Warning signs:** Space key always triggers play (never pause), or arrow keys seek from the wrong position

### Pitfall 3: Expanded Tile Click Propagation
**What goes wrong:** Clicking the expanded tile to collapse also triggers seek or other events in components underneath
**Why it happens:** Click event propagates through the overlay to elements beneath it
**How to avoid:** Call `e.stopPropagation()` on the expanded tile's click handler, or ensure the overlay covers the full container with a high z-index
**Warning signs:** Clicking to collapse also seeks the waveform or triggers other UI actions

### Pitfall 4: Label Text Overflow in Small Tiles
**What goes wrong:** Long filenames push tile content out of bounds or wrap to multiple lines
**Why it happens:** No text overflow handling on the label
**How to avoid:** Use Tailwind `truncate` (which sets `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`) and ensure the label container has a max-width (it naturally gets this from the tile width since it's absolutely positioned with `left-0 right-0`)
**Warning signs:** Text wrapping or horizontal scrollbar appearing in the grid

### Pitfall 5: Keyboard Shortcuts Fire in Text Inputs
**What goes wrong:** Pressing space while typing in a text field triggers play/pause instead of typing a space character
**Why it happens:** Document-level keydown listener captures ALL key events regardless of focus context
**How to avoid:** Check `e.target` tag name at the start of the handler -- bail out if it's INPUT, TEXTAREA, or SELECT
**Warning signs:** Can't type spaces or use arrow keys in any input field while the playback section is mounted

### Pitfall 6: Expanded Tile Loses Sync
**What goes wrong:** Video in the expanded tile drifts or stutters when expanding/collapsing
**Why it happens:** If the implementation removes and re-adds the video element to the DOM (e.g., via conditional rendering), the browser resets the element's playback state
**How to avoid:** Keep the same video element in the DOM at all times -- only change its CSS position/size. React key stability ensures this: never change the `key` prop during expand/collapse
**Warning signs:** Video reloads or shows a flash of black when expanding/collapsing

## Code Examples

### Complete VideoTile Label Addition
```typescript
// VideoTile.tsx - modified return statement
return (
  <div
    style={{
      ...style,
      position: 'absolute',
      overflow: 'hidden',
    }}
    onClick={onClick}
  >
    <video
      ref={setRef}
      src={blobUrl ?? undefined}
      poster={posterUrl ?? undefined}
      preload="auto"
      playsInline
      style={{
        width: '100%',
        height: '100%',
        objectFit,
        backgroundColor: '#000',
        display: 'block',
      }}
    />
    {/* Filename label overlay */}
    <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-gradient-to-t from-black/70 to-transparent pointer-events-none">
      <span className="text-xs text-white truncate block drop-shadow-sm">
        {file.name}
      </span>
    </div>
    {loading && (
      <div className="absolute inset-0 flex items-center justify-center bg-black/50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-600 border-t-gray-200" />
      </div>
    )}
  </div>
);
```

### VideoGrid Expand State
```typescript
// VideoGrid.tsx - expand/collapse state management
const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

const handleTileClick = useCallback((index: number) => {
  setExpandedIndex(prev => prev === index ? null : index);
}, []);

// For each tile in the render:
const isExpanded = expandedIndex === index;
const tileStyle: React.CSSProperties = isExpanded
  ? { left: 0, top: 0, width: containerWidth, height: containerHeight, zIndex: 10 }
  : { left: tile.x, top: tile.y, width: tile.width, height: tile.height };
```

### Keyboard Handler with Guards
```typescript
// PlaybackSection.tsx - keyboard shortcuts
useEffect(() => {
  if (!allVideosReady) return;

  const SEEK_STEP = 5; // seconds

  const handleKeyDown = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    switch (e.key) {
      case ' ':
        e.preventDefault();
        if (isPlaying) handlePause();
        else handlePlay();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        handleSeek(Math.max(0, currentTime - SEEK_STEP));
        break;
      case 'ArrowRight':
        e.preventDefault();
        handleSeek(Math.min(duration, currentTime + SEEK_STEP));
        break;
    }
  };

  document.addEventListener('keydown', handleKeyDown);
  return () => document.removeEventListener('keydown', handleKeyDown);
}, [allVideosReady, isPlaying, currentTime, duration, handlePlay, handlePause, handleSeek]);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Element.requestFullscreen() for single video | CSS overlay within container | Always been better for multi-video apps | Keeps transport controls visible, no OS chrome change |
| tabIndex + onKeyDown focus management | Document-level keydown listener | N/A (project convention) | Simpler, works regardless of focus state |

**Deprecated/outdated:**
- None relevant -- these are stable browser APIs and CSS patterns

## Open Questions

1. **Seek step size for arrow keys**
   - What we know: YouTube and most video players use 5-second jumps for arrow keys. Some use 10 seconds.
   - What's unclear: User preference for this project
   - Recommendation: Use 5 seconds as the default. This is easily tunable later.

2. **Should Escape key collapse expanded tile?**
   - What we know: This is standard UX for dismissing overlays/modals
   - What's unclear: Whether the user wants Escape to do anything else
   - Recommendation: Yes, add Escape to the keyboard handler to collapse expanded tile. It's expected behavior and costs nothing to implement.

3. **Label visibility toggle**
   - What we know: Requirements say labels display during preview. No mention of a toggle.
   - What's unclear: Whether users might want to hide labels sometimes
   - Recommendation: Always show labels. If a toggle is needed later, it's trivial to add. Don't over-engineer.

## Sources

### Primary (HIGH confidence)
- Project codebase inspection: VideoTile.tsx, VideoGrid.tsx, PlaybackSection.tsx, TransportBar.tsx, WaveformTrack.tsx, types/index.ts, videoSync.ts, gridLayout.ts
- React 19 documentation: useEffect, useCallback, useState hooks (stable API)
- MDN Web Docs: KeyboardEvent, e.preventDefault(), CSS position/z-index

### Secondary (MEDIUM confidence)
- YouTube/Vimeo keyboard shortcut conventions: Space = play/pause, Arrow keys = seek 5s (widely documented, cross-verified)

### Tertiary (LOW confidence)
- None -- all findings are from direct codebase inspection and stable web platform APIs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new libraries needed, pure React + CSS + DOM APIs
- Architecture: HIGH - All patterns verified against existing codebase structure
- Pitfalls: HIGH - Pitfalls are well-known web development concerns (stale closures, event propagation, preventDefault)

**Research date:** 2026-03-03
**Valid until:** 2026-04-03 (stable -- no moving parts, all browser-native APIs)
