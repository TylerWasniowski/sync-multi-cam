# Architecture Research

**Domain:** Synced video grid playback and GPU-accelerated composite export — v2.0 integration
**Researched:** 2026-03-02
**Confidence:** HIGH (playback patterns), MEDIUM (export approach — two viable paths with different tradeoffs)

---

## How v2.0 Integrates With the Existing System

The v1.0 pipeline ends at `stage === 'complete'` with `DownloadableResult[]` in React state and
`waveformPeaks: Map<string, MultiResolutionPeaks>` available. v2.0 consumes these as inputs — it
does not change the sync pipeline. Everything new is additive, appearing after pipeline completion.

### What v2.0 Receives From v1.0

```typescript
// Already in App.tsx state after pipeline completes:
syncResults: DownloadableResult[]    // per-file: trimmedData, trimSeconds, originalFile, offsetSeconds
waveformPeaks: Map<string, MultiResolutionPeaks>  // pre-computed 3-LOD waveform data

// DownloadableResult shape (existing type):
interface DownloadableResult extends SyncResult {
  trimmedData: Uint8Array | null;   // null = reference file (no trim needed)
  trimSeconds: number;              // how much was trimmed from front
  originalFile: File;              // original File reference
  fileId: string;
  offsetSeconds: number;           // audio correlation offset
}
```

### What v2.0 Needs to Derive

Each video needs a playable URL. Two sources:

- `trimmedData !== null` → `URL.createObjectURL(new Blob([trimmedData], { type: 'video/mp4' }))`
- `trimmedData === null` (reference file) → `URL.createObjectURL(originalFile)` (reference file, no trim needed)

Object URLs are created once when results arrive, stored in a `Map<string, string>` (fileId → objectURL),
and revoked on component unmount or re-sync.

**Playback alignment:** All trimmed videos share the same logical start point (t=0 = aligned start).
Playback just means `video.currentTime = playhead`, `video.play()` / `video.pause()` — no additional
offset math needed. The sync pipeline already did the work.

---

## System Overview — v2.0 Full Architecture

```
+-----------------------------------------------------------------------+
|                      UI Layer (React 19)                              |
|                                                                       |
|  +------------------+  +-------------------+  +------------------+   |
|  | FileDropZone     |  | SyncButton        |  | PipelineProgress |   |
|  | FileList         |  | FFmpegStatus      |  | SyncResults      |   |
|  +------------------+  +-------------------+  +------------------+   |
|           [EXISTING — unchanged]                                      |
|                                                                       |
|  +-----------------------------------------------------------------+  |
|  |  WaveformPanel (MODIFIED — adds playhead cursor + seek click)   |  |
|  |    WaveformTrack x N (MODIFIED — playhead line + seek)         |  |
|  |    WaveformCanvas x N (MODIFIED — playhead overlay render)     |  |
|  +-----------------------------------------------------------------+  |
|                                                                       |
|  +-----------------------------------------------------------------+  |
|  |  VideoGridPlayer (NEW)                                          |  |
|  |    GridLayout engine (packing algorithm)                        |  |
|  |    VideoTile x N (HTMLVideoElement per camera)                  |  |
|  |    PlaybackControls (play/pause/scrub/audio select)             |  |
|  +-----------------------------------------------------------------+  |
|                                                                       |
|  +-----------------------------------------------------------------+  |
|  |  ExportPanel (NEW)                                              |  |
|  |    Resolution picker (4K / 1080p / 720p)                       |  |
|  |    Export progress + download                                   |  |
|  +-----------------------------------------------------------------+  |
|                                                                       |
+-----------------------------------------------------------------------+
|                         State Layer                                   |
|                                                                       |
|  App.tsx (MODIFIED — adds playback state)                             |
|    playheadTime: number          // seconds, synchronized             |
|    isPlaying: boolean                                                  |
|    activeAudioTrack: string | 'all'  // fileId or 'all' for mix      |
|    objectURLs: Map<string, string>   // fileId -> blob URL (NEW)     |
|                                                                       |
+-----------------------------------------------------------------------+
|                       Processing Layer                                |
|                                                                       |
|  [EXISTING — unchanged]              [NEW]                            |
|  audioExtractor.ts                   exportCompositor.ts              |
|  audioSync.ts                        (FFmpeg WASM composite encode)   |
|  videoTrimmer.ts                                                       |
|  waveformPeaks.ts                                                      |
|  ffmpeg.ts (singleton)                                                 |
|                                                                       |
+-----------------------------------------------------------------------+
|                        Browser APIs                                   |
|                                                                       |
|  File API    Blob/ObjectURL    HTMLVideoElement    Web Audio API       |
|  Canvas 2D   requestAnimationFrame    FFmpeg WASM (existing)          |
|                                                                       |
+-----------------------------------------------------------------------+
```

---

## Component Inventory

### Existing Components — Unchanged

| Component | Status | Notes |
|-----------|--------|-------|
| `FileDropZone.tsx` | No change | Input phase, complete |
| `FileList.tsx` | No change | File list display |
| `FFmpegStatus.tsx` | No change | Loading indicator |
| `SyncButton.tsx` | No change | Trigger sync |
| `PipelineProgress.tsx` | No change | Progress display |
| `SyncResults.tsx` | No change | Per-file offsets and downloads |
| `PrivacyBanner.tsx` | No change | Static UI |

### Existing Components — Modified

| Component | Change | Reason |
|-----------|--------|--------|
| `WaveformPanel.tsx` | Add playhead cursor + seek-on-click | Waveform becomes the scrubbar |
| `WaveformTrack.tsx` | Pass playheadTime, emit seek events | Track-level playhead rendering |
| `WaveformCanvas.tsx` | Draw animated playhead line | Playhead needs to animate during playback |
| `App.tsx` | Add playback state, objectURLs Map | New state fields needed for player |
| `src/types/index.ts` | Add playback-related interfaces | Shared types for new components |

### New Components

| Component | File | Purpose |
|-----------|------|---------|
| `VideoGridPlayer` | `components/VideoGridPlayer.tsx` | Container: layout + ref management |
| `VideoTile` | `components/VideoTile.tsx` | Single `<video>` element with metadata |
| `PlaybackControls` | `components/PlaybackControls.tsx` | Play/pause/scrub/audio select bar |
| `ExportPanel` | `components/ExportPanel.tsx` | Resolution picker + export trigger |
| Grid packing logic | `lib/gridPacking.ts` | Aspect-ratio-aware layout algorithm |
| Export logic | `lib/exportCompositor.ts` | FFmpeg composite + encode to MP4 |

### New State in `App.tsx`

```typescript
// Added to existing App state:
const [playheadTime, setPlayheadTime] = useState(0);         // seconds
const [isPlaying, setIsPlaying] = useState(false);
const [activeAudioTrack, setActiveAudioTrack] = useState<string | 'all'>('all');
const [objectURLs, setObjectURLs] = useState<Map<string, string>>(new Map());

// Derived when syncResults populate:
// Create object URLs from trimmedData / originalFile
useEffect(() => {
  if (syncResults.length === 0) return;
  const urls = new Map<string, string>();
  for (const r of syncResults) {
    const blob = r.trimmedData
      ? new Blob([r.trimmedData], { type: 'video/mp4' })
      : r.originalFile;
    urls.set(r.fileId, URL.createObjectURL(blob));
  }
  setObjectURLs(urls);
  return () => { urls.forEach(url => URL.revokeObjectURL(url)); };
}, [syncResults]);
```

---

## New Lib Modules

### `lib/gridPacking.ts` — Aspect-Ratio-Aware Layout

**What it solves:** Given N video tiles with known aspect ratios and a container width/height, compute
x/y/width/height for each tile to fill the space with minimal wasted area and no overlaps.

**Algorithm recommendation:** Custom grid-row packing (not a generic bin packer).

The standard multi-camera viewer pattern is: arrange tiles in rows, pack videos into rows by aspect ratio,
equalize row heights. This is simpler than general bin packing and produces intuitive layouts.

```typescript
interface TileLayout {
  fileId: string;
  x: number;       // px from left
  y: number;       // px from top
  width: number;   // px
  height: number;  // px
}

interface GridPackingOptions {
  containerWidth: number;
  containerHeight: number;
  aspectRatios: Map<string, number>;  // fileId -> width/height ratio
  displayMode: 'preserve-ar' | 'fill-tiles';
}

export function computeGridLayout(opts: GridPackingOptions): TileLayout[];
```

**Two display modes:**
- `preserve-ar`: tiles sized to fit their AR, possible letterboxing within tile bounds
- `fill-tiles`: tiles fill their computed bounds with CSS `object-fit: cover` (crops edges)

**Implementation approach:** Try 1 to N rows, pick the row count that minimizes wasted space.
For each row count: partition tiles into rows, compute tile widths proportional to AR, scale
all rows to container height. O(N^2) at most, negligible for N ≤ 30.

**Aspect ratio source:** The `<video>` element's `videoWidth` / `videoHeight` after `loadedmetadata`
fires. Store in a Map as tiles mount.

### `lib/exportCompositor.ts` — FFmpeg WASM Composite Export

**What it solves:** Render all N synced video tiles into a single MP4 composite at target resolution.

**Approach: FFmpeg WASM with filtergraph**

Use the existing FFmpeg WASM singleton (already loaded) with the `xstack` or `hstack`/`vstack` filter
to composite all inputs, then encode to H.264 with `libx264`.

```typescript
export async function exportComposite(
  results: DownloadableResult[],
  layout: TileLayout[],
  options: {
    outputWidth: number;    // 3840 | 1920 | 1280
    outputHeight: number;   // 2160 | 1080 | 720
    crf: number;            // 23 default
  },
  onProgress?: (percent: number) => void
): Promise<Uint8Array>;
```

**FFmpeg filter approach:** Use `xstack` filter for arbitrary grid layout:

```bash
ffmpeg \
  -i cam1_synced.mp4 -i cam2_synced.mp4 -i cam3_synced.mp4 -i cam4_synced.mp4 \
  -filter_complex "
    [0:v]scale=960:540[v0];
    [1:v]scale=960:540[v1];
    [2:v]scale=960:540[v2];
    [3:v]scale=960:540[v3];
    [v0][v1][v2][v3]xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0[out]
  " \
  -map "[out]" -c:v libx264 -crf 23 -preset fast output.mp4
```

Layout coordinates for `xstack` are computed from the same `TileLayout` objects used for playback.

**Memory consideration:** This is the most memory-intensive v2.0 operation. All N video files are
written to FFmpeg MEMFS simultaneously. For 4 files at 200MB each = 800MB baseline. Recommend
sequentially writing input files to MEMFS during the export command build, and clearing them after.

**Audio handling:** For the composite export, use `-map 0:a` to include the reference track audio
(or a mix). Full multi-track mixing in FFmpeg adds complexity — for v2.0, include the audio from
the active audio track selection only.

---

## Architectural Patterns — v2.0 Specific

### Pattern 1: Playhead as Shared State, Not DOM Sync

**What:** Playback synchronization is maintained by a single `playheadTime` React state value in
`App.tsx`. VideoTile components receive `playheadTime` as a prop and set `video.currentTime` in a
`useEffect`. WaveformPanel receives `playheadTime` to render the cursor. There is no cross-element
DOM synchronization.

**When to use:** Always for this feature. Shared state is simpler and more reliable than event-based
multi-element DOM synchronization.

**Why not event-based sync:** The `timeupdate` event fires every 15-250ms (indeterminate). Syncing
multiple video elements by listening to each other's `timeupdate` events causes visible drift within
seconds. Shared React state with explicit `video.currentTime` assignment on each render is more
reliable.

**Drift correction:** Use `requestVideoFrameCallback` (or `requestAnimationFrame` as fallback) to
read `video.currentTime` from the "leader" video and correct `playheadTime` during playback. The
leader is the reference camera (or first loaded video).

```typescript
// In VideoGridPlayer or a dedicated usePlaybackSync hook:
function usePlaybackSync(leaderRef: RefObject<HTMLVideoElement>, isPlaying: boolean) {
  const rafRef = useRef(0);

  useEffect(() => {
    if (!isPlaying) return;
    const tick = () => {
      const leader = leaderRef.current;
      if (leader) {
        setPlayheadTime(leader.currentTime);  // reads actual played time
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying]);
}
```

**Trade-offs:** All follower videos may lag by one frame (~16ms at 60fps). For multi-cam viewing this
is imperceptible. True frame-accurate sync requires WebCodecs decoder, which adds significant
complexity and has Safari support gaps.

### Pattern 2: Video Tile as Controlled Component

**What:** `VideoTile` manages one `<video>` element and synchronizes it to the playhead imperatively
via `useEffect` / `useRef`. It does not self-play or manage its own time. All playback decisions
come from props.

```typescript
interface VideoTileProps {
  src: string;              // object URL from trimmed data
  playheadTime: number;     // controlled current time
  isPlaying: boolean;
  isMuted: boolean;         // true unless this is the active audio track
  layout: TileLayout;
  onAspectRatioReady: (fileId: string, ar: number) => void;
  onReady: (fileId: string) => void;  // fires when canplay is true
}

// Inside VideoTile:
const videoRef = useRef<HTMLVideoElement>(null);

// Seek when playhead jumps (user scrub):
useEffect(() => {
  const video = videoRef.current;
  if (!video || !video.readyState) return;
  if (Math.abs(video.currentTime - playheadTime) > 0.1) {
    video.currentTime = playheadTime;
  }
}, [playheadTime]);

// Play/pause:
useEffect(() => {
  const video = videoRef.current;
  if (!video) return;
  if (isPlaying) { video.play().catch(() => {}); }
  else { video.pause(); }
}, [isPlaying]);
```

**Why 0.1s threshold:** Continuously setting `currentTime` during `rAF`-driven playback would
interrupt browser's native playback. Only seek when the gap exceeds 100ms (scrub or resync).

### Pattern 3: WaveformPanel as Scrubbar

**What:** Extend the existing `ViewState` / `WaveformPanel` to emit a `onSeek` callback when the
user clicks the waveform. Add a `playheadTime` prop to render a playhead line overlay on
`WaveformCanvas`.

**Changes to existing components:**

`WaveformPanel` receives two new props:
```typescript
playheadTime: number;      // seconds — new, for rendering cursor
onSeek: (t: number) => void;  // new, for click-to-seek
```

`WaveformCanvas` receives `playheadTime` and draws a bright vertical line at the corresponding x position:
```typescript
// In WaveformCanvas draw loop:
const playheadX = ((playheadTime * sampleRate - scrollOffset) / samplesPerPixel);
ctx.strokeStyle = '#60a5fa';  // blue-400
ctx.lineWidth = 1.5;
ctx.beginPath();
ctx.moveTo(playheadX, 0);
ctx.lineTo(playheadX, height);
ctx.stroke();
```

Click-to-seek in `WaveformTrack` (existing pointer down handler extended):
```typescript
// If not dragging and is a click (pointerdown + pointerup without move):
const clickTime = (scrollOffset + offsetX * samplesPerPixel) / sampleRate;
onSeek(clickTime);
```

**Why this approach:** The waveform already has all the coordinate math for sample→pixel conversion.
Adding a playhead line is 10 lines of canvas code. No new abstractions needed.

### Pattern 4: Progressive Video Loading (Audio-First)

**What:** Waveforms become interactive immediately after audio extraction completes (existing v1.0
behavior). Video elements load in the background via object URLs created after trimming completes.
The grid player shows loading states while videos buffer.

**Implementation:**
- Object URLs are created in the `useEffect` triggered by `syncResults` populating
- `VideoTile` shows a loading overlay until `video.readyState >= 2` (HAVE_CURRENT_DATA)
- The "Play All" button is disabled until all tiles report `onReady`

**No change needed to the pipeline:** v1.0's pipeline already produces trimmed data before the grid
appears. The "progressive" aspect is that waveform scrubbing works before the grid is ready.

### Pattern 5: Export as FFmpeg Pipeline — Not WebCodecs

**What:** Use the existing FFmpeg WASM singleton to composite and encode the grid export. Write all
input video files to MEMFS, construct an `xstack` filtergraph matching the current grid layout,
encode to H.264 with `libx264 -preset fast`.

**Why FFmpeg over WebCodecs:**

| Factor | FFmpeg WASM | WebCodecs |
|--------|-------------|-----------|
| Browser support | Chrome, Firefox, Safari (via existing WASM) | VideoEncoder: Chrome/Edge/Firefox; Safari partial until v26+ |
| H.264 encoding | libx264 included in @ffmpeg/core-mt | Hardware-accelerated but needs MP4 muxer separately |
| Grid compositing | xstack/vstack/hstack built-in | Must implement manually with Canvas |
| Integration effort | Reuse existing singleton + add export fn | New decode loop + canvas compositor + VideoEncoder + Muxer |
| Output | Direct MP4 | Needs mediabunny or similar for MP4 wrapping |
| Memory | High (all inputs in MEMFS) | Similar (decode all inputs to VideoFrames) |
| Speed | 12-25x slower than native for encode | Hardware GPU acceleration possible |
| Verdict | **Recommended for v2.0** | Better long-term but higher complexity |

**WebCodecs is the better long-term approach** for GPU-accelerated encoding, but the integration
complexity (VideoDecoder per input → Canvas compositor → VideoEncoder → MP4 muxer) is significant.
Safari's VideoEncoder gaps add further risk. FFmpeg WASM's `xstack` filter handles compositing
trivially with the existing infrastructure. Revisit WebCodecs in v3.0 if export performance is
a complaint.

**Export memory management:**
```typescript
// Sequential: write one file at a time to MEMFS, not all at once
for (const result of results) {
  const data = result.trimmedData ?? new Uint8Array(await result.originalFile.arrayBuffer());
  await ffmpeg.writeFile(`input_${result.fileId}.mp4`, data);
}
// ... run xstack command ...
// Sequential cleanup after command:
for (const result of results) {
  await ffmpeg.deleteFile(`input_${result.fileId}.mp4`).catch(() => {});
}
await ffmpeg.deleteFile('composite_out.mp4').catch(() => {});
```

---

## Data Flow — v2.0

### Playback Data Flow

```
syncResults populated (pipeline complete)
    |
    v
[App.tsx useEffect]
    |-- Create object URLs from trimmedData / originalFile
    |-- Store in objectURLs: Map<fileId, string>
    |
    v
[VideoGridPlayer receives]
    |-- objectURLs Map
    |-- syncResults (for file order)
    |-- playheadTime, isPlaying, activeAudioTrack (from App state)
    |
    v
[VideoTile x N mounts]
    |-- src = objectURLs.get(fileId)
    |-- <video> loads via object URL (network-free, local blob)
    |-- onLoadedMetadata: reports videoWidth/videoHeight -> AR computation
    |-- onCanPlay: reports ready state
    |
    v
[GridPacking.computeGridLayout]
    |-- receives container dimensions + aspect ratios
    |-- returns TileLayout[] (x, y, width, height per tile)
    |
    v
[VideoTile positioned by TileLayout]
    |-- Absolute positioning within VideoGridPlayer container
    |-- CSS: position: absolute, left, top, width, height from layout
    |-- <video>: object-fit: contain (preserve-ar) or cover (fill)
```

### Playback Sync Loop

```
User clicks Play
    |
    v
[App: setIsPlaying(true)]
    |
    v
[VideoTile x N: video.play() called via useEffect]
    |
    v
[usePlaybackSync hook (rAF loop)]
    |-- reads leaderRef.current.currentTime each frame
    |-- setPlayheadTime(leader.currentTime)
    |
    v
[WaveformPanel: playheadTime prop updates]
    |-- WaveformCanvas re-renders with playhead line position
    |
    v
[VideoTile x N: playheadTime prop updates]
    |-- if |video.currentTime - playheadTime| > 0.1s: seek
    |-- (normally no seek needed during smooth playback)
```

### Seek Data Flow (Waveform Click)

```
User clicks waveform at position X
    |
    v
[WaveformTrack click handler]
    |-- converts X to time: (scrollOffset + X * SPP) / sampleRate
    |-- calls onSeek(time)
    |
    v
[WaveformPanel: onSeek prop -> App.tsx: setPlayheadTime(t)]
    |
    v
[VideoTile x N: playheadTime changes]
    |-- |video.currentTime - playheadTime| > 0.1: seek
    |-- video.currentTime = playheadTime  (immediate seek)
    |
    v
[usePlaybackSync: continues reading from leader after seek]
```

### Export Data Flow

```
User clicks Export (resolution selected)
    |
    v
[ExportPanel: calls exportComposite(results, layout, options)]
    |
    v
[exportCompositor.ts]
    |-- getFFmpeg() -- reuse existing singleton
    |-- Sequential: write all input videos to MEMFS
    |-- Build xstack filtergraph from layout (x,y,w,h -> xstack positions)
    |-- ffmpeg.exec([...xstack + libx264 command...])
    |-- onProgress via ffmpeg 'progress' event
    |-- readFile('composite_out.mp4') -> Uint8Array
    |-- Sequential: delete all MEMFS files
    |-- return Uint8Array
    |
    v
[ExportPanel: triggerDownload(data, 'composite.mp4', 'video/mp4')]
```

---

## Component Boundaries and Communication

| Boundary | Communication | Direction |
|----------|--------------|-----------|
| App ↔ VideoGridPlayer | Props (playheadTime, isPlaying, objectURLs, results) | Down |
| App ↔ WaveformPanel | Props (playheadTime) + callback (onSeek) | Both |
| VideoGridPlayer ↔ VideoTile | Props (src, playheadTime, isPlaying, isMuted, layout) | Down |
| VideoTile ↔ App | Callbacks (onReady, onAspectRatioReady) | Up |
| VideoGridPlayer → App | usePlaybackSync hook updates playheadTime | Up (via rAF) |
| PlaybackControls ↔ App | Callbacks (onPlay, onPause, onSeek, onAudioTrackChange) | Up |
| ExportPanel → exportCompositor.ts | Direct function call | — |
| exportCompositor.ts → FFmpeg singleton | getFFmpeg() — existing singleton | — |

---

## Recommended File Structure (v2.0 additions)

```
src/
├── components/
│   ├── App.tsx               (MODIFIED — new state fields)
│   ├── WaveformPanel.tsx     (MODIFIED — playheadTime + onSeek)
│   ├── WaveformTrack.tsx     (MODIFIED — onSeek emit, playheadTime pass-through)
│   ├── WaveformCanvas.tsx    (MODIFIED — playhead line render)
│   ├── VideoGridPlayer.tsx   (NEW — grid container + sync loop)
│   ├── VideoTile.tsx         (NEW — single controlled <video>)
│   ├── PlaybackControls.tsx  (NEW — play/pause/scrub/audio bar)
│   └── ExportPanel.tsx       (NEW — resolution + export trigger)
├── lib/
│   ├── gridPacking.ts        (NEW — layout algorithm)
│   ├── exportCompositor.ts   (NEW — FFmpeg xstack composite)
│   ├── [existing unchanged]
│   └── ...
└── types/
    └── index.ts              (MODIFIED — add PlaybackState, TileLayout)
```

### New Types in `src/types/index.ts`

```typescript
// Add to existing types:

export interface TileLayout {
  fileId: string;
  x: number;        // px
  y: number;        // px
  width: number;    // px
  height: number;   // px
}

export type DisplayMode = 'preserve-ar' | 'fill-tiles';

export type AudioTrackSelection = 'all' | string;  // 'all' or a fileId

export interface ExportOptions {
  width: number;      // 3840 | 1920 | 1280
  height: number;     // 2160 | 1080 | 720
  crf: number;        // H.264 quality (lower = better, 18-28 range)
}

export type ExportStage = 'idle' | 'compositing' | 'complete' | 'error';
```

---

## Build Order — v2.0 (Dependency Chain)

Dependencies flow strictly downward. Each stage is blocked on the one above it.

```
1. Object URL creation from trimmedData
   ↓ (object URLs must exist before video elements can load)

2. VideoTile — basic <video> element with src + loadedmetadata
   ↓ (aspect ratios needed before layout)

3. gridPacking.ts — layout algorithm
   ↓ (layout needed before VideoGridPlayer renders tiles)

4. VideoGridPlayer — positions VideoTiles using TileLayout
   ↓ (player must exist before playback controls are meaningful)

5. PlaybackControls — play/pause/audio select
   ↓ (basic playback must work before sync matters)

6. usePlaybackSync — rAF-based drift correction from leader
   ↓ (playback sync before waveform integration)

7. WaveformPanel modifications — playhead line + onSeek
   ↓ (waveform-as-scrubbar after playback works)

8. ExportPanel + exportCompositor.ts — FFmpeg composite export
   (independent of playback, can be built in parallel after step 3)
```

**Parallelizable after step 3:**
- Playback path (steps 4-7) and export path (step 8) are independent

**Critical path for "watch it work" moment:**
Steps 1→2→3→4→5 give a working grid viewer. Steps 6-7 add sync accuracy. Step 8 is export.

---

## Integration Points With Existing Code

### What Changes in `App.tsx`

1. Add `playheadTime`, `isPlaying`, `activeAudioTrack`, `objectURLs` state
2. Add `useEffect` to create/revoke object URLs when `syncResults` change
3. Pass `playheadTime` + `onSeek` to `WaveformPanel`
4. Render `<VideoGridPlayer>` and `<ExportPanel>` below `<WaveformPanel>` when `syncResults.length > 0`
5. Reset new state fields in the `handleSync` cleanup block

### What Changes in `WaveformPanel.tsx`

1. Accept `playheadTime: number` and `onSeek: (t: number) => void` props
2. Pass `playheadTime` down to each `WaveformTrack`
3. Handle click-on-panel (non-drag pointer up) → call `onSeek`

### What Changes in `WaveformCanvas.tsx`

1. Accept `playheadTime: number` prop
2. After drawing waveform, draw playhead line at computed x position
3. The canvas already re-renders on `viewState` changes; add `playheadTime` to deps

### What the Existing FFmpeg Singleton Provides

`exportCompositor.ts` calls `getFFmpeg()` (existing `src/lib/ffmpeg.ts`). The singleton is already
loaded by the time the pipeline completes. No new FFmpeg initialization needed. The export simply
runs additional `ffmpeg.exec()` calls on the existing instance.

**One constraint:** FFmpeg WASM is single-instance. Export cannot run while another pipeline run is
in progress. The UI must prevent triggering export during an active sync operation. Enforce with
the existing `isSyncing` flag from `syncProgress.stage`.

---

## Scaling Considerations

| N videos | Grid layout | Export memory | Export time (estimate) |
|----------|-------------|---------------|----------------------|
| 2 cameras | 1×2 or 2×1 (auto) | 400MB-1GB MEMFS | ~30-120s for 5min at 1080p |
| 4 cameras | 2×2 grid | 800MB-2GB MEMFS | ~60-240s for 5min at 1080p |
| 8 cameras | 2×4 or 3×3 | Approaching browser limits | Export may OOM |
| 30 cameras | Impractical for export | Would exceed limits | Prevent in UI |

**Recommendation:** Cap composite export at 8 cameras with a UI warning. Grid playback can support
up to the existing 30-file limit (each video element uses separate browser decode pipeline).

**Export resolution impact:** 4K output (`3840×2160`) is 4x the data of 1080p. For N=4 cameras,
the FFmpeg libx264 encode of a 4K composite will be slow (minutes per minute of footage in WASM).
Offer 1080p as default, 4K as "high quality" with a time warning.

---

## Anti-Patterns — v2.0

### Anti-Pattern 1: Syncing Videos via timeupdate Events

**What people do:** Listen to `video1.addEventListener('timeupdate', () => { video2.currentTime = video1.currentTime })`

**Why it's wrong:** `timeupdate` fires every 15-250ms (browser decides). Cross-setting currentTime
during playback interrupts the decoder and causes audio glitches. Drift accumulates quickly.

**Do this instead:** Use shared React state (`playheadTime`) updated by a single rAF loop reading
the leader video. Follower videos only seek when drift exceeds 100ms. During smooth play, they run
independently via `video.play()`.

### Anti-Pattern 2: Computing Layout on Every Render

**What people do:** Call the packing algorithm inside the render function or without memoization.

**Why it's wrong:** `playheadTime` updates at 60fps during playback. If layout is recomputed every
frame, all tiles re-position (causing flickers) and the packing function runs 60x/second unnecessarily.

**Do this instead:** Memoize layout on `[containerDimensions, aspectRatios, displayMode]`. Layout
only changes when the container resizes or display mode toggles. `useMemo` with stable dependencies.

### Anti-Pattern 3: Running Export With Input Files Still in DownloadableResult Memory

**What people do:** Export while `syncResults[i].trimmedData` (large Uint8Arrays) are still held
in React state.

**Why it's wrong:** `trimmedData` arrays for all files are in JS heap. Writing them to FFmpeg MEMFS
(for export) doubles the memory. With 4 × 200MB files: 800MB in state + 800MB in MEMFS = 1.6GB
minimum before encode output.

**Do this instead:** Either (a) write input files to MEMFS sequentially and release each reference,
or (b) re-read from `originalFile` for the reference camera. The object URLs created for playback
serve the `<video>` elements; the Uint8Arrays in `trimmedData` are only needed for export and can
potentially be cleared after object URLs are created. However, clearing them after URL creation is
a trade-off against future re-export capability — document this explicitly.

### Anti-Pattern 4: Creating New FFmpeg Instance for Export

**What people do:** `new FFmpeg()` and `ffmpeg.load()` again for the export operation.

**Why it's wrong:** FFmpeg WASM initialization downloads ~30MB of WASM and takes 2-5 seconds.
Creating a second instance doubles memory (two WASM heaps). The COOP/COEP environment only allows
one SharedArrayBuffer-backed worker anyway.

**Do this instead:** Call `getFFmpeg()` which returns the existing singleton. The export is just
another sequence of `writeFile` + `exec` + `readFile` calls on the already-loaded instance.

---

## Sources

- [MDN HTMLVideoElement.requestVideoFrameCallback](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback) — rAF-based sync pattern, timing metadata (HIGH confidence)
- [web.dev requestVideoFrameCallback article](https://web.dev/articles/requestvideoframecallback-rvfc) — canvas compositing patterns, limitations (HIGH confidence)
- [Bocoup: Synchronizing HTML5 Video](https://www.bocoup.com/blog/html5-video-synchronizing-playback-of-two-videos) — drift correction via rAF, timeupdate limitations (MEDIUM confidence)
- [MDN WebCodecs API](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API) — VideoEncoder capability and browser support (HIGH confidence)
- [caniuse: WebCodecs API](https://caniuse.com/webcodecs) — Safari VideoEncoder partial support until v26 (HIGH confidence)
- [FFmpeg xstack filter docs](https://ffmpeg.org/ffmpeg-filters.html) — xstack layout syntax (HIGH confidence)
- [FFmpeg WASM GitHub](https://github.com/ffmpegwasm/ffmpeg.wasm) — singleton pattern, MEMFS memory constraints (HIGH confidence)
- [Chrome DevTools: Video Processing with WebCodecs](https://developer.chrome.com/docs/web-platform/best-practices/webcodecs) — encode queue, frame handling patterns (HIGH confidence)
- [MDN AudioContext.createMediaElementSource](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/createMediaElementSource) — audio mixing from video elements (HIGH confidence)
- [canvas-record GitHub](https://github.com/dmnsgn/canvas-record) — WebCodecs-based canvas-to-video recording reference (MEDIUM confidence)
- [Vanilagy/mp4-muxer deprecated → Mediabunny](https://github.com/Vanilagy/mp4-muxer) — confirms mp4-muxer deprecated, Mediabunny is replacement (MEDIUM confidence)

---

*Architecture research for: v2.0 synced video grid playback and GPU-accelerated composite export*
*Researched: 2026-03-02*
