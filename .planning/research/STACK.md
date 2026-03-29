# Technology Stack

**Project:** Sync Multi-Cam -- v2.3 Robust Audio Sync (Spectral Cross-Correlation)
**Researched:** 2026-03-28
**Confidence:** HIGH (core algorithm approach and library choice), MEDIUM (confidence scoring calibration)

---

## Context: What the Existing Stack Already Covers

The following are already in place and do NOT need to change for v2.3:

| Capability | Covered By |
|------------|-----------|
| Audio extraction (mono 16kHz PCM WAV) | @ffmpeg/ffmpeg ^0.12.15 via `audioExtractor.ts` |
| Build, bundling, dev server | Vite ^7.3.1 (module Workers supported) |
| UI components and state | React ^19.2.0 + TypeScript ~5.9.3 |
| Styling | Tailwind CSS ^4.2.1 |
| Export pipeline | WebCodecs + mediabunny ^1.35.1 |
| Audio mixing | Web Audio API GainNode graph |
| Container operations | mp4box ^2.3.0 |
| COOP/COEP headers (SharedArrayBuffer/WASM SIMD) | Cloudflare Pages _headers + vite.config.ts |

**What IS changing:** `synaudio ^0.4.0` (Pearson correlation on raw waveforms) is being replaced with a custom GCC-PHAT spectral cross-correlation engine.

---

## Why Replace SynAudio

SynAudio uses the **Pearson correlation coefficient** on raw time-domain audio samples -- a waveform-matching approach that compares amplitude values sample-by-sample. Its weaknesses for multi-camera sync:

1. **Sensitive to frequency response differences** -- Different microphones (phone vs. DSLR vs. lav) produce different spectral profiles for the same sound event. Pearson correlation on raw samples sees these as "different signals."
2. **Fooled by repetitive content** -- Music with repeating beats produces multiple high-correlation peaks at beat intervals, not just the true sync point.
3. **Weak with reverb/room acoustics** -- Different distances from a sound source cause different reverb characteristics that alter the raw waveform shape.
4. **Confidence scores are misleading** -- A Pearson coefficient of 0.6 on raw waveforms might mean "good sync, different mics" or "bad sync, similar mics." There is no way to distinguish.

**Frequency-domain processing (GCC-PHAT) solves these problems** by normalizing magnitude and retaining only phase information. Two recordings of the same concert from different positions will have very different waveforms but identical phase relationships at the correct time delay.

---

## Recommended Stack Addition for v2.3

### Core: FFT Library

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **fft.js** | ^4.0.4 | Fast Fourier Transform (forward and inverse) for GCC-PHAT | Pure JS, zero dependencies, 5 KB minified, MIT license. Radix-4/Radix-2 implementation -- the fastest pure-JS FFT available. Works in Web Workers without any configuration (no WASM instantiation, no SharedArrayBuffer requirements beyond what we already have). 44 dependents on npm including major audio libraries. For our use case (one large FFT per audio pair for cross-correlation), pure JS performance is adequate -- the FFT is not the bottleneck. | HIGH |

**This is the only new npm dependency for v2.3.**

### Why fft.js Over Alternatives

| Alternative | Why Not |
|-------------|---------|
| KissFFT WASM (kissfft-js, PulseFFT) | WASM adds complexity: async instantiation, memory management, data copying overhead between JS and WASM linear memory. At our FFT sizes (millions of points, done once per pair), the WASM copying overhead is significant. We already have FFmpeg WASM -- adding another WASM module increases bundle size and complexity for marginal speed gain on a non-bottleneck operation. fft.js is only ~1.5x slower at large sizes in Chrome, and performs comparably or faster in Firefox. |
| WebFFT (metalibrary) | Pulls in multiple FFT implementations (~50+ KB), auto-benchmarks them at runtime. Overkill -- we need one FFT implementation for one algorithm. The v0.1.58 release (Jan 2024) had community concerns about memory management in heap-allocated objects. |
| pffft.wasm | Window size capped at 4096 samples. GCC-PHAT needs FFT size equal to next-power-of-2 of the combined signal lengths (potentially millions of points). The 4096 cap makes pffft.wasm unusable for our core algorithm. |
| essentia.js | Full music analysis framework (1.2 MB WASM binary). Includes hundreds of algorithms we never use. Last npm publish was 4+ years ago (v0.1.3). Overkill for a single cross-correlation algorithm. |
| Web Audio API AnalyserNode | Only works in real-time with AudioContext. Cannot process offline Float32Array buffers directly. Returns only magnitude (no phase information, no complex spectrum). Not suitable for GCC-PHAT which requires full complex FFT output. |

### Performance Evidence

From the [KISS FFT vs fft.js benchmark comparison](https://toughengineer.github.io/demo/dsp/fft-perf/):
- At small sizes (128-512): fft.js matches or beats WASM in Chrome
- At large sizes (8192+): KISS FFT zero-copy WASM is ~2-5x faster, but fft.js still achieves tens of thousands of transforms/second
- Key insight: "fft.js has great performance in Chrome" but performs "several times slower" in Firefox. KISS FFT WASM "provides better performance across browsers." However, for our use case we run ~3-6 FFTs per sync session (not thousands), so even the slower Firefox performance of fft.js completes in seconds.
- fft.js is 5 KB vs KISS FFT WASM at 55 KB -- 11x smaller footprint

---

## Algorithm: GCC-PHAT (Custom Implementation)

The algorithm itself is NOT a library -- it is ~150 lines of TypeScript built on top of fft.js. GCC-PHAT (Generalized Cross-Correlation with Phase Transform) is the standard algorithm for Time Delay of Arrival (TDOA) estimation in acoustics research.

### Why GCC-PHAT

| Property | Pearson (current) | GCC-PHAT (new) |
|----------|-------------------|----------------|
| Operates on | Raw waveform amplitudes | Phase information (magnitude normalized away) |
| Different mic responses | Confused (different spectral shape = low correlation) | Robust (magnitude differences normalized out) |
| Reverb/room effects | Confused (echo alters waveform shape) | Robust (phase weighting suppresses reverb peaks) |
| Repetitive content | Multiple equally-high peaks at beat intervals | Better peak discrimination (phase is more unique than amplitude for timing) |
| Precision | Sample-level | Sub-sample (via parabolic interpolation on peak) |
| Speed | Fast (WASM SIMD) | Comparable (3 FFTs per pair in JS) |

### Algorithm Steps

```
Input: reference PCM (Float32Array), comparison PCM (Float32Array)
Output: { offsetSamples: number, confidence: number }

1. Apply Hann window to both signals
2. Zero-pad both to fftSize = nextPowerOf2(len_ref + len_comp)
3. FFT(ref) and FFT(comp) using fft.js realTransform
4. Cross-power spectrum: G(f) = FFT(ref) * conj(FFT(comp))
5. Phase transform: W(f) = G(f) / |G(f)|  (normalize magnitude to 1)
6. IFFT(W) -> gcc_phat correlation function
7. Find peak within plausible offset range (+/- MAX_SYNC_OFFSET_SECONDS)
8. Compute confidence from peak-to-noise-floor ratio
```

This is approximately 150 lines of TypeScript total across 3 files (window functions, GCC-PHAT core, peak finding).

### Why NOT a Full Spectrogram Approach

The ARCHITECTURE.md for this milestone identifies full spectrogram computation (STFT with sliding windows + mel filterbank + spectrogram cross-correlation) as an **anti-pattern** for time-delay estimation:

- **Slower**: STFT requires thousands of small FFTs (one per hop); GCC-PHAT requires 3 large FFTs total
- **Less precise**: Spectrogram resolution is quantized to the hop size (~32ms); GCC-PHAT gives sub-sample precision (~62 microseconds at 16kHz)
- **More memory**: Full spectrogram for 5 minutes of audio is large; GCC-PHAT operates on the same PCM data already in memory
- **More code**: STFT + mel filterbank + spectrogram correlation is ~300 lines; GCC-PHAT core is ~150 lines

GCC-PHAT on the full signal is both faster and more accurate for finding a single time offset between two recordings of the same event.

### Confidence Scoring: Peak Sharpness

Replace `Math.abs(correlation) * 100` with peak-to-noise-floor ratio:

```typescript
// Peak of GCC-PHAT output vs. mean of correlation values (excluding peak neighborhood)
// Sharp spike = high confidence (unambiguous offset)
// Flat or multi-peaked = low confidence (ambiguous -- repetitive content or weak signal)
ratio = peakValue / meanNoiseFloor;
confidence = clamp((ratio - 2) / 13, 0, 1);  // Maps ratio 2-15 to 0-1
```

This produces interpretable scores: high confidence means "one clear peak," low confidence means "ambiguous -- multiple candidate offsets or no strong correlation."

---

## What NOT to Add

| Do Not Add | Why | What Handles It Instead |
|------------|-----|------------------------|
| essentia.js | 1.2 MB WASM binary. Hundreds of unused algorithms. Stale npm (4+ years). | ~150 lines of custom GCC-PHAT using fft.js |
| Chromaprint / AcoustID | Audio fingerprinting for music identification -- wrong problem. We need time-delay estimation, not content matching. No maintained browser WASM build. | GCC-PHAT cross-correlation |
| WebFFT | Metalibrary overkill. Multiple FFT implementations and runtime benchmarking. We need one algorithm run a handful of times. | fft.js (5 KB, proven) |
| TensorFlow.js | ML-based audio analysis is unnecessary. Classical DSP (GCC-PHAT) is the optimal solution for TDOA. TF.js adds 300+ KB and model files. | Custom DSP with fft.js |
| Superpowered Web Audio SDK | Commercial SDK for real-time audio effects. Wrong domain -- we need offline analysis. | Custom analysis pipeline |
| KissFFT WASM variants | Additional WASM module. Marginal speed gain does not justify complexity for ~3 FFTs per sync pair. Removing SynAudio WASM and not adding new WASM reduces project complexity. | fft.js (pure JS, zero overhead) |
| Meyda | Feature extraction library. We do not need MFCC, spectral centroid, or other features. GCC-PHAT operates directly on raw PCM -- no feature extraction step needed. | Direct PCM processing |
| Full STFT / mel spectrogram pipeline | Slower, less precise, more code than direct GCC-PHAT for time-delay estimation. An anti-pattern for this specific problem. | Single full-signal GCC-PHAT |

---

## Integration Points with Existing Code

### What Changes

| File | Change | Scope |
|------|--------|-------|
| `src/lib/audioSync.ts` | Replace SynAudio calls with new GCC-PHAT engine | Rewrite internals of `syncAudioTracks()`. **Same function signature and return type preserved.** |
| `src/lib/constants.ts` | Add GCC-PHAT parameters, remove SynAudio-specific ones | Replace `CORRELATION_SAMPLE_SIZE` and `INITIAL_GRANULARITY` with `MAX_SYNC_OFFSET_SECONDS` and `GCC_CONFIDENCE_THRESHOLD` |
| `package.json` | Remove `synaudio`, add `fft.js` | Net reduction in WASM footprint, bundle size decreases |

### What Does NOT Change

| File | Why Unchanged |
|------|---------------|
| `src/lib/audioExtractor.ts` | Still produces `AudioData { channelData: Float32Array[], samplesDecoded, sampleRate }` at 16kHz mono. GCC-PHAT consumes Float32Array identically. |
| `src/types/index.ts` | `SyncResult` interface unchanged: `{ fileId, fileName, offsetSeconds, offsetSamples, confidence, isReference }`. Confidence scoring changes internally but the 0-100 range is preserved. |
| `src/lib/audioSync.ts` (public API) | `syncAudioTracks()` signature unchanged: `(tracks, onProgress?) => Promise<SyncResult[]>`. All UI code sees no API change. |
| All UI components | Zero changes. Pipeline is fully encapsulated behind `syncAudioTracks()`. |
| `src/lib/waveformPeaks.ts` | Operates on raw PCM, independent of sync algorithm. |
| Export pipeline | Consumes `SyncResult[]` offsets. Unchanged. |

### New Files

| File | Purpose | Lines (est.) |
|------|---------|-------------|
| `src/lib/spectralSync.ts` | Main-thread API: creates worker, transfers buffers, returns Promise | ~60 |
| `src/lib/spectralSyncWorker.ts` | Web Worker: receives PCM, runs FFT + GCC-PHAT, posts result | ~80 |
| `src/lib/fftEngine.ts` | Pure math: Hann window, GCC-PHAT core, peak finding, confidence | ~120 |
| `src/lib/__tests__/fftEngine.test.ts` | Unit tests with synthetic signals at known offsets | ~100 |
| `src/lib/__tests__/spectralSync.test.ts` | Integration tests for worker-based sync | ~60 |

**Total new code: ~420 lines** (including tests). This replaces the SynAudio WASM dependency entirely.

---

## Installation

```bash
# Add new FFT library
npm install fft.js

# Remove old correlation library
npm uninstall synaudio
```

Net dependency change: **-1 WASM module (~50+ KB), +1 pure JS library (~5 KB)**. Bundle size decreases.

**TypeScript types:** fft.js does not ship TypeScript declarations. A small `.d.ts` file is needed:

```typescript
// src/types/fft.js.d.ts
declare module 'fft.js' {
  export default class FFT {
    constructor(size: number);
    size: number;
    createComplexArray(): Float32Array;
    toComplexArray(input: Float32Array, storage?: Float32Array): Float32Array;
    fromComplexArray(complex: Float32Array, storage?: Float32Array): Float32Array;
    realTransform(output: Float32Array, input: Float32Array): void;
    completeSpectrum(spectrum: Float32Array): void;
    transform(output: Float32Array, input: Float32Array): void;
    inverseTransform(output: Float32Array, input: Float32Array): void;
  }
}
```

---

## Key Parameters

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Sample rate | 16000 Hz (existing) | Adequate for sync. Captures up to 8kHz (Nyquist), covering all transients and percussive content. No change needed. |
| FFT size | nextPowerOf2(ref.length + comp.length) | Must accommodate both signals for linear (non-circular) cross-correlation. For two 5-minute clips: 2^23 = 8,388,608. |
| Window function | Hann | Standard for FFT-based cross-correlation. Smooth taper prevents spectral leakage at signal boundaries. |
| Max offset search | 300 seconds (5 minutes) | Maximum plausible start-time difference between cameras at same event. Limits peak search range. |
| Confidence threshold | 0.15 (GCC-PHAT peak sharpness) | Below this, sync is unreliable. Maps to ~25 on the 0-100 scale shown to users. |
| Epsilon for phase transform | 1e-10 | Prevents division by zero when |G(f)| is near-zero. Bins below epsilon are set to zero. |

---

## Web Worker Architecture

The project already uses Vite module Workers (`new Worker(new URL('./exportWorker.ts', import.meta.url), { type: 'module' })`). The same pattern applies here. fft.js is pure JavaScript with no DOM dependencies -- it imports cleanly in a module Worker.

### Worker Lifecycle

- **Create** when `syncAudioTracks()` is called
- **Init**: Send reference track, worker computes and caches reference FFT (computed once, reused for all comparisons)
- **Compare**: For each comparison track, send its PCM data, worker runs GCC-PHAT against cached reference FFT
- **Terminate** after all comparisons complete, freeing ~275 MB of FFT buffers

### Data Transfer

- **Reference buffer**: Must be **copied** before transfer (original needed for all comparisons; transfer detaches the buffer)
- **Comparison buffers**: Can be **transferred** (zero-copy) since each is used only once and peaks are already computed by the time sync runs

---

## Browser Requirements (v2.3 additions)

**No new browser requirements.** The spectral sync engine uses only:

- `Float32Array` -- universal
- `Web Worker` with `type: 'module'` -- Chrome 80+, Firefox 114+, Safari 15+ (already required by existing export Worker)
- Basic math operations -- universal

The removal of SynAudio actually **reduces** browser requirements by removing one WASM SIMD dependency. Browsers that support WASM but not WASM SIMD (some older mobile browsers) gain compatibility.

---

## Performance Estimates

### Per-Pair Timing (5-minute clips at 16kHz)

| Step | Estimated Time | Notes |
|------|---------------|-------|
| Hann window (2x) | ~5 ms | Simple multiply loop on 4.8M floats |
| Zero-pad to FFT size | ~2 ms | TypedArray allocation + copy |
| FFT reference | ~100-200 ms | 8M-point real FFT via fft.js |
| FFT comparison | ~100-200 ms | Same |
| Cross-power + phase transform | ~30 ms | Element-wise complex multiply + normalize |
| IFFT | ~100-200 ms | 8M-point inverse FFT |
| Peak finding | ~5 ms | Linear scan of constrained range |
| **Total per pair** | **~350-650 ms** | |

### Full Sync Session

| Scenario | Pairs | Estimated Total | Notes |
|----------|-------|----------------|-------|
| 2 cameras, 5 min | 1 | ~0.5-0.7 s | Reference FFT + 1 comparison |
| 4 cameras, 5 min | 3 | ~1.0-1.5 s | Reference FFT computed once, reused |
| 8 cameras, 5 min | 7 | ~2.5-4.0 s | |
| 30 cameras, 5 min | 29 | ~10-18 s | Dominated by comparison FFTs |

Comparable to current SynAudio performance. The trade-off is not speed -- it is **accuracy and robustness**. GCC-PHAT produces correct results in scenarios where Pearson correlation fails entirely.

### Memory Per Pair (in Web Worker)

| Data | Size | Notes |
|------|------|-------|
| Reference PCM | 19.2 MB | 5 * 60 * 16000 * 4 bytes |
| Comparison PCM | 19.2 MB | Same |
| Reference FFT (complex) | 67.1 MB | fftSize * 2 * 4 bytes |
| Cross-power spectrum | 67.1 MB | Same shape |
| Correlation output | 33.6 MB | fftSize * 4 bytes |
| **Peak worker memory** | **~275 MB** | All arrays simultaneously |

Feasible in a Web Worker. Reference FFT persists across comparisons (computed once). Sequential pair processing means only one comparison's buffers exist at a time.

---

## Alternatives Considered

| Recommended | Alternative | When Alternative Makes Sense |
|-------------|-------------|-------------------------------|
| fft.js (pure JS, 5 KB) | KissFFT WASM (55 KB) | Only if processing hours of audio where the ~2-5x WASM speed advantage matters. For 3-5 minute multi-cam recordings, pure JS is fast enough and dramatically simpler. |
| GCC-PHAT (single-stage) | Two-stage: mel spectrogram coarse + GCC-PHAT fine | If GCC-PHAT alone proves insufficient for extremely repetitive music content. The mel spectrogram layer adds a perceptual pre-filter. Reserve as enhancement if needed -- start simple. |
| GCC-PHAT (single-stage) | Meyda MFCC feature extraction | If we discover that the algorithm needs additional perceptual features. MFCC adds ~30 KB dependency. Not needed for TDOA. |
| Custom ~150 lines | Full audio fingerprinting (Shazam-style) | If we needed to match audio across entirely different recordings (cover songs, remixes). For multi-cam sync of the same event, GCC-PHAT is simpler and more appropriate. |
| Peak sharpness confidence | Pearson magnitude confidence | Never -- Pearson magnitude is not interpretable for cross-device recordings. Peak sharpness directly measures "how unambiguous is this offset?" |
| Custom ~150 lines | essentia.js (1.2 MB WASM) | Never for this project. essentia.js solves a different class of problems (music information retrieval, chord detection, BPM). Massive dependency for zero benefit. |

---

## Sources

### PRIMARY (HIGH confidence -- verified against official documentation or peer-reviewed research)

- [fft.js GitHub (indutny)](https://github.com/indutny/fft.js/) -- API reference: `realTransform()`, `completeSpectrum()`, `inverseTransform()`. Radix-4 implementation. MIT license. 334 stars, 44 npm dependents.
- [KISS FFT WASM vs fft.js benchmark](https://toughengineer.github.io/demo/dsp/fft-perf/) -- Measured performance: fft.js at 35K ops/sec for size 2048; WASM 2-5x faster at large sizes but copying overhead narrows the gap. fft.js is 5 KB vs 55 KB.
- [GCC-PHAT academic reference](https://xavieranguera.com/phdthesis/node92.html) -- PHAT weighting normalizes magnitude, retaining only phase. Standard for TDOA estimation.
- [Frequency-Sliding GCC-PHAT (IEEE/ACM)](https://arxiv.org/pdf/1910.08838) -- Sub-band GCC-PHAT for improved robustness in reverberant environments. Confirms GCC-PHAT as predominant method for acoustic source localization.
- [Delay Estimation by FFT (dsprelated.com)](https://www.dsprelated.com/showarticle/26.php) -- FFT cross-correlation with phase-slope sub-sample accuracy. Zero-padding for linear correlation.
- [SynAudio GitHub (eshaz)](https://github.com/eshaz/synaudio) -- Pearson correlation on raw samples. 104 commits. Comparison clips must be subsets of base clip. Being replaced.
- [MDN AnalyserNode](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode) -- Only real-time, no offline, no phase data. Confirmed unsuitable.
- [ES modules in Web Workers (web.dev)](https://web.dev/es-modules-in-sw/) -- `{ type: 'module' }` Workers supported in Chrome 80+, Safari 15+, Firefox 114+.

### SECONDARY (MEDIUM confidence -- credible sources, cross-referenced)

- [Audio Event Detection via Spectral Cross-Correlation (Springer)](https://link.springer.com/chapter/10.1007/978-3-031-45651-0_19) -- Mel spectrogram band selection for cross-correlation. Confirms approach viability.
- [SpectroMap: Peak Detection for Audio Fingerprinting](https://arxiv.org/pdf/2211.00982) -- Spectral peak robustness: "magnitudes are no longer used -- only time and frequency stamps." Informs constellation-map as future enhancement.
- [Mel-frequency cepstrum (Wikipedia)](https://en.wikipedia.org/wiki/Mel-frequency_cepstrum) -- Mel scale formula, filterbank construction reference.
- [Meyda GitHub](https://github.com/meyda/meyda) -- v5.6.3, 1.6k stars, offline `extract()` API. Potential fallback library if additional features needed.
- [How Shazam works (cameronmacleod.com)](https://www.cameronmacleod.com/blog/how-does-shazam-work) -- Spectral peak / constellation map approach. Background context for fingerprinting vs. TDOA.
- [Chroma features (Wikipedia)](https://en.wikipedia.org/wiki/Chroma_feature) -- Chroma representations. Considered but not needed for time-delay estimation.
- [pffft.wasm GitHub](https://github.com/JorenSix/pffft.wasm) -- WASM FFT alternative. 4096 size cap confirmed -- rules out for full-signal cross-correlation.

### TERTIARY (LOW confidence -- noted for completeness, not relied upon)

- [WebFFT GitHub (IQEngine)](https://github.com/IQEngine/WebFFT) -- v0.1.58. Community concerns about memory management. Not recommended.
- [essentia.js GitHub (MTG)](https://github.com/mtg/essentia.js/) -- npm v0.1.3, last published 4+ years ago. Not recommended for new projects.

---

*Stack research for: spectral/frequency-domain audio cross-correlation engine replacing SynAudio Pearson correlation*
*Researched: 2026-03-28*
