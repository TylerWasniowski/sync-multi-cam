# Project Research Summary

**Project:** Sync Multi-Cam -- v2.3 Robust Audio Sync (Spectral Cross-Correlation)
**Domain:** Browser-based audio synchronization algorithm replacement (DSP / signal processing)
**Researched:** 2026-03-28
**Confidence:** HIGH

## Executive Summary

v2.3 replaces the SynAudio Pearson correlation engine with a GCC-PHAT (Generalized Cross-Correlation with Phase Transform) implementation built on fft.js. This is a well-scoped, algorithmically proven upgrade: GCC-PHAT is the standard method for time-delay estimation in acoustics research, and it directly addresses the three failure modes of the current system -- sensitivity to different microphone frequency responses, false matches on repetitive music, and misleading confidence scores. The existing pipeline interface (`syncAudioTracks() -> SyncResult[]`) is preserved exactly, meaning zero UI changes and zero downstream code changes. The entire scope is: remove one npm dependency (synaudio), add one (fft.js, 5 KB), and write approximately 420 lines of new TypeScript across 3 modules plus tests.

The recommended approach is deliberately simple: a single-stage GCC-PHAT correlation on full-length PCM signals, not a multi-stage spectrogram pipeline. All four research tracks converged on this conclusion. STACK.md rejected WASM FFT libraries, mel spectrograms, and feature extraction libraries as unnecessary complexity. ARCHITECTURE.md designed a clean three-module structure (fftEngine.ts for pure math, spectralSyncWorker.ts for the Web Worker, spectralSync.ts for the main-thread API). FEATURES.md identified a coarse-to-fine two-stage search as a "should have" but confirmed that single-stage GCC-PHAT on the full signal is fast enough (350-650ms per pair) for the typical 2-8 camera workflow. The PITFALLS research validated this by showing that the spectrogram-based alternatives (STFT, MFCC, mel filterbanks) introduce memory blowup risks (1+ GB for 30 tracks) that GCC-PHAT avoids entirely.

The key risk is regression on cases that already work well -- dialogue, clap tests, distinctive transients. GCC-PHAT is tuned for robustness across device types and reverberant environments, but it processes phase information differently than Pearson correlation. The mitigation is straightforward: build a regression test suite with synthetic signals at known offsets before writing any algorithm code, then validate against real audio via Edge CDP tests. A secondary risk is memory pressure: GCC-PHAT requires ~275 MB of FFT buffers per pair in the Web Worker, which is acceptable for sequential processing but would be catastrophic if pairs were processed in parallel. The architecture enforces sequential processing with a session-scoped worker that caches the reference FFT and terminates after all comparisons complete.

## Key Findings

### Recommended Stack

The only new dependency is **fft.js ^4.0.4** (5 KB, pure JS, MIT, Radix-4 FFT). It replaces **synaudio ^0.4.0** (WASM SIMD Pearson correlation). Net result: bundle size decreases, WASM complexity decreases, browser compatibility increases (WASM SIMD requirement removed).

**Core technologies:**
- **fft.js** (^4.0.4): Forward/inverse FFT for GCC-PHAT -- pure JS, works in Web Workers without configuration, 5 KB minified, adequate performance for 3-6 FFTs per sync session
- **Web Worker** (module type, existing Vite pattern): Offloads 200-500ms FFT computations per pair off the main thread -- same `new Worker(new URL(...), { type: 'module' })` pattern used by the export pipeline
- **Existing 16kHz mono PCM pipeline**: audioExtractor.ts output is the correct input for GCC-PHAT -- no sample rate or format changes needed

**Rejected alternatives:** KissFFT WASM (marginal speed gain, adds WASM complexity), WebFFT (overkill metalibrary), essentia.js (1.2 MB stale framework), TensorFlow.js (wrong problem domain), pffft.wasm (4096 size cap -- unusable for full-signal correlation).

### Expected Features

**Must have (P0 -- core algorithm):**
- GCC-PHAT spectral cross-correlation engine replacing SynAudio internals
- Phase-transform normalization for device invariance (different mics, clipping, reverb)
- Peak-to-noise-floor confidence scoring (replaces meaningless Pearson magnitude)
- Hann windowing and zero-padding for correct linear correlation
- Constrained peak search within plausible offset range (+/- 5 minutes)
- Web Worker execution with Transferable buffer transfers
- Identical SyncResult interface preserved

**Should have (P1 -- quality improvements):**
- Parabolic peak interpolation for sub-sample accuracy (5 lines of math, improves confidence reliability)
- Silence/clipping detection with user-facing warnings
- Per-pair progress reporting through existing onProgress callback

**Defer to v2.4+:**
- Coarse-to-fine two-stage search (only needed if single-stage proves too slow for 30+ cameras)
- Landmark fingerprint pre-filter (only matters for 10+ cameras)
- Multi-pair MST graph-based offset resolution (elegant but complex, current reference-vs-all works)
- Adaptive frequency band selection (fixed 300Hz-8kHz via 16kHz sample rate handles 95% of cases)
- Confidence breakdown in UI tooltip (polish, not functional)

### Architecture Approach

The architecture is a clean three-layer replacement of SynAudio internals. `audioSync.ts` remains the public API (unchanged signature). It delegates to `spectralSync.ts` which manages a session-scoped Web Worker. The worker imports `fftEngine.ts` (pure math: Hann window, GCC-PHAT core, peak finding, confidence scoring) and fft.js. Data flows via Transferable ArrayBuffer transfers -- reference buffer is copied before transfer (needed for all comparisons), comparison buffers are transferred zero-copy (each used once). The worker caches the reference FFT across comparisons and terminates when the session completes, freeing ~275 MB.

**Major components:**
1. **fftEngine.ts** (~120 lines) -- Pure math: Hann window, GCC-PHAT core (cross-power spectrum with phase transform), peak finding with constrained search, confidence from peak-to-noise-floor ratio
2. **spectralSyncWorker.ts** (~80 lines) -- Web Worker: receives PCM via Transferable transfer, runs FFT via fft.js, executes GCC-PHAT, posts result back. Protocol: `init-reference` (compute and cache ref FFT) then N x `compare` messages
3. **spectralSync.ts** (~60 lines) -- Main-thread API: creates worker, manages session lifecycle (init -> compare N times -> terminate), returns Promise per comparison
4. **audioSync.ts** (modified) -- Replaces `SynAudio.syncWorker()` call with `computeSpectralSync()` call. Same function signature, same return type. Thin wrapper only.

### Critical Pitfalls

1. **Circular correlation without zero-padding produces wrong offsets** -- FFT multiplication computes circular, not linear, correlation. Must zero-pad both signals to nextPowerOf2(len_ref + len_comp). Without this, phantom correlation peaks appear at wraparound positions with high confidence. Prevention is built into the algorithm design: fftSize is always computed as nextPowerOf2 of combined signal lengths.

2. **Repetitive music creates multiple equal-height correlation peaks** -- A 4-bar loop at 120 BPM produces peaks every 8 seconds. GCC-PHAT's phase normalization helps (phase is more unique than amplitude for timing) but does not eliminate the problem entirely. The peak-to-noise-floor confidence metric is the primary mitigation: when multiple peaks of similar height exist, the ratio drops, and the result is flagged as ambiguous rather than silently wrong.

3. **Regression on dialogue/transient content that already works** -- Pearson correlation excels at distinctive time-domain features (claps, speech plosives). GCC-PHAT processes phase information differently. Mitigation: build regression test suite FIRST with synthetic signals at known offsets, then validate with real audio before removing SynAudio.

4. **Memory pressure from large FFT buffers** -- Two 5-minute clips require ~275 MB peak worker memory (8M-point complex FFT buffers). Acceptable for sequential pair processing but would crash if attempted in parallel or if buffers leaked between pairs. Prevention: session-scoped worker with explicit buffer reuse and termination after completion.

5. **Transferring buffers you still need** -- postMessage with Transferable detaches the source ArrayBuffer. The reference PCM must be copied before transfer (needed for all comparisons). Comparison buffers can be transferred zero-copy since each is used once and waveform peaks are already computed.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: DSP Foundation + Test Suite

**Rationale:** fftEngine.ts is the foundation -- every other component depends on it. It has zero external dependencies beyond fft.js and is fully unit-testable with synthetic signals. Building and testing this first validates the algorithm before any integration work. The PITFALLS research specifically warns: build the regression test suite FIRST, before any algorithm work.
**Delivers:** Working GCC-PHAT implementation with Hann windowing, zero-padded linear correlation, constrained peak search, and peak-to-noise-floor confidence scoring. Comprehensive unit tests with synthetic sine waves at known offsets, silence handling, negative offset handling, and numerical stability. TypeScript type declarations for fft.js.
**Addresses:** GCC-PHAT engine (P0), confidence scoring (P0), parabolic peak interpolation (P1)
**Avoids:** Circular correlation pitfall (zero-padding built in), numerical instability (epsilon guard in phase transform), regression risk (test suite established first)

### Phase 2: Worker Integration + Pipeline Swap

**Rationale:** With the algorithm proven in unit tests, this phase wraps it in the Web Worker architecture and wires it into the existing pipeline. The worker protocol (init-reference, compare, terminate) and Transferable buffer management are the integration concerns. SynAudio is removed from package.json here.
**Delivers:** spectralSyncWorker.ts, spectralSync.ts, modified audioSync.ts and constants.ts. Complete pipeline: user clicks Sync -> GCC-PHAT runs in worker -> SyncResult[] returned with new confidence scores. SynAudio dependency removed.
**Addresses:** Web Worker execution (P0), same SyncResult interface (P0), buffer transfer (P0), silence/clipping detection (P1), per-pair progress (P1)
**Avoids:** Buffer detachment pitfall (reference copied, comparisons transferred), main-thread blocking (all FFT in worker), memory leaks (session-scoped worker terminated after completion)

### Phase 3: Validation + Confidence Tuning

**Rationale:** The algorithm and integration are complete but confidence thresholds need empirical tuning against real multi-camera recordings. This phase uses Edge CDP tests with actual audio files to validate accuracy and calibrate the confidence mapping.
**Delivers:** Validated sync accuracy across device types (phone, DSLR, GoPro), validated confidence thresholds, regression test results against dialogue/transient content, updated constants if thresholds need adjustment.
**Addresses:** Device-invariant matching validation, repetitive content handling validation, confidence recalibration, regression prevention
**Avoids:** Deploying uncalibrated confidence scores that confuse users, regression on previously-working cases

### Phase Ordering Rationale

- **Strict dependency chain:** fftEngine.ts must exist before the worker can import it; the worker must exist before spectralSync.ts can use it; the pipeline must be wired before validation can run on real audio.
- **Test-first approach:** Unit tests in Phase 1 catch algorithm bugs before they compound with integration bugs in Phase 2. The PITFALLS research specifically warns that circular correlation bugs and phase transform numerical issues "look reasonable" in simple tests but fail in production.
- **Confidence tuning is empirical, not theoretical:** The peak-to-noise-floor ratio mapping `(ratio - 2) / 13` is a starting point. Real audio will reveal whether the thresholds produce useful HIGH/MEDIUM/LOW classifications. This must happen after integration, not during algorithm design.
- **SynAudio removal in Phase 2, not Phase 1:** Keeps the old algorithm available as a reference point until the new one is integrated and passing tests.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3:** MEDIUM risk -- confidence threshold calibration requires empirical testing with a diverse audio corpus. May need multiple tuning iterations. Edge CDP test infrastructure is already established but test audio files need to be sourced or synthesized.

Phases with standard patterns (skip research-phase):
- **Phase 1:** GCC-PHAT algorithm is thoroughly documented in academic literature with Python/MATLAB reference implementations. fft.js API is small and well-documented. No additional research needed.
- **Phase 2:** Worker integration follows the exact same pattern as the existing export worker. Transferable buffer handling is documented in ARCHITECTURE.md with code examples. No additional research needed.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | fft.js is well-established (334 stars, 44 npm dependents, MIT). The only new dependency. All alternatives thoroughly evaluated and rejected with clear rationale. |
| Features | MEDIUM-HIGH | Core features (GCC-PHAT, confidence scoring) are well-defined. Deferred features clearly separated. One uncertainty: whether single-stage GCC-PHAT is sufficient for 30-camera scenarios or if coarse-to-fine will be needed. |
| Architecture | HIGH | Clean three-module design with clear boundaries. Follows existing patterns (module Workers, Transferable objects). Memory analysis detailed and feasible. |
| Pitfalls | HIGH | Comprehensive coverage from DSP literature, BBC implementation analysis, and direct codebase analysis. Circular correlation, repetitive content, and regression risks well-characterized with specific prevention strategies. |

**Overall confidence:** HIGH

### Gaps to Address

- **Confidence threshold calibration:** The mapping `(ratio - 2) / 13` is theoretical. Real recordings will determine if this produces useful confidence levels. Plan for 1-2 tuning iterations in Phase 3.
- **30-camera performance at scale:** Single-stage GCC-PHAT is estimated at 10-18s for 30 cameras. If this proves too slow, coarse-to-fine or segment-based correlation may be needed. Monitor during Phase 3 validation.
- **fft.js Firefox performance:** fft.js is reportedly "several times slower" in Firefox than Chrome for large FFT sizes. For ~3 FFTs per pair this should be acceptable, but Firefox testing in Phase 3 should confirm.
- **Very long recordings (>30 minutes):** FFT size doubles to 2^24, pushing worker memory to ~550 MB. The architecture handles this but approaches browser limits. Document as a known limitation; chunking optimization is a v2.4 candidate.
- **fft.js TypeScript declarations:** fft.js does not ship .d.ts files. A small type declaration file must be created in Phase 1.

## Sources

### Primary (HIGH confidence)
- [fft.js GitHub (indutny)](https://github.com/indutny/fft.js/) -- API reference, Radix-4 implementation, MIT license
- [GCC-PHAT academic reference (Anguera PhD)](https://xavieranguera.com/phdthesis/node92.html) -- Phase normalization foundation
- [Frequency-Sliding GCC-PHAT (IEEE/ACM)](https://arxiv.org/pdf/1910.08838) -- Confirms GCC-PHAT as predominant TDOA method
- [Cross-Correlation in Spectral Audio Processing (DSPRelated)](https://www.dsprelated.com/freebooks/sasp/Cross_Correlation.html) -- Circular vs linear correlation, zero-padding
- [Google Research: Temporal Synchronization of Multiple Audio Signals](https://research.google/pubs/temporal-synchronization-of-multiple-audio-signals/) -- Spectral flatness, MST graph approach
- [MDN Transferable Objects](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects) -- Zero-copy buffer transfer
- [Chrome: Transferable Objects Lightning Fast](https://developer.chrome.com/blog/transferable-objects-lightning-fast) -- Transfer performance data
- [FFT Convolution and Zero-Padding](https://www.matecdev.com/posts/julia-fft-convolution.html) -- M+N-1 padding for linear correlation
- [Understanding FFTs and Windowing (NI)](https://www.ni.com/en/shop/data-acquisition/measurement-fundamentals/analog-fundamentals/understanding-ffts-and-windowing.html) -- Window function comparison

### Secondary (MEDIUM confidence)
- [KISS FFT WASM vs fft.js benchmark](https://toughengineer.github.io/demo/dsp/fft-perf/) -- Performance comparison data
- [BBC audio-offset-finder](https://github.com/bbc/audio-offset-finder) -- MFCC-based approach, z-score normalization reference
- [Shazam: Industrial-Strength Audio Search](https://www.ee.columbia.edu/~dpwe/papers/Wang03-shazam.pdf) -- Constellation map fingerprinting context
- [SpectroMap: Peak Detection for Audio Fingerprinting](https://arxiv.org/pdf/2211.00982) -- Spectral peak robustness
- [Coarse-to-fine audio sync (ResearchGate)](https://www.researchgate.net/publication/263925127_Fast_second_screen_TV_synchronization_combining_audio_fingerprint_technique_and_generalized_cross_correlation) -- Combined fingerprint + GCC-PHAT approach
- [postMessage performance (Surma)](https://surma.dev/things/is-postmessage-slow/) -- Typed array transfer costs by size

### Tertiary (LOW confidence)
- [WebFFT GitHub (IQEngine)](https://github.com/IQEngine/WebFFT) -- Evaluated, not recommended
- [essentia.js GitHub (MTG)](https://github.com/mtg/essentia.js/) -- Evaluated, not recommended
- Confidence weight parameters and threshold calibration -- theoretical, needs empirical validation

---
*Research completed: 2026-03-28*
*Ready for roadmap: yes*
