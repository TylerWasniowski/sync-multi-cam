# Architecture Research

**Domain:** Browser-based multi-camera video synchronization tool
**Researched:** 2026-03-01
**Confidence:** HIGH

## Standard Architecture

### System Overview

```
+-----------------------------------------------------------------------+
|                          UI Layer (React/Solid)                        |
|  +---------------+  +----------------+  +---------------------------+ |
|  | File Drop     |  | Progress       |  | Results Display           | |
|  | Zone          |  | Dashboard      |  | (offsets, downloads)      | |
|  +-------+-------+  +-------+--------+  +-------------+-------------+ |
|          |                  ^                          ^               |
+----------+------------------+------ Main Thread ------+---------------+
|          v                  |                          |               |
|  +-------+------------------+--------------------------+------------+ |
|  |                    Pipeline Orchestrator                          | |
|  |  (state machine: idle -> extracting -> correlating -> trimming)   | |
|  +---+-------------------+---------------------+-------------------+  |
|      |                   |                     |                      |
+------+------- Web Worker Boundary -------------+----------------------+
|      v                   v                     v                      |
|  +---+--------+  +------+---------+  +---------+--------+            |
|  | FFmpeg      |  | Audio         |  | FFmpeg            |            |
|  | Audio       |  | Correlation   |  | Video             |            |
|  | Extractor   |  | Engine        |  | Trimmer           |            |
|  | (Worker)    |  | (SynAudio)    |  | (Worker)          |            |
|  +---+--------+  +------+---------+  +---------+--------+            |
|      |                   |                     |                      |
|      v                   v                     v                      |
|  +---+-------------------+---------------------+-------------------+  |
|  |              FFmpeg WASM Virtual File System (MEMFS)             | |
|  |  (in-memory: input videos, extracted audio, trimmed output)      | |
|  +------------------------------------------------------------------+ |
+-----------------------------------------------------------------------+
|                    Browser APIs                                        |
|  +-------------+  +----------------+  +-------------------+           |
|  | File API    |  | Web Audio API  |  | Blob / Object URL |           |
|  | (input)     |  | (decode PCM)   |  | (download output) |           |
|  +-------------+  +----------------+  +-------------------+           |
+-----------------------------------------------------------------------+
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| File Drop Zone | Accept 2-4 video files via drag-drop or file picker | HTML5 drag/drop events + `<input type="file">` |
| Pipeline Orchestrator | Coordinate the extract-correlate-trim sequence, manage state transitions, aggregate progress | State machine on main thread, dispatches to workers |
| FFmpeg Audio Extractor | Extract audio tracks from video files as WAV/PCM | ffmpeg.wasm `exec()` in Web Worker: `-i input.mp4 -vn -acodec pcm_s16le -ar 16000 -ac 1 output.wav` |
| Audio Correlation Engine | Find time offsets between audio clips via cross-correlation | SynAudio library (Pearson correlation with WASM SIMD) |
| FFmpeg Video Trimmer | Trim videos to align start points based on computed offsets | ffmpeg.wasm `exec()` in Web Worker: `-ss offset -i input.mp4 -c copy output.mp4` |
| Progress Dashboard | Show per-file and overall pipeline progress | Subscribe to worker message events, render progress bars |
| Results Display | Show computed offsets, provide individual + zip download | Blob URLs for individual files, client-zip for bundle |
| Virtual File System | Hold all intermediate and output files in memory | ffmpeg.wasm MEMFS (writeFile/readFile) |

## Recommended Project Structure

```
src/
├── components/           # UI components
│   ├── FileDropZone.tsx  # Drag-and-drop file input
│   ├── ProgressDashboard.tsx  # Per-file + overall progress
│   ├── ResultsList.tsx   # Offset display + download buttons
│   └── App.tsx           # Root layout and top-level state
├── pipeline/             # Core processing logic
│   ├── orchestrator.ts   # State machine coordinating the pipeline
│   ├── types.ts          # Shared types (PipelineState, FileEntry, SyncResult)
│   └── progress.ts       # Progress aggregation utilities
├── workers/              # Web Worker entry points
│   ├── ffmpeg.worker.ts  # FFmpeg WASM operations (extract audio, trim video)
│   └── sync.worker.ts    # SynAudio correlation (optional: may run on main thread)
├── audio/                # Audio processing utilities
│   ├── extract.ts        # FFmpeg commands for audio extraction
│   ├── correlate.ts      # SynAudio wrapper for cross-correlation
│   └── decode.ts         # Web Audio API decodeAudioData -> Float32Array
├── output/               # Output generation
│   ├── trim.ts           # FFmpeg commands for video trimming
│   ├── download.ts       # Blob URL creation, individual downloads
│   └── zip.ts            # Zip bundle generation (client-zip)
├── lib/                  # Shared utilities
│   ├── ffmpeg.ts         # FFmpeg WASM initialization and singleton management
│   ├── fileHelpers.ts    # File reading, ArrayBuffer conversion
│   └── constants.ts      # Sample rates, correlation thresholds, limits
└── index.tsx             # Entry point
public/
├── _headers              # Cloudflare Pages COOP/COEP headers
└── index.html
```

### Structure Rationale

- **pipeline/:** Separates orchestration logic from both UI and worker code. The orchestrator is the "brain" -- it knows the sequence of operations but delegates actual work to workers. This makes the pipeline testable without DOM or worker dependencies.
- **workers/:** Isolated entry points that can be bundled as separate files. Each worker has a narrow interface (receives commands, emits progress/results). Keeps the ffmpeg.wasm instance fully contained within the worker scope.
- **audio/:** Domain-specific logic for the audio processing chain. Separating extraction, decoding, and correlation makes each step independently testable and replaceable.
- **output/:** Keeps output generation (trimming, downloading, zipping) separate from the sync detection logic. These are the "last mile" of the pipeline.
- **lib/:** Shared utilities that multiple modules need. FFmpeg initialization is critical -- it must be done once and reused.

## Architectural Patterns

### Pattern 1: Sequential Pipeline with Worker Delegation

**What:** The core processing flow is a linear pipeline with three stages: Extract Audio -> Cross-Correlate -> Trim Videos. Each stage must complete before the next begins (correlation needs extracted audio; trimming needs correlation results). The orchestrator on the main thread manages this sequence and delegates heavy work to Web Workers.

**When to use:** Always -- this is the fundamental architecture of the tool.

**Trade-offs:** Simple to reason about and debug. Sequential means no parallelism between stages (cannot start correlation until all audio is extracted). However, within each stage, individual files CAN be processed in parallel.

**Example:**
```typescript
// pipeline/orchestrator.ts
type PipelineStage = 'idle' | 'loading' | 'extracting' | 'correlating' | 'trimming' | 'complete' | 'error';

interface PipelineState {
  stage: PipelineStage;
  files: FileEntry[];
  progress: Map<string, number>; // fileId -> 0-1
  offsets: Map<string, number>;  // fileId -> offset in seconds
  error?: string;
}

async function runPipeline(files: File[]): AsyncGenerator<PipelineState> {
  // Stage 1: Extract audio from all files (parallel per-file)
  const audioData = await extractAllAudio(files, onProgress);

  // Stage 2: Cross-correlate using first file as reference
  const offsets = await correlateAudio(audioData);

  // Stage 3: Trim videos based on offsets (parallel per-file)
  const trimmedFiles = await trimAllVideos(files, offsets, onProgress);

  return { trimmedFiles, offsets };
}
```

### Pattern 2: Message-Based Worker Communication

**What:** Main thread and workers communicate exclusively through `postMessage()` with typed message envelopes. Workers never access the DOM. Data transfers use Transferable objects (ArrayBuffer) for zero-copy performance.

**When to use:** All main-thread-to-worker communication.

**Trade-offs:** Adds message serialization overhead for small payloads, but eliminates shared-state bugs and enables zero-copy transfers for large binary data (video files, audio buffers). The typed message envelope pattern prevents message type mismatches.

**Example:**
```typescript
// workers/messages.ts
type WorkerMessage =
  | { type: 'extract-audio'; fileId: string; fileData: ArrayBuffer }
  | { type: 'trim-video'; fileId: string; fileData: ArrayBuffer; offsetSeconds: number }
  | { type: 'progress'; fileId: string; percent: number; stage: string }
  | { type: 'result'; fileId: string; data: ArrayBuffer }
  | { type: 'error'; fileId: string; message: string };

// In worker:
self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data;
  if (msg.type === 'extract-audio') {
    // Write to MEMFS, run ffmpeg, read result, post back
    // Transfer ArrayBuffer (zero-copy):
    self.postMessage(
      { type: 'result', fileId: msg.fileId, data: resultBuffer },
      [resultBuffer]  // transferable
    );
  }
};
```

### Pattern 3: Reference File Correlation Strategy

**What:** Designate one video as the "reference" and correlate all others against it. This produces N-1 pairwise offsets rather than N*(N-1)/2 all-pairs comparisons. The reference file's offset is 0; all others are relative to it.

**When to use:** Always for this tool. With 2-4 files, pairwise all-to-all is feasible but unnecessary. Reference-based is simpler, faster, and produces directly usable offsets.

**Trade-offs:** If the reference file has poor audio quality, all correlations suffer. Mitigation: let the user choose the reference, or automatically select the file with the highest audio energy.

**Example:**
```typescript
// audio/correlate.ts
async function correlateToReference(
  reference: PCMAudio,
  others: { id: string; audio: PCMAudio }[]
): Promise<Map<string, { offsetSamples: number; correlation: number }>> {
  const synAudio = new SynAudio();
  const results = new Map();

  for (const other of others) {
    const match = await synAudio.syncWorkerConcurrent(reference, other.audio, 4);
    results.set(other.id, {
      offsetSamples: match.sampleOffset,
      correlation: match.correlation,
    });
  }
  return results;
}
```

### Pattern 4: Eager Memory Cleanup

**What:** Explicitly null-out ArrayBuffer references and delete files from the MEMFS virtual filesystem as soon as each pipeline stage completes. Do not hold input video data, extracted audio, AND trimmed output all in memory simultaneously.

**When to use:** Always. Browser memory is the primary constraint (practical limit ~2-4GB). With 4 video files, memory can easily exceed limits without disciplined cleanup.

**Trade-offs:** Slightly more complex code (must track what to clean up when). But prevents OOM crashes that would otherwise make the tool unusable with larger files.

**Example:**
```typescript
// After extracting audio from a file, delete the input video from MEMFS
await ffmpeg.deleteFile('input.mp4');

// After correlation completes, release the Float32Array audio buffers
audioBuffers.forEach(buf => { buf.channelData = null; });

// After trimming, read the result and delete from MEMFS immediately
const result = await ffmpeg.readFile('output.mp4');
await ffmpeg.deleteFile('output.mp4');
```

## Data Flow

### Primary Processing Pipeline

```
User drops files
    |
    v
[File API] -- File objects (references, not loaded into memory yet)
    |
    v
[Pipeline Orchestrator] -- begins extract stage
    |
    +-- For each file (parallel):
    |       |
    |       v
    |   [File.arrayBuffer()] -- reads file into ArrayBuffer
    |       |
    |       v  (transfer ArrayBuffer to worker)
    |   [FFmpeg Worker]
    |       |-- writeFile('input.mp4', data)
    |       |-- exec(['-i','input.mp4','-vn','-ac','1','-ar','16000','-f','wav','audio.wav'])
    |       |-- readFile('audio.wav') -> Uint8Array
    |       |-- deleteFile('input.mp4')  // free memory
    |       |-- postMessage({ type:'result', data: wavBuffer }, [wavBuffer])
    |       v
    |   [Main Thread receives WAV ArrayBuffer]
    |       |
    |       v
    |   [Web Audio API: decodeAudioData(wavBuffer)]
    |       |
    |       v
    |   [AudioBuffer.getChannelData(0)] -> Float32Array (PCM samples)
    |
    v
[All audio extracted as Float32Array PCM]
    |
    v
[SynAudio Correlation Engine]
    |-- reference = files[0].pcmData
    |-- For each other file:
    |       syncWorkerConcurrent(reference, other.pcmData, concurrency)
    |       -> { sampleOffset, correlation }
    |
    v
[Offsets computed] -- Map<fileId, { offsetSamples, offsetSeconds, correlation }>
    |
    v
[Determine trim points]
    |-- Find the maximum offset (latest start)
    |-- Each file's trim = maxOffset - thisOffset
    |   (file with latest start gets trim=0, others get trimmed from front)
    |
    +-- For each file (parallel):
    |       |
    |       v
    |   [File.arrayBuffer()] -- re-read original file
    |       |
    |       v  (transfer to worker)
    |   [FFmpeg Worker]
    |       |-- writeFile('input.mp4', data)
    |       |-- exec(['-ss', trimSeconds, '-i', 'input.mp4', '-c', 'copy', 'output.mp4'])
    |       |-- readFile('output.mp4') -> Uint8Array
    |       |-- deleteFile('input.mp4'), deleteFile('output.mp4')
    |       |-- postMessage({ type:'result', data: trimmedBuffer }, [trimmedBuffer])
    |       v
    |   [Main Thread receives trimmed video ArrayBuffer]
    |
    v
[All trimmed videos ready]
    |
    +-- Create Blob URLs for individual downloads
    +-- Bundle into ZIP via client-zip for bulk download
    +-- Display offset results in UI
```

### State Management

```
[Pipeline State (reactive store)]
    |
    +-- stage: 'idle' | 'extracting' | 'correlating' | 'trimming' | 'complete' | 'error'
    +-- files: Array<{ id, name, size, status, progress }>
    +-- offsets: Map<fileId, { seconds, samples, correlation }>
    +-- outputs: Map<fileId, Blob>
    |
    v (subscribe)
[UI Components]
    +-- FileDropZone: enabled when stage === 'idle'
    +-- ProgressDashboard: visible during processing stages
    +-- ResultsList: visible when stage === 'complete'
```

### Key Data Flows

1. **File Ingestion:** User drops files -> File API creates File objects (lazy, no memory until read) -> FileDropZone validates count (2-4) and type (video/*) -> Pipeline state updated with file metadata.

2. **Audio Extraction:** For each file, read as ArrayBuffer -> transfer to FFmpeg worker -> extract mono 16kHz WAV -> transfer WAV back -> decode via Web Audio API to Float32Array PCM. This is the most memory-intensive stage because both the video ArrayBuffer and extracted audio co-exist briefly.

3. **Cross-Correlation:** All PCM Float32Arrays passed to SynAudio -> reference-based correlation produces sample offsets -> convert sample offsets to seconds (offset / sampleRate). SynAudio's WASM SIMD implementation handles the heavy math.

4. **Video Trimming:** Original files re-read from disk (File API) -> transfer to FFmpeg worker -> stream-copy trim with `-ss` offset -> transfer result back as Blob. Using `-c copy` (no re-encode) is fast and preserves quality.

5. **Output Delivery:** Trimmed Blobs stored in state -> individual Blob URLs created for per-file download -> client-zip streams all Blobs into a ZIP for bulk download -> auto-download triggered.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 2 files, short (<5min) | Single FFmpeg worker instance, sequential extraction, basic correlation. Works with single-threaded @ffmpeg/core. ~500MB memory. |
| 4 files, moderate (5-30min) | Use multi-threaded @ffmpeg/core-mt for faster extraction. Process files sequentially to manage memory. Downsample audio to 8kHz for correlation. ~1-2GB memory. |
| 4 files, long (>30min) | Near browser memory limits. Must aggressively clean up between stages. Consider extracting only a subset of audio (first 2-5 minutes) for correlation -- sync point is typically near the start. ~2-3GB memory. |

### Scaling Priorities

1. **First bottleneck -- memory:** Browser tabs typically have 2-4GB memory limits. Four 30-minute 1080p video files at ~200MB each = 800MB just for input, plus extracted audio, plus trimmed output. Mitigation: never hold more than one file's input + output in MEMFS simultaneously; process sequentially with cleanup between files.

2. **Second bottleneck -- extraction time:** FFmpeg WASM audio extraction is CPU-bound. Multi-threaded core provides ~2x speedup. Downsampling to 16kHz mono WAV (sufficient for correlation) reduces output size and processing time dramatically compared to full-quality extraction.

3. **Third bottleneck -- correlation time:** SynAudio's SIMD-optimized WASM correlation is fast, but with long audio clips the search space grows. Using `initialGranularity: 16` (default) and limiting correlation to the first few minutes of audio keeps this stage under a few seconds even for long recordings.

## Anti-Patterns

### Anti-Pattern 1: Loading All Files into Memory Simultaneously

**What people do:** Read all video files into ArrayBuffers at once, keep them all in memory while processing.
**Why it's wrong:** With 4 videos at 200MB+ each, you immediately consume 800MB+ before any processing begins. Add extracted audio and trimmed output, and you exceed browser memory limits.
**Do this instead:** Process files one at a time through each stage. Read a file, extract its audio, release the ArrayBuffer, move to the next. Re-read from File API for trimming stage (the File object is a reference, not in-memory data).

### Anti-Pattern 2: Re-encoding During Trim

**What people do:** Use FFmpeg to re-encode videos when trimming (e.g., `-c:v libx264`).
**Why it's wrong:** Re-encoding is 10-100x slower than stream copy, produces artifacts, and consumes massive CPU/memory. For trimming to a sync point, there is no quality benefit.
**Do this instead:** Use `-c copy` (stream copy) with `-ss` before `-i` for fast keyframe-accurate seeking. Accept that the trim point may not be frame-exact (will snap to nearest keyframe, typically within 0.5s). For most multi-cam sync use cases, keyframe accuracy is sufficient.

### Anti-Pattern 3: Running FFmpeg on the Main Thread

**What people do:** Call `ffmpeg.exec()` directly from the main thread without a dedicated worker.
**Why it's wrong:** Even though ffmpeg.wasm uses an internal worker, the API calls and file I/O operations still block the main thread's event loop, causing UI freezes during large file operations.
**Do this instead:** Wrap all FFmpeg interactions in a dedicated Web Worker. The main thread sends file data via `postMessage()` with Transferable ArrayBuffers. The worker owns the FFmpeg instance exclusively.

### Anti-Pattern 4: Full-Quality Audio for Correlation

**What people do:** Extract audio at original sample rate (44.1kHz or 48kHz, stereo) for cross-correlation.
**Why it's wrong:** Higher sample rates and multiple channels multiply memory usage and correlation computation time without improving sync detection accuracy. Cross-correlation for temporal alignment works perfectly well at low sample rates.
**Do this instead:** Extract mono audio at 16kHz (`-ac 1 -ar 16000`). This is more than sufficient for finding sync offsets and reduces memory by ~6x compared to 48kHz stereo.

### Anti-Pattern 5: Skipping COOP/COEP Headers

**What people do:** Deploy to Cloudflare Pages without configuring cross-origin isolation headers, then wonder why multi-threaded FFmpeg fails.
**Why it's wrong:** `SharedArrayBuffer` (required by `@ffmpeg/core-mt`) is only available in cross-origin isolated contexts. Without the headers, the browser silently disables it.
**Do this instead:** Create a `_headers` file in the public directory with COOP/COEP headers for all routes. Fall back to single-threaded `@ffmpeg/core` if `SharedArrayBuffer` is not available (detect at runtime).

## Integration Points

### External Services

None. The entire application runs client-side with no external service dependencies. This is a key architectural constraint and advantage -- no API keys, no CORS issues, no rate limits, no data leaving the browser.

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Main Thread <-> FFmpeg Worker | postMessage with typed envelopes, Transferable ArrayBuffers | Worker owns FFmpeg instance. Main thread never touches ffmpeg.wasm directly. |
| Main Thread <-> SynAudio | Direct API call (SynAudio handles its own internal workers) | SynAudio's `syncWorkerConcurrent()` manages its own worker pool. Main thread passes Float32Array PCM data. |
| Pipeline Orchestrator <-> UI | Reactive state store (signals/atoms/useState) | Orchestrator updates state; UI subscribes. No direct DOM manipulation from pipeline code. |
| File API <-> Pipeline | File objects passed by reference (lazy read) | Files are read on-demand via `file.arrayBuffer()`. The File object itself consumes minimal memory. |
| FFmpeg MEMFS <-> Worker Code | `writeFile()` / `readFile()` / `deleteFile()` | All within the worker scope. MEMFS is an implementation detail of the worker, not exposed to main thread. |

### Required Browser APIs

| API | Purpose | Fallback |
|-----|---------|----------|
| WebAssembly | Run FFmpeg and SynAudio WASM modules | None -- hard requirement |
| Web Workers | Offload processing from main thread | None -- hard requirement |
| SharedArrayBuffer | Enable multi-threaded FFmpeg core | Fall back to single-threaded @ffmpeg/core |
| File API | Read user-selected video files | None -- hard requirement |
| Web Audio API (decodeAudioData) | Decode extracted WAV to Float32Array PCM | Parse WAV manually (simple but less robust) |
| Blob / Object URL | Create downloadable links for output files | None -- hard requirement |
| Drag and Drop API | Accept files via drag-and-drop | File input picker as fallback |

### Cloudflare Pages Configuration

The `_headers` file in the public/output directory must include:

```
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
```

This enables `SharedArrayBuffer` for multi-threaded FFmpeg. Without these headers, the app must fall back to single-threaded mode (still functional, but ~2x slower for extraction and trimming).

## Build Order (Dependency Chain)

The following order reflects hard dependencies between components:

1. **FFmpeg WASM Initialization** -- Everything depends on this. Get FFmpeg loading in a worker, verify MEMFS read/write, test a simple command. Validate COOP/COEP headers on Cloudflare Pages.

2. **Audio Extraction Pipeline** -- Depends on (1). Extract WAV from a video file using FFmpeg in the worker. Decode WAV to Float32Array using Web Audio API. This produces the input for correlation.

3. **Cross-Correlation Engine** -- Depends on (2). Integrate SynAudio, feed it Float32Array PCM data, get sample offsets back. Convert sample offsets to time offsets.

4. **Video Trimming Pipeline** -- Depends on (1) and (3). Apply computed offsets to trim videos using FFmpeg stream copy. This is structurally similar to audio extraction (same FFmpeg worker pattern) but uses different commands.

5. **Output and Download** -- Depends on (4). Create Blob URLs, generate ZIP bundle, trigger downloads. This is the simplest layer -- just packaging already-computed results.

6. **UI and Progress Reporting** -- Can be built incrementally alongside other stages. The file drop zone is needed first (before stage 2). Progress reporting adds polish but is not a functional dependency.

7. **Pipeline Orchestrator** -- Integrates stages 2-5 into a coherent sequence. This is the glue layer built last, once all individual stages are proven to work.

## Sources

- [ffmpeg.wasm GitHub Repository](https://github.com/ffmpegwasm/ffmpeg.wasm) -- HIGH confidence
- [ffmpeg.wasm Official Documentation](https://ffmpegwasm.netlify.app/docs/overview/) -- HIGH confidence
- [ffmpeg.wasm DeepWiki Architecture](https://deepwiki.com/ffmpegwasm/ffmpeg.wasm) -- MEDIUM confidence (third-party synthesis of official docs)
- [ffmpeg.wasm API Reference](https://ffmpegwasm.netlify.app/docs/api/ffmpeg/classes/ffmpeg/) -- HIGH confidence
- [SynAudio Library](https://github.com/eshaz/synaudio) -- MEDIUM confidence (well-documented but niche library)
- [Cloudflare Pages Headers Configuration](https://developers.cloudflare.com/pages/configuration/headers/) -- HIGH confidence
- [Web Audio API decodeAudioData](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData) -- HIGH confidence
- [Web Workers API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers) -- HIGH confidence
- [client-zip (streaming ZIP generator)](https://github.com/Touffy/client-zip) -- MEDIUM confidence
- [SyncSink Audio Synchronization Tool](https://github.com/JorenSix/SyncSink) -- MEDIUM confidence (reference architecture from desktop tool)
- [AudioAlign Synchronization Tool](https://github.com/protyposis/AudioAlign) -- LOW confidence (Windows desktop, different domain but similar algorithm)

---
*Architecture research for: browser-based multi-camera video synchronization*
*Researched: 2026-03-01*
