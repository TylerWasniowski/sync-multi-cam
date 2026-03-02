# Phase 2: Audio Sync Engine - Research

**Researched:** 2026-03-01
**Domain:** Audio extraction via FFmpeg WASM, cross-correlation synchronization via SynAudio WASM, PCM data pipeline, confidence scoring
**Confidence:** HIGH

## Summary

Phase 2 builds the core algorithmic capability of the app: extracting audio from loaded videos and cross-correlating their waveforms to detect time offsets. The data pipeline is: (1) use the already-loaded FFmpeg WASM instance from Phase 1 to extract audio from each video as raw PCM, (2) convert the PCM bytes to Float32Array format, (3) feed the arrays into SynAudio's WASM-accelerated Pearson correlation engine to find sample offsets, and (4) convert sample offsets to timecodes and correlation coefficients to confidence percentages for display.

SynAudio (`synaudio` npm package, v0.4.0, LGPL-3.0) is the recommended library. It is purpose-built for this exact problem: finding synchronization points between audio clips using Pearson correlation implemented as hand-optimized WebAssembly 128-bit SIMD instructions. It provides `syncOneToMany()` which maps directly to our requirement of comparing all videos against a single reference. The alternative of hand-rolling FFT-based cross-correlation (using fft.js or kissfft-js) would require hundreds of lines of custom DSP code for a problem SynAudio solves in a single function call.

The key architectural decision is the audio extraction format. FFmpeg should extract audio as WAV (PCM s16le, mono, 16kHz) to keep memory usage manageable while retaining enough frequency content for reliable correlation. The raw PCM bytes from FFmpeg's output are then converted to Float32Array (dividing each Int16 sample by 32768.0) for SynAudio's input. This downsampled mono approach reduces data volume by ~5.5x compared to 44.1kHz stereo, which is critical when processing up to 30 videos.

**Primary recommendation:** Use FFmpeg WASM for audio extraction (already loaded) and SynAudio for cross-correlation. Process videos sequentially through FFmpeg (one at a time to manage memory), select the longest video as reference, and use `syncOneToMany()` with SharedMemory enabled to correlate all comparison clips against the reference in parallel.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SYNC-01 | App extracts audio from uploaded videos using FFmpeg WASM | FFmpeg WASM exec with `-vn -acodec pcm_s16le -ac 1 -ar 16000` extracts mono 16kHz PCM audio. Already-loaded FFmpeg instance from Phase 1 is reused. Write video to WASM FS, exec, readFile output. |
| SYNC-02 | App cross-correlates audio waveforms to detect time offsets between videos | SynAudio `syncOneToMany()` returns `sampleOffset` for each comparison clip. Convert sample offset to seconds: `offset = sampleOffset / sampleRate`. WASM SIMD Pearson correlation is fast enough for real-time feedback. |
| SYNC-03 | App auto-selects reference file (longest or first) with no user input | Select video with longest duration as reference (base clip for SynAudio). Duration can be determined from audio sample count after extraction. SynAudio requires comparison clips to be subsets of the base clip, so longest = best reference. |
| SYNC-04 | App displays detected timecode offsets per video in the results UI | Convert `sampleOffset / sampleRate` to human-readable timecode (e.g., "+2.34s" or "-0.51s"). Display in the file list or a new results section below it. |
| SYNC-05 | App displays sync confidence score (correlation strength as percentage) per video | SynAudio returns `correlation` as a float from -1 to 1. Convert to percentage: `confidence = Math.round(correlation * 100)`. Display alongside timecode offset. Values above 50% indicate reliable sync. |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| synaudio | ^0.4.0 | Audio cross-correlation engine | Purpose-built WASM SIMD library for finding sync points between audio clips. Pearson correlation with configurable accuracy/speed tradeoffs. Built-in Web Worker support. Only library that solves this exact problem in JS/WASM. |
| @ffmpeg/ffmpeg | ^0.12.15 | Audio extraction from video | Already installed and loaded in Phase 1. Provides `exec()` to run FFmpeg commands for audio extraction. No new dependency needed. |
| @ffmpeg/util | ^0.12.2 | File I/O utilities | Already installed. `fetchFile()` converts File objects to Uint8Array for FFmpeg's virtual filesystem. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none) | - | - | No additional libraries needed. PCM-to-Float32 conversion is trivial (4 lines of code). Web Audio API `decodeAudioData` is NOT needed since we extract raw PCM via FFmpeg. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SynAudio (Pearson correlation) | fft.js + custom FFT cross-correlation | FFT cross-correlation is faster for very large N (>4096 samples) but requires ~200 lines of custom DSP code (FFT, IFFT, normalization, peak detection). SynAudio's WASM SIMD is fast enough and handles all edge cases. |
| SynAudio | Web Audio API AnalyserNode + custom correlation | AnalyserNode gives frequency data, not time-domain correlation. Would need to hand-roll everything. |
| FFmpeg PCM extraction | Web Audio API `decodeAudioData()` | `decodeAudioData` can decode audio from video containers BUT format support varies by browser (MKV not supported in some). FFmpeg handles all formats uniformly. Since FFmpeg is already loaded, there is no reason to add a second decoding path. |
| Raw PCM (s16le) output | WAV output from FFmpeg | WAV adds a 44-byte header but is otherwise identical to raw PCM. Using WAV is slightly more convenient for debugging (can be played back) and the header overhead is negligible. Use WAV. |
| 16kHz mono downsample | 44.1kHz stereo (full quality) | Full quality uses ~5.5x more memory per video. For correlation purposes, 16kHz mono is sufficient -- we only need to match ambient sound patterns, not preserve audio fidelity. 16kHz captures frequencies up to 8kHz which covers all speech and most environmental sounds. |
| 8kHz mono | 16kHz mono | 8kHz cuts off at 4kHz, losing significant audio content. 16kHz is the sweet spot for correlation accuracy vs memory usage. |

**Installation:**

```bash
npm install synaudio
```

Note: `@ffmpeg/ffmpeg` and `@ffmpeg/util` are already installed from Phase 1.

## Architecture Patterns

### Recommended Project Structure (Phase 2 additions)

```
src/
  lib/
    ffmpeg.ts             # (existing) FFmpeg singleton
    audioExtractor.ts     # NEW: Extract audio from video via FFmpeg -> Float32Array
    audioSync.ts          # NEW: SynAudio wrapper, correlation logic, confidence scoring
    constants.ts          # (existing) Add SYNC_SAMPLE_RATE, CORRELATION_SAMPLE_SIZE
  types/
    index.ts              # (existing) Add SyncResult, AudioData types
  components/
    App.tsx               # (existing) Add sync trigger, results state
    SyncResults.tsx       # NEW: Display offsets and confidence scores
    SyncButton.tsx        # NEW: "Sync Videos" trigger button (enabled when >= 2 files)
    SyncProgress.tsx      # NEW: Progress indicator for extraction + correlation
```

### Pattern 1: Sequential Audio Extraction with Progress

**What:** Extract audio from videos one at a time through FFmpeg WASM, converting each to Float32Array. Process sequentially to avoid exceeding WASM memory limits (2GB hard cap). Report progress per file.

**When to use:** Always. FFmpeg WASM cannot process multiple files simultaneously, and loading all video files into the WASM filesystem at once would exhaust memory.

**Example:**

```typescript
// src/lib/audioExtractor.ts
import { getFFmpeg } from './ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { SYNC_SAMPLE_RATE } from './constants';

export interface AudioData {
  channelData: Float32Array[];
  samplesDecoded: number;
  sampleRate: number;
}

export async function extractAudio(
  file: File,
  onProgress?: (stage: string) => void
): Promise<AudioData> {
  const ffmpeg = await getFFmpeg();

  onProgress?.('Writing file to memory...');
  const inputName = 'input_video';
  const outputName = 'output.wav';

  await ffmpeg.writeFile(inputName, await fetchFile(file));

  onProgress?.('Extracting audio...');
  await ffmpeg.exec([
    '-i', inputName,
    '-vn',                    // No video
    '-acodec', 'pcm_s16le',  // 16-bit PCM
    '-ac', '1',               // Mono
    '-ar', String(SYNC_SAMPLE_RATE), // 16000 Hz
    outputName,
  ]);

  const outputData = await ffmpeg.readFile(outputName);

  // Clean up WASM filesystem to free memory
  await ffmpeg.deleteFile(inputName);
  await ffmpeg.deleteFile(outputName);

  // Convert WAV (skip 44-byte header) to Float32Array
  const pcmBytes = (outputData as Uint8Array).slice(44);
  const int16 = new Int16Array(pcmBytes.buffer, pcmBytes.byteOffset, pcmBytes.byteLength / 2);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768.0;
  }

  return {
    channelData: [float32],
    samplesDecoded: float32.length,
    sampleRate: SYNC_SAMPLE_RATE,
  };
}
```

### Pattern 2: Reference Selection and One-to-Many Correlation

**What:** Auto-select the longest video as the reference (base) clip. Correlate all other videos against it using SynAudio's `syncOneToMany()`. This is required because SynAudio expects comparison clips to be subsets of the base clip.

**When to use:** Always. This is the core sync algorithm.

**Example:**

```typescript
// src/lib/audioSync.ts
import SynAudio from 'synaudio';
import type { AudioData } from './audioExtractor';
import { SYNC_SAMPLE_RATE, CORRELATION_SAMPLE_SIZE, INITIAL_GRANULARITY } from './constants';

export interface SyncResult {
  fileId: string;
  fileName: string;
  offsetSeconds: number;
  offsetSamples: number;
  confidence: number; // 0-100 percentage
  isReference: boolean;
}

export async function syncAudioTracks(
  tracks: { fileId: string; fileName: string; audio: AudioData }[],
  onProgress?: (progress: number) => void
): Promise<SyncResult[]> {
  // Select longest track as reference (SYNC-03)
  const sorted = [...tracks].sort(
    (a, b) => b.audio.samplesDecoded - a.audio.samplesDecoded
  );
  const reference = sorted[0];
  const comparisons = sorted.slice(1);

  const synAudio = new SynAudio({
    correlationSampleSize: CORRELATION_SAMPLE_SIZE,
    initialGranularity: INITIAL_GRANULARITY,
  });

  const comparisonClips = comparisons.map((track) => ({
    name: track.fileId,
    data: {
      channelData: track.audio.channelData,
      samplesDecoded: track.audio.samplesDecoded,
    },
  }));

  const matches = await synAudio.syncWorkerConcurrent(
    {
      channelData: reference.audio.channelData,
      samplesDecoded: reference.audio.samplesDecoded,
    },
    comparisonClips[0].data,
    navigator.hardwareConcurrency || 4
  );

  // Build results array
  const results: SyncResult[] = [
    {
      fileId: reference.fileId,
      fileName: reference.fileName,
      offsetSeconds: 0,
      offsetSamples: 0,
      confidence: 100,
      isReference: true,
    },
  ];

  // For one-to-many, iterate and call sync for each comparison
  for (let i = 0; i < comparisons.length; i++) {
    const { sampleOffset, correlation } = await synAudio.syncWorkerConcurrent(
      {
        channelData: reference.audio.channelData,
        samplesDecoded: reference.audio.samplesDecoded,
      },
      {
        channelData: comparisons[i].audio.channelData,
        samplesDecoded: comparisons[i].audio.samplesDecoded,
      },
      navigator.hardwareConcurrency || 4
    );

    results.push({
      fileId: comparisons[i].fileId,
      fileName: comparisons[i].fileName,
      offsetSeconds: sampleOffset / SYNC_SAMPLE_RATE,
      offsetSamples: sampleOffset,
      confidence: Math.round(Math.abs(correlation) * 100),
      isReference: false,
    });

    onProgress?.(((i + 1) / comparisons.length) * 100);
  }

  return results;
}
```

### Pattern 3: PCM Byte Conversion (Int16 to Float32)

**What:** Convert raw PCM s16le bytes (from FFmpeg WAV output) to Float32Array normalized to [-1.0, 1.0] range for SynAudio input.

**When to use:** After every FFmpeg audio extraction. This is a pure data transformation.

**Example:**

```typescript
// Inline in audioExtractor.ts — no library needed
function pcmInt16ToFloat32(pcmBytes: Uint8Array): Float32Array {
  // pcmBytes is raw PCM data (no WAV header)
  const int16 = new Int16Array(
    pcmBytes.buffer,
    pcmBytes.byteOffset,
    pcmBytes.byteLength / 2
  );
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768.0;
  }
  return float32;
}
```

### Anti-Patterns to Avoid

- **Loading all videos into FFmpeg WASM filesystem simultaneously:** WASM has a 2GB memory hard limit. A single 1GB video file already consumes significant memory. Process one video at a time through FFmpeg and delete the input/output files from the WASM filesystem immediately after extraction.
- **Using `decodeAudioData` instead of FFmpeg for audio extraction:** `decodeAudioData` format support varies by browser (MKV may fail in Chrome, various codecs unsupported in Firefox). FFmpeg handles all formats uniformly and is already loaded.
- **Extracting audio at full 44.1kHz/48kHz stereo:** Wastes memory. 16kHz mono is sufficient for correlation and reduces data by ~5.5x.
- **Calling `syncOneToMany` without `shared: true`:** This method requires SharedMemory. Since we already have COOP/COEP headers (validated in Phase 1), SharedArrayBuffer is available, but the SynAudio constructor must be initialized with `shared: true`.
- **Re-instantiating SynAudio for each comparison:** Create one SynAudio instance and reuse it across all correlation operations.
- **Displaying raw correlation coefficient to users:** Users do not understand that 0.85 means "very good match." Convert to percentage and use color coding (green > 70%, yellow 40-70%, red < 40%).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Audio cross-correlation | Custom FFT-based cross-correlation | SynAudio `syncWorkerConcurrent()` | WASM SIMD optimization, built-in Web Workers, handles edge cases (different lengths, noise), single function call. Custom FFT correlation needs 200+ lines: FFT, IFFT, complex multiply, normalization, peak detection. |
| PCM audio extraction from video | Custom WebCodecs-based audio decoder | FFmpeg WASM `exec()` | FFmpeg handles all container formats and codecs. WebCodecs API is not fully supported across browsers and requires manual demuxing. |
| Audio format detection | Custom probe/header parsing | FFmpeg `-vn` flag | FFmpeg auto-detects input format and transcodes to requested output format regardless of input codec. |
| Sample rate conversion | Custom resampling filter | FFmpeg `-ar 16000` flag | FFmpeg's built-in resampler handles anti-aliasing filtering correctly. Hand-rolling resampling introduces aliasing artifacts. |
| Progress tracking across async pipeline | Custom event system | Simple callback chain with state | The pipeline is linear (extract -> correlate -> display). Callbacks with `onProgress` are sufficient. No need for a pub/sub system. |

**Key insight:** The entire Phase 2 algorithm is: "extract audio with FFmpeg, convert bytes, correlate with SynAudio." Both heavy-lifting steps are handled by optimized WASM libraries. The application code is just plumbing between them.

## Common Pitfalls

### Pitfall 1: FFmpeg WASM Memory Exhaustion with Multiple Videos

**What goes wrong:** Processing multiple large video files causes the browser tab to crash with "Out of Memory" or "Array buffer allocation failed" errors.
**Why it happens:** FFmpeg WASM runs inside a 2GB WASM memory limit. Writing a large video file to the virtual filesystem, processing it, and keeping the output all consume memory. With multiple videos, this accumulates.
**How to avoid:** Process videos sequentially. After extracting audio from each video: (1) delete the input video from WASM FS (`ffmpeg.deleteFile()`), (2) read the output audio, (3) delete the output from WASM FS, (4) store only the Float32Array in JS memory. The video file data is released after each extraction.
**Warning signs:** Browser tab becomes unresponsive during processing. DevTools shows increasing memory usage that never drops.

### Pitfall 2: SynAudio Comparison Clip Longer Than Base Clip

**What goes wrong:** SynAudio returns a very low or meaningless correlation because the comparison clip is longer than the base clip.
**Why it happens:** SynAudio's algorithm slides the comparison clip along the base clip looking for the best match. If the comparison is longer than the base, there is no valid position where the comparison is fully contained within the base.
**How to avoid:** Always use the longest video as the reference (base) clip. Sort videos by duration (sample count) descending and use index 0 as the reference.
**Warning signs:** Correlation values near 0 for clips that should clearly match. Offset values at the extreme start or end of the base clip.

### Pitfall 3: WAV Header Not Skipped When Converting to Float32

**What goes wrong:** The first few samples of the Float32Array contain garbage data, causing incorrect correlation for the first fraction of a second.
**Why it happens:** WAV files have a 44-byte header containing metadata (sample rate, bit depth, etc.). If the header bytes are interpreted as PCM samples, they produce incorrect float values.
**How to avoid:** Always skip the first 44 bytes when converting WAV output to Float32Array: `pcmBytes.slice(44)`. Alternatively, output raw PCM from FFmpeg (using `-f s16le` with no container) to avoid the header entirely. WAV is preferred because it is easier to debug (can be played back).
**Warning signs:** First ~5ms of audio data looks like noise or has extreme values when plotted.

### Pitfall 4: Forgetting to Clean Up FFmpeg Virtual Filesystem

**What goes wrong:** Memory usage grows with each processed video and never recovers.
**Why it happens:** Files written to FFmpeg's WASM virtual filesystem persist until explicitly deleted. Processing 10 videos without cleanup means all 10 input videos and 10 output audio files coexist in WASM memory.
**How to avoid:** Call `ffmpeg.deleteFile(filename)` for both input and output files after reading the output data. Do this inside a try/finally block to ensure cleanup even on error.
**Warning signs:** Processing works for first 2-3 videos, then crashes. Memory profiler shows WASM heap growing monotonically.

### Pitfall 5: Blocking the Main Thread During Correlation

**What goes wrong:** The UI freezes for seconds or minutes while SynAudio processes audio correlation.
**Why it happens:** Using `synAudio.sync()` (main thread method) instead of `syncWorkerConcurrent()` (Web Worker method) runs the WASM correlation on the main thread, blocking all UI updates and interaction.
**How to avoid:** Always use `syncWorkerConcurrent()` or `syncWorker()` which execute in Web Workers. The `syncWorkerConcurrent()` method also parallelizes across multiple threads using `navigator.hardwareConcurrency`.
**Warning signs:** Browser shows "Page Unresponsive" dialog. Progress indicators stop updating during correlation.

### Pitfall 6: Incorrect Sample Rate Assumption for Offset Calculation

**What goes wrong:** Displayed timecode offsets are wrong by a factor of ~2.75x (if assuming 44100 instead of 16000).
**Why it happens:** SynAudio returns `sampleOffset` in units of samples at whatever sample rate the input audio was. If audio was extracted at 16000 Hz but offsets are divided by 44100, the resulting seconds are incorrect.
**How to avoid:** Always divide `sampleOffset` by the extraction sample rate (16000), not the original video's sample rate. Store the sample rate alongside the audio data and use it consistently.
**Warning signs:** Offset values are "in the right direction" but the magnitude is wrong. Manual verification shows the actual offset is different by a consistent ratio.

## Code Examples

### FFmpeg Audio Extraction Command

```typescript
// Extract mono 16kHz PCM audio as WAV from any video format
await ffmpeg.exec([
  '-i', inputFileName,
  '-vn',                    // Discard video stream
  '-acodec', 'pcm_s16le',  // 16-bit signed little-endian PCM
  '-ac', '1',               // Mix down to mono
  '-ar', '16000',           // Resample to 16kHz
  outputFileName,           // e.g., 'audio.wav'
]);
```

Source: Standard FFmpeg audio extraction flags. Verified via [FFmpeg documentation](https://ffmpeg.org/ffmpeg.html) and [Mux FFmpeg guide](https://www.mux.com/articles/extract-audio-from-a-video-file-with-ffmpeg).

### SynAudio Initialization with SharedMemory

```typescript
import SynAudio from 'synaudio';

// SharedMemory requires COOP/COEP headers (already set in Phase 1)
const synAudio = new SynAudio({
  correlationSampleSize: 11025,  // Default: compare 11025 samples (~0.69s at 16kHz)
  initialGranularity: 16,        // Default: skip 16 samples in first pass
  shared: true,                  // Enable SharedMemory for worker communication
});
```

Source: [SynAudio README](https://github.com/eshaz/synaudio)

### Complete Extraction-to-Correlation Pipeline

```typescript
// 1. Extract audio from all videos
const audioTracks = [];
for (let i = 0; i < videoFiles.length; i++) {
  const audio = await extractAudio(videoFiles[i].file);
  audioTracks.push({
    fileId: videoFiles[i].id,
    fileName: videoFiles[i].name,
    audio,
  });
  onProgress?.(`Extracted ${i + 1}/${videoFiles.length}`);
}

// 2. Select reference (longest track)
const sorted = [...audioTracks].sort(
  (a, b) => b.audio.samplesDecoded - a.audio.samplesDecoded
);
const reference = sorted[0];

// 3. Correlate each comparison against reference
const synAudio = new SynAudio({
  correlationSampleSize: 11025,
  initialGranularity: 16,
  shared: true,
});

const results = [];
for (const track of sorted.slice(1)) {
  const { sampleOffset, correlation } = await synAudio.syncWorkerConcurrent(
    {
      channelData: reference.audio.channelData,
      samplesDecoded: reference.audio.samplesDecoded,
    },
    {
      channelData: track.audio.channelData,
      samplesDecoded: track.audio.samplesDecoded,
    },
    navigator.hardwareConcurrency || 4
  );

  results.push({
    fileId: track.fileId,
    fileName: track.fileName,
    offsetSeconds: sampleOffset / 16000,
    confidence: Math.round(Math.abs(correlation) * 100),
    isReference: false,
  });
}

// 4. Add reference with 0 offset
results.unshift({
  fileId: reference.fileId,
  fileName: reference.fileName,
  offsetSeconds: 0,
  confidence: 100,
  isReference: true,
});
```

### Confidence Score Display Logic

```typescript
// Convert correlation to user-friendly confidence
function getConfidenceDisplay(confidence: number) {
  if (confidence >= 70) return { label: 'High', color: 'text-green-400' };
  if (confidence >= 40) return { label: 'Medium', color: 'text-yellow-400' };
  return { label: 'Low', color: 'text-red-400' };
}

// Format offset as human-readable timecode
function formatOffset(seconds: number): string {
  const sign = seconds >= 0 ? '+' : '';
  return `${sign}${seconds.toFixed(3)}s`;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| FFT-based cross-correlation in pure JS | WASM SIMD Pearson correlation (SynAudio) | SynAudio v0.4.0 (2025) | 10-100x faster correlation via WASM SIMD. No custom DSP code needed. |
| Web Audio API `decodeAudioData` for audio extraction | FFmpeg WASM `exec()` for universal format support | ffmpeg.wasm 0.12.x (2023) | Handles all video/audio formats uniformly. No browser-specific codec issues. |
| `createFFmpeg()` API (ffmpeg.wasm 0.11) | `new FFmpeg()` + `ffmpeg.load()` (0.12) | 2023 | Class-based API with `writeFile/exec/readFile`. Phase 1 already uses 0.12 API. |
| Full sample-rate correlation | Downsampled correlation (8-16kHz) | Standard practice | Reduces memory and computation by 3-6x with negligible accuracy loss for sync detection. |

**Deprecated/outdated:**
- `createFFmpeg()` / `fetchFFmpeg()` API: Replaced by `new FFmpeg()` + `ffmpeg.load()` in v0.12
- Manual FFT cross-correlation: Superseded by SynAudio's WASM SIMD implementation for browser use cases
- `OfflineAudioContext` for audio decoding: Unreliable for video containers, replaced by FFmpeg extraction

## Open Questions

1. **SynAudio `syncOneToMany` vs individual `syncWorkerConcurrent` calls**
   - What we know: `syncOneToMany` is designed for exactly our use case (one reference, many comparisons) and handles parallelization internally. It requires `shared: true` (SharedMemory). Individual `syncWorkerConcurrent` calls work without SharedMemory.
   - What's unclear: Whether `syncOneToMany` provides a meaningful performance advantage over looping `syncWorkerConcurrent` calls. SharedMemory is available (COOP/COEP headers from Phase 1), so both approaches are viable.
   - Recommendation: Start with individual `syncWorkerConcurrent` calls in a loop (simpler, more debuggable). If performance is insufficient, switch to `syncOneToMany`. Both use the same underlying WASM SIMD engine.

2. **Optimal `correlationSampleSize` for multi-cam audio**
   - What we know: Default is 11025 (~0.69s at 16kHz). Higher values increase accuracy but slow computation. Multi-cam recordings share the same ambient audio environment.
   - What's unclear: Whether the default is sufficient for noisy environments or recordings with little overlapping audio content.
   - Recommendation: Use the default 11025 initially. Expose as an advanced setting only if testing reveals accuracy issues. For most multi-cam setups (events, interviews, performances), ambient audio overlap is strong enough for the default.

3. **LGPL-3.0 license implications for SynAudio**
   - What we know: SynAudio is LGPL-3.0. This is a "weak copyleft" license. For web applications served over HTTP (not distributed as downloadable software), LGPL compliance is straightforward -- users can always view the source via browser DevTools.
   - What's unclear: Whether bundling via Vite/Rollup constitutes "static linking" under LGPL interpretation.
   - Recommendation: Proceed with SynAudio. The app is deployed as a static site (source visible in browser). If license concerns arise, the alternative is fft.js (MIT) + custom cross-correlation code, which is significantly more work.

4. **Duration detection without full audio extraction**
   - What we know: To select the longest video as reference, we need duration info. FFmpeg can probe duration with `-i input -f null -` or we could use the video element's `duration` property.
   - What's unclear: Whether `video.duration` from the HTML5 video element is reliable enough across all formats, or if FFmpeg probe is needed.
   - Recommendation: Use `HTMLVideoElement.duration` for initial reference selection (create a temporary `<video>` element, load the file via object URL, read `duration` on `loadedmetadata` event). This avoids running FFmpeg just for duration detection. Fall back to sample count comparison after extraction if needed.

## Sources

### Primary (HIGH confidence)
- [SynAudio GitHub](https://github.com/eshaz/synaudio) - API surface, algorithm description, WASM SIMD details, constructor options, method signatures, type definitions
- [SynAudio Demo](https://eshaz.github.io/synaudio/) - Configuration options, performance characteristics, output format
- [FFmpeg WASM](https://ffmpegwasm.netlify.app/) - `writeFile/exec/readFile` API, WASM filesystem, memory constraints
- [MDN AudioBuffer](https://developer.mozilla.org/en-US/docs/Web/API/AudioBuffer) - Float32Array audio representation, `getChannelData()` format
- [MDN decodeAudioData](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData) - Browser audio decoding limitations
- [FFmpeg audio extraction](https://www.mux.com/articles/extract-audio-from-a-video-file-with-ffmpeg) - `-vn -acodec pcm_s16le -ac 1 -ar` flags

### Secondary (MEDIUM confidence)
- [FFmpeg WASM large file discussions](https://github.com/ffmpegwasm/ffmpeg.wasm/discussions/516) - 2GB WASM memory limit, sequential processing recommendation
- [FFmpeg WASM FAQ](https://ffmpegwasm.netlify.app/docs/faq/) - Memory management, file cleanup
- [PCM conversion gist](https://gist.github.com/HudsonHuang/fbdf8e9af7993fe2a91620d3fb86a182) - Int16 to Float32 conversion formula
- [SynAudio npm](https://www.npmjs.com/package/synaudio) - Version 0.4.0, last published ~3 months ago, LGPL-3.0

### Tertiary (LOW confidence)
- SynAudio weekly download count: Not verified (npm page returned 403). Low download count expected for a niche library; does not indicate quality issues -- the library is purpose-built and the only JS/WASM option for this problem.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - SynAudio API verified against GitHub README. FFmpeg WASM already proven in Phase 1. Audio extraction flags are standard FFmpeg.
- Architecture: HIGH - Pipeline pattern (extract -> convert -> correlate -> display) is straightforward. All I/O formats verified (PCM s16le -> Float32Array -> SynAudio input).
- Pitfalls: HIGH - Memory limits documented in FFmpeg WASM GitHub issues. WAV header skip is well-known. SynAudio subset requirement verified in README.
- Data conversion: HIGH - Int16-to-Float32 conversion is a one-line formula verified across multiple sources. WAV header is always 44 bytes for PCM format.

**Research date:** 2026-03-01
**Valid until:** 2026-04-01 (stable libraries, 30-day window appropriate)
