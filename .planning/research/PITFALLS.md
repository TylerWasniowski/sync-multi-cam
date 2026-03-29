# Domain Pitfalls

**Domain:** Spectral/frequency-domain audio synchronization for browser-based multi-camera sync
**Researched:** 2026-03-28
**Confidence:** HIGH (verified across DSP literature, BBC audio-offset-finder implementation, WebAudio/WebCodecs specs, community post-mortems, and direct analysis of existing SynAudio codebase)

> **Scope:** This document covers v2.3 pitfalls -- replacing SynAudio's time-domain Pearson correlation with spectral/frequency-domain audio sync. The existing system works for dialogue and distinctive transients but fails on concerts/music with repetitive content. Prior v2.0 pitfalls (video sync drift, GPU memory, WebCodecs encoding, MP4 muxing) are already addressed in the shipped codebase.

---

## Critical Pitfalls

Mistakes that cause incorrect sync results, catastrophic memory blowup, or require architecture-level rewrites.

### Pitfall 1: FFT Window Size Too Small Destroys Low-Frequency Resolution

**What goes wrong:**
The current SynAudio correlation window is 11,025 samples at 16kHz -- 0.69 seconds. If you compute an FFT on this window directly, the frequency resolution is `sampleRate / fftSize`. With a 1024-point FFT at 16kHz, that is 15.6 Hz per bin. With a 512-point FFT (as BBC's audio-offset-finder uses), it is 31.25 Hz per bin. Music fundamentals live in the 80-500 Hz range, so at 31.25 Hz resolution, a bass note at 100 Hz occupies only 3 bins, making spectral comparison unreliable.

Worse: if you keep the small window from the time-domain approach and just "add FFT," you get the worst of both worlds -- poor frequency resolution AND poor time resolution. The STFT time-frequency tradeoff is fundamental: a 512-sample window at 16kHz gives 32ms time resolution but 31.25 Hz frequency resolution. A 4096-sample window gives 0.25 Hz resolution but 256ms time resolution.

**Why it happens:**
Developers carry over the correlation sample size from the time-domain implementation (11,025 samples = 0.69s) and treat it as the FFT window, or pick small FFT sizes (256-512) from tutorials optimized for real-time visualization rather than offline correlation accuracy.

**Consequences:**
- Spectral features are too coarse to distinguish between similar musical passages
- Low-frequency content (bass, drums) gets smeared into a few bins, losing the detail that makes concert audio distinguishable
- The new algorithm performs no better than the old one on music, defeating the purpose of the migration

**Prevention:**
- Use FFT size of 2048 or 4096 for the STFT. At 16kHz, a 2048-point FFT gives 7.8 Hz/bin frequency resolution with 128ms windows. A 4096-point FFT gives 3.9 Hz/bin with 256ms windows. For music sync, 2048 is the minimum practical size.
- Use 75% overlap (hop size = FFT/4) to recover time resolution lost from larger windows. With 2048 FFT and 512-sample hop at 16kHz, you get 32ms time resolution AND 7.8 Hz frequency resolution.
- Do NOT reuse the `CORRELATION_SAMPLE_SIZE = 11025` constant from the current system for FFT sizing. They solve different problems.

**Detection:**
- Test with a bass-heavy music clip (electronic music, concert recording). If two clips with the same content at different offsets produce low confidence scores or wrong offsets, the frequency resolution is likely insufficient.
- Verify the frequency bin count covers at least 20 bins in the 80-500 Hz fundamental range.

**Phase to address:** Algorithm design phase (first phase). FFT parameters are the foundation -- everything else depends on getting this right.

---

### Pitfall 2: Circular Cross-Correlation Without Zero-Padding Produces Wrong Offsets

**What goes wrong:**
FFT-based cross-correlation computes circular (cyclic) cross-correlation, not linear cross-correlation. In circular correlation, the signal wraps around: the end of signal A overlaps with the beginning of signal B. This produces phantom correlation peaks at wraparound positions that do not correspond to real time offsets.

For audio sync, if track A is 60 seconds and track B is 45 seconds, circular correlation might report a high correlation at an offset of 58 seconds -- not because the audio actually aligns there, but because the tail of A wraps around and happens to match the beginning of B.

**Why it happens:**
FFT multiplication in the frequency domain is equivalent to circular convolution in the time domain. This is a fundamental property of the DFT, not a bug. But if you compute `IFFT(FFT(A) * conj(FFT(B)))` without padding, you get circular correlation. Every DSP textbook covers this, but every implementation gets bitten by it at least once because the output "looks reasonable" for short signals where wraparound artifacts are small.

**Consequences:**
- Sync reports completely wrong offsets (off by the full recording length) with high confidence
- The error is intermittent -- it only manifests when the tail of one signal happens to correlate with the head of another, so it passes simple tests but fails in production

**Prevention:**
- Zero-pad both signals to length `M + N - 1` before FFT, where M and N are the signal lengths. This makes the circular correlation equivalent to linear correlation.
- Since signals are typically much longer than the maximum expected offset, you can optimize by padding to `max(M, N) + maxExpectedOffset` instead of `M + N - 1`. For multi-camera sync, the maximum offset is typically under 60 seconds, so you pad by `60 * sampleRate` beyond the longer signal.
- Use power-of-2 FFT sizes for performance: round `M + N - 1` up to the next power of 2.
- Memory implication: for two 5-minute tracks at 16kHz, `M + N - 1 = 9,600,000 + 1` samples. At Float32 (4 bytes), that is ~38MB per padded signal. For complex FFT output, double that. Total: ~150MB for one correlation. Manageable for modern browsers but requires awareness.

**Detection:**
- Verify that the reported offset is within the plausible range (0 to min(durationA, durationB)). Any offset exceeding the shorter track's duration is a wraparound artifact.
- Test with recordings where track B starts well after track A begins (large positive offset). Circular artifacts manifest most when the true offset is large relative to signal length.

**Phase to address:** Core algorithm implementation. This must be correct from the first implementation -- it cannot be patched later without changing the fundamental correlation computation.

---

### Pitfall 3: Repetitive Music Creates Multiple Equal-Height Correlation Peaks

**What goes wrong:**
Time-domain Pearson correlation already struggles with repetitive content. Spectral cross-correlation can be equally vulnerable if not handled carefully. A 4-bar musical loop at 120 BPM repeats every 8 seconds. The cross-correlation function will show peaks at the true offset AND at offsets shifted by +/-8s, +/-16s, etc. These peaks can have nearly identical heights because the spectral content genuinely is nearly identical at those offsets.

This is the core reason the current SynAudio-based system fails on concerts: it picks the highest peak, but all the periodic peaks are approximately equal, so it essentially picks randomly among them.

**Why it happens:**
Cross-correlation (time-domain or spectral) measures similarity at each offset. For periodic signals, the similarity IS high at multiples of the period. This is not a bug in the algorithm -- it is a fundamental property of periodic signals. The Shazam-style fingerprinting approach avoids this by using combinatorial hashing of peak constellations rather than global correlation, but that approach is designed for matching against a database, not for determining a sub-second time offset between two arbitrary recordings.

**Consequences:**
- Sync offset is wrong by a multiple of the musical repetition period (e.g., exactly 8 seconds off, or 16 seconds off)
- Confidence score is high because the correlation at the wrong peak IS genuinely high
- The error looks plausible -- the videos are "almost" in sync, just shifted by one musical phrase
- Hard to detect automatically because the peak height ratio between correct and incorrect peaks can be as low as 1.01:1

**Prevention:**
- **Multi-scale approach:** First do a coarse correlation on full spectrograms to find candidate offsets. Then refine each candidate using a different feature set that is NOT periodic -- for example, transient detection, onset strength, or spectral flux. Transients (claps, cymbal hits, speech plosives) are not periodic and break the ambiguity.
- **Peak cluster analysis:** Instead of taking the single highest peak, identify all peaks above a threshold and check if they form a periodic pattern. If they do, flag the result as ambiguous and fall back to a secondary method (onset matching, GCC-PHAT on specific transient segments).
- **Longer analysis windows:** Use the entire recording for correlation, not just a small window. With longer signals, non-repeating elements (crowd noise, between-song patter, applause) break the periodicity and make the true peak distinguishable.
- **MFCC-based correlation** (BBC approach) is more robust here than raw spectral correlation because MFCCs compress spectral detail into perceptual features, and identical musical notes played at different times do differ slightly in MFCC space due to room acoustics, crowd noise, and performer variation.

**Detection:**
- After finding the peak, scan for other peaks within 90% of the peak height. If more than 3 such peaks exist at regular intervals, the result is likely ambiguous.
- Test with a 3-minute electronic music track with a clear 8-bar loop. If the algorithm consistently returns the correct offset, it handles periodicity correctly. If it returns an offset that is a multiple of the loop length, it does not.

**Phase to address:** Algorithm design phase. The multi-scale or multi-feature approach must be architectured, not bolted on after initial implementation.

---

### Pitfall 4: Spectrogram Memory Blowup Crashes Browser Tabs

**What goes wrong:**
A spectrogram is a 2D matrix: frequency bins x time frames. The memory grows with both dimensions. Concrete calculations for the current system:

- **Input:** 16kHz mono, 5-minute recording = 4,800,000 samples
- **FFT size 2048, hop 512 (75% overlap):** 9,375 time frames, 1025 frequency bins (N/2 + 1)
- **Storage:** 9,375 x 1,025 x 4 bytes (Float32) = **38.4 MB per track**
- **For 30 tracks (MAX_FILES):** 38.4 MB x 30 = **1,152 MB** just for spectrograms

That is over 1 GB of Float32Array allocations in the main thread (or Web Worker) heap before any correlation computation begins. For longer recordings (30-minute concert), multiply by 6: 6.9 GB for 30 tracks. The browser tab will crash.

The correlation step adds more: for FFT-based cross-correlation, you need padded complex arrays of size `M + N - 1` for each pair comparison. With 30 tracks, that is 29 pairwise comparisons, each needing temporary buffers.

**Why it happens:**
Developers compute spectrograms eagerly for all tracks and hold them all in memory simultaneously. They reason: "16kHz mono is already downsampled, so the data is small." But the STFT expansion factor is roughly `(fftSize / hopSize) * (fftSize/2 + 1) / fftSize` per sample, which for 2048/512 overlap is about 4x. Combined with 30 tracks, the small per-sample cost becomes enormous.

**Consequences:**
- Browser tab crashes with OOM on consumer hardware (4-8 GB RAM) with >10 long recordings
- Performance degrades progressively as GC pressure increases with Float32Array allocations
- On Safari (which has stricter memory limits), crashes happen with fewer/shorter recordings

**Prevention:**
- **Streaming spectrogram computation:** Compute spectrograms on-demand per pair, not all at once. When correlating track A vs track B, compute spectrogram of A and B, correlate, then release both before moving to the next pair.
- **Reduce spectrogram resolution for initial pass:** Use fewer frequency bins (e.g., 64-128 mel bands instead of 1025 linear bins) for the coarse offset search. Only compute full-resolution spectrograms for the refinement step around candidate offsets.
- **Use MFCC features (26-40 coefficients per frame) instead of full spectrograms** for the correlation step. BBC's audio-offset-finder uses 26 MFCCs, reducing the per-track storage from 38.4 MB to 26 coefficients x 9,375 frames x 4 bytes = **0.98 MB per track**. That is a 39x reduction.
- **Progressive GC pressure management:** After each pairwise correlation completes, explicitly null the references and consider triggering minor GC via small `setTimeout` delays between pairs.
- **Memory budget cap:** Calculate memory requirements upfront based on file count and duration. Warn the user before processing if estimated memory exceeds a threshold (e.g., 1 GB). Provide a "lightweight mode" that uses lower FFT resolution.

**Detection:**
- Log `performance.memory.usedJSHeapSize` (Chrome-only) before and after spectrogram computation. If heap growth exceeds 500 MB, the approach needs optimization.
- Test with 10 tracks of 10-minute audio each. If the browser becomes sluggish or crashes, memory management is inadequate.

**Phase to address:** Algorithm implementation phase. Memory strategy must be decided before writing the spectrogram computation code. This directly impacts whether you use full spectrograms, MFCCs, or a hybrid approach.

---

### Pitfall 5: Normalization Mismatch Between Tracks From Different Devices Causes False Low Confidence

**What goes wrong:**
Audio from different cameras has dramatically different characteristics:
- **Volume levels:** One camera 10 feet from the stage, another 50 feet back. The closer camera may be clipped while the farther one is -30dB.
- **Frequency response:** Phone microphones roll off below 100 Hz and above 10 kHz. Dedicated cameras have flatter response down to 50 Hz. Two recordings of the same concert have genuinely different spectral shapes.
- **Clipping and distortion:** Close microphones at concerts frequently clip. Clipping introduces harmonics that dramatically change the spectrum.
- **Reverb and room acoustics:** Cameras at different distances have different direct-to-reverberant sound ratios. The reverberant field is decorrelated across positions.

If the correlation step compares raw spectrogram magnitudes (or raw MFCCs) without proper normalization, these device differences dominate the similarity measure. Two recordings of the same event from different devices may show lower correlation than two recordings of similar-but-different music from the same device.

**Why it happens:**
Developers test with recordings from the same device (or the same type of device) at similar distances. The algorithm works because the spectral shape is similar. When deployed with real multi-camera setups (phone + DSLR + GoPro at different positions), the device and position differences overwhelm the content similarity.

**Consequences:**
- Confidence scores drop to 30-50% for recordings that are actually synchronized, causing the UI to show "low confidence" warnings for correct results
- In extreme cases, the algorithm picks a wrong offset because device-related spectral differences cause the true offset peak to be lower than a noise peak
- Users lose trust in the tool even when it returns correct offsets because confidence is reported as low

**Prevention:**
- **Per-track z-score normalization of features:** After computing MFCCs or spectral features, normalize each coefficient to zero mean and unit variance across the time axis. This removes constant spectral coloration from microphone frequency response. BBC's audio-offset-finder does exactly this via `(mfcc - mean) / std` per coefficient.
- **Use MFCCs rather than raw spectrograms:** MFCCs inherently decorrelate spectral features and are less sensitive to broadband gain differences than linear spectrograms. The mel filterbank compresses differences in frequency response.
- **Band-pass filter before analysis:** Apply a 200-4000 Hz band-pass filter to the audio before computing spectral features. This removes low-frequency rumble (handling noise, wind) and high-frequency noise (hiss) that differ most between devices, while preserving the mid-range where speech and most musical content lives.
- **Energy normalization per frame:** Normalize each STFT frame to unit energy before comparison. This removes frame-level volume differences.
- **GCC-PHAT weighting:** If using FFT-based cross-correlation, apply PHAT (Phase Transform) normalization which divides the cross-power spectrum by its magnitude. This retains only phase information, making the correlation independent of spectral magnitude differences between devices. GCC-PHAT is specifically designed for robustness to different frequency responses and reverberation.

**Detection:**
- Test with the same audio content recorded on two very different devices (phone internal mic vs. external shotgun mic). If confidence drops below 60% for content that clearly matches audibly, normalization is insufficient.
- Compare confidence scores for same-device pairs vs. different-device pairs. If there is a >20 percentage point gap, device-dependent spectral features are leaking into the correlation.

**Phase to address:** Feature extraction phase. Normalization must be applied immediately after feature computation, before any correlation step.

---

### Pitfall 6: Regression on Previously-Working Cases (Dialogue, Distinctive Audio)

**What goes wrong:**
The current SynAudio system produces correct results with high confidence (>85%) for dialogue, interviews, and recordings with distinctive transients. Replacing it with a spectral method that is tuned for music may break these existing cases. Specific failure modes:

- **Dialogue with pauses:** MFCC or spectral features during silence are dominated by noise floor, which is nearly uncorrelated between devices. If the analysis window happens to land on a pause, the correlation drops. The time-domain Pearson approach handles this better because it correlates the overall waveform shape including low-energy regions.
- **Short transients:** A sharp clap or door slam is a broadband transient that is very distinctive in the time domain but spreads across all frequency bins in the spectral domain, reducing its distinctiveness. Time-domain correlation peaks sharply on transients; spectral correlation may not.
- **Low-energy speech:** Quiet speech in a large room may have energy concentrated in a narrow band. Mel-scale compression can smear this narrow band across fewer bins, reducing discrimination.

**Why it happens:**
Every algorithm has strengths and weaknesses. The old algorithm is well-suited to content with distinctive time-domain features (dialogue, transients). The new algorithm is being designed for content where time-domain approaches fail (music). Optimizing for one type of content risks degrading the other.

**Consequences:**
- Users who previously got 95% confidence on interview recordings now get 60% or worse
- Edge cases that worked with the old algorithm (two cameras recording quiet ambient sound with occasional speech) may fail entirely with the new one
- Loss of user trust: "the update broke sync for my use case"

**Prevention:**
- **Build a regression test suite BEFORE changing the algorithm.** Create a test corpus of audio pairs that currently work correctly with SynAudio, including:
  - Clear dialogue with pauses
  - Single sharp transient (clap test)
  - Ambient with occasional speech
  - High-energy continuous speech (podcast)
  - Music with distinctive verses and choruses
  Record the expected offsets and confidence scores for each pair.
- **Hybrid/fallback approach:** Run both algorithms (or detect content type and choose). A simple energy variance check can distinguish "mostly silence with speech bursts" (high variance, use time-domain) from "continuous music" (low variance, use spectral). Or run spectral first, and if confidence is below threshold, fall back to time-domain.
- **A/B validation:** Before replacing SynAudio, run both algorithms on the same inputs and compare results. Deploy the new algorithm only for cases where it produces better results, keeping the old algorithm for cases where it was already correct.
- **Confidence recalibration:** The new algorithm will produce different raw correlation values than SynAudio. The existing confidence thresholds (high >= 70%, medium >= 40%) may not be appropriate. Recalibrate thresholds on the test corpus.

**Detection:**
- Run the regression test suite after every algorithm change. Any degradation in offset accuracy or confidence for previously-passing cases is a regression.
- Log the confidence scores from both algorithms (old and new) during a transition period.

**Phase to address:** This spans ALL phases. The regression test suite must be built in the FIRST phase (before any algorithm work). Every subsequent phase must pass the regression suite.

---

## Moderate Pitfalls

### Pitfall 7: Spectral Leakage From Wrong Window Function Smears Frequency Peaks

**What goes wrong:**
The FFT assumes the input signal is periodic with period equal to the window length. When the window does not contain an integer number of cycles of a given frequency, energy from that frequency "leaks" into adjacent bins. The choice of window function controls this leakage. Using a rectangular window (no windowing) produces the worst leakage. Using the wrong window function for the application can cause frequency peaks to spread across 5-10 bins, reducing the distinctiveness of spectral features.

**Prevention:**
- Use a Hann (Hanning) window for the STFT. It is the standard choice for audio analysis, with good sidelobe suppression (-31 dB first sidelobe) and acceptable main lobe width. It satisfies the COLA (Constant Overlap-Add) constraint at 50% and 75% overlap.
- Do NOT use a rectangular window. Do NOT use a Hamming window for correlation (it does not reach zero at the edges, leaving a discontinuity).
- Apply the window in the time domain before FFT: `windowedFrame[i] = frame[i] * hannWindow[i]`.
- Pre-compute the window coefficients once and reuse for all frames.

**Detection:**
- Visualize the spectrogram of a known sine wave. The peak should be confined to 2-3 bins with a Hann window. If it spreads across 5+ bins, windowing is wrong or missing.

---

### Pitfall 8: Silence and Noise-Floor Segments Produce Spurious Correlation Peaks

**What goes wrong:**
When both tracks contain silence or near-silence (noise floor), the spectral features are dominated by uncorrelated background noise. Normalizing these low-energy frames amplifies noise to unit variance, making random noise patterns look like meaningful features. Cross-correlating noise-dominated features produces random peaks that can be higher than the actual signal-aligned peak.

Additionally, if one track has silence where another has content, MFCC normalization (subtract mean, divide by std) on the silence track produces unstable features (dividing near-zero values by near-zero std), causing numerical instability or NaN propagation.

**Prevention:**
- **Energy-gated analysis:** Compute frame energy before feature extraction. Skip or down-weight frames below an energy threshold (e.g., -40 dB relative to the track's peak energy). Only correlate features from frames where both tracks have sufficient energy.
- **Clamp minimum standard deviation** in normalization to prevent division by near-zero: `normalized = (x - mean) / max(std, epsilon)` where epsilon is 1e-6.
- **Weighted correlation:** Weight each frame's contribution to the correlation by the minimum energy of the two tracks at that frame. This naturally suppresses silence-dominated regions.

**Detection:**
- Test with two recordings where one starts 30 seconds before the other (so one has 30 seconds of silence overlap). If the algorithm reports high confidence for an offset that aligns the silence regions, it is not handling silence correctly.

---

### Pitfall 9: Web Worker Data Transfer Overhead for Spectrograms

**What goes wrong:**
The current system transfers Float32Array audio data to a Web Worker via postMessage. SynAudio's worker receives raw audio samples -- relatively compact (16kHz mono, 4 bytes/sample). If the new algorithm computes spectrograms in the main thread and transfers them to a worker, the data size increases dramatically.

A spectrogram for a 5-minute track at 2048 FFT / 512 hop is 38.4 MB (see Pitfall 4). With structured cloning (the default postMessage behavior), transferring 38.4 MB takes ~300ms per track. For 30 tracks, that is 9 seconds of just data transfer overhead, blocking the main thread during each copy.

Using Transferable ArrayBuffers avoids the copy cost (<10ms per transfer regardless of size) but has a catch: the source loses access to the data. If the main thread needs the spectrogram for visualization while the worker needs it for correlation, you must duplicate it before transfer.

**Prevention:**
- **Compute spectrograms inside the Web Worker.** Transfer raw audio (compact: 4 bytes/sample) to the worker, compute the STFT there, run correlation there, and return only the result (offset + confidence). This avoids transferring spectrograms across the thread boundary entirely.
- If spectrograms must be transferred, **use Transferable ArrayBuffers** (not structured clone). Ensure the source no longer needs the data before transferring: `worker.postMessage({ spectrogram: buffer }, [buffer])`.
- **SharedArrayBuffer** is available in this project (COOP/COEP headers are already configured for FFmpeg WASM). If computing spectrograms in the main thread and consuming in workers, consider using SharedArrayBuffer to avoid any copy. However, SynAudio currently does NOT use shared memory mode (the `shared: false` default is used), so this would be a new pattern.
- **Batch processing:** Do not send 30 spectrograms at once. Send them one pair at a time, correlate, receive result, then send the next pair. This bounds peak memory to 2 spectrograms + correlation buffers rather than 30 spectrograms.

**Detection:**
- Profile data transfer time using `performance.now()` around postMessage calls. If transfer exceeds 100ms per message, the data volume is too large.
- Check Chrome DevTools Memory tab for heap spikes during postMessage (indicates structured cloning of large typed arrays).

---

### Pitfall 10: Sub-Sample Accuracy Requires Interpolation of Correlation Peak

**What goes wrong:**
FFT-based cross-correlation returns a peak at an integer sample offset. At 16kHz, one sample is 62.5 microseconds. For video sync, the required accuracy is typically one frame (33ms at 30fps = 528 samples). So integer-sample accuracy is sufficient for the offset.

However, the correlation VALUE at the peak affects confidence scoring. If the true peak falls between two integer samples, the measured peak is lower than the true peak, and the confidence score underestimates the actual sync quality. This matters most for GCC-PHAT, where the correlation function has a sharp, narrow peak (by design -- PHAT normalization sharpens peaks). If the true peak is at sample 1000.4, the measured values at samples 1000 and 1001 may both be 0.7 when the true peak is 0.95.

**Prevention:**
- For offset accuracy: integer sample resolution is sufficient. Do not over-engineer sub-sample interpolation unless drift compensation requires it (which is out of scope).
- For confidence accuracy: apply parabolic interpolation around the peak. Fit a parabola through the peak and its two neighbors: `peakValue = y[peak] - (y[peak-1] - y[peak+1])^2 / (8 * (y[peak-1] - 2*y[peak] + y[peak+1]))`. This gives a better estimate of the true peak height.
- Do not use the raw integer-sample peak height for confidence scoring with GCC-PHAT -- it will systematically underestimate confidence, causing false "low confidence" warnings.

---

### Pitfall 11: Choosing Mel Scale When Linear Scale Is Needed (or Vice Versa)

**What goes wrong:**
Mel-scale spectrograms compress higher frequencies and expand lower frequencies, mimicking human perception. This is excellent for speech recognition and music genre classification. However, for time-delay estimation via cross-correlation, mel compression can REDUCE discrimination:

- Two signals that differ in high-frequency content (cymbals, sibilants, room reflections) look nearly identical after mel compression because the high-frequency differences are compressed into fewer bins.
- For GCC-PHAT, the mel scale is inappropriate because PHAT normalization assumes uniform frequency resolution across all bins. Applying PHAT to mel-scaled features produces incorrect phase estimates.

Conversely, using a linear spectrogram for MFCC-style correlation wastes resolution on high frequencies where human-audible differences (and microphone differences) are largest and least useful for sync.

**Prevention:**
- **For MFCC-based correlation (BBC approach):** Use mel scale. MFCCs are defined on the mel scale and the approach is proven for audio offset finding.
- **For GCC-PHAT cross-correlation:** Use linear scale (standard FFT bins). Do not apply mel filterbank before PHAT normalization.
- **For hybrid approaches:** Compute features on the appropriate scale for each stage. Coarse search can use MFCCs (mel), fine refinement can use linear-scale GCC-PHAT.
- Do not mix scales within a single correlation step.

---

## Minor Pitfalls

### Pitfall 12: FFT Size Not Power of 2 Degrades Performance

**What goes wrong:**
Modern FFT implementations (including browser-native and WASM) are optimized for power-of-2 sizes. A 2000-point FFT may be 3-10x slower than a 2048-point FFT. A 3000-point FFT may fall back to O(N^2) DFT.

**Prevention:**
- Always use power-of-2 FFT sizes: 512, 1024, 2048, 4096.
- When zero-padding signals for cross-correlation, round up to the next power of 2.

---

### Pitfall 13: Forgetting to Take Magnitude of Complex FFT Output

**What goes wrong:**
The FFT outputs complex numbers (real + imaginary parts). The spectrogram uses the magnitude (`sqrt(real^2 + imag^2)`) or power (`real^2 + imag^2`), not the raw complex values. If you accidentally use only the real part, you lose half the spectral information and the features become unreliable.

For cross-correlation in the frequency domain, you multiply `FFT(A) * conj(FFT(B))` -- this requires proper complex conjugate multiplication, not element-wise real multiplication.

**Prevention:**
- Implement complex multiplication explicitly: `(a_re * b_re + a_im * b_im) + j*(a_im * b_re - a_re * b_im)` for conjugate multiplication.
- For spectrograms, always compute magnitude: `Math.sqrt(re*re + im*im)` or use log-power: `10 * Math.log10(re*re + im*im + epsilon)`.
- Add unit tests that verify FFT output matches known analytical results (e.g., FFT of a single sine wave should produce a peak at the expected bin).

---

### Pitfall 14: Not Handling the DC and Nyquist Bins Correctly

**What goes wrong:**
For a real-valued input of length N, the FFT produces N/2 + 1 unique frequency bins (from DC to Nyquist). The DC bin (index 0) and Nyquist bin (index N/2) are purely real. Some FFT libraries pack these differently. If you process N/2 bins instead of N/2 + 1, you silently lose the Nyquist bin. If you treat the DC bin as complex, you introduce a spurious imaginary component.

**Prevention:**
- Know your FFT library's output format. JavaScript's common FFT libraries (fft.js, KissFFT WASM) use different packing conventions.
- For STFT computation, extract `N/2 + 1` magnitude values per frame (0 through Nyquist inclusive).
- The DC bin is rarely useful for audio correlation (it represents the constant offset). Consider zeroing it before correlation.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| FFT parameter selection | Too-small FFT window (Pitfall 1), non-power-of-2 (Pitfall 12) | Start with 2048 FFT, 512 hop, Hann window. Benchmark before changing. |
| Feature extraction | Raw spectrogram memory blowup (Pitfall 4), wrong scale (Pitfall 11) | Use MFCCs (26-40 coefficients) with mel scale for compact, perceptually-weighted features. Budget <2 MB per track. |
| Normalization | Device differences cause false low confidence (Pitfall 5), silence instability (Pitfall 8) | Z-score normalize per coefficient, energy-gate silent frames, clamp minimum std to 1e-6. |
| Cross-correlation | Circular correlation wraparound (Pitfall 2), repetitive music ambiguity (Pitfall 3) | Zero-pad to M+N-1 for linear correlation. Implement peak cluster analysis for periodicity detection. |
| Web Worker integration | Spectrogram transfer overhead (Pitfall 9) | Compute STFT inside the worker. Transfer raw audio (compact), not spectrograms (large). |
| Confidence scoring | Sub-sample peak underestimate (Pitfall 10), recalibration needed (Pitfall 6) | Parabolic interpolation of peak. Recalibrate thresholds on test corpus. |
| Regression testing | Breaking existing working cases (Pitfall 6) | Build regression suite FIRST. Run both old and new algorithms during transition. |
| Production rollout | Edge cases with silence, short clips, extreme offsets | Test with <5s clips, >30 min clips, clips with 90% silence, clips with mono tone |

## Integration Gotchas

| Integration Point | Common Mistake | Correct Approach |
|-------------------|----------------|------------------|
| Replacing SynAudio | Removing SynAudio entirely before new algorithm is validated | Keep SynAudio as fallback. New algorithm returns result + confidence; if confidence < threshold, automatically retry with SynAudio. |
| FFmpeg WASM audio extraction | Changing sample rate or format to accommodate new algorithm | Keep 16kHz mono PCM Float32Array output. The new algorithm must consume the same AudioData format. Do not change the extraction pipeline. |
| Confidence score interface | New algorithm produces different scale (e.g., 0-1 standard score vs 0-100 percentage) | Normalize to the existing 0-100 confidence scale. Recalibrate thresholds but maintain the same SyncResult interface. |
| Web Worker architecture | Creating a new worker architecture alongside SynAudio's | Replace SynAudio's worker, not add a parallel one. One sync entry point in audioSync.ts that dispatches to the new implementation. |
| Progress reporting | New algorithm has different phases (spectrogram, correlation, refinement) not reflected in UI | Map internal algorithm phases to the existing PipelineProgress 'correlating' stage. Use fine-grained progress within that stage. |
| Constants file | Adding many new constants (FFT size, hop, bands, etc.) without organization | Group new constants under a clear namespace (e.g., `SPECTRAL_SYNC_*` prefix) in constants.ts. |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Full spectrogram in memory for all tracks | Browser tab crashes or freezes; heap > 1 GB | Stream spectrograms per pair; use MFCCs instead (39x smaller) | >10 tracks of >5 minutes each |
| FFT computed in main thread | UI freezes during correlation; unresponsive for seconds | Compute all FFTs in Web Worker | Any recording longer than ~30 seconds |
| Structured clone of large typed arrays | 300ms+ delays per postMessage; visible UI stutters | Use Transferable ArrayBuffers or compute in worker | Any spectrogram transfer > 5 MB |
| GCC-PHAT on very long signals | Single FFT of full signal (e.g., 30 min = 28.8M points) uses ~230 MB per complex array | Segment-and-average: compute GCC-PHAT on overlapping 30-60s segments, average results | Recordings > 5 minutes |
| Repeated FFT computation | Computing STFT for the same track multiple times (once per pair comparison) | Cache STFT/MFCC features keyed by fileId; compute once, reuse across comparisons | >5 tracks (quadratic pairwise comparisons) |
| Large zero-padded FFT | Padding two 30-min tracks to M+N-1 at 16kHz = 57.6M samples; 460 MB per complex array | Use segment-based correlation instead of full-length FFT correlation | Two tracks totaling > 10 minutes |

## Memory Budget Reference

| Component | Per-Track Size (5 min @ 16kHz) | 10 Tracks | 30 Tracks |
|-----------|-------------------------------|-----------|-----------|
| Raw audio (Float32) | 19.2 MB | 192 MB | 576 MB |
| Full spectrogram (2048 FFT, 512 hop) | 38.4 MB | 384 MB | 1,152 MB |
| MFCC features (26 coeff, 512 hop) | 0.98 MB | 9.8 MB | 29.4 MB |
| Mel spectrogram (64 bands, 512 hop) | 2.4 MB | 24 MB | 72 MB |
| Cross-correlation buffer (1 pair, padded) | ~77 MB | N/A | N/A |
| GCC-PHAT buffer (1 pair, padded complex) | ~154 MB | N/A | N/A |

**Guidance:** Target total memory under 500 MB for the sync pipeline. This means: (1) do not hold full spectrograms for all tracks simultaneously, (2) use MFCCs or mel spectrograms for the main correlation, (3) process pairs sequentially and release buffers between pairs.

## Testing Strategy to Prevent Regression

### Build This Test Corpus FIRST

| Test Case | Content Type | Expected Behavior | Why It Matters |
|-----------|-------------|-------------------|----------------|
| Two cameras, clear dialogue, 5s offset | Speech | Offset within +/-1 sample, confidence > 90% | Baseline: must not regress |
| Two cameras, sharp clap test, 2s offset | Transient | Offset within +/-1 sample, confidence > 95% | Most distinctive signal; any algorithm must handle this |
| Two cameras, quiet ambient + occasional speech | Low-energy speech | Offset within +/-5 samples, confidence > 60% | Edge case for energy-gated approaches |
| Two cameras, concert music, 10s offset | Repetitive music | Correct offset (not shifted by loop length), confidence > 50% | The core motivating use case for v2.3 |
| Phone mic + DSLR mic, same content, 3s offset | Device mismatch | Correct offset, confidence > 50% | Device normalization validation |
| Two cameras, 30-minute recording, 5s offset | Long duration | Correct offset, memory < 500 MB, time < 30s | Performance and memory validation |
| Two cameras, one starts 45s before the other | Large offset | Correct offset, no wraparound artifacts | Circular correlation guard |
| Two cameras, pure silence | Silence | Low confidence (< 30%), no crash | Graceful degradation |
| Two cameras, 3s recording only | Very short | Offset within +/-2 samples, or low confidence (not crash) | Edge case for small windows |

### Dual-Run Validation
During the transition phase, run BOTH algorithms on every input and compare:
- If both agree on offset (+/- 5 samples): high confidence, use new algorithm's confidence score
- If they disagree: flag for manual review, prefer the result with higher confidence
- If new algorithm has lower confidence on a case that old algorithm handled well: regression detected

## Sources

- [BBC audio-offset-finder](https://github.com/bbc/audio-offset-finder) -- MFCC-based cross-correlation with standard score confidence; 26 MFCCs, 512 FFT, 128 hop, z-score normalization (HIGH confidence, direct code analysis)
- [GCC-PHAT: Generalized Cross Correlation with Phase Transform](https://xavieranguera.com/phdthesis/node92.html) -- Phase normalization for robustness to reverberation and frequency response differences (HIGH confidence, academic source)
- [Shazam: An Industrial-Strength Audio Search Algorithm](https://www.ee.columbia.edu/~dpwe/papers/Wang03-shazam.pdf) -- Constellation map fingerprinting, peak detection in spectrograms (HIGH confidence, foundational paper)
- [SpectroMap: Peak detection algorithm for audio fingerprinting](https://arxiv.org/pdf/2211.00982) -- Spectrogram peak parameters: minimum distance, relative threshold (HIGH confidence, peer-reviewed)
- [Cross-Correlation and Spectral Audio Signal Processing](https://www.dsprelated.com/freebooks/sasp/Cross_Correlation.html) -- Circular vs linear correlation, zero-padding requirements (HIGH confidence, DSP textbook)
- [FFT Convolution and Zero-Padding](https://www.matecdev.com/posts/julia-fft-convolution.html) -- M+N-1 padding for linear correlation from circular FFT (HIGH confidence)
- [Understanding FFTs and Windowing](https://www.ni.com/en/shop/data-acquisition/measurement-fundamentals/analog-fundamentals/understanding-ffts-and-windowing.html) -- Hann vs Hamming vs Blackman window comparison (HIGH confidence, NI documentation)
- [KISS FFT WASM vs fft.js performance](https://toughengineer.github.io/demo/dsp/fft-perf/) -- Browser FFT performance: WASM competitive with JS, data copy overhead (MEDIUM confidence, community benchmark)
- [Web Worker Transferable Objects](https://developer.chrome.com/blog/transferable-objects-lightning-fast) -- Zero-copy transfer <10ms vs structured clone 302ms for 32MB (HIGH confidence, Chrome docs)
- [postMessage performance benchmarks](https://surma.dev/things/is-postmessage-slow/) -- Typed array transfer costs by size (HIGH confidence)
- [Performance issue of massive transferable objects](https://joji.me/en-us/blog/performance-issue-of-using-massive-transferable-objects-in-web-worker/) -- Chrome parsing overhead with many Transferable Objects (MEDIUM confidence, community analysis)
- [Web Audio API performance notes](https://padenot.github.io/web-audio-perf/) -- Float32Array reuse, typed array allocator overhead (HIGH confidence, Mozilla developer)
- [Selecting appropriate spectrogram parameters](https://avisoft.com/tutorials/selecting-appropriate-spectrogram-parameters/) -- FFT size vs frequency/time resolution tradeoff (HIGH confidence)
- [Audio Deep Learning: Why Mel Spectrograms perform better](https://towardsdatascience.com/audio-deep-learning-made-simple-part-2-why-mel-spectrograms-perform-better-aad889a93505/) -- Mel vs linear scale for audio features (MEDIUM confidence)
- [Digital spectrographic cross-correlation: tests of sensitivity](https://www.bioacoustics.info/article/digital-spectrographic-cross-correlation-tests-sensitivity) -- SPCC validation methodology with known-good references (MEDIUM confidence)

---
*Pitfalls research for: Spectral audio synchronization algorithm (v2.3)*
*Researched: 2026-03-28*
