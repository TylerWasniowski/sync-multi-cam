# Phase 3: Video Trimming and Output - Research

**Researched:** 2026-03-01
**Domain:** FFmpeg WASM video re-encoding, browser file download/zip, pipeline progress architecture
**Confidence:** HIGH

## Summary

Phase 3 extends the existing FFmpeg WASM pipeline to trim and re-encode videos based on sync offsets from Phase 2, then deliver them as individual downloads and an auto-zip. The core technical challenge is running FFmpeg re-encode commands in the browser's WASM sandbox with frame-precise seeking, managing memory for sequential video processing, and generating a ZIP file from the output blobs without a server.

The existing `extractAudio()` pattern in `audioExtractor.ts` establishes the exact write-exec-read-cleanup lifecycle needed for trimming. The trimming module will follow this identical shape but with different FFmpeg arguments (re-encode with `-ss` instead of audio extraction). For ZIP generation, `fflate` is the standard choice -- it is 8kB, supports store mode (level 0, no compression since videos are already compressed), and has a simple synchronous API via `zipSync`. The SyncProgress component needs refactoring from a sync-specific widget into a generic multi-stage pipeline progress component.

**Primary recommendation: Smart Rendering (partial re-encode).** For each file: (1) probe keyframe positions, (2) re-encode ONLY from the precise trim point to the first keyframe after it (~0.5-2s of video), (3) stream-copy from that keyframe to end of file, (4) concat the two segments seamlessly. This gives frame-precise alignment with near stream-copy speed. Use the established `getFFmpeg()` singleton, collect output as `Uint8Array`, then ZIP with `fflate.zipSync` at level 0 (store). Track progress via `ffmpeg.on('progress')` using the `time` field (not the broken `progress` field).

**Fallback:** If keyframe probing fails or smart rendering produces errors, fall back to full re-encode via `-ss` + `-accurate_seek` + `-c:v libx264 -crf 18 -preset fast -c:a aac`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Trimming auto-starts immediately after sync completes -- no separate "Export" button
- Full pipeline is one-click: user hits "Sync Videos" -> extraction -> correlation -> trimming -> downloads ready
- Progress is displayed throughout the entire pipeline including trimming
- Both per-file download buttons AND zip download available
- Zip auto-downloads when trimming completes (matches roadmap OUT-03)
- Per-file buttons appear in the results list for individual grabs
- Smart rendering (partial re-encode) for frame-precise cuts with near stream-copy speed
- Only re-encode the tiny segment from trim point to first keyframe (~0.5-2s)
- Stream-copy everything from that keyframe to end of file
- Concat the two segments seamlessly
- Fallback to full re-encode if smart rendering fails
- Re-architect SyncProgress into a generic pipeline progress component
- Same component used for extraction, correlation, and trimming stages (different params as needed)
- Not a bolt-on -- refactor the existing component to be stage-agnostic

### Claude's Discretion
- Output file naming convention (prefix/suffix/zip name)
- Reference file handling in zip (include as-is or exclude)
- Error handling strategy for individual file trim failures
- Re-encode codec/quality settings (should match source quality)
- Exact progress detail level (per-file counts vs percentage)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| OUT-01 | App trims videos to align start points using FFmpeg WASM (user chose RE-ENCODE over stream-copy) | FFmpeg `-ss` + `-accurate_seek` + libx264 re-encode pattern; sequential per-file processing via existing `getFFmpeg()` singleton |
| OUT-02 | App keeps full remaining footage per video after trim (no forced end cut) | Omit `-t`/`-to` flags -- FFmpeg processes to end of input when no duration specified |
| OUT-03 | UI presents individual synced videos in a list with offset info and per-file download buttons | Extend existing `SyncResults` component; use `URL.createObjectURL(new Blob([data]))` for download links |
| OUT-04 | App auto-downloads a zip of all synced/trimmed video files | `fflate.zipSync` with level 0 (store mode) -- 8kB library, no compression needed for video |
| OUT-05 | App shows multi-stage progress indicator during processing (loading, extracting, analyzing, trimming) | Refactor SyncProgress into generic PipelineProgress; add `trimming`/`zipping` stages to SyncStage type |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @ffmpeg/ffmpeg | ^0.12.15 | Video re-encoding via WASM | Already installed; singleton `getFFmpeg()` established; same exec/FS pattern as audio extraction |
| @ffmpeg/util | ^0.12.2 | `fetchFile()` helper for writing File objects to WASM FS | Already installed; used in `audioExtractor.ts` |
| fflate | ^0.8.2 | Client-side ZIP archive generation | 8kB, fastest pure-JS ZIP lib, supports store mode (level 0) for pre-compressed video data |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none) | - | Blob download via `URL.createObjectURL` + anchor click | Built-in browser API -- no library needed for file downloads |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| fflate | JSZip | JSZip is 40% slower and ~25kB larger; fflate is standard for performance-sensitive browser apps |
| fflate | client-zip | client-zip is streaming-first (2.6kB gzipped), but fflate's `zipSync` is simpler for in-memory video blobs and more widely adopted |
| libx264 CRF 18 | CRF 0 (lossless) | Lossless would balloon file sizes 10-50x; CRF 18 is visually indistinguishable from source |

**Installation:**
```bash
npm install fflate
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── lib/
│   ├── ffmpeg.ts              # Existing singleton (unchanged)
│   ├── audioExtractor.ts      # Existing (unchanged)
│   ├── audioSync.ts           # Existing (unchanged)
│   ├── videoTrimmer.ts        # NEW: trimVideo() -- same write/exec/read/cleanup shape as extractAudio()
│   ├── zipBuilder.ts          # NEW: buildZip() -- fflate zipSync wrapper
│   └── downloadHelper.ts      # NEW: triggerDownload() -- blob URL + anchor click utility
├── components/
│   ├── App.tsx                # Extended handleSync pipeline: extract -> correlate -> trim -> zip -> download
│   ├── PipelineProgress.tsx   # REFACTORED from SyncProgress -- generic stage-driven progress bar
│   ├── SyncResults.tsx        # Extended with per-file download buttons and trimmed file references
│   └── ...existing...
└── types/
    └── index.ts               # Extended: new PipelineStage type, TrimResult type
```

### Pattern 1: Smart Rendering — Partial Re-encode + Stream-Copy
**What:** For frame-precise trimming with near stream-copy speed: (1) probe keyframes, (2) re-encode only the segment from trim point to first keyframe, (3) stream-copy the rest, (4) concat.
**When to use:** Always as primary approach. Fall back to full re-encode if probing/concat fails.
**Example:**
```typescript
// Smart rendering approach per file:
// Step 1: Write input file to WASM FS
// Step 2: Probe to find first keyframe at or after trim point
//   ffmpeg -i input -c copy -f null - (parse log for keyframes)
//   OR use ffprobe-equivalent: ffmpeg -i input -select_streams v:0 -show_frames -of csv
//   In WASM, parse ffmpeg log output for keyframe timestamps
// Step 3: Re-encode ONLY from trim point to first keyframe
//   ffmpeg -ss {trimPoint} -accurate_seek -i input -t {keyframe - trimPoint} -c:v libx264 -crf 18 -preset fast -c:a aac -b:a 192k start_segment.mp4
// Step 4: Stream-copy from first keyframe to end
//   ffmpeg -ss {keyframe} -i input -c copy rest_segment.mp4
// Step 5: Concat the two segments
//   ffmpeg -f concat -safe 0 -i concat_list.txt -c copy output.mp4
// Step 6: Read output, clean up all intermediate files

// Fallback: If any step fails, full re-encode:
//   ffmpeg -ss {trimPoint} -accurate_seek -i input -c:v libx264 -crf 18 -preset fast -c:a aac -b:a 192k output.mp4
```

**Key detail:** The re-encoded start segment is typically only 0.5-2 seconds of video (one GOP). The rest is stream-copied at near-instant speed. Total processing time is dramatically less than full re-encode.

### Pattern 2: Blob Download via Anchor Click
**What:** Trigger browser file download from in-memory data using `URL.createObjectURL` and a temporary anchor element.
**When to use:** For both per-file downloads and auto-zip download.
**Example:**
```typescript
export function triggerDownload(data: Uint8Array, filename: string, mimeType: string): void {
  const blob = new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after a short delay to ensure download starts
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
```

### Pattern 3: Store-Mode ZIP with fflate
**What:** Bundle trimmed video blobs into a ZIP using `fflate.zipSync` with level 0 (no compression).
**When to use:** After all videos are trimmed, before auto-download.
**Example:**
```typescript
import { zipSync } from 'fflate';

export function buildZip(
  files: Array<{ name: string; data: Uint8Array }>
): Uint8Array {
  const zipData: Record<string, [Uint8Array, { level: 0 }]> = {};
  for (const file of files) {
    zipData[file.name] = [file.data, { level: 0 }];
  }
  return zipSync(zipData);
}
```

### Pattern 4: Generic Pipeline Progress Component
**What:** Refactor `SyncProgress` into a stage-agnostic `PipelineProgress` that renders any stage from a configurable stage list.
**When to use:** Replace the current `SyncProgress` everywhere.
**Example:**
```typescript
// Extended stage type
export type PipelineStage =
  | 'idle'
  | 'extracting'
  | 'correlating'
  | 'trimming'
  | 'zipping'
  | 'complete'
  | 'error';

export interface PipelineProgress {
  stage: PipelineStage;
  current: number;
  total: number;
  message: string;
}
```

### Anti-Patterns to Avoid
- **Parallel FFmpeg exec calls:** The FFmpeg WASM singleton cannot run concurrent `exec()` calls -- they will deadlock or corrupt the FS. Always sequential.
- **Storing all trimmed videos in WASM FS simultaneously:** Would exhaust WASM memory (2GB limit). Read output, delete from FS, then process next file.
- **Compressing video in ZIP:** Videos are already compressed (H.264/AAC); deflate adds CPU time with zero size reduction. Always use level 0 (store).
- **Using `progress` field from ffmpeg.on('progress'):** The `progress` field is broken in @ffmpeg/core 0.12.x (returns huge negative numbers). Use the `time` field instead.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ZIP archive creation | Custom ZIP writer | `fflate.zipSync` | ZIP format has CRC32, local/central headers, compression options -- dozens of edge cases |
| File download trigger | Manual blob handling everywhere | Shared `triggerDownload()` utility | URL lifecycle (create/revoke) is error-prone; centralize once |
| Video re-encoding | Raw WASM codec calls | FFmpeg `exec()` with standard args | FFmpeg handles container muxing, codec init, timestamp correction, audio sync |
| Progress percentage | Manual frame counting | `ffmpeg.on('progress')` `time` field / expected duration | FFmpeg already emits progress; just divide time by expected output duration |

**Key insight:** FFmpeg WASM abstracts all the video codec complexity. The trimming module should be a thin wrapper around `exec()` with the right arguments -- identical in shape to `extractAudio()`.

## Common Pitfalls

### Pitfall 1: WASM Memory Exhaustion on Multiple Large Files
**What goes wrong:** Writing multiple video files to WASM FS at once exhausts the 2GB memory limit, causing `Array buffer allocation` errors.
**Why it happens:** WASM FS (MEMFS) stores files in browser RAM. A 500MB video file uses ~500MB of WASM memory when written, plus the output takes additional space during encoding.
**How to avoid:** Process files strictly sequentially. Write one input, encode, read output to JS-side `Uint8Array`, delete both FS files, then proceed to next. The existing `audioExtractor.ts` pattern with try/finally cleanup is correct.
**Warning signs:** Crashes on 3rd or 4th video file; `RangeError` or out-of-memory errors.

### Pitfall 2: Broken `progress` Field in @ffmpeg/core 0.12.x
**What goes wrong:** The `progress` value from `ffmpeg.on('progress', ({progress, time}) => ...)` returns enormous negative numbers (e.g., -3406300) instead of 0-1.
**Why it happens:** Known bug in @ffmpeg/core 0.12.4+ (GitHub issue #600, still open as of June 2025).
**How to avoid:** Use the `time` field (microseconds of encoded output) divided by expected output duration. The `time` field works correctly.
**Warning signs:** Progress bar shows nonsensical percentages or NaN.

### Pitfall 3: `-ss` Position Affects Seek Accuracy and Speed
**What goes wrong:** Placing `-ss` after `-i` causes FFmpeg to decode from the beginning of the file to the seek point, making trimming extremely slow on large files.
**Why it happens:** `-ss` after `-i` is "output seeking" -- accurate but slow. `-ss` before `-i` is "input seeking" -- fast but can be imprecise with stream-copy.
**How to avoid:** Place `-ss` before `-i` AND use `-accurate_seek` flag. When re-encoding (our case), this gives both speed AND frame-precise accuracy because FFmpeg decodes a small window around the seek point and discards frames before the exact timestamp.
**Warning signs:** Trimming a 1-hour video takes minutes instead of seconds-per-minute-of-output.

### Pitfall 4: Reference File Doesn't Need Trimming
**What goes wrong:** Trimming the reference file at offset 0 wastes time re-encoding the entire file with no change.
**Why it happens:** The reference file has offsetSeconds=0, meaning no trim is needed.
**How to avoid:** Skip trimming for the reference file (offsetSeconds === 0 AND isReference). Include its original File blob directly in the results/zip, or re-encode it if the user expects consistent codec output.
**Warning signs:** Unnecessary processing time; reference file takes as long as all other files combined.

### Pitfall 5: Offset Direction -- Which Way to Trim
**What goes wrong:** Trimming by the wrong offset or in the wrong direction produces files that are more out-of-sync than before.
**Why it happens:** Confusion about what `offsetSeconds` means. A positive offset means the track starts LATER than the reference; a negative offset means it starts EARLIER. To align start points, you need to trim based on the earliest common point.
**How to avoid:** Calculate the maximum offset (latest start relative to reference). The reference file needs to be trimmed by (maxOffset - 0), and each other file by (maxOffset - itsOffset). This aligns all files to the latest-starting track's start point.
**Warning signs:** Synced files play back with the same offset as before; or files are trimmed to different lengths.

### Pitfall 6: Auto-Download Blocked by Browser Popup Blocker
**What goes wrong:** The auto-zip download is silently blocked because it wasn't triggered by a direct user interaction.
**Why it happens:** Browsers require file downloads to originate from a user gesture (click). If the download is triggered at the end of an async chain far removed from the original click, some browsers block it.
**How to avoid:** The entire pipeline starts from a user click on "Sync Videos". Modern browsers generally allow downloads from async chains originating from user gestures, but test across browsers. As a fallback, show a manual "Download ZIP" button alongside the auto-download attempt.
**Warning signs:** ZIP download works in Chrome but silently fails in Firefox/Safari.

## Code Examples

Verified patterns from official sources:

### Smart Rendering: Partial Re-encode + Stream-Copy Concat
```bash
# Step 1: Probe keyframes (parse FFmpeg log for keyframe timestamps)
# Step 2: Re-encode from trim point to first keyframe only
ffmpeg -ss 2.345 -accurate_seek -i input.mp4 -t 0.655 -c:v libx264 -crf 18 -preset fast -c:a aac -b:a 192k start.mp4
# Step 3: Stream-copy from first keyframe to end
ffmpeg -ss 3.0 -i input.mp4 -c copy rest.mp4
# Step 4: Concat seamlessly
echo "file 'start.mp4'" > list.txt && echo "file 'rest.mp4'" >> list.txt
ffmpeg -f concat -safe 0 -i list.txt -c copy output.mp4
```

### Fallback: Full Re-encode (Frame-Accurate)
```bash
# Source: https://shotstack.io/learn/use-ffmpeg-to-trim-video/
# Used when smart rendering fails (probing error, concat error, etc.)
ffmpeg -ss 2.345 -accurate_seek -i input.mp4 -c:v libx264 -crf 18 -preset fast -c:a aac -b:a 192k output.mp4
```

### FFmpeg WASM Progress Event (0.12.x)
```typescript
// Source: https://ffmpegwasm.netlify.app/docs/api/ffmpeg/classes/ffmpeg/
// WARNING: progress field is broken (issue #600), use time field
ffmpeg.on('progress', ({ progress, time }) => {
  // progress: BROKEN -- returns huge negative numbers
  // time: works -- microseconds of encoded output
  const secondsEncoded = time / 1_000_000;
  const ratio = Math.min(secondsEncoded / expectedDurationSeconds, 1);
  updateProgress(ratio);
});
```

### fflate ZIP Creation (Store Mode)
```typescript
// Source: https://github.com/101arrowz/fflate
import { zipSync } from 'fflate';

const zipData = zipSync({
  'video1_synced.mp4': [uint8Array1, { level: 0 }],
  'video2_synced.mp4': [uint8Array2, { level: 0 }],
}, { level: 0 });
```

### Browser File Download from Uint8Array
```typescript
// Source: https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL_static
const blob = new Blob([data], { type: 'video/mp4' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'synced_video.mp4';
document.body.appendChild(a);
a.click();
document.body.removeChild(a);
setTimeout(() => URL.revokeObjectURL(url), 1000);
```

### Offset Calculation for Aligned Trimming
```typescript
// Given SyncResult[] from Phase 2:
// reference: offsetSeconds = 0
// track A:   offsetSeconds = +2.5 (starts 2.5s after reference)
// track B:   offsetSeconds = -1.0 (starts 1.0s before reference)
//
// To align all to common start point:
// maxOffset = max of all offsets = 2.5 (latest start)
// reference trim: 2.5 - 0   = 2.5s (trim 2.5s from start)
// track A trim:   2.5 - 2.5 = 0.0s (no trim needed -- it's the latest)
// track B trim:   2.5 - (-1.0) = 3.5s (trim 3.5s from start)

const maxOffset = Math.max(...results.map(r => r.offsetSeconds));
const trimAmounts = results.map(r => ({
  ...r,
  trimSeconds: maxOffset - r.offsetSeconds,
}));
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| JSZip for browser ZIP | fflate (8kB, 3x faster) | 2021+ | Smaller bundle, faster ZIP creation |
| ffmpeg.wasm 0.11 `createFFmpeg()` | 0.12 class-based `new FFmpeg()` | 2023 | Already using 0.12 API in project |
| Stream-copy trimming (`-c copy`) | Smart rendering (partial re-encode + stream-copy concat) | User decision | Frame-precise at trim point with near stream-copy speed for bulk of file |
| `progress` field in on('progress') | `time` field (progress is broken) | 0.12.4+ | Must use time/duration for progress ratio |

**Deprecated/outdated:**
- `createFFmpeg()` function: Replaced by `new FFmpeg()` class in 0.12.x (project already uses new API)
- `progress` callback field: Broken in 0.12.4+; use `time` field divided by expected duration instead

## Open Questions

1. **Reference file handling in ZIP**
   - What we know: Reference file has offset 0 but may still need trimming if other files start later (see offset calculation)
   - What's unclear: Should re-encoded reference be included even when trim is 0? (Re-encoding adds processing time but ensures consistent codec)
   - Recommendation: Include reference as-is (skip re-encode when trim is 0s). User gets faster results and original quality. Flag this as Claude's discretion.

2. **Memory pressure with many large files**
   - What we know: WASM FS limit is ~2GB; files are processed sequentially with cleanup. But trimmed video Uint8Arrays accumulate in JS heap.
   - What's unclear: At what point do accumulated JS-side Uint8Arrays cause issues? 10 x 200MB files = 2GB in JS heap.
   - Recommendation: For v1, accept the limitation. Most multi-cam setups are 2-8 files. Document as known constraint. Could stream to IndexedDB in future.

3. **Codec availability in @ffmpeg/core 0.12.10**
   - What we know: libx264 and aac are standard in ffmpeg.wasm builds. The project uses core version 0.12.10.
   - What's unclear: Cannot verify the exact codec list without runtime check; build configurations can vary.
   - Recommendation: Add a runtime fallback: if libx264 fails, try encoding without specifying codec (FFmpeg will use default). Log codec availability on first trim.

## Sources

### Primary (HIGH confidence)
- [ffmpeg.wasm official API docs](https://ffmpegwasm.netlify.app/docs/api/ffmpeg/classes/ffmpeg/) - exec(), on('progress'), writeFile/readFile/deleteFile signatures
- [ffmpeg.wasm usage guide](https://ffmpegwasm.netlify.app/docs/getting-started/usage/) - Progress event format, transcoding examples
- [fflate GitHub README](https://github.com/101arrowz/fflate) - zipSync API, level 0 store mode, version 0.8.2
- [MDN URL.createObjectURL](https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL_static) - Blob download pattern
- Project codebase: `src/lib/audioExtractor.ts` - Established FFmpeg write/exec/read/cleanup pattern

### Secondary (MEDIUM confidence)
- [Shotstack FFmpeg trim guide](https://shotstack.io/learn/use-ffmpeg-to-trim-video/) - `-ss` positioning, `-accurate_seek`, re-encode commands
- [FFmpeg WASM encoding progress blog](https://www.japj.net/2025/04/21/ffmpeg-wasm-encoding-progress/) - Progress tracking via log parsing, TTY workaround
- [ffmpeg.wasm issue #600](https://github.com/ffmpegwasm/ffmpeg.wasm/issues/600) - Broken progress field, time field workaround
- [ffmpeg.wasm discussion #755](https://github.com/ffmpegwasm/ffmpeg.wasm/discussions/755) - 2GB WASM memory limit, MEMFS constraints

### Tertiary (LOW confidence)
- [ffmpeg.wasm issue #61](https://github.com/ffmpegwasm/ffmpeg.wasm/issues/61) - Available codec list (libx264, aac mentioned but not verified for 0.12.10 specifically)
- [CRF Guide](https://slhck.info/video/2017/02/24/crf-guide.html) - CRF 18 as "visually lossless" recommendation (well-established but from 2017)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - fflate is the clear choice for browser ZIP; FFmpeg WASM API is already established in the project
- Architecture: HIGH - Trimming follows the identical pattern as audio extraction; offset calculation is straightforward math
- Pitfalls: HIGH - Memory limits, broken progress field, and offset direction are well-documented issues with multiple sources
- Code examples: MEDIUM - FFmpeg trim commands are standard but codec availability in WASM 0.12.10 needs runtime validation

**Research date:** 2026-03-01
**Valid until:** 2026-03-31 (stable domain; ffmpeg.wasm updates may affect progress API)
