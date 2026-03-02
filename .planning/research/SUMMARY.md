# Project Research Summary

**Project:** Sync Multi-Cam
**Domain:** Browser-based multi-camera video synchronization tool
**Researched:** 2026-03-01
**Confidence:** HIGH

## Executive Summary

Sync Multi-Cam is a client-side browser tool that accepts 2-4 video files from a multi-camera shoot, automatically detects their temporal alignment via audio cross-correlation, and outputs trimmed/synchronized video files the user can download and immediately use in any NLE. The expert approach to building this is a sequential processing pipeline (extract audio, cross-correlate, trim video) running entirely in-browser using FFmpeg WASM for media manipulation and an FFT-based or SIMD-optimized cross-correlation library (SynAudio or fft.js) for sync detection. The architecture is a standard React SPA with heavy computation delegated to Web Workers, deployed as a static site on Cloudflare Pages with cross-origin isolation headers to enable SharedArrayBuffer for multi-threaded FFmpeg.

The recommended approach is a Vite 7 + React 19 + TypeScript SPA styled with Tailwind CSS 4, using @ffmpeg/core-mt for media processing and SynAudio (or fft.js) for audio correlation. The key architectural decision is to process files sequentially with aggressive memory cleanup between stages, because browser memory is the binding constraint -- not CPU speed. Audio should be extracted via FFmpeg as 8-16kHz mono WAV (not via Web Audio API's decodeAudioData, which causes memory explosions on long files), and video trimming must use stream copy (`-c copy`) rather than re-encoding to avoid the 12-25x WASM performance penalty. The competitive gap is clear: PluralEyes is discontinued, SyncSink.wasm outputs only JSON offsets (no trimmed video files), and all other competitors require desktop installation and paid licenses.

The three highest-risk areas are: (1) memory management -- MEMFS double-buffering can easily blow through browser tab memory limits with just 2-3 large files; (2) cross-origin isolation headers -- misconfigured COOP/COEP headers silently break SharedArrayBuffer, and this must be validated on Cloudflare Pages before any real development begins; (3) cross-correlation accuracy -- sample rate mismatches, low SNR audio, and clock drift can all produce wrong offsets if the audio extraction and correlation pipeline is not carefully parameterized. All three must be addressed in the earliest phases.

## Key Findings

### Recommended Stack

The stack is well-established with high-confidence choices across the board. Vite 7 provides first-class WASM support and native Cloudflare Pages integration. React 19 is the right fit for the component model (drag-drop zone, progress indicators, file list, download actions) without needing SSR or routing. FFmpeg WASM (@ffmpeg/ffmpeg + @ffmpeg/core-mt) is the only viable option for in-browser video manipulation.

**Core technologies:**
- **Vite 7 + React 19 + TypeScript 5.9:** SPA framework -- fast HMR, WASM support, component model fits the UI needs
- **Tailwind CSS 4:** Utility-first styling with first-party Vite plugin -- dark theme from day one
- **@ffmpeg/ffmpeg + @ffmpeg/core-mt:** In-browser video/audio processing via WASM -- multi-threaded for 2x speedup
- **SynAudio (or fft.js):** Audio cross-correlation engine -- SIMD-optimized WASM (SynAudio) or pure-JS FFT (fft.js) for offset detection
- **Web Audio API:** Native audio decoding for short segments (fallback only; FFmpeg extraction preferred for long files)
- **client-zip + file-saver:** Output delivery -- streaming ZIP generation and browser download triggering
- **Cloudflare Pages:** Static hosting with custom headers for cross-origin isolation

**Critical version requirement:** @ffmpeg/core-mt requires SharedArrayBuffer, which requires COOP/COEP headers on the hosting environment. Single-threaded @ffmpeg/core must be available as a runtime fallback.

### Expected Features

**Must have (table stakes):**
- Drag-and-drop file input with browse fallback (2-4 video files)
- Audio-based automatic sync with frame-accurate offset detection
- Trimmed/aligned output files via stream-copy (no re-encode)
- Per-file download of synced videos
- Multi-stage processing progress feedback
- Offset display per video in timecode format
- Privacy messaging ("files never leave your browser")
- Dark/professional UI theme

**Should have (differentiators):**
- Sync confidence score (correlation coefficient as percentage)
- Visual waveform display with alignment markers
- Reference file selection (user picks the anchor video)
- Batch ZIP download (with size guard)
- Manual offset adjustment (frame-level nudge controls)

**Defer (v2+):**
- Re-encode mode for frame-exact trimming (keyframe-accurate stream copy is sufficient for v1)
- NLE project file export (FCP XML / Premiere XML)
- Audio drift detection/compensation (only matters for 30+ minute recordings)
- Keyboard shortcuts, drag-to-reorder files

**Key competitive insight:** SyncSink.wasm is the closest prior art but outputs only JSON offsets, not trimmed video files. This tool closes that gap. PluralEyes is discontinued. Syncaila costs $49-$199. The "free, zero-install, browser-based" positioning is the primary differentiator.

### Architecture Approach

The architecture is a sequential three-stage pipeline (extract audio, cross-correlate, trim video) orchestrated by a state machine on the main thread, with all heavy computation delegated to Web Workers. Files are processed one at a time through each stage with eager memory cleanup to stay within browser memory limits. The FFmpeg WASM instance lives exclusively inside a Web Worker and communicates via typed postMessage envelopes with Transferable ArrayBuffer transfers for zero-copy performance.

**Major components:**
1. **File Drop Zone** -- accepts 2-4 video files, validates count and type, creates File object references (lazy, no memory until read)
2. **Pipeline Orchestrator** -- state machine (idle -> extracting -> correlating -> trimming -> complete) that sequences the processing stages and aggregates progress
3. **FFmpeg Worker** -- owns the FFmpeg WASM instance, handles audio extraction and video trimming via postMessage commands
4. **Audio Correlation Engine** -- SynAudio (or fft.js) cross-correlation against a reference file, produces sample-level offsets and confidence scores
5. **Output/Download Manager** -- creates Blob URLs for per-file downloads, generates optional ZIP bundle via client-zip

**Key pattern:** Reference-based correlation (N-1 pairwise comparisons instead of N*(N-1)/2 all-pairs). First file is default reference; user can override.

### Critical Pitfalls

1. **MEMFS double-buffering memory explosion** -- FFmpeg WASM creates copies of files in its virtual filesystem. A 500MB video consumes 1.5-2GB in practice (JS ArrayBuffer + MEMFS copy + working memory + output). Process files sequentially, delete from MEMFS immediately after reading results, never hold input + output simultaneously.

2. **COOP/COEP header misconfiguration** -- SharedArrayBuffer requires cross-origin isolation headers. Works on localhost but silently breaks in production if `_headers` file is missing or misconfigured. Validate on Cloudflare Pages on day one with a skeleton deploy.

3. **Audio cross-correlation accuracy** -- Sample rate mismatches between cameras produce garbage offsets. Always resample to a common rate (8-16kHz mono) via FFmpeg before correlation. Validate correlation peak exceeds a minimum threshold; warn users on low confidence.

4. **FFmpeg WASM is 12-25x slower than native** -- Re-encoding video is prohibitively slow. Use `-c copy` (stream copy) for trimming, which runs at near-native speed. Place `-ss` before `-i` for fast seeking. Accept keyframe-aligned trim points.

5. **decodeAudioData memory explosion** -- Web Audio API's decodeAudioData decodes entire files into uncompressed PCM in memory (a 60-min stereo file = 1.2GB). Use FFmpeg to extract 8kHz mono WAV limited to 60 seconds instead. Parse WAV headers manually to get Float32Array.

## Implications for Roadmap

Based on research, the build order is strictly constrained by dependencies: FFmpeg must load before audio can be extracted, audio must be extracted before correlation, correlation must complete before trimming, and trimming must complete before download. The suggested phase structure follows this dependency chain.

### Phase 1: Foundation and Infrastructure

**Rationale:** Cross-origin isolation headers and FFmpeg WASM loading are hard prerequisites for everything else. Getting these wrong wastes days of debugging. The ARCHITECTURE and PITFALLS research both identify this as the "validate first" step.
**Delivers:** Deployable skeleton on Cloudflare Pages with verified COOP/COEP headers, FFmpeg WASM loading in a Web Worker, basic React app shell with dark theme, file drop zone accepting 2-4 videos.
**Addresses:** No-installation-required (table stakes), privacy messaging, dark theme UI, drag-and-drop file input.
**Avoids:** Pitfall 2 (COOP/COEP misconfiguration) -- validate SharedArrayBuffer availability on production deploy before writing any processing code. Pitfall 1 (memory) -- establish sequential processing pattern and MEMFS cleanup discipline from the start.

### Phase 2: Audio Extraction and Sync Algorithm

**Rationale:** This is the algorithmic core and highest-risk phase. The cross-correlation engine is the product's reason to exist. It depends on Phase 1's FFmpeg Worker being operational. Audio extraction parameters (sample rate, mono, duration limit) directly determine whether correlation works or fails.
**Delivers:** Working audio extraction pipeline (FFmpeg Worker extracts 8-16kHz mono WAV), cross-correlation engine producing sample-level offsets and confidence scores, offset display in the UI.
**Uses:** @ffmpeg/ffmpeg, @ffmpeg/core-mt, SynAudio or fft.js, Web Audio API (for short-segment fallback only).
**Implements:** FFmpeg Audio Extractor, Audio Correlation Engine, Pipeline Orchestrator (extract + correlate stages).
**Avoids:** Pitfall 3 (correlation accuracy) -- resample all audio to common rate, validate correlation peaks, test with real multi-cam footage. Pitfall 5 (decodeAudioData memory) -- use FFmpeg extraction, not Web Audio API, for long files.

### Phase 3: Video Trimming and Download

**Rationale:** Depends on Phase 2 producing correct offsets. Trimming reuses the FFmpeg Worker pattern from Phase 2 (same infrastructure, different commands). Download is the "last mile" that makes the product useful -- without downloadable trimmed files, the tool is just SyncSink.wasm with a nicer UI.
**Delivers:** Stream-copy video trimming based on computed offsets, per-file download buttons, processing progress feedback across all stages, beforeunload warning during processing.
**Uses:** @ffmpeg/ffmpeg (stream copy trim), file-saver, Blob URLs.
**Implements:** FFmpeg Video Trimmer, Output/Download Manager, Progress Dashboard, complete Pipeline Orchestrator (all stages).
**Avoids:** Pitfall 4 (FFmpeg performance) -- use `-c copy` with `-ss` before `-i`, never re-encode. Pitfall 1 (memory) -- re-read files from File API for trimming stage (do not hold in memory from extraction stage).

### Phase 4: Polish and Differentiators

**Rationale:** Core functionality is complete after Phase 3. This phase adds the features that differentiate from competitors and improve confidence in results. These features are independently valuable and can be shipped incrementally.
**Delivers:** Sync confidence score display, visual waveform overlay, reference file selection, batch ZIP download, manual offset adjustment, file size/duration validation and warnings, user-friendly error messages.
**Uses:** Canvas API (waveforms), client-zip (ZIP bundle).
**Implements:** Results Display enhancements, validation and error handling, UX polish.
**Avoids:** UX pitfalls (no progress indication, no size warnings, technical error messages). ZIP memory issues (offer only when total output < 500MB).

### Phase Ordering Rationale

- **Phases 1-3 are strictly sequential** due to hard technical dependencies: COOP/COEP headers -> FFmpeg Worker -> audio extraction -> correlation -> trimming -> download. There is no way to parallelize these phases.
- **Phase 1 before Phase 2** because COOP/COEP validation on Cloudflare Pages must happen before any FFmpeg code is written. This is a 30-minute spike that prevents days of debugging.
- **Phase 2 before Phase 3** because the correlation algorithm is the highest-risk component. If cross-correlation does not produce accurate offsets, the trimming and download phases are worthless. Validate the algorithm with real multi-cam test footage before building the output pipeline.
- **Phase 4 is independent** and can be worked on incrementally. Each differentiator feature (confidence score, waveforms, ZIP download) is self-contained and can ship separately.
- **Memory management patterns must be established in Phase 1** and maintained throughout. The sequential-processing-with-cleanup pattern from ARCHITECTURE.md is not optional -- it is a structural requirement.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (Audio Extraction + Sync Algorithm):** This is the highest-risk phase. The cross-correlation algorithm choice (SynAudio vs fft.js vs custom), audio extraction parameters (sample rate, duration limit), and correlation validation thresholds all need careful evaluation with real test data. The ARCHITECTURE.md references SynAudio (Pearson correlation with WASM SIMD) while STACK.md recommends fft.js -- this discrepancy needs resolution. SynAudio appears to be the better choice (purpose-built for audio sync, handles its own worker pool) but needs validation.
- **Phase 3 (Video Trimming):** Stream-copy trimming has a known caveat -- trim points snap to the nearest keyframe, which can be up to 0.5s off for some codecs. Need to research keyframe detection and whether a hybrid approach (stream copy with re-encode of first GOP) is feasible.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Foundation):** Vite + React + Tailwind + Cloudflare Pages is thoroughly documented. COOP/COEP header configuration is well-documented. FFmpeg WASM loading follows official examples.
- **Phase 4 (Polish):** Waveform rendering, ZIP generation, and UI enhancements follow standard web development patterns.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All technologies verified against official sources with current version numbers. Vite 7, React 19, FFmpeg WASM 0.12.x are mature and well-documented. |
| Features | HIGH | Feature landscape validated against 5+ competitors (PluralEyes, Syncaila, Tentacle Sync Studio, SyncSink.wasm, DaVinci Resolve). Clear MVP definition with justified prioritization. |
| Architecture | HIGH | Pipeline pattern is standard for media processing tools. Architecture verified against ffmpeg.wasm official docs, SyncSink reference implementation, and multiple community sources. |
| Pitfalls | HIGH | Every pitfall sourced from official GitHub issues, MDN documentation, or verified browser bug reports. Memory limits, COOP/COEP requirements, and performance benchmarks are well-documented. |

**Overall confidence:** HIGH

### Gaps to Address

- **SynAudio vs fft.js decision:** ARCHITECTURE.md recommends SynAudio (WASM SIMD, handles its own workers), while STACK.md recommends fft.js (pure JS, simpler). SynAudio appears more capable but is a niche library with less community validation. Resolve during Phase 2 planning by testing both with real multi-cam audio.
- **Keyframe alignment precision:** Stream-copy trimming snaps to keyframes. The gap between the ideal trim point and the nearest keyframe varies by codec and GOP size (0.03s to 0.5s). Need to determine if this is acceptable for the target use case or if a hybrid approach is needed.
- **Maximum practical file size:** The 2GB MEMFS limit and ~4GB browser tab limit are documented, but the practical ceiling for "4 files processed sequentially with cleanup" needs empirical validation. Set conservative UI limits (200MB warning, 500MB reject) and adjust based on testing.
- **Clock drift severity:** Research acknowledges drift is a real issue for recordings over 30 minutes but defers it to v2+. If the target audience routinely records 30-60 minute sessions (common for podcasts), this gap may need earlier attention.
- **FFmpeg progress callback reliability:** The FFmpeg WASM progress event is documented as unreliable (can return NaN). Need a fallback progress estimation strategy (timer-based or step-based) for Phase 3.

## Sources

### Primary (HIGH confidence)
- [ffmpeg.wasm GitHub Repository](https://github.com/ffmpegwasm/ffmpeg.wasm) -- API, architecture, memory constraints
- [ffmpeg.wasm Official Documentation](https://ffmpegwasm.netlify.app/) -- installation, usage patterns, performance benchmarks
- [@ffmpeg/core-mt npm](https://www.npmjs.com/package/@ffmpeg/core-mt) -- v0.12.10, multi-threading requirements
- [MDN SharedArrayBuffer](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer) -- COOP/COEP requirements
- [MDN decodeAudioData](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData) -- memory behavior, limitations
- [Cloudflare Pages Headers](https://developers.cloudflare.com/pages/configuration/headers/) -- _headers file configuration
- [Vite Getting Started](https://vite.dev/guide/) -- v7.3.1, configuration
- [React v19](https://react.dev/blog/2024/12/05/react-19) -- current stable
- [Tailwind CSS v4](https://tailwindcss.com/blog/tailwindcss-v4) -- Vite plugin, configuration
- [FFmpeg WASM GitHub Issues: Memory](https://github.com/ffmpegwasm/ffmpeg.wasm/issues/200) -- OOM patterns
- [FFmpeg WASM Performance Docs](https://ffmpegwasm.netlify.app/docs/performance/) -- 12-25x slower benchmarks

### Secondary (MEDIUM confidence)
- [SynAudio Library](https://github.com/eshaz/synaudio) -- WASM SIMD correlation engine
- [fft.js GitHub](https://github.com/indutny/fft.js/) -- pure-JS FFT, benchmarks
- [client-zip GitHub](https://github.com/Touffy/client-zip) -- streaming ZIP generation, performance claims
- [SyncSink.wasm](https://github.com/JorenSix/SyncSink.wasm) -- browser-based sync prior art
- [ffmpeg.wasm DeepWiki](https://deepwiki.com/ffmpegwasm/ffmpeg.wasm) -- architecture synthesis
- [Audio cross-correlation research](https://www.researchgate.net/publication/263925127_Fast_second_screen_TV_synchronization_combining_audio_fingerprint_technique_and_generalized_cross_correlation) -- algorithm approach

### Tertiary (LOW confidence)
- [AudioAlign Synchronization Tool](https://github.com/protyposis/AudioAlign) -- Windows desktop reference, different domain but similar algorithm

---
*Research completed: 2026-03-01*
*Ready for roadmap: yes*
