# Phase 5: Video Grid & Synchronized Playback - Research

**Researched:** 2026-03-02
**Domain:** HTML5 multi-video synchronized playback, grid layout algorithms, browser media APIs
**Confidence:** HIGH

## Summary

This phase adds a video grid player with synchronized multi-camera playback to the existing sync tool. The user has already made key architectural decisions: a custom layout algorithm (not CSS Grid auto-fit) that outputs tile positions reusable by both the preview renderer and the Phase 8 FFmpeg xstack export, zero-gap seamless mosaic aesthetic, fill mode as default with a letterbox toggle, and poster-frame placeholders while videos load.

The core technical challenge is keeping 2-8 video elements frame-synchronized during playback. The standard approach is a leader-follower sync loop using `requestVideoFrameCallback` (rVFC) as the timing source, with `requestAnimationFrame` as fallback for older Firefox versions. Drift correction reads each follower's `currentTime` against the leader and either adjusts `currentTime` directly (for large drift) or nudges `playbackRate` (for small drift). The grid layout is a pure function: given container dimensions, tile count, and aspect ratio, it returns absolute pixel positions -- matching the `x_y` coordinate format that FFmpeg's xstack filter consumes.

**Primary recommendation:** Build a pure `computeGridLayout()` function in `src/lib/` that returns `{ x, y, width, height }[]` tile positions, use native `<video>` elements with `object-fit: cover` (fill) / `object-fit: contain` (letterbox) for display modes, and implement a rVFC-based leader-follower sync loop with a two-threshold drift correction strategy (nudge playbackRate for <100ms drift, hard seek for >100ms drift).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Custom layout algorithm that computes tile positions for a given canvas size -- NOT CSS Grid auto-fit
- The preview grid must match the export grid exactly, so the same algorithm is reused by both the preview renderer and the FFmpeg xstack filtergraph (Phase 8)
- Algorithm should tightly pack tiles to minimize blank space for 2-8 cameras at various aspect ratios
- Zero gap between tiles -- tiles touch edge-to-edge, seamless mosaic
- Default mode: **fill** (crop to fill tiles, no black bars)
- Toggle available to switch to letterbox (preserve aspect ratio, show black bars)
- Grid updates immediately on toggle
- Keep the existing max-w-4xl single-column layout -- do not widen to full viewport
- SyncResults table stays in its current position (above the playback section)
- File input area (drop zone, file list, sync button) stays visible above everything -- matches v1.0 behavior
- The current "Audio Waveforms" section gets repurposed into a combined playback section: video grid above, waveform tracks below, within the same container
- Section will need a new name (no longer just "Audio Waveforms")
- Each tile shows a poster frame (first frame of the video) with a loading spinner overlay while the video element loads
- When the user scrubs on the waveform, the poster frame updates to show the frame at the scrubbed position -- even before full playback is ready
- Transport controls (play/pause) are disabled until ALL video elements report ready -- guarantees sync from first play
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

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| GRID-01 | User sees all synced videos in a dynamic grid that packs tiles to minimize blank space based on video count and aspect ratios | Pure `computeGridLayout()` function iterates column counts 1..N, picks configuration maximizing tile area within container bounds. Returns absolute `{ x, y, w, h }` positions. |
| GRID-02 | User can toggle between "preserve aspect ratio" (letterbox) and "fill tiles" (crop) display modes | CSS `object-fit: contain` for letterbox, `object-fit: cover` for fill. Toggle is a single boolean state that re-renders video elements with the appropriate style. Grid positions remain unchanged. |
| GRID-03 | Grid layout responds to container resize without requiring manual refresh | ResizeObserver on grid container (established pattern from WaveformPanel/WaveformTrack). Recompute `computeGridLayout()` on size change. |
| PLAY-01 | User can play/pause all synced videos simultaneously with a single transport control | Single play/pause button calls `.play()` / `.pause()` on all video refs. Play disabled until all videos report `canplay` readyState. |
| PLAY-02 | All videos maintain frame-level sync during playback via drift-corrected sync loop | Leader-follower pattern: leader video drives timing via rVFC callback. On each frame, check each follower's `currentTime` against leader's `mediaTime`. Small drift (<100ms): nudge `playbackRate` (1.02/0.98). Large drift (>100ms): hard seek `currentTime`. |
| PLAY-03 | User can seek to any point and all videos jump to the correct offset position | Set `currentTime` on all video elements simultaneously, accounting for each video's sync offset from `DownloadableResult.offsetSeconds`. |
| PLAY-04 | Waveform tracks remain interactive immediately after sync completes while video previews load in background | Waveform section renders immediately from existing `waveformPeaks` state (already computed during v1.0 pipeline). Video elements load asynchronously below. Transport play button stays disabled until all videos ready. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React 19 | ^19.2.0 | Already in project -- component framework for grid + transport UI | Project standard |
| Tailwind CSS v4 | ^4.2.1 | Already in project -- styling for grid container, transport bar, toggles | Project standard |
| Native `<video>` elements | Browser API | Video playback -- each tile is a native video element with blob URL src | Avoids canvas compositing (explicitly out of scope per REQUIREMENTS.md), uses browser hardware decoder |
| `requestVideoFrameCallback` | Browser API | Frame-accurate sync timing source | Baseline 2024: Chrome 83+, Edge 83+, Safari 15.4+, Firefox 132+. Fires at video frame rate, provides `mediaTime` for deterministic frame identification |
| `requestAnimationFrame` | Browser API | Fallback sync loop for browsers without rVFC | Universal support, fires at ~60Hz |
| `URL.createObjectURL()` | Browser API | Create blob URLs from `File` objects for video `src` | Already used pattern -- `DownloadableResult.originalFile` is a `File` object |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| ResizeObserver | Browser API | Responsive grid resize detection | Established pattern in WaveformPanel/WaveformTrack |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom layout algorithm | CSS Grid `auto-fit` | CSS Grid cannot produce exact pixel coordinates for FFmpeg xstack -- user explicitly chose custom algorithm |
| Native `<video>` elements | Canvas compositing | Browser compositor handles decode + render better; canvas fights it, degrades quality, explicitly out of scope |
| `requestVideoFrameCallback` | `timeupdate` events | `timeupdate` fires unpredictably every 15-250ms, not frame-accurate. rVFC fires per-frame with deterministic `mediaTime` |
| `requestVideoFrameCallback` | `requestAnimationFrame` only | rAF fires at display refresh rate (60Hz) not video frame rate. rVFC matches actual video frames and provides frame metadata |

**Installation:**
```bash
# No new dependencies needed -- all browser APIs + existing project packages
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── lib/
│   ├── gridLayout.ts          # Pure computeGridLayout() function + types
│   └── videoSync.ts           # Leader-follower sync loop engine
├── components/
│   ├── App.tsx                # Existing -- add playback state, wire up new section
│   ├── PlaybackSection.tsx    # New combined section: video grid + transport + waveforms
│   ├── VideoGrid.tsx          # Grid container: positions video tiles using layout output
│   ├── VideoTile.tsx          # Single video element with poster/spinner/object-fit
│   ├── TransportBar.tsx       # Play/pause, seek bar, timecode, display mode toggle
│   ├── WaveformPanel.tsx      # Existing -- moved inside PlaybackSection
│   ├── WaveformTrack.tsx      # Existing -- unchanged
│   └── WaveformCanvas.tsx     # Existing -- unchanged
└── types/
    └── index.ts               # Extend with GridTile, LayoutResult, PlaybackState types
```

### Pattern 1: Pure Grid Layout Function
**What:** A stateless function that takes container dimensions, tile count, and tile aspect ratio as inputs and returns absolute pixel positions for each tile. The same function is consumed by both the React preview renderer and the future FFmpeg xstack filtergraph generator (Phase 8).
**When to use:** Every time the container resizes or the tile count changes.
**Confidence:** HIGH -- based on verified Zoom gallery algorithm approach (brute-force column iteration) adapted for the zero-gap seamless mosaic constraint.

```typescript
// src/lib/gridLayout.ts

export interface GridTile {
  x: number;      // left position in pixels
  y: number;      // top position in pixels
  width: number;  // tile width in pixels
  height: number; // tile height in pixels
}

export interface LayoutResult {
  tiles: GridTile[];
  gridWidth: number;   // total grid width used
  gridHeight: number;  // total grid height used
  columns: number;     // column count chosen
  rows: number;        // row count chosen
}

/**
 * Compute optimal tile arrangement for N videos in a container.
 * Iterates all possible column counts (1..N) and picks the layout
 * that maximizes total tile area within the container bounds.
 *
 * Tile aspect ratio is assumed uniform (most common: 16:9).
 * For mixed aspect ratios, use the most common ratio or the median.
 */
export function computeGridLayout(
  containerWidth: number,
  containerHeight: number,
  tileCount: number,
  tileAspectRatio: number, // width / height, e.g. 16/9 = 1.778
): LayoutResult {
  let bestLayout: LayoutResult | null = null;
  let bestArea = 0;

  for (let cols = 1; cols <= tileCount; cols++) {
    const rows = Math.ceil(tileCount / cols);

    // Max tile size that fits within container
    const maxTileWidth = containerWidth / cols;
    const maxTileHeight = containerHeight / rows;

    // Constrain by aspect ratio
    let tileWidth: number;
    let tileHeight: number;

    if (maxTileWidth / maxTileHeight > tileAspectRatio) {
      // Height-constrained
      tileHeight = maxTileHeight;
      tileWidth = tileHeight * tileAspectRatio;
    } else {
      // Width-constrained
      tileWidth = maxTileWidth;
      tileHeight = tileWidth / tileAspectRatio;
    }

    const totalArea = tileWidth * tileHeight * tileCount;

    if (totalArea > bestArea) {
      bestArea = totalArea;

      // Compute positions
      const tiles: GridTile[] = [];
      // Center the grid within the container
      const gridWidth = tileWidth * cols;
      const gridHeight = tileHeight * rows;
      const offsetX = (containerWidth - gridWidth) / 2;
      const offsetY = (containerHeight - gridHeight) / 2;

      for (let i = 0; i < tileCount; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        tiles.push({
          x: Math.round(offsetX + col * tileWidth),
          y: Math.round(offsetY + row * tileHeight),
          width: Math.round(tileWidth),
          height: Math.round(tileHeight),
        });
      }

      bestLayout = { tiles, gridWidth, gridHeight, columns: cols, rows };
    }
  }

  return bestLayout!;
}
```

### Pattern 2: Leader-Follower Video Sync Loop
**What:** One video element is designated as the "leader." On each rVFC callback from the leader, read each follower's `currentTime` and compare against the leader's `mediaTime`. Apply drift correction: small drift uses playbackRate nudge, large drift uses hard seek.
**When to use:** During active playback. Pause the loop when paused. Re-arm on play.
**Confidence:** HIGH -- standard approach documented across Bocoup, noophq/html5-video-sync, and W3C frame-accurate sync discussions. The two-threshold strategy is the industry standard.

```typescript
// src/lib/videoSync.ts

const DRIFT_THRESHOLD_NUDGE = 0.05;  // 50ms -- nudge playbackRate
const DRIFT_THRESHOLD_SEEK = 0.1;    // 100ms -- hard seek correction
const PLAYBACK_RATE_FAST = 1.03;
const PLAYBACK_RATE_SLOW = 0.97;
const PLAYBACK_RATE_NORMAL = 1.0;

export interface SyncEngine {
  start: () => void;
  stop: () => void;
  seek: (time: number) => void;
  destroy: () => void;
}

/**
 * Creates a sync engine that keeps follower videos aligned with a leader.
 * Uses rVFC when available, falls back to rAF.
 */
export function createSyncEngine(
  leader: HTMLVideoElement,
  followers: HTMLVideoElement[],
  offsets: number[], // per-follower offset in seconds (from sync results)
  onFrame?: (time: number) => void, // callback for playhead updates
): SyncEngine {
  let active = false;
  let rafId = 0;

  const hasRVFC = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;

  function syncFollowers(leaderTime: number) {
    for (let i = 0; i < followers.length; i++) {
      const follower = followers[i];
      const expectedTime = leaderTime - offsets[i];
      const actualTime = follower.currentTime;
      const drift = actualTime - expectedTime;

      if (Math.abs(drift) > DRIFT_THRESHOLD_SEEK) {
        // Large drift: hard seek
        follower.currentTime = expectedTime;
        follower.playbackRate = PLAYBACK_RATE_NORMAL;
      } else if (Math.abs(drift) > DRIFT_THRESHOLD_NUDGE) {
        // Small drift: nudge rate
        follower.playbackRate = drift > 0
          ? PLAYBACK_RATE_SLOW
          : PLAYBACK_RATE_FAST;
      } else {
        // In sync
        follower.playbackRate = PLAYBACK_RATE_NORMAL;
      }
    }
  }

  function onVideoFrame(_now: DOMHighResTimeStamp, metadata: VideoFrameCallbackMetadata) {
    if (!active) return;
    const leaderTime = metadata.mediaTime;
    syncFollowers(leaderTime);
    onFrame?.(leaderTime);
    leader.requestVideoFrameCallback(onVideoFrame);
  }

  function onAnimationFrame() {
    if (!active) return;
    const leaderTime = leader.currentTime;
    syncFollowers(leaderTime);
    onFrame?.(leaderTime);
    rafId = requestAnimationFrame(onAnimationFrame);
  }

  return {
    start() {
      active = true;
      if (hasRVFC) {
        leader.requestVideoFrameCallback(onVideoFrame);
      } else {
        rafId = requestAnimationFrame(onAnimationFrame);
      }
    },
    stop() {
      active = false;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      // Reset all playback rates
      for (const f of followers) {
        f.playbackRate = PLAYBACK_RATE_NORMAL;
      }
    },
    seek(time: number) {
      leader.currentTime = time;
      for (let i = 0; i < followers.length; i++) {
        followers[i].currentTime = time - offsets[i];
        followers[i].playbackRate = PLAYBACK_RATE_NORMAL;
      }
    },
    destroy() {
      this.stop();
    },
  };
}
```

### Pattern 3: Poster Frame Extraction via Canvas
**What:** Extract a video frame by seeking a hidden video element to the desired time, waiting for `seeked` event, then drawing to an offscreen canvas and converting to blob URL.
**When to use:** Initial poster frame (seek to 0), and on waveform scrub (seek to scrub time).
**Confidence:** HIGH -- well-documented browser API pattern. Same-origin blob URLs avoid CORS canvas tainting.

```typescript
/**
 * Extract a frame from a video file at a given time as a blob URL.
 */
async function extractPosterFrame(
  file: File,
  timeSeconds: number = 0,
): Promise<string> {
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.muted = true;
  const url = URL.createObjectURL(file);
  video.src = url;

  await new Promise<void>((resolve) => {
    video.addEventListener('loadedmetadata', () => resolve(), { once: true });
  });

  video.currentTime = Math.max(0.001, timeSeconds); // avoid black frame at 0

  await new Promise<void>((resolve) => {
    video.addEventListener('seeked', () => resolve(), { once: true });
  });

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(video, 0, 0);

  const blob = await new Promise<Blob>((resolve) => {
    canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.85);
  });

  URL.revokeObjectURL(url); // clean up video blob URL
  return URL.createObjectURL(blob); // return poster blob URL
  // caller must revoke this URL when done
}
```

### Pattern 4: Video Ready State Tracking
**What:** Track readiness of all video elements using `canplay` events. Transport controls remain disabled until all videos report ready.
**When to use:** Between sync completion and first user play action.
**Confidence:** HIGH -- standard HTMLMediaElement event.

```typescript
// Track readiness of N video elements
function useAllVideosReady(videoRefs: React.RefObject<HTMLVideoElement>[]) {
  const [readyCount, setReadyCount] = useState(0);
  const allReady = readyCount >= videoRefs.length;

  useEffect(() => {
    let count = 0;
    const handlers: (() => void)[] = [];

    for (const ref of videoRefs) {
      const video = ref.current;
      if (!video) continue;

      if (video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
        count++;
      } else {
        const handler = () => {
          count++;
          setReadyCount(count);
        };
        video.addEventListener('canplay', handler, { once: true });
        handlers.push(() => video.removeEventListener('canplay', handler));
      }
    }
    setReadyCount(count);

    return () => handlers.forEach(cleanup => cleanup());
  }, [videoRefs]);

  return allReady;
}
```

### Anti-Patterns to Avoid
- **Canvas compositing for playback:** Drawing video frames to a canvas on every rAF fights the browser's hardware-accelerated compositor. The browser already composites `<video>` elements efficiently. Canvas approach causes quality degradation and higher CPU usage. Explicitly excluded in REQUIREMENTS.md.
- **`timeupdate` event for sync:** Fires every 15-250ms (per spec), indeterminate timing. Not suitable for frame-level sync. Use rVFC or rAF instead.
- **CSS Grid `auto-fit` for tile layout:** Cannot extract pixel coordinates for FFmpeg xstack. The layout must be a pure function producing `{ x, y, w, h }` values.
- **Playing videos before all are ready:** If one video buffers while others play, sync is immediately lost. Wait for all `canplay` events before enabling transport controls.
- **Revoking blob URLs while video is using them:** `URL.revokeObjectURL()` on a video src while the video is still loaded causes playback to break. Only revoke on unmount.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Video display mode (fill/letterbox) | Custom canvas cropping/scaling | CSS `object-fit: cover` / `object-fit: contain` | Browser-native, GPU-accelerated, no quality loss, one CSS property |
| Responsive container resize detection | `window.resize` listener + debounce | `ResizeObserver` | Already used in project (WaveformPanel/WaveformTrack), handles container-level resize not just window |
| Poster image generation | Server-side thumbnail extraction | `<canvas>` drawImage + toBlob from video element | Runs client-side, same-origin blob URLs avoid CORS issues, existing File objects work directly |
| Video blob URLs | Base64 data URLs | `URL.createObjectURL(file)` | Data URLs duplicate file in memory as base64 (33% larger), blob URLs are zero-copy references |

**Key insight:** The browser's native video element handles hardware decoding, compositing, and display mode (object-fit) better than any JavaScript solution. The custom work in this phase is limited to: layout computation, sync coordination, and UI chrome (transport controls, poster frames).

## Common Pitfalls

### Pitfall 1: Blob URL Memory Leaks
**What goes wrong:** Creating blob URLs via `URL.createObjectURL()` without revoking them leaks memory. Each blob URL holds a reference to the underlying data.
**Why it happens:** Videos need blob URLs for their entire lifetime. Revoking too early breaks playback; never revoking leaks.
**How to avoid:** Revoke blob URLs in component cleanup (useEffect return). For poster frame blob URLs, revoke the old one when generating a new one. Track all created URLs in a Set for cleanup.
**Warning signs:** Memory usage grows with each sync run without decreasing.

### Pitfall 2: Stale Playback Rate After Sync Correction
**What goes wrong:** A follower video's `playbackRate` gets nudged to 1.03 for drift correction but never resets to 1.0, causing permanent speed mismatch.
**Why it happens:** The sync loop corrects drift but the "in sync" branch that resets rate is too narrow, or the loop stops running while rate is still adjusted.
**How to avoid:** Always reset all followers to `playbackRate = 1.0` when: (a) stopping the sync loop, (b) pausing playback, (c) seeking. The "in sync" branch in the drift correction should explicitly set `playbackRate = 1.0`.
**Warning signs:** Audio pitch changes during playback, videos gradually drift apart after pause/resume.

### Pitfall 3: Video Elements Not Ready After Seek
**What goes wrong:** After calling `video.currentTime = X` on all videos simultaneously, some videos seek faster than others, causing a visible flash of different frames.
**Why it happens:** Seek speed depends on keyframe distance. Stream-copy videos may have sparse keyframes (every 2-5 seconds).
**How to avoid:** After setting `currentTime` on all videos, wait for all `seeked` events before resuming playback. Show current poster frames during seek operation.
**Warning signs:** Visible frame jumps or mismatched frames briefly visible after seek.

### Pitfall 4: ResizeObserver Loop Limit
**What goes wrong:** ResizeObserver callback triggers layout change that triggers another resize, hitting the browser's loop limit and logging a console error.
**Why it happens:** Setting element dimensions inside a ResizeObserver callback can trigger another observation.
**How to avoid:** Never set the observed element's dimensions inside its ResizeObserver callback. Read container size, compute layout, set child sizes only (children are not observed). The project's existing WaveformPanel pattern does this correctly.
**Warning signs:** Console error: "ResizeObserver loop completed with undelivered notifications."

### Pitfall 5: Race Between Waveform Interaction and Video Loading
**What goes wrong:** User scrubs waveform while videos are still loading, causing seek commands to fail or queue up.
**Why it happens:** Waveforms are interactive immediately (PLAY-04), but video elements may not have loaded enough data to seek.
**How to avoid:** Separate poster frame extraction from playback video elements. Use a lightweight hidden video element for poster generation that only needs `loadedmetadata`. Queue seek commands and apply them once the video is ready.
**Warning signs:** Poster frame doesn't update on scrub, or app hangs while videos load.

### Pitfall 6: Sync Offset Confusion Between Trim and Playback
**What goes wrong:** Using the wrong offset value when seeking follower videos, causing incorrect sync alignment.
**Why it happens:** `DownloadableResult` has both `offsetSeconds` (original audio offset from correlation) and `trimSeconds` (amount trimmed from start). These are related but different. After trimming, all videos should start at approximately the same point, so playback offsets should be near-zero or based on the remaining sub-keyframe difference.
**How to avoid:** The playback offset for each video is `trimSeconds` (how much was cut from the original). Since the videos were trimmed to align, the original files (pre-trim) need `maxOffset - offsetSeconds` as their playback start offset. But if using trimmed files, offsets are near-zero. Clarify which file is used for playback (original vs trimmed) and compute offsets accordingly.
**Warning signs:** Videos are noticeably out of sync from the first frame.

## Code Examples

### Video Tile with Poster Frame and Loading State
```typescript
// Source: Browser API patterns, verified against MDN docs
interface VideoTileProps {
  file: File;
  posterUrl: string | null;
  displayMode: 'fill' | 'letterbox';
  style: React.CSSProperties; // absolute positioning from layout
  onReady: () => void;
  videoRef: React.RefObject<HTMLVideoElement>;
}

function VideoTile({ file, posterUrl, displayMode, style, onReady, videoRef }: VideoTileProps) {
  const [loading, setLoading] = useState(true);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    blobUrlRef.current = url;
    if (videoRef.current) {
      videoRef.current.src = url;
    }
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file, videoRef]);

  const handleCanPlay = () => {
    setLoading(false);
    onReady();
  };

  return (
    <div style={{ ...style, position: 'absolute', overflow: 'hidden' }}>
      <video
        ref={videoRef}
        preload="auto"
        muted // audio handled separately in Phase 6
        playsInline
        poster={posterUrl ?? undefined}
        onCanPlay={handleCanPlay}
        style={{
          width: '100%',
          height: '100%',
          objectFit: displayMode === 'fill' ? 'cover' : 'contain',
          backgroundColor: '#000',
        }}
      />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          {/* Spinner overlay */}
          <div className="w-8 h-8 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
```

### Transport Bar with Seek
```typescript
// Source: Standard HTMLMediaElement API patterns
interface TransportBarProps {
  isPlaying: boolean;
  allReady: boolean;
  currentTime: number;
  duration: number;
  displayMode: 'fill' | 'letterbox';
  onPlay: () => void;
  onPause: () => void;
  onSeek: (time: number) => void;
  onDisplayModeToggle: () => void;
}

function TransportBar({
  isPlaying, allReady, currentTime, duration,
  displayMode, onPlay, onPause, onSeek, onDisplayModeToggle,
}: TransportBarProps) {
  const formatTime = (t: number) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-gray-800 border-t border-gray-700">
      <button
        onClick={isPlaying ? onPause : onPlay}
        disabled={!allReady}
        className="..."
      >
        {isPlaying ? 'Pause' : 'Play'}
      </button>
      <span className="text-xs font-mono text-gray-400">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>
      {/* Seek bar */}
      <input
        type="range"
        min={0}
        max={duration}
        step={0.01}
        value={currentTime}
        onChange={(e) => onSeek(Number(e.target.value))}
        className="flex-1"
      />
      {/* Display mode toggle */}
      <button onClick={onDisplayModeToggle} className="...">
        {displayMode === 'fill' ? 'Letterbox' : 'Fill'}
      </button>
    </div>
  );
}
```

### FFmpeg xstack Layout String Generation (Preview of Phase 8 Reuse)
```typescript
// The same computeGridLayout() output can generate xstack filter strings
// This function will be used in Phase 8 but demonstrates why the layout
// must produce pixel coordinates, not CSS classes.
function toXstackLayout(tiles: GridTile[]): string {
  return tiles.map(t => `${t.x}_${t.y}`).join('|');
}
// Example for 2x2 at 1920x1080: "0_0|960_0|0_540|960_540"
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `timeupdate` event for sync | `requestVideoFrameCallback` | Chrome 83 (2020), Baseline 2024 (Oct 2024) | Frame-accurate timing, deterministic `mediaTime`, fires at video framerate not arbitrary intervals |
| `requestAnimationFrame` for video sync | `requestVideoFrameCallback` with rAF fallback | Baseline 2024 | rVFC matches actual video frames; rAF fires at display refresh rate which may not align with video frames |
| CSS `padding-bottom` aspect ratio hack | CSS `aspect-ratio` property | Baseline 2021 | Native aspect ratio support, cleaner markup |
| `object-fit` polyfills | Native `object-fit` | All modern browsers | No polyfill needed; cover/contain work on `<video>` elements natively |
| Manual ResizeObserver polyfill | Native `ResizeObserver` | Baseline 2020 | Already used in project |

**Deprecated/outdated:**
- `timeupdate` event for frame-level sync: fires every 15-250ms, indeterminate timing. Use rVFC instead.
- `Video.webkitDecodedFrameCount`: Non-standard, removed from most browsers. Use rVFC `presentedFrames` metadata instead.

## Open Questions

1. **Which file to use for playback: original or trimmed?**
   - What we know: `DownloadableResult` has `originalFile` (File object) and `trimmedData` (Uint8Array | null). The original files contain full untrimmed video. The trimmed files are aligned to start at the same point.
   - What's unclear: Using trimmed files means offsets are near-zero (ideal for sync), but trimmed files are Uint8Arrays that need conversion to Blobs for `createObjectURL`. Using original files avoids the conversion but requires applying `trimSeconds` as a start offset.
   - Recommendation: Use `originalFile` for playback (already a File, zero-copy blob URL). Apply each video's `trimSeconds` as the initial `currentTime` offset on seek operations. This avoids duplicating trimmed data in memory and keeps the File reference pattern consistent.

2. **Poster frame update latency during waveform scrub**
   - What we know: User wants poster frames to update as they scrub the waveform. This requires seeking a video element and extracting a canvas frame per scrub position.
   - What's unclear: How fast can a hidden video element seek + canvas draw? If the user scrubs quickly, seek requests may queue up and lag.
   - Recommendation: Throttle poster frame extraction to ~10fps (100ms intervals). Use a single shared hidden video element per tile with `preload="metadata"`. Discard stale seek requests (only process the latest). Consider debouncing with rAF gating (existing project pattern).

3. **Aspect ratio: uniform vs mixed**
   - What we know: The user specified 2-8 cameras. Most multi-cam shoots use cameras with the same aspect ratio (16:9). But phone cameras could introduce 9:16 or 4:3 footage.
   - What's unclear: Should the layout algorithm handle mixed aspect ratios? The user said "aspect ratios" (plural) but also said tiles should be identical sizes (uniform grid).
   - Recommendation: For this phase, assume uniform aspect ratio (use the first video's intrinsic ratio, or 16:9 as default). The `object-fit` property handles the actual display of differently-sized videos within uniform tiles. Note this as a known simplification.

## Sources

### Primary (HIGH confidence)
- [MDN: requestVideoFrameCallback](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback) - Full API documentation, callback metadata, timing notes
- [Can I Use: requestVideoFrameCallback](https://caniuse.com/mdn-api_htmlvideoelement_requestvideoframecallback) - Browser support: Chrome 83+, Edge 83+, Safari 15.4+, Firefox 132+, Baseline 2024
- [MDN: object-fit](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/object-fit) - CSS cover/contain for video display modes
- [MDN: HTMLMediaElement events](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/canplaythrough_event) - canplay, canplaythrough, loadeddata, loadedmetadata, seeked events
- [MDN: HTMLMediaElement.readyState](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/readyState) - HAVE_NOTHING through HAVE_ENOUGH_DATA states
- [WICG rVFC explainer](https://github.com/WICG/video-rvfc/blob/gh-pages/explainer.md) - Design rationale, mediaTime vs currentTime, compositor thread notes
- [web.dev: requestVideoFrameCallback](https://web.dev/articles/requestvideoframecallback-rvfc) - Use cases, timing accuracy, one-vsync-late detection
- [FFmpeg xstack docs](https://ayosec.github.io/ffmpeg-filters-docs/6.0/Filters/Video/xstack.html) - Layout format: `x_y` coordinates separated by `|`, dimension variables `w0`/`h0`

### Secondary (MEDIUM confidence)
- [Bocoup: Synchronizing Two Videos](https://www.bocoup.com/blog/html5-video-synchronizing-playback-of-two-videos) - rAF-based sync pattern, leader-follower concept. Verified against rVFC spec.
- [Zoom Gallery Algorithm](https://dev.to/antondosov/building-a-video-gallery-just-like-in-zoom-4mam) - Brute-force column iteration for tile sizing. Verified: math checks out for uniform-ratio grids.
- [noophq/html5-video-sync](https://github.com/noophq/html5-video-sync) - Leader-follower architecture: main video + synced videos. Confirms pattern is standard.
- [RectanglePacker](https://github.com/aslamhus/RectanglePacker) - Heuristic bin packing for same-ratio rectangles. Confirms iterative column search is standard approach.
- [Swesonga: Synchronizing 2 Videos (2025)](https://blog.swesonga.org/2025/01/25/synchronizing-2-html5-videos/) - Event-based sync (play/pause/seeked), currentTime-based alignment.

### Tertiary (LOW confidence)
- None -- all findings verified with at least two sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All browser APIs, verified via MDN and Can I Use. No third-party dependencies needed.
- Architecture: HIGH - Leader-follower sync is well-documented standard. Grid layout algorithm is straightforward brute-force. Both patterns verified across multiple sources.
- Pitfalls: HIGH - Blob URL lifecycle, playbackRate reset, seek race conditions are well-documented issues in browser video programming.

**Research date:** 2026-03-02
**Valid until:** 2026-04-02 (stable browser APIs, unlikely to change)
