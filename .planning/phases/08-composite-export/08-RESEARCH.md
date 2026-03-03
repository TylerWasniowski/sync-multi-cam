# Phase 8: Composite Export - Research

**Researched:** 2026-03-03
**Domain:** FFmpeg WASM xstack compositing, H.264 encoding, browser-based video export
**Confidence:** HIGH

## Summary

Phase 8 composites all synced camera angles into a single downloadable MP4 using the existing FFmpeg WASM singleton. The core approach is straightforward: reuse `computeGridLayout()` (Phase 5) to generate tile coordinates, build an FFmpeg `filter_complex` string that scales each input video to its tile size and positions it via the `xstack` filter, encode with `libx264`, and trigger a browser download. The `@ffmpeg/ffmpeg` progress event provides `time` (microseconds) which, divided by the known total duration, yields frame-level progress.

The main technical challenges are: (1) generating the correct `xstack` layout string from `GridTile[]` coordinates (the coordinates are absolute pixels, which map directly to xstack's `x_y` position format), (2) managing FFmpeg WASM MEMFS memory with up to 8 input files written simultaneously, and (3) handling the audio track selection at export time (single track via `-map N:a` or all tracks mixed via the `amix` filter).

**Primary recommendation:** Build a pure `buildFiltergraph()` function (TDD, like `computeGridLayout`) that converts `GridTile[]` + resolution into the FFmpeg `-filter_complex` string, then wire it into an `exportComposite()` pipeline function that manages MEMFS I/O, progress reporting, and cleanup.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| EXP-01 | User can download a single MP4 (H.264) containing all camera angles composited in the grid layout | FFmpeg WASM xstack filter composites N inputs at arbitrary positions; libx264 encodes H.264; `computeGridLayout()` already outputs pixel coordinates compatible with xstack format |
| EXP-02 | User can select export resolution: 4K (default), 1080p, or 720p | Scale filter applied per-input before xstack; output canvas size set by resolution preset (3840x2160, 1920x1080, 1280x720); grid layout recomputed at target resolution |
| EXP-03 | Export shows frame-level progress indicator | `ffmpeg.on('progress', { progress, time })` fires during encoding; `time` is in microseconds; divide by total duration for 0-1 ratio; verified in existing `videoTrimmer.ts` pattern |
| EXP-04 | User can select which audio track(s) to include in the exported video | FFmpeg `-map N:a` selects a single input's audio; `amix` filter mixes multiple tracks; matches playback audio selection (per-track mute/unmute from Phase 6) |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @ffmpeg/ffmpeg | ^0.12.15 | FFmpeg WASM runtime for encoding | Already loaded as project singleton; handles xstack compositing + libx264 encoding in one exec call |
| @ffmpeg/util | ^0.12.2 | `fetchFile` utility for MEMFS I/O | Already used in audioExtractor.ts and videoTrimmer.ts; converts File/Blob/Uint8Array to MEMFS-compatible format |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| computeGridLayout (src/lib/gridLayout.ts) | existing | Generate tile positions at export resolution | Reuse for xstack layout generation -- same algorithm, different container size |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| FFmpeg WASM xstack | WebCodecs + Canvas | Better performance (GPU), but requires VideoDecoder per input + Canvas compositor + VideoEncoder + MP4 muxer (mediabunny). Safari support gaps. Explicitly deferred to v3+ (AEXP-03 in REQUIREMENTS.md) |
| FFmpeg WASM xstack | ffmpeg `grid` option | Simpler syntax (`xstack=grid=2x2`) but requires all inputs to be same size already. Cannot handle incomplete last rows (e.g., 3 videos in 2x2 grid). Layout string approach is more flexible |
| `amix` filter | Single track only | amix adds complexity and has volume normalization issues. For v2.0 the audio options are: one selected track OR all tracks mixed. Both are feasible |

**Installation:**
No new dependencies needed. All libraries already installed.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── lib/
│   ├── gridLayout.ts          # EXISTING -- reused for export resolution
│   ├── exportComposite.ts     # NEW -- FFmpeg xstack pipeline
│   └── ffmpeg.ts              # EXISTING -- getFFmpeg() singleton
├── components/
│   ├── ExportPanel.tsx         # NEW -- resolution picker + export button + progress
│   └── PlaybackSection.tsx     # MODIFIED -- add ExportPanel below transport bar
└── types/
    └── index.ts                # MODIFIED -- add ExportState type
```

### Pattern 1: Pure Filtergraph Builder (TDD)
**What:** A pure function that takes `GridTile[]`, output resolution, input count, and audio config, and returns the complete `-filter_complex` string and FFmpeg args array. No side effects, no FFmpeg instance needed.
**When to use:** Always. This is the most complex and error-prone part of the export -- it MUST be unit tested.
**Example:**
```typescript
// Source: FFmpeg xstack filter docs + existing gridLayout.ts
export interface ExportConfig {
  width: number;     // 3840 | 1920 | 1280
  height: number;    // 2160 | 1080 | 720
  fps: number;       // 30
  crf: number;       // 23
}

export interface AudioConfig {
  mode: 'single';
  trackIndex: number;
} | {
  mode: 'mix';
  trackIndices: number[];  // unmuted tracks
}

export function buildExportArgs(
  tiles: GridTile[],
  config: ExportConfig,
  inputCount: number,
  audioConfig: AudioConfig,
): string[] {
  // 1. Build -i args for each input
  const inputArgs: string[] = [];
  for (let i = 0; i < inputCount; i++) {
    inputArgs.push('-i', `input_${i}.mp4`);
  }

  // 2. Build filter_complex: scale each input to tile size, then xstack
  const scaleFilters: string[] = [];
  const xstackInputs: string[] = [];
  for (let i = 0; i < inputCount; i++) {
    const tile = tiles[i];
    // Force even dimensions (H.264 requirement)
    const w = tile.width % 2 === 0 ? tile.width : tile.width - 1;
    const h = tile.height % 2 === 0 ? tile.height : tile.height - 1;
    scaleFilters.push(
      `[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,` +
      `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:black,setsar=1[v${i}]`
    );
    xstackInputs.push(`[v${i}]`);
  }

  // 3. xstack layout string from tile positions
  const layoutParts = tiles.slice(0, inputCount).map(t => `${t.x}_${t.y}`);
  const xstackFilter = `${xstackInputs.join('')}xstack=inputs=${inputCount}:layout=${layoutParts.join('|')}:fill=black[vout]`;

  const filterComplex = [...scaleFilters, xstackFilter].join(';');

  // 4. Audio handling
  const audioArgs = buildAudioArgs(audioConfig, inputCount);

  // 5. Assemble full command
  return [
    ...inputArgs,
    '-filter_complex', filterComplex,
    '-map', '[vout]',
    ...audioArgs,
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', String(config.crf),
    '-r', String(config.fps),
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    'composite_output.mp4',
  ];
}
```

### Pattern 2: Sequential MEMFS I/O with Cleanup
**What:** Write input files to FFmpeg MEMFS one at a time, run the export command, read the output, then delete all files. Never leave orphaned files in MEMFS.
**When to use:** Always for the export pipeline.
**Example:**
```typescript
// Source: existing videoTrimmer.ts pattern
export async function exportComposite(
  results: DownloadableResult[],
  config: ExportConfig,
  audioConfig: AudioConfig,
  onProgress?: (ratio: number) => void,
): Promise<Uint8Array> {
  const ffmpeg = await getFFmpeg();
  const inputNames: string[] = [];

  try {
    // Write inputs sequentially to MEMFS
    for (let i = 0; i < results.length; i++) {
      const name = `input_${i}.mp4`;
      inputNames.push(name);
      const data = results[i].trimmedData
        ?? new Uint8Array(await results[i].originalFile.arrayBuffer());
      await ffmpeg.writeFile(name, data);
    }

    // Compute layout at export resolution
    const tiles = computeGridLayout(
      config.width, config.height,
      results.length, 16 / 9
    ).tiles;

    // Build and execute FFmpeg command
    const args = buildExportArgs(tiles, config, results.length, audioConfig);

    // Progress handler
    const totalDurationUs = /* compute from results */ 0;
    const progressHandler = ({ time }: { progress: number; time: number }) => {
      if (onProgress && time > 0 && totalDurationUs > 0) {
        onProgress(Math.min(time / totalDurationUs, 1));
      }
    };
    ffmpeg.on('progress', progressHandler);

    try {
      await ffmpeg.exec(args);
    } finally {
      ffmpeg.off('progress', progressHandler);
    }

    // Read output
    const output = await ffmpeg.readFile('composite_output.mp4');
    return output as Uint8Array;
  } finally {
    // Always clean up MEMFS
    for (const name of inputNames) {
      await ffmpeg.deleteFile(name).catch(() => {});
    }
    await ffmpeg.deleteFile('composite_output.mp4').catch(() => {});
  }
}
```

### Pattern 3: Export State Machine
**What:** The export UI follows a clear state machine: `idle` -> `preparing` (writing files to MEMFS) -> `encoding` (FFmpeg running, progress updates) -> `complete` (download ready) -> `idle`. Errors return to `idle` with an error message.
**When to use:** For the ExportPanel component state management.

### Anti-Patterns to Avoid
- **Writing all files to MEMFS at once without sequential cleanup:** FFmpeg WASM shares browser memory. 8 videos at 200MB each = 1.6GB. Write sequentially and never forget cleanup in the `finally` block.
- **Using `xstack=grid=NxM` shorthand for non-rectangular grids:** The `grid` option requires exactly N*M inputs with identical dimensions. It cannot handle incomplete last rows (e.g., 3 or 5 cameras). Use the `layout=` parameter instead.
- **Re-encoding with default pixel format:** Always specify `-pix_fmt yuv420p` for H.264 output. Without it, FFmpeg may output yuv444p which many players cannot decode.
- **Forgetting to make dimensions even for H.264:** libx264 requires even width and height. Round tile dimensions down to nearest even number.
- **Using `progress.progress` for progress bar:** The `progress` property of the FFmpeg progress event is unreliable (returns large negative numbers per GitHub issue #600). Use `time / totalDurationMicroseconds` instead.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Video compositing/tiling | Canvas-based frame-by-frame compositor | FFmpeg `xstack` filter | xstack handles pixel format conversion, scaling, positioning, and encoding in one pipeline -- a canvas approach requires VideoDecoder + Canvas + VideoEncoder + muxer |
| H.264 encoding | WebCodecs VideoEncoder | FFmpeg `libx264` via WASM | Universal browser support, no MP4 muxer needed, already loaded |
| MP4 container muxing | mediabunny or manual mux | FFmpeg built-in muxer | FFmpeg produces valid MP4 with faststart atoms automatically |
| Progress calculation | Custom frame counting | FFmpeg progress event `time` field | Already works, divide microseconds by total duration |
| Grid layout for export | Separate layout algorithm | Existing `computeGridLayout()` | Same algorithm, just called with export resolution instead of container size |

**Key insight:** The entire export pipeline is a single FFmpeg command. The complexity is in generating the correct `filter_complex` string, not in the encoding itself. Isolate the string generation as a pure, testable function.

## Common Pitfalls

### Pitfall 1: xstack Layout Coordinates Must Match Scale Output
**What goes wrong:** The xstack filter positions tiles at absolute pixel coordinates. If you scale input 0 to 960x540 but place it at position `0_0`, and scale input 1 to 960x540 but place it at position `960_0`, the total output width is 1920. But if the tile coordinates from `computeGridLayout()` use a different resolution than the scale targets, tiles will overlap or have gaps.
**Why it happens:** `computeGridLayout()` is called with the export resolution (e.g., 1920x1080) and returns tile positions. The scale filter must produce tiles at exactly those dimensions.
**How to avoid:** Use `tiles[i].width` and `tiles[i].height` as the scale target for input `i`. Use `tiles[i].x` and `tiles[i].y` as the xstack position.
**Warning signs:** Black bars between tiles, overlapping video, or output that is the wrong total size.

### Pitfall 2: H.264 Requires Even Dimensions
**What goes wrong:** `libx264` fails with "width/height not divisible by 2" if any tile dimension is odd.
**Why it happens:** `computeGridLayout()` uses `Math.round()` which can produce odd numbers for certain container/tile-count combinations.
**How to avoid:** In the filtergraph builder, round all tile widths and heights down to the nearest even number: `w & ~1`. Also ensure the total output canvas (sum of tiles) has even dimensions.
**Warning signs:** FFmpeg exec returns non-zero, error log shows "not divisible by 2".

### Pitfall 3: FFmpeg MEMFS Memory Exhaustion
**What goes wrong:** Writing 8 large video files (e.g., 200MB each = 1.6GB) to MEMFS can exceed the browser tab's memory limit (typically 2-4GB), causing the tab to crash.
**Why it happens:** FFmpeg WASM uses Emscripten's MEMFS which stores all file data in JavaScript ArrayBuffers within the browser tab's memory.
**How to avoid:** (1) Use trimmed video data when available (smaller than originals). (2) The project caps export at 8 cameras (REQUIREMENTS.md). (3) Warn users if total input size exceeds ~1GB. (4) Clean up MEMFS files immediately after export completes.
**Warning signs:** Tab becomes unresponsive, "Out of memory" errors, FFmpeg exec hangs.

### Pitfall 4: Progress Event Time is in Microseconds
**What goes wrong:** Progress bar shows incorrect values (either near-zero or overflowing).
**Why it happens:** The `time` field in FFmpeg WASM's progress callback is in microseconds (not seconds). Dividing by the wrong scale gives wrong results.
**How to avoid:** Convert total duration to microseconds (`duration * 1_000_000`) before dividing: `ratio = event.time / (totalDurationSeconds * 1_000_000)`. This matches the pattern already used in `videoTrimmer.ts` which divides by `1_000_000`.
**Warning signs:** Progress jumps to 100% immediately, or stays at 0%.

### Pitfall 5: Audio Track Mapping with filter_complex
**What goes wrong:** When using `-filter_complex`, FFmpeg's automatic stream selection is disabled. If you don't explicitly `-map` an audio stream, the output has no audio.
**Why it happens:** `-filter_complex` mode requires explicit `-map` for every output stream.
**How to avoid:** Always include `-map N:a` for single-track audio, or add an `amix` filter to the filtergraph for mixed audio and `-map [aout]`.
**Warning signs:** Output MP4 plays video but has no sound.

### Pitfall 6: Video Timing Offsets in Export
**What goes wrong:** Camera videos have different start times (offsets from the shared timeline). If fed directly to xstack without timing alignment, cameras appear out of sync in the export.
**Why it happens:** Each camera's `trimSeconds` may differ slightly due to keyframe snapping. The original files have different durations before the sync point.
**How to avoid:** Use the trimmed video data (`result.trimmedData`) rather than original files when available -- trimmed files are already aligned to a common start point. For original files, use `-ss` to seek to the correct start point. Alternatively, apply timing offsets in the filtergraph with `trim` and `setpts` filters.
**Warning signs:** Cameras visibly out of sync in exported video, one camera leads or lags.

## Code Examples

Verified patterns from official sources and existing codebase:

### Generating xstack Layout String from GridTile[]
```typescript
// Source: FFmpeg xstack docs + existing gridLayout.ts
// The xstack layout format is: x0_y0|x1_y1|x2_y2|...
// where positions are absolute pixel coordinates.

function toXstackLayout(tiles: GridTile[]): string {
  return tiles.map(t => `${t.x}_${t.y}`).join('|');
}

// Example for 4 cameras at 1920x1080:
// computeGridLayout(1920, 1080, 4, 16/9) returns 2x2 grid
// tiles = [{x:0,y:0,w:960,h:540}, {x:960,y:0,w:960,h:540},
//          {x:0,y:540,w:960,h:540}, {x:960,y:540,w:960,h:540}]
// xstack layout = "0_0|960_0|0_540|960_540"
```

### Building filter_complex with Scale + xstack
```typescript
// Source: FFmpeg filter docs, verified with xstack documentation
function buildFilterComplex(tiles: GridTile[], inputCount: number): string {
  const parts: string[] = [];

  // Scale each input to its tile size (even dimensions for H.264)
  for (let i = 0; i < inputCount; i++) {
    const w = tiles[i].width & ~1;  // round down to even
    const h = tiles[i].height & ~1;
    parts.push(
      `[${i}:v]scale=${w}:${h},setsar=1[v${i}]`
    );
  }

  // xstack composites all scaled inputs
  const inputs = Array.from({ length: inputCount }, (_, i) => `[v${i}]`).join('');
  const layout = tiles.slice(0, inputCount).map(t => `${t.x}_${t.y}`).join('|');
  parts.push(`${inputs}xstack=inputs=${inputCount}:layout=${layout}:fill=black[vout]`);

  return parts.join(';');
}
```

### Audio Args: Single Track vs Mix
```typescript
// Source: FFmpeg -map docs, amix filter docs
function buildAudioArgs(
  audioConfig: { mode: 'single'; trackIndex: number } | { mode: 'mix'; trackIndices: number[] },
  inputCount: number,
): { filterParts: string[]; mapArgs: string[] } {
  if (audioConfig.mode === 'single') {
    // Map audio from one specific input
    return {
      filterParts: [],
      mapArgs: ['-map', `${audioConfig.trackIndex}:a`],
    };
  }

  // Mix multiple audio tracks
  const indices = audioConfig.trackIndices;
  if (indices.length === 0) {
    // No audio -- export video only
    return { filterParts: [], mapArgs: ['-an'] };
  }
  if (indices.length === 1) {
    return {
      filterParts: [],
      mapArgs: ['-map', `${indices[0]}:a`],
    };
  }

  // amix filter for multiple tracks
  const amixInputs = indices.map(i => `[${i}:a]`).join('');
  const amixFilter = `${amixInputs}amix=inputs=${indices.length}:duration=longest:normalize=0[aout]`;
  return {
    filterParts: [amixFilter],
    mapArgs: ['-map', '[aout]'],
  };
}
```

### Progress Reporting (Existing Pattern)
```typescript
// Source: existing videoTrimmer.ts lines 40-44, GitHub issue #600
// The progress event's `time` field is in microseconds.
// The `progress` field is unreliable -- use time / totalDuration instead.

const totalDurationUs = totalDurationSeconds * 1_000_000;
const progressHandler = ({ time }: { progress: number; time: number }) => {
  if (time > 0 && totalDurationUs > 0) {
    const ratio = Math.min(time / totalDurationUs, 1);
    onProgress(ratio);  // 0.0 to 1.0
  }
};
ffmpeg.on('progress', progressHandler);
```

### Download Trigger
```typescript
// Source: existing downloadHelper.ts pattern
function triggerDownload(data: Uint8Array, filename: string): void {
  const blob = new Blob([data], { type: 'video/mp4' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

### Resolution Presets
```typescript
export const EXPORT_RESOLUTIONS = {
  '4K': { width: 3840, height: 2160, label: '4K (3840x2160)' },
  '1080p': { width: 1920, height: 1080, label: '1080p (1920x1080)' },
  '720p': { width: 1280, height: 720, label: '720p (1280x720)' },
} as const;

export type ResolutionKey = keyof typeof EXPORT_RESOLUTIONS;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `hstack`/`vstack` for 2-wide grids | `xstack` with arbitrary layout | FFmpeg 4.4+ (2021) | Supports any number of inputs at any position |
| `overlay` filter chain for compositing | `xstack` single filter | FFmpeg 4.1+ (2019) | Much simpler filtergraph, no chained overlay pyramid |
| WebCodecs for browser encoding | FFmpeg WASM for universal support | Ongoing (2024-2026) | WebCodecs faster but Safari gaps remain; FFmpeg WASM universally supported |

**Deprecated/outdated:**
- `hstack`/`vstack` for more than 2 inputs: Requires nested filter chains. Use `xstack` instead.
- `overlay` pyramid for grid compositing: Error-prone, hard to maintain. `xstack` does it in one filter.
- `progress.progress` field in @ffmpeg/ffmpeg 0.12: Buggy (negative values). Use `time / totalDuration` instead.

## Open Questions

1. **Aspect ratio for export: uniform 16:9 or mixed?**
   - What we know: The playback grid uses a single `tileAspectRatio` (typically 16:9) for all tiles. `computeGridLayout()` takes one aspect ratio parameter.
   - What's unclear: If a user imports 16:9 and 9:16 (phone) videos, the export tiles will crop or letterbox. The scale+pad filter handles this, but the visual result may surprise users.
   - Recommendation: Use 16:9 as the default export aspect ratio (matching the preview grid). The `scale` + `pad` filter combination already handles different input aspect ratios by letterboxing within the tile. Document this behavior.

2. **Audio strategy for "all mix" export**
   - What we know: STATE.md flags this as needing a decision: "reference track vs amix filter." The playback mixer (Phase 6) uses per-track mute/unmute via GainNodes.
   - What's unclear: Should "all mix" use `amix` (which normalizes volume) or should it just pass through all tracks without normalization?
   - Recommendation: Use `amix` with `normalize=0` (no automatic normalization). This matches the playback behavior where all tracks play at equal volume. For single-track export, use `-map N:a` directly. The UI should mirror the playback mute toggles to let users choose which tracks to include.

3. **Using trimmed data vs original files for export**
   - What we know: `DownloadableResult` has `trimmedData` (Uint8Array | null) and `originalFile` (File). Trimmed files are keyframe-aligned to a common start. Original files need offset-based seeking.
   - What's unclear: Trimmed files are already in memory as Uint8Arrays, but originals would need `arrayBuffer()` conversion. For export, trimmed files are ideal because they are already aligned.
   - Recommendation: Use `trimmedData` when available (pre-aligned). Fall back to `originalFile` with `-ss` offset for reference files where `trimmedData` is null. This avoids timing alignment complexity in the filtergraph.

## Sources

### Primary (HIGH confidence)
- [FFmpeg xstack filter docs](https://ayosec.github.io/ffmpeg-filters-docs/6.0/Filters/Video/xstack.html) - Layout string format (`x_y|x_y`), `inputs`, `fill`, `grid` options
- [FFmpeg amix filter docs](https://ayosec.github.io/ffmpeg-filters-docs/7.1/Filters/Audio/amix.html) - `inputs`, `duration`, `normalize`, `weights` options
- [FFmpeg.wasm API docs](https://ffmpegwasm.netlify.app/docs/api/ffmpeg/classes/ffmpeg/) - `exec()` returns Promise<number>, progress event with `{ progress, time }`
- [FFmpeg.wasm progress issue #600](https://github.com/ffmpegwasm/ffmpeg.wasm/issues/600) - `progress` field is buggy; `time` is microseconds; manual calculation recommended
- Existing codebase: `src/lib/videoTrimmer.ts` - Progress event handling pattern (time / 1_000_000)
- Existing codebase: `src/lib/gridLayout.ts` - `computeGridLayout()` returns `GridTile[]` with x, y, width, height
- Existing codebase: `src/lib/ffmpeg.ts` - `getFFmpeg()` singleton, already supports multi-thread
- Existing codebase: `src/lib/audioMixer.ts` - Per-track mute/unmute pattern (mirrors export audio selection)

### Secondary (MEDIUM confidence)
- [FFmpeg WASM encoding progress blog](https://www.japj.net/2025/04/21/ffmpeg-wasm-encoding-progress/) - TTY buffering gotcha (CR vs LF), time field parsing
- [FFmpeg WASM memory issues](https://github.com/ffmpegwasm/ffmpeg.wasm/issues/623) - 2GB practical limit for MEMFS, browser tab memory constraints
- [xstack tutorial (Jim B)](https://www.jimby.name/techbits/recent/xstack/) - Practical layout string generation for N inputs
- [OTTVerse xstack guide](https://ottverse.com/stack-videos-horizontally-vertically-grid-with-ffmpeg/) - Scale + xstack pattern for different input resolutions

### Tertiary (LOW confidence)
- None -- all findings verified with primary or secondary sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Using existing FFmpeg WASM singleton, no new dependencies, all patterns verified in existing codebase
- Architecture: HIGH - Export data flow documented in ARCHITECTURE.md, xstack layout format verified in FFmpeg docs, pure filtergraph builder is clearly testable
- Pitfalls: HIGH - Memory limits verified in GitHub issues, H.264 even-dimension requirement is well-documented, progress event quirks confirmed in issue #600

**Research date:** 2026-03-03
**Valid until:** 2026-04-03 (stable domain -- FFmpeg filter syntax does not change frequently)
