# Pitfalls Research

**Domain:** Browser-based multi-cam video sync (FFmpeg WASM + audio cross-correlation)
**Researched:** 2026-03-01
**Confidence:** HIGH (verified across official docs, GitHub issues, and multiple community sources)

## Critical Pitfalls

### Pitfall 1: MEMFS Double-Buffering Blows Through Browser Memory

**What goes wrong:**
FFmpeg WASM uses an in-memory virtual filesystem (MEMFS). When you load a video file into the browser (via File API), you hold it in JS memory as an ArrayBuffer. Then you write it to MEMFS with `ffmpeg.writeFile()`, creating a second copy. During processing, FFmpeg allocates additional working memory and produces output files -- also in MEMFS. For a single 500MB video, you easily consume 1.5-2GB of RAM. With 4 videos, you are at 6-8GB before the cross-correlation even starts.

The hard ceiling: FFmpeg WASM's virtual filesystem has a **2GB file size limit** per file (WebAssembly 32-bit address space). Browser tabs in Chrome typically crash around 4GB total memory usage, though this varies by OS and available RAM.

**Why it happens:**
Developers think in terms of "the file is 500MB, so I need 500MB." They forget: (1) JS ArrayBuffer holding the file, (2) MEMFS copy, (3) FFmpeg working memory during decode/encode, (4) output file in MEMFS, (5) JS ArrayBuffer when reading output back. That is 3-5x the source file size in simultaneous memory usage.

**How to avoid:**
- Process files sequentially, not in parallel. Load one video, extract its audio, read the output, then `ffmpeg.deleteFile()` and `ffmpeg.terminate()` before processing the next.
- Extract audio only (small PCM/WAV output) before doing any video trimming. Audio extraction is the lightweight step; defer the expensive video trim until sync offsets are known.
- Delete source files from MEMFS immediately after processing: `ffmpeg.deleteFile('input.mp4')` before reading output.
- Set explicit file size limits in the UI (warn at 200MB per file, reject above 500MB) with clear messaging about browser constraints.
- Consider using the single-threaded FFmpeg core (`@ffmpeg/core` not `@ffmpeg/core-mt`) to reduce baseline memory overhead.

**Warning signs:**
- Browser tab becomes unresponsive during file loading.
- `RuntimeError: memory access out of bounds` in console.
- Chrome's Task Manager shows tab memory exceeding 2GB.
- Processing silently fails with no error (WASM OOM can kill the worker without surfacing an error to the main thread).

**Phase to address:**
Phase 1 (Foundation/Core Architecture). The file handling pipeline and memory management strategy must be designed correctly from the start. Retrofitting sequential processing onto a parallel architecture is a rewrite.

---

### Pitfall 2: SharedArrayBuffer / Cross-Origin Isolation Misconfiguration

**What goes wrong:**
FFmpeg WASM's multi-threaded version (`@ffmpeg/core-mt`) requires `SharedArrayBuffer`, which browsers only expose in cross-origin isolated contexts. Without the correct HTTP headers, `SharedArrayBuffer` is `undefined`, and ffmpeg.load() fails silently or throws a cryptic error. Even the single-threaded version benefits from running in a Web Worker, which can also be affected by CORS policies.

On Cloudflare Pages, you must configure a `_headers` file in the static asset output directory. If this file is missing, misconfigured, or placed in the wrong directory, the headers are not applied and nothing works.

**Why it happens:**
- Developers get it working in `localhost` dev servers (which some frameworks auto-configure) and assume production will work the same.
- The `_headers` file must be in the build output directory (e.g., `dist/`), not the project root. Build tools can silently exclude it.
- Setting `Cross-Origin-Embedder-Policy: require-corp` breaks loading of third-party resources (fonts, analytics, CDN scripts) that do not set `Cross-Origin-Resource-Policy` headers. This causes mysterious blank pages or broken assets.
- Hot module replacement (HMR) in development does not re-apply header changes; you must fully restart the dev server.

**How to avoid:**
- Create a `_headers` file with exact content:
  ```
  /*
    Cross-Origin-Embedder-Policy: require-corp
    Cross-Origin-Opener-Policy: same-origin
  ```
- Ensure build tooling copies `_headers` to the output directory. In Vite, place it in `public/`. Verify post-build with `ls dist/_headers`.
- Test in a production-like environment early (deploy to Cloudflare Pages on day 1, not after weeks of localhost development).
- Verify headers in browser DevTools: Network tab -> select document -> check Response Headers.
- Avoid loading any third-party resources from external CDNs, or add `crossorigin` attributes and ensure those CDNs set `Cross-Origin-Resource-Policy: cross-origin`. Self-host everything (fonts, scripts) if possible.
- Use `coi-serviceworker` as a fallback for environments that cannot set headers, but be aware it requires a page reload on first visit and does not work in all browsers.

**Warning signs:**
- `SharedArrayBuffer is not defined` in console.
- FFmpeg loads but immediately errors on `.exec()`.
- Third-party fonts/scripts suddenly stop loading after adding COEP headers.
- Works on localhost but breaks in production deployment.

**Phase to address:**
Phase 1 (Foundation). This must be validated on Cloudflare Pages before any FFmpeg integration work begins. A 30-minute spike to deploy a skeleton with the headers and verify `SharedArrayBuffer` availability saves days of debugging later.

---

### Pitfall 3: Audio Cross-Correlation Accuracy Failures

**What goes wrong:**
Cross-correlation assumes the audio signals share a common acoustic event recorded by different microphones. Several real-world conditions break this assumption:

1. **Sample rate mismatch:** Camera A records at 48kHz, Camera B at 44.1kHz. Cross-correlation on raw samples produces garbage offsets because the time grids do not align.
2. **Clock drift:** Consumer cameras have imprecise internal clocks. Over a 30-minute recording, cameras can drift 1-5 frames apart. Cross-correlation finds the best single offset, but the videos gradually desynchronize. This is not solvable by simple trimming.
3. **Low signal-to-noise ratio:** If the room is quiet or one camera is far from the sound source, cross-correlation may lock onto noise or HVAC hum rather than the actual shared audio event.
4. **Phase inversion:** Some microphone setups produce inverted phase. Standard cross-correlation finds the wrong peak (negative correlation maximum vs. positive).

**Why it happens:**
Developers test with clean, short clips from the same device and assume that represents real-world input. Real multi-cam shoots use different camera brands, different rooms, different mic distances, and run for 30-90 minutes.

**How to avoid:**
- **Always resample all audio to a common sample rate** (e.g., 16kHz mono) before cross-correlation. Use FFmpeg to extract: `ffmpeg -i input.mp4 -ar 16000 -ac 1 -f wav output.wav`. Lower sample rates also dramatically reduce cross-correlation computation time.
- **Use FFT-based cross-correlation** (multiply spectra) rather than naive time-domain correlation. Time-domain is O(n^2); FFT-based is O(n log n). For a 30-minute audio at 16kHz that is ~28M samples -- naive correlation is computationally infeasible in a browser.
- **Validate the correlation peak:** Check that the peak correlation coefficient exceeds a minimum threshold (e.g., 0.3). If it does not, warn the user that sync confidence is low rather than silently producing a bad offset.
- **Use a subset of audio for correlation:** Correlate the first 30-60 seconds of audio (where a clap or speech onset likely exists) rather than the entire file. This reduces memory and computation by 30-60x.
- **Handle clock drift in documentation, not code (for MVP):** Acknowledge that drift over long recordings is a known limitation. Solving drift requires time-stretching or segmented re-sync, which is out of scope for a trim-and-align tool.

**Warning signs:**
- Sync results look correct for short test clips but fail for real-world recordings.
- Computed offsets are wildly different from expected (e.g., minutes instead of seconds).
- Two runs on the same files produce different offsets (noise sensitivity).
- Users report that videos start in sync but gradually diverge.

**Phase to address:**
Phase 2 (Audio Extraction + Sync Algorithm). This is the algorithmic core. Build it with test fixtures from real multi-cam shoots (different cameras, different sample rates, noisy environments). Do not test only with synthetic data.

---

### Pitfall 4: FFmpeg WASM Performance is 12-25x Slower Than Native

**What goes wrong:**
Developers prototype with short clips (10-30 seconds) and find acceptable performance. Then a real user loads four 10-minute 1080p videos and the trim operation takes 20-40 minutes. The browser shows "Page Unresponsive" dialogs. Users close the tab thinking the app is broken.

Official benchmarks: a WebM-to-MP4 conversion that takes 5.2s natively takes **128.8s in single-threaded WASM** (25x slower) or **60.4s in multi-threaded WASM** (12x slower). Video re-encoding is the bottleneck. Audio extraction (codec copy) is significantly faster because it avoids re-encoding.

**Why it happens:**
FFmpeg WASM is transpiled C code running in a sandboxed WASM VM without access to hardware acceleration (GPU, SIMD optimizations, etc.). The performance gap is inherent and cannot be optimized away at the application level.

**How to avoid:**
- **Use `-c copy` (stream copy) for trimming** wherever possible. Stream copy remuxes without re-encoding and runs at near-native speed. Instead of: `ffmpeg -i input.mp4 -ss 5.0 output.mp4` (which re-encodes), use: `ffmpeg -ss 5.0 -i input.mp4 -c copy output.mp4` (stream copy, near-instant).
- **Extract audio using codec copy first:** `ffmpeg -i input.mp4 -vn -acodec copy audio.aac` avoids re-encoding audio entirely.
- **Place `-ss` before `-i` for fast seeking** in stream copy mode. Placing it after `-i` forces FFmpeg to decode all frames up to the seek point.
- **Run all FFmpeg operations in a Web Worker** to keep the main thread responsive. FFmpeg WASM does this by default in newer versions, but verify.
- **Show accurate, granular progress feedback.** FFmpeg WASM supports a progress callback (`ffmpeg.on('progress', ...)`) but it is experimental and can return `NaN`. Implement a fallback timer-based progress estimation.
- **Set user expectations:** Show estimated processing time before starting (based on file sizes and a rough heuristic). "Processing 4 videos (~2GB total) -- estimated 5-10 minutes."

**Warning signs:**
- Processing takes more than 2x the expected time.
- Progress bar stalls at 0% for extended periods (FFmpeg progress reporting is unreliable).
- User closes tab or navigates away during processing.
- "Page Unresponsive" browser dialog appears.

**Phase to address:**
Phase 2 (Video Trimming) and Phase 3 (UX/Polish). The technical optimization (stream copy) belongs in the trimming phase. The UX treatment (progress, time estimates, "do not close tab" warnings) belongs in polish.

---

### Pitfall 5: decodeAudioData Memory Explosion for Audio Analysis

**What goes wrong:**
If you use the Web Audio API's `decodeAudioData()` to decode audio for cross-correlation, it decodes the entire compressed audio file into uncompressed 32-bit float PCM in memory. A 5MB compressed audio file becomes ~55MB of PCM data. A 60-minute stereo file at 44.1kHz/32-bit requires **1.2GB of memory** -- for one file. With 4 videos, you need 4-5GB just for decoded audio buffers, on top of the source files and FFmpeg memory.

Worse, `decodeAudioData()` can cause **hard browser crashes** (not graceful errors) when memory is low. The browser crashes to desktop with no recovery possible.

**Why it happens:**
`decodeAudioData()` is designed for short audio clips (sound effects, music tracks), not for analyzing long-form recordings. There is no streaming alternative in the Web Audio API -- it is all-or-nothing.

**How to avoid:**
- **Do NOT use decodeAudioData for long audio files.** Instead, use FFmpeg WASM to extract audio as low-sample-rate mono WAV (e.g., `ffmpeg -i input.mp4 -ar 8000 -ac 1 -t 60 output.wav`). This produces a small, manageable PCM file.
- `-ar 8000` downsamples to 8kHz (sufficient for cross-correlation -- you need timing, not fidelity).
- `-ac 1` converts to mono (halves the data).
- `-t 60` limits extraction to the first 60 seconds (cross-correlation only needs a representative segment).
- A 60-second, 8kHz, mono, 16-bit WAV file is only **960KB** -- manageable even with 4 files.
- Parse the WAV file header manually to read raw PCM samples as a typed array (Float32Array). This avoids the Web Audio API decode path entirely.

**Warning signs:**
- Browser crashes (not just errors -- full crash) during audio analysis.
- Memory usage spikes dramatically when audio processing begins.
- Processing works for short test clips but fails for real-world recordings.

**Phase to address:**
Phase 2 (Audio Extraction). The extraction command parameters are the critical decision. Get this wrong and the entire sync pipeline is memory-bound.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Loading all files into memory simultaneously | Simpler code, no sequencing logic | Memory crashes with 3-4 large files | Never for production; OK for initial prototype with 2 small files |
| Using `decodeAudioData` instead of FFmpeg-extracted PCM | Fewer dependencies, Web-native | Memory explosion on real files, hard crashes | Never -- use FFmpeg extraction from day 1 |
| Skipping `-c copy` for video trimming (re-encoding instead) | Works with any seek point, simpler FFmpeg command | 25x slower processing, users abandon the tool | Only when keyframe-accurate trimming is required and codec copy produces visual glitches |
| Hardcoding sample rate assumptions (e.g., all 48kHz) | Simpler correlation code | Breaks with 44.1kHz sources, produces wrong offsets | Never -- always resample to common rate |
| Bundling `@ffmpeg/core-mt` without single-thread fallback | Better performance for supported browsers | App is broken in Safari on iOS, older browsers | Never -- always detect and fall back |
| Using JSZip to zip all output files in memory | Simple API, clean user experience | Memory explosion: zip requires holding all output files in memory simultaneously | Only if total output < 500MB; otherwise offer individual downloads |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| FFmpeg WASM loading | Bundling the WASM core with your app bundle (bloats initial load to 25MB+) | Load `@ffmpeg/core` from CDN or lazy-load on first use. Self-host the WASM files if COEP blocks CDN loading. The core is ~25MB and should not be in the critical path. |
| Cloudflare Pages `_headers` | Placing `_headers` in project root instead of build output dir | Place in `public/` (Vite) or equivalent static dir. Verify it exists in `dist/` after build. Test with `curl -I` on deployed URL. |
| FFmpeg WASM + Vite | Vite's dev server does not set COOP/COEP headers by default | Use `vite-plugin-cross-origin-isolation` or configure `server.headers` in `vite.config.ts`. Headers require full server restart (not HMR) to take effect. |
| Web Worker + FFmpeg WASM | Trying to share FFmpeg instance between main thread and worker, or creating multiple FFmpeg instances | One FFmpeg instance per worker. One worker for the lifetime of the app. Communicate via `postMessage`. Terminate and re-create only if memory must be freed. |
| File API + FFmpeg WASM | Using `FileReader.readAsArrayBuffer()` which loads entire file into main thread memory before passing to worker | Use `file.arrayBuffer()` (returns Promise, same memory cost but cleaner). Better: if FFmpeg WASM supports it, pass the File object and let the worker read it. |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Naive time-domain cross-correlation O(n^2) | Correlation step takes minutes or hangs for 30+ minute recordings | Use FFT-based cross-correlation. At 16kHz mono, 60 seconds = 960K samples; FFT correlation completes in <1 second. 30 minutes = 28M samples; naive correlation is infeasible. | Audio segments longer than ~60 seconds at 16kHz |
| Re-encoding video during trim | Trimming 4 videos takes 20-40 minutes | Use `-c copy` with `-ss` before `-i`. Stream copy is 100-1000x faster than re-encoding. | Any file over 30 seconds |
| Loading WASM core on page load | 25MB download before user can interact, 5+ second load on fast connections | Lazy-load FFmpeg WASM only when user drops files. Show the UI immediately, load FFmpeg in background or on-demand. | Always -- 25MB blocking load is unacceptable |
| Full-resolution audio for correlation | 48kHz stereo = 384KB/sec = 23MB/min per file. Four 10-min files = 920MB just for audio buffers | Downsample to 8-16kHz mono. 8kHz mono = 16KB/sec = 960KB/min. Four 10-min files = 38MB. | Files longer than 2-3 minutes |
| Generating zip of all output files | 4x 500MB trimmed videos = 2GB in memory for the zip (compressed video files barely shrink with zip) | Offer individual file downloads. Only zip if total output < 200MB. Use `StreamSaver.js` or `showSaveFilePicker()` for streaming large downloads without memory buffering. | Total output exceeds ~500MB |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Not validating file types before FFmpeg processing | Malicious files could trigger FFmpeg WASM vulnerabilities or cause unexpected behavior | Check file MIME types and extensions before processing. Accept only known video containers (mp4, mov, avi, mkv, webm). Validate with magic bytes, not just extension. |
| Missing Content-Security-Policy | XSS vulnerabilities, especially if showing user filenames in the UI | Add `Content-Security-Policy` header. At minimum: `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'`. The `wasm-unsafe-eval` directive is required for WASM execution. |
| Exposing FFmpeg error output to users | FFmpeg error messages can leak file metadata, system paths | Catch FFmpeg errors, log internally, show generic "Processing failed" message to user. |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No progress indication during processing | Users think the app is frozen, close the tab, lose all progress | Show step-by-step progress: "Extracting audio (1/4)...", "Analyzing sync...", "Trimming video (3/4)...". Use FFmpeg's progress callback where available; fall back to step-based indicators. |
| No "do not close tab" warning | Users navigate away during 5-minute processing, lose everything | Add `beforeunload` event listener during processing. Show prominent "Processing in progress -- do not close this tab" banner. |
| Showing only technical error messages | "RuntimeError: memory access out of bounds" means nothing to a user | Catch WASM/FFmpeg errors and translate: "Your files are too large for browser processing. Try shorter videos or fewer files." |
| Forcing users to wait for all files before starting | User drops 4 files, waits for all to "upload" (actually just read into memory) before anything happens | Start audio extraction on each file as soon as it is dropped. Pipeline: extract audio from file 1 while user is still dropping files 2-4. |
| Auto-downloading a zip without asking | Large unexpected download, browser may block it, user has no control | Show results with per-file download buttons. Offer "Download All as ZIP" as an optional action. Let the user choose. |
| No file size/duration warnings | User drops a 4GB file, processing starts, eventually crashes 10 minutes later | Validate files immediately on drop. Show warnings for large files. Reject files over the practical limit with a clear explanation. |

## "Looks Done But Isn't" Checklist

- [ ] **Audio extraction:** Often missing sample rate normalization -- verify all audio is resampled to the same rate before cross-correlation
- [ ] **Cross-correlation:** Often missing correlation confidence check -- verify the peak correlation exceeds a minimum threshold and warn user if sync confidence is low
- [ ] **Video trimming:** Often missing keyframe alignment -- verify that `-c copy` trimming does not produce black frames or glitches at the start (common when trim point is not on a keyframe)
- [ ] **File download:** Often missing blob URL cleanup -- verify `URL.revokeObjectURL()` is called after download to prevent memory leaks
- [ ] **FFmpeg cleanup:** Often missing MEMFS cleanup -- verify `ffmpeg.deleteFile()` is called for every input and output file after reading results
- [ ] **Web Worker cleanup:** Often missing worker termination -- verify the FFmpeg worker is properly terminated when processing is complete to free memory
- [ ] **Progress reporting:** Often missing error state handling -- verify that processing failures show a clear error, not a stuck progress bar
- [ ] **Mobile browsers:** Often missing SharedArrayBuffer detection -- verify the app shows a clear "unsupported browser" message rather than silently failing on Safari iOS or older browsers
- [ ] **COEP header side effects:** Often missing verification that self-hosted assets still load -- verify fonts, images, and scripts load correctly after enabling cross-origin isolation

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Memory crash during processing | LOW | User refreshes page and retries with fewer/smaller files. App state is lost but no data corruption. Add guidance to retry with fewer files. |
| Wrong sync offsets from sample rate mismatch | MEDIUM | Add sample rate detection and resampling. Requires modifying the audio extraction FFmpeg command, re-testing correlation. |
| COEP headers break third-party resources | LOW | Self-host all resources. Remove external CDN dependencies. Takes 1-2 hours to identify and fix. |
| Video trim produces corrupted start frames | MEDIUM | Switch from `-c copy` to re-encoding for the first few frames, or adjust seek point to nearest keyframe. Requires understanding container/codec keyframe structure. |
| Naive O(n^2) correlation is too slow for real files | HIGH | Requires rewriting correlation algorithm to use FFT. Not a simple fix -- need FFT library (e.g., `fft.js`) and understanding of spectral cross-correlation. Design it right from the start. |
| JSZip OOM on large output | LOW | Replace zip-all with individual downloads. 30-minute change. |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| MEMFS double-buffering memory explosion | Phase 1: Core Architecture | Test with 4x 200MB files on a machine with 8GB RAM. Measure peak memory in Chrome Task Manager. |
| COOP/COEP misconfiguration | Phase 1: Foundation | Deploy skeleton to Cloudflare Pages. Verify `crossOriginIsolated === true` in browser console. Check that no resources are blocked. |
| Audio cross-correlation accuracy | Phase 2: Sync Algorithm | Test with: (1) same-camera audio, (2) different cameras/sample rates, (3) quiet room, (4) 30+ minute recordings. Verify offset within 1 frame of expected. |
| FFmpeg WASM performance (25x slower) | Phase 2: Video Trimming | Verify `-c copy` is used for trimming. Time the trim operation on a 10-minute file -- should be seconds, not minutes. |
| decodeAudioData memory explosion | Phase 2: Audio Extraction | Verify audio is extracted via FFmpeg (not Web Audio API). Check extracted WAV file size matches expected (~960KB for 60s at 8kHz mono). |
| Progress and UX feedback | Phase 3: Polish | User-test with non-technical person. They should understand what the app is doing at every step. No "is it frozen?" moments. |
| Zip download memory issues | Phase 3: Download/Export | Test downloading 4x 300MB trimmed videos. Verify memory does not spike above baseline + total file size. |
| Browser compatibility / fallback | Phase 3: Polish | Test in Chrome, Firefox, Edge, Safari. Verify graceful degradation message in browsers without SharedArrayBuffer. |

## Sources

- [FFmpeg WASM GitHub Issues: Memory](https://github.com/ffmpegwasm/ffmpeg.wasm/issues/200) - ERR_OUT_OF_MEMORY with multiple instances (HIGH confidence)
- [FFmpeg WASM GitHub Issues: Memory Access Out of Bounds](https://github.com/ffmpegwasm/ffmpeg.wasm/issues/704) - Processing many files (HIGH confidence)
- [FFmpeg WASM Performance Docs](https://ffmpegwasm.netlify.app/docs/performance/) - Official benchmarks showing 12-25x slower than native (HIGH confidence)
- [FFmpeg WASM GitHub: MEMFS File Size Limits](https://github.com/ffmpegwasm/ffmpeg.wasm/discussions/755) - 2GB limit discussion (HIGH confidence)
- [FFmpeg WASM GitHub: Large Files](https://github.com/ffmpegwasm/ffmpeg.wasm/issues/8) - Handling large files discussion (HIGH confidence)
- [Cloudflare Pages Headers Docs](https://developers.cloudflare.com/pages/configuration/headers/) - Official _headers file configuration (HIGH confidence)
- [MDN: SharedArrayBuffer](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer) - Cross-origin isolation requirements (HIGH confidence)
- [MDN: decodeAudioData](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData) - Full decode into memory behavior (HIGH confidence)
- [Chromium Bug: decodeAudioData Memory](https://bugs.chromium.org/p/chromium/issues/detail?id=447580) - Memory issues with large files (HIGH confidence)
- [Mozilla Bug: decodeAudioData OOM Crash](https://bugzilla.mozilla.org/show_bug.cgi?id=1066036) - Hard browser crash on OOM (HIGH confidence)
- [JSZip Limitations](https://stuk.github.io/jszip/documentation/limitations.html) - Memory and size constraints (HIGH confidence)
- [FFmpeg WASM Multi-threading Docs](https://deepwiki.com/ffmpegwasm/ffmpeg.wasm/4.4-multi-threading) - SharedArrayBuffer requirement for multi-thread (MEDIUM confidence)
- [COOP/COEP on Static Hosting](https://blog.tomayac.com/2025/03/08/setting-coop-coep-headers-on-static-hosting-like-github-pages/) - Practical header setup guide (MEDIUM confidence)
- [FFmpeg WASM Progress Reporting Issue](https://github.com/ffmpegwasm/ffmpeg.wasm/issues/49) - Progress ratio unreliable/NaN (HIGH confidence)
- [Blackmagic Forum: Multicam Drift](https://forum.blackmagicdesign.com/viewtopic.php?f=21&t=79835) - Clock drift in multi-cam setups (MEDIUM confidence)
- [DSP Related: FFT Delay Estimation](https://www.dsprelated.com/showarticle/26.php) - FFT-based cross-correlation algorithm (MEDIUM confidence)
- [ResearchGate: Synchronizing Different Sample Rates](https://www.researchgate.net/post/How_to_synchronise_two_signal_with_different_sampling_frequency) - Must resample before correlation (MEDIUM confidence)

---
*Pitfalls research for: Browser-based multi-cam video sync tool*
*Researched: 2026-03-01*
