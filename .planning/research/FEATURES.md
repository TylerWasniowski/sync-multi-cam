# Feature Landscape: Robust Audio Synchronization

**Domain:** Audio synchronization algorithms for multi-camera video alignment
**Researched:** 2026-03-28
**Confidence:** MEDIUM-HIGH (algorithms well-documented in literature; browser/WASM implementation specifics have less prior art)

---

## Context: v2.3 Replaces the Sync Engine Only

v2.2 is shipped and complete. This research covers ONLY the v2.3 milestone:
replacing the SynAudio Pearson correlation engine with a spectral/frequency-domain
sync algorithm. The existing pipeline interface is preserved: video files in,
`{offsetSeconds, offsetSamples, confidence, isReference}` per file out. Everything
upstream (FFmpeg WASM audio extraction) and downstream (waveform visualization,
grid playback, composite export) remains unchanged.

### Current Pipeline (Being Replaced)

```
FFmpeg WASM → 16kHz mono PCM → SynAudio WASM SIMD Pearson correlation → offsets + confidence
```

**Current limitations driving this milestone:**
- SynAudio uses time-domain Pearson correlation on raw waveform samples
- Sensitive to device frequency response differences (phone mic vs DSLR preamp)
- Fails on repetitive content (concert music) where many correlation peaks are similar
- Confidence score (raw |correlation|) does not distinguish "good match with ambient noise" from "ambiguous match with multiple candidates"
- `correlationSampleSize=11025` and `initialGranularity=16` are fixed — no multi-resolution refinement
- Comparison clip must be a subset of the base clip (SynAudio constraint)

---

## Table Stakes

Features users expect from audio sync that "just works." Missing any of these means the algorithm is not meaningfully better than SynAudio.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Spectral-domain cross-correlation | Raw waveform correlation is fragile to device differences. Spectral methods normalize timbral variation so a phone recording matches a DSLR recording of the same event. This is the core upgrade. | HIGH | FFT-based cross-correlation in frequency domain. Compute STFT of both signals, multiply conjugate spectra, IFFT to get cross-correlation. GCC-PHAT variant whitens magnitudes (retains only phase) for robustness to different mic frequency responses. |
| Coarse-to-fine multi-resolution search | Brute-force correlation at full sample rate is O(N*M). Must be fast enough for 30 files x multi-minute recordings in a browser. SynAudio already uses `initialGranularity=16` for this reason, but a spectral approach needs its own multi-res strategy. | MEDIUM | Stage 1: Downsample to ~1kHz, FFT cross-correlate for coarse offset (resolution ~1ms). Stage 2: Refine in a narrow window at full sample rate (16kHz) for fine offset. Reduces FFT size from millions to tens of thousands in the coarse pass. |
| Meaningful confidence scoring | Current SynAudio returns `|correlation|` scaled to 0-100. This doesn't distinguish "clear unique peak" from "many similar peaks" (repetitive music). Users need confidence that actually predicts sync reliability. | MEDIUM | Peak-to-sidelobe ratio (PSR): compare the primary peak height to the second-best peak. A PSR of 3+ means unambiguous match. PSR < 1.5 means multiple candidates — flag as low confidence. Also report the absolute correlation magnitude. Combined metric: `confidence = f(PSR, peak_magnitude)`. |
| Device-invariant matching | Different microphones (phone, DSLR, lavalier, shotgun) have wildly different frequency responses. A phone clips bass, a lavalier boosts mids. The sync algorithm must find alignment despite these spectral differences. | MEDIUM | GCC-PHAT normalization handles this by discarding magnitude information and using only phase. Additional robustness: operate on a frequency band (300Hz-5kHz) where most devices have usable response, ignoring sub-bass rumble and ultrasonic noise. |
| Robust to ambient noise and reverb | Multi-camera shoots in reverberant spaces (churches, concert halls) add room reflections that smear temporal features. The algorithm must handle SNR as low as 10-15 dB. | MEDIUM | GCC-PHAT is specifically designed for noisy/reverberant environments — the phase whitening suppresses colored noise. Band-pass filtering (300Hz-5kHz) removes low-frequency rumble and high-frequency hiss that carry room modes and device noise. |
| Same pipeline interface as SynAudio | Downstream code expects `SyncResult[]` with `offsetSeconds`, `offsetSamples`, `confidence`, `isReference`. Breaking this interface means rewriting the waveform visualization, grid player offset logic, and export offset logic. | LOW | Drop-in replacement. `syncAudioTracks(tracks, onProgress) => Promise<SyncResult[]>`. Internal algorithm changes, external contract unchanged. |
| Runs entirely client-side in browser | The app is a static site on Cloudflare Pages. No server round-trips. Audio processing must happen in WebAssembly or JavaScript with Web Workers. | HIGH (constraint) | FFT via WASM (KissFFT or PFFFT compiled to WASM) for performance. All correlation logic in a Web Worker to avoid blocking UI. Memory budget: ~50-100MB for processing 30 tracks of 10-minute audio at 16kHz. |

---

## Differentiators

Features that are not strictly required for "better than SynAudio" but meaningfully improve the product.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Spectral flatness feature extraction | Google Research (2014) found spectral flatness outperforms zero-crossing rate and signal energy for audio synchronization cross-correlation. Operating on spectral flatness time series rather than raw audio further compresses representation and improves noise robustness. | MEDIUM | Compute per-frame spectral flatness (geometric mean / arithmetic mean of power spectrum). Cross-correlate the spectral flatness curves between tracks. This is a 1D signal at ~100 Hz frame rate — cross-correlation is extremely fast. Can serve as the coarse alignment stage. |
| Landmark-based fingerprint pre-filter | For large file counts (10-30 cameras), pairwise correlation is O(N^2). Fingerprint-based matching can quickly identify which clips overlap in time before running expensive correlation, and can cluster clips that recorded the same event segment. | HIGH | Extract spectral peak landmarks (Shazam-style) from each track. Hash pairs of peaks by (frequency_delta, time_delta). Match hashes between tracks to get candidate offsets. Only run full GCC-PHAT on tracks with hash matches. Libraries: `stream-audio-fingerprint` (JS, landmark algorithm) or Olaf (C compiled to WASM). |
| Subsample-accurate offset refinement | 16kHz sample rate gives 62.5 microsecond resolution. For professional use, sub-sample accuracy via parabolic or Gaussian peak interpolation on the cross-correlation curve yields fractional-sample offsets. At 30fps video, this is overkill — but it makes the confidence metric more reliable. | LOW | Fit a parabola (or Gaussian) to the 3 samples around the correlation peak. The interpolated peak position gives a fractional sample offset. Gaussian interpolation is more accurate than parabolic for cross-correlation peaks (research-verified). Trivial to implement: 5 lines of math. |
| Multi-pair graph-based offset resolution | When syncing N cameras, instead of correlating all against one reference, correlate multiple pairs and use a graph algorithm to find globally consistent offsets. Detects outlier pairs. Google's MST approach is elegant and handles pairwise failures gracefully. | HIGH | Build a complete graph where edge weights are pairwise correlation confidence. Use Minimum Spanning Tree (MST) to find the most confident path from each node to the reference. Offset for each camera = sum of offsets along the MST path. Outlier detection: if an edge's correlation is below threshold, flag that camera pair. |
| Adaptive frequency band selection | Different audio scenarios have energy in different bands. A concert has energy everywhere; a quiet dialogue scene has energy only in 100Hz-4kHz. Auto-detecting the useful frequency range and focusing correlation there improves SNR. | MEDIUM | Compute average spectral energy across both tracks. Select bands where both tracks have energy above a noise floor. Apply correlation only in those bands. Fallback to full-band if no clear energy concentration is found. |
| Confidence breakdown in UI | Instead of a single confidence number, show users *why* confidence is high or low: "Strong unique peak" vs "Multiple candidate offsets detected — verify manually" vs "Low signal overlap." | LOW | Decompose confidence into: (1) PSR rating, (2) overlap percentage, (3) spectral similarity. Display the dominant factor in the UI tooltip. E.g., "87% confidence — clear match" vs "42% confidence — repetitive audio, verify alignment." |
| Progress reporting per-stage | The multi-stage algorithm (extract features, coarse correlate, refine, score) can report granular progress instead of just "correlating..." | LOW | Report which stage and which pair is being processed: "Coarse alignment: camera 3 of 8" then "Refining: camera 3 of 8". Wires into existing `onProgress` callback. |

---

## Anti-Features

Features to explicitly NOT build in v2.3. Commonly suggested, actively harmful or out of scope.

| Anti-Feature | Why Suggested | Why Avoid | What to Do Instead |
|--------------|---------------|-----------|-------------------|
| Audio drift compensation (clock rate correction) | Different devices record at slightly different actual sample rates (e.g., 47998 vs 48000 Hz), causing progressive drift over long recordings (20+ frames over 30 minutes). | Drift compensation requires resampling one track relative to another — this is extremely complex, error-prone, and changes the audio data. The PROJECT.md explicitly lists this as out of scope. For typical multi-cam shoots (< 30 min), drift is < 1 frame and imperceptible. | Document the limitation. For long recordings, suggest users sync at multiple points and split into segments. Detect drift as a quality signal in confidence scoring but do not correct it. |
| Machine-learning-based sync (neural audio embeddings) | Neural fingerprinting (PeakNetFP, Neural GCC-PHAT) achieves SOTA accuracy in noisy conditions. | ML models require downloading weights (10-100MB), inference is slow in WASM without WebGPU, and the model becomes a maintenance burden. The classical signal processing approach (GCC-PHAT + spectral features) is well-understood, fast, and sufficient for this use case. | Use classical DSP. The improvement from ML is marginal for clean multi-camera audio where all devices recorded the same event. ML matters for degraded audio (radio broadcast, lossy streaming) — not this use case. |
| Chromagram / MFCC-based correlation | Chroma features are robust to timbre changes and popular in music information retrieval. MFCCs capture perceptual spectral shape. | Chroma features are designed for musical pitch analysis — they collapse octaves, losing temporal transient information that is critical for precise time alignment. MFCCs are designed for speech recognition, not time-delay estimation. Both are good for *content matching* ("is this the same song?") but poor for *sample-accurate temporal alignment*. | Use spectral flatness or power spectrum cross-correlation for time alignment. Chroma/MFCC would only be useful if we needed to match recordings of *different performances* of the same music — not the same event captured by multiple devices. |
| Full Shazam-style database architecture | Fingerprint storage, indexing, and retrieval via hash tables or B-trees for scalable matching. | We are matching N clips against each other in-memory, not searching a database of millions of songs. The overhead of building and querying a fingerprint database is not justified for 2-30 clips. | Use fingerprints only as a lightweight pre-filter to identify overlapping segments and candidate offsets, then run full cross-correlation. No persistent database needed. |
| WebGPU-accelerated FFT | GPU compute shaders for massively parallel FFT operations. | WebGPU is not available in Firefox (as of March 2026). FFT sizes for audio at 16kHz are small enough (16K-64K points) that WASM SIMD handles them in < 1ms per transform. GPU dispatch overhead would actually slow things down for these sizes. | WASM SIMD FFT (KissFFT or PFFFT). GPU acceleration only matters for real-time video processing, not offline audio correlation. |
| User-configurable algorithm parameters | Expose FFT size, hop size, frequency bands, correlation threshold as UI controls. | Audio sync should "just work." Exposing algorithm internals creates confusion and support burden. PluralEyes has only one meaningful user control: "Try Really Hard" (which just runs more iterations). | Auto-tune parameters internally. Expose only one user-facing option if any: a "thorough mode" toggle that uses more compute for difficult scenarios. |
| Support for non-overlapping audio segments | Detect that camera A recorded segment 1 and camera B recorded segment 2 with no temporal overlap. | This is a fundamentally different problem (content-based segmentation) that requires a fingerprint database approach. With no overlapping audio, cross-correlation will correctly return low confidence — which is the right answer. | Low confidence score is the correct output for non-overlapping clips. The UI already communicates this. No algorithm change needed. |

---

## Feature Dependencies

```
[FFmpeg WASM audio extraction — EXISTING, unchanged]
    |
    v
[16kHz mono PCM Float32Array — EXISTING format]
    |
    v
[NEW: Spectral Feature Extraction]
    |
    +-- STFT (Short-Time Fourier Transform) via WASM FFT
    |     |
    |     +-- Window function (Hann)
    |     +-- FFT size (1024 or 2048)
    |     +-- Hop size (512 or 256)
    |
    +-- Spectral flatness computation (per frame)
    |
    +-- Optional: Spectral peak landmark extraction (for pre-filter)
    |
    v
[NEW: Coarse Alignment Stage]
    |
    +-- Cross-correlate spectral flatness curves (fast, ~100Hz frame rate)
    |   OR
    +-- FFT-based cross-correlation of downsampled signal
    |
    +-- Produces: candidate offset(s) with coarse resolution (~1-10ms)
    |
    v
[NEW: Fine Alignment Stage]
    |
    +-- GCC-PHAT cross-correlation in narrow window around coarse offset
    |     |
    |     +-- Band-pass filter (300Hz-5kHz)
    |     +-- Phase-only weighting (PHAT)
    |     +-- FFT cross-correlation
    |
    +-- Parabolic/Gaussian peak interpolation for sub-sample accuracy
    |
    +-- Produces: refined offset at sample-level precision
    |
    v
[NEW: Confidence Scoring]
    |
    +-- Peak-to-sidelobe ratio (PSR)
    +-- Absolute peak magnitude
    +-- Overlap percentage estimation
    +-- Combined confidence metric (0-100)
    |
    v
[EXISTING: SyncResult interface — unchanged]
    { offsetSeconds, offsetSamples, confidence, isReference }
    |
    v
[EXISTING: Waveform visualization, grid playback, export — unchanged]
```

### Key Dependency Notes

- **FFT library is the foundation.** Every other feature depends on having a fast FFT. Choose between KissFFT (WASM, well-tested, 55KB) and PFFFT (WASM, SIMD-optimized, used by Olaf/Panako ecosystem). Decision drives all downstream implementation.
- **Spectral flatness extraction is independent of cross-correlation method.** Can be computed once and cached. Cross-correlating spectral flatness curves is the cheapest possible coarse alignment.
- **GCC-PHAT operates on the same STFT data** that spectral flatness uses. No redundant FFT computation needed if the STFT is computed once and shared.
- **Confidence scoring depends on the raw cross-correlation output**, not just the peak. The full correlation curve around the peak must be preserved for PSR computation.
- **The SyncResult interface is a hard constraint.** The new algorithm must produce identical output shape. Internal enrichment (PSR, overlap percentage) can be added as optional fields without breaking downstream consumers.

---

## Algorithm Properties That Matter

Ranked by importance for this specific use case (multi-camera shoot sync in browser).

### Critical (Must Have)

| Property | Why It Matters | How to Achieve |
|----------|---------------|----------------|
| **Device invariance** | Users mix phone, GoPro, DSLR, dedicated audio recorder. Different mic preamps, different clipping behavior, different frequency response curves. | GCC-PHAT phase-only weighting normalizes all magnitude differences. Band-pass filtering (300Hz-5kHz) avoids device-specific low/high frequency artifacts. |
| **Speed (< 30s for 8 tracks x 10 min)** | Browser-based tool. Users expect results in seconds, not minutes. SynAudio currently takes ~5-15s for typical use. New algorithm must not regress. | Coarse-to-fine: spectral flatness cross-correlation at ~100Hz for coarse offset (< 100ms per pair), then 1-second GCC-PHAT window for refinement (< 50ms per pair). Total for 8 tracks: < 5s. |
| **Repetitive content handling** | Concerts, music rehearsals, rhythmic audio produce multiple high-correlation peaks at beat intervals. Current algorithm picks the wrong beat. | PSR-based confidence identifies ambiguous cases. Multi-pair graph resolution (if implemented) detects inconsistent offsets. Band-pass focus on transient-rich frequencies (2-5kHz) favors percussive attacks over sustained tones. |
| **Noise robustness (10-15 dB SNR)** | Outdoor shoots, crowd noise, HVAC hum, distant cameras with poor audio. | GCC-PHAT is specifically designed for this. Whitening suppresses colored noise. Band-pass filtering removes out-of-band noise. Spectral flatness is inherently noise-characterizing. |

### Important (Should Have)

| Property | Why It Matters | How to Achieve |
|----------|---------------|----------------|
| **Graceful degradation** | When sync fails, users need to know *why* and *what to do*. A silent wrong offset is worse than an error. | Multi-level confidence: HIGH (PSR > 3), MEDIUM (PSR 1.5-3), LOW (PSR < 1.5). LOW triggers a UI warning: "Alignment may be inaccurate — verify manually." |
| **Memory efficiency** | Browser tab memory ceiling (~2-4 GB). Processing 30 tracks of 10-minute audio at 16kHz = ~600MB of PCM data already in memory. | Process pairs sequentially (not all at once). STFT is computed on-the-fly, not stored for all tracks simultaneously. Spectral flatness curves are tiny (~60KB per 10-min track at 100Hz). |
| **Progressivity** | Users want to see results arriving, not a spinner. | Report per-pair progress. Display intermediate results (coarse offsets) before refinement completes. |

### Nice to Have

| Property | Why It Matters | How to Achieve |
|----------|---------------|----------------|
| **Sub-frame accuracy** | 16kHz sample rate = 62.5us resolution. At 30fps, one frame = 33.3ms. Current resolution is already 530x better than frame-level. | Parabolic/Gaussian interpolation on correlation peak. Adds < 0.1ms to computation per pair. |
| **Partial overlap detection** | Cameras may have started/stopped at different times. Estimating the overlap region improves correlation by ignoring non-overlapping silence. | Use energy envelope to detect signal start/end. Only correlate the overlapping time range. Report overlap percentage as part of confidence. |

---

## Confidence Metric Design

The current confidence metric (`Math.round(Math.abs(correlation) * 100)`) is a raw
Pearson coefficient scaled to 0-100. This is inadequate because:

1. **Pearson correlation of 0.7 does not mean "70% likely correct"** — it means 70% of variance explained, which is a meaningless concept for sync accuracy.
2. **Does not distinguish unique vs ambiguous matches** — a score of 65 could be one clear peak or five similarly-sized peaks.
3. **Does not account for overlap amount** — short overlaps produce high correlation on little evidence.

### Proposed Confidence Model

```
confidence = clamp(0, 100, w1 * psr_score + w2 * magnitude_score + w3 * overlap_score)

where:
  psr_score = min(100, (PSR - 1.0) / 4.0 * 100)
    -- PSR of 1.0 = completely ambiguous (score 0)
    -- PSR of 5.0+ = unambiguous (score 100)

  magnitude_score = min(100, abs(peak_correlation) * 200)
    -- GCC-PHAT peaks are typically 0.0-0.5 for real recordings
    -- Peak of 0.5+ = very strong match (score 100)

  overlap_score = min(100, overlap_fraction * 120)
    -- 80%+ overlap = full score
    -- < 50% overlap = penalty

  w1 = 0.5 (PSR is most important — is the match unambiguous?)
  w2 = 0.3 (magnitude confirms signal similarity)
  w3 = 0.2 (overlap validates sufficient evidence)
```

### Confidence Level Thresholds

| Score | Level | UI Treatment | What It Means |
|-------|-------|-------------|--------------|
| 80-100 | HIGH | Green indicator | Unambiguous match, strong correlation, good overlap. Trust the offset. |
| 50-79 | MEDIUM | Yellow indicator | Decent match but with some ambiguity or noise. Likely correct. User should spot-check. |
| 20-49 | LOW | Orange indicator + warning text | Ambiguous match or weak correlation. "Alignment may be inaccurate — verify manually." |
| 0-19 | FAILED | Red indicator + error text | No usable match found. "Could not align this track — check that audio overlaps." |

---

## Failure Modes and Graceful Handling

| Failure Mode | Cause | Detection | User-Facing Response |
|--------------|-------|-----------|---------------------|
| **No overlapping audio** | Camera started after all others stopped, or recorded a completely different event. | Cross-correlation peak magnitude near noise floor; PSR ~ 1.0. | "Could not align — no matching audio detected. Ensure this camera recorded the same event." |
| **Multiple equally-good offsets** | Repetitive music with strong beats. Correlation has peaks at every beat interval. | PSR < 1.5 with peak magnitude still reasonable (> 0.1). | "Multiple candidate alignments found — audio is repetitive. Verify sync visually after alignment." Still returns the best offset. |
| **Clock drift detected** | Cameras with different crystal oscillators accumulate timing error. Over 10 minutes, 50ppm drift = 30ms. | Correlation peak is broad (not sharp). Peak width at half-maximum > 5ms. | "Alignment found but timing may drift over long playback. Consider re-syncing at multiple points for recordings over 30 minutes." |
| **Clipping distortion** | One camera's mic was overloaded (concert front row). Audio is square-wave clipped. | Detected during feature extraction: > 10% of samples at max amplitude. | "Camera X audio appears clipped — sync may be less accurate." Still attempts sync — GCC-PHAT handles mild clipping acceptably. |
| **Very short overlap** | Cameras overlap by only a few seconds. | Overlap estimation < 10% of shorter track. | "Only N seconds of audio overlap detected. Confidence is lower due to limited matching data." |
| **Silent or near-silent audio** | Camera with no external mic, or mic was off. RMS energy near noise floor. | Average RMS < -60 dBFS during feature extraction. | "Camera X has very quiet audio — sync may not be possible. Ensure microphone was active during recording." |

---

## MVP Recommendation

### Must Build for v2.3

1. **GCC-PHAT spectral cross-correlation engine** — The core algorithm replacement. FFT-based cross-correlation with phase-transform whitening. This alone solves device invariance and noise robustness.
2. **Coarse-to-fine two-stage search** — Spectral flatness or downsampled cross-correlation for coarse offset, narrow-window GCC-PHAT for fine offset. Required for acceptable performance.
3. **Band-pass filtering (300Hz-5kHz)** — Pre-processing step that eliminates device-specific noise outside the useful band. Trivial to implement, large impact on robustness.
4. **Peak-to-sidelobe ratio confidence** — The critical differentiator over SynAudio. Flags ambiguous matches from repetitive content instead of silently returning a wrong offset.
5. **WASM FFT in Web Worker** — Performance foundation. KissFFT or PFFFT compiled to WASM with 128-bit SIMD.

### Should Build for v2.3

6. **Gaussian peak interpolation** — Sub-sample accuracy from 5 lines of math. Improves confidence metric reliability.
7. **Overlap estimation** — Detect how much audio actually overlaps between pairs. Feeds confidence scoring and user messaging.
8. **Failure mode detection and user messaging** — Clipping detection, silence detection, overlap warnings. The difference between "sync failed" and "sync failed and here's why."

### Defer to v2.4+

9. **Landmark fingerprint pre-filter** — Only matters for 10+ cameras. Adds significant complexity (Olaf WASM integration or custom peak extraction). Not needed for typical 2-8 camera workflows.
10. **Multi-pair graph-based offset resolution (MST)** — Elegant but complex. Current reference-vs-all approach works for typical use. MST matters when one pair fails and you need to route through other pairs.
11. **Adaptive frequency band selection** — Auto-tuning frequency range per scenario. The fixed 300Hz-5kHz band handles 95% of cases. Adaptive selection is a refinement, not a requirement.

---

## Feature Prioritization Matrix

| Feature | User Impact | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| GCC-PHAT cross-correlation engine | CRITICAL | HIGH | P0 |
| Coarse-to-fine search strategy | CRITICAL | MEDIUM | P0 |
| Band-pass pre-filtering | HIGH | LOW | P0 |
| WASM FFT in Web Worker | CRITICAL (perf) | HIGH | P0 |
| Peak-to-sidelobe confidence metric | HIGH | LOW | P0 |
| Same SyncResult interface | HIGH (compat) | LOW | P0 |
| Gaussian peak interpolation | MEDIUM | TRIVIAL | P1 |
| Overlap estimation | MEDIUM | LOW | P1 |
| Failure mode detection + messaging | MEDIUM | MEDIUM | P1 |
| Confidence breakdown in UI tooltip | LOW | LOW | P2 |
| Progress reporting per-stage | LOW | LOW | P2 |
| Landmark fingerprint pre-filter | LOW (< 10 cams) | HIGH | P3 |
| MST graph-based offset resolution | LOW (< 10 cams) | HIGH | P3 |
| Adaptive frequency band selection | LOW | MEDIUM | P3 |

**Priority key:**
- P0: Core algorithm — must ship for v2.3 to be meaningful
- P1: Quality improvements — ship in v2.3 if time allows
- P2: Polish — can ship in a v2.3.x patch
- P3: Defer — high effort, low impact for typical use cases

---

## UX Behavior Expectations

| Behavior | Expected | Rationale |
|----------|----------|-----------|
| Sync results appear in same UI location as before | Yes | Drop-in replacement. User flow does not change. |
| Confidence scores are more informative | Yes | Current scores feel arbitrary. New scores should have clear meaning at each threshold. |
| Sync is at least as fast as before | Yes | SynAudio takes ~5-15s for typical use. New algorithm must not regress. Target: same or faster via coarse-to-fine. |
| Sync handles concert/music recordings | Yes (improvement) | Current algorithm frequently picks wrong beat offset for music. New algorithm should flag ambiguity instead of silently being wrong. |
| Sync handles mixed device recordings | Yes (improvement) | Phone + DSLR + GoPro should sync reliably. Current algorithm struggles when frequency responses differ significantly. |
| Low confidence produces a visible warning | Yes (new) | Users currently see "42%" and don't know what it means. New UI should say "Alignment uncertain — verify manually." |
| Progress shows more detail during sync | Nice to have | "Aligning camera 3 of 8..." is better than a generic progress bar. |
| Algorithm parameters are not exposed to users | Yes | Sync should "just work." No FFT size sliders. |

---

## Complexity Flags for Roadmap Phases

| Feature Area | Complexity Driver | Mitigation |
|--------------|-------------------|------------|
| WASM FFT integration | Build system complexity: compiling C FFT library to WASM with SIMD, loading in Web Worker, managing memory | Use pre-built WASM binaries (pffft.wasm already exists). Wrap in TypeScript API. Test with existing audio extraction pipeline. |
| GCC-PHAT implementation | The math is well-documented but subtle: zero-padding for linear correlation, phase normalization avoiding division by zero, IFFT output interpretation | Reference implementations exist in Python (scipy), MATLAB. Port carefully with unit tests against known input/output pairs. |
| Coarse-to-fine handoff | Coarse stage returns candidate range; fine stage must search the right window. Off-by-one in window boundaries causes missed peak. | Make the fine-stage window generous (e.g., coarse_offset +/- 500ms). Overlap is cheap insurance. |
| Confidence metric tuning | Weight parameters (w1, w2, w3) need empirical tuning against real multi-camera recordings | Collect test corpus: concert, dialogue, outdoor, mixed devices. Tune weights to maximize correlation between confidence score and actual sync accuracy. |
| Memory management in Worker | FFT buffers, correlation arrays, STFT frames for 10-minute tracks. Must not exceed Worker memory budget. | Process one pair at a time. Free intermediate buffers aggressively. Spectral flatness is tiny (< 100KB per track). Only the GCC-PHAT refinement window needs full-rate data (1 second = 16K samples = 64KB). |
| Replacing SynAudio dependency | SynAudio is imported in audioSync.ts and its Worker. Must remove cleanly without breaking the build. | New sync engine is a new file (e.g., spectralSync.ts). audioSync.ts becomes a thin wrapper that calls the new engine. SynAudio dependency removed from package.json after verification. |

---

## Sources

### High Confidence (Official Documentation, Academic Papers)
- [GCC-PHAT Cross-Correlation — Xavier Anguera PhD Thesis](https://xavieranguera.com/phdthesis/node92.html) — foundational reference for GCC-PHAT algorithm
- [Temporal Synchronization of Multiple Audio Signals — Google Research (Kammerl et al., ICASSP 2014)](https://research.google/pubs/temporal-synchronization-of-multiple-audio-signals/) — spectral flatness outperforms ZCR and energy; MST graph approach for multi-pair sync
- [Robust Matching of Audio Signals Using Spectral Flatness Features — IEEE](https://ieeexplore.ieee.org/document/969559/) — spectral flatness for audio matching robustness
- [Spectral Flatness — Wikipedia](https://en.wikipedia.org/wiki/Spectral_flatness) — definition and computation
- [SynAudio — GitHub (eshaz/synaudio)](https://github.com/eshaz/synaudio) — current library being replaced; Pearson correlation, WASM SIMD
- [Panako Acoustic Fingerprinting — ISMIR 2014 / JOSS](https://github.com/JorenSix/Panako) — spectral peak fingerprinting for audio synchronization
- [Olaf Acoustic Fingerprinting — ISMIR 2020](https://github.com/JorenSix/Olaf) — lightweight fingerprinting with WASM/Emscripten browser support
- [PFFFT.wasm — JorenSix](https://github.com/JorenSix/pffft.wasm) — WASM FFT library with SIMD, browser-ready
- [KissFFT WASM vs fft.js benchmark](https://toughengineer.github.io/demo/dsp/fft-perf/) — WASM FFT 2-10x faster than pure JS across browsers
- [Bias of Parabolic Peak Interpolation — DSPRelated](https://www.dsprelated.com/freebooks/sasp/Bias_Parabolic_Peak_Interpolation.html) — limitations of parabolic vs Gaussian interpolation
- [Delay Estimation by FFT — DSPRelated](https://www.dsprelated.com/showarticle/26.php) — practical FFT cross-correlation implementation

### Medium Confidence (Verified Tutorials, Multiple Sources Agree)
- [Fast Second Screen TV Synchronization — ResearchGate](https://www.researchgate.net/publication/263925127_Fast_second_screen_TV_synchronization_combining_audio_fingerprint_technique_and_generalized_cross_correlation) — combined fingerprint + GCC-PHAT coarse-to-fine approach
- [Correlation Without Pre-Whitening is Often Misleading — DSPRelated](https://www.dsprelated.com/showarticle/52.php) — importance of whitening for cross-correlation
- [stream-audio-fingerprint — npm](https://www.npmjs.com/package/stream-audio-fingerprint) — JavaScript Shazam-style landmark fingerprinting
- [WebAssembly SIMD — V8 Features](https://v8.dev/features/simd) — 128-bit SIMD widely supported in browsers as of 2024
- [Multiresolution Alignment Using Sequential Monte Carlo — ScienceDirect](https://www.sciencedirect.com/science/article/pii/S235271101730064X) — coarse-to-fine audio alignment approach

### Low Confidence (Single Source, Needs Validation)
- Effect of audio quality on MFCC and chroma feature robustness — claims MFCC is more robust with homogeneous encoding; needs validation for this specific use case
- Spectral flatness as sole coarse alignment feature — Google paper validated it, but with different datasets than multi-camera shoots; should be validated empirically
- Confidence weight parameters (w1=0.5, w2=0.3, w3=0.2) — proposed based on reasoning, not empirical tuning; must be validated against real recordings

---
*Feature research for: Robust audio synchronization algorithm (v2.3 milestone)*
*Researched: 2026-03-28*
