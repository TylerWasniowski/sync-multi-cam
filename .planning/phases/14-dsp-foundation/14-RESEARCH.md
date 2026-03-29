# Phase 14: DSP Foundation - Research

**Researched:** 2026-03-28
**Domain:** GCC-PHAT algorithm implementation, FFT-based cross-correlation, DSP unit testing
**Confidence:** HIGH

## Summary

Phase 14 implements the GCC-PHAT (Generalized Cross-Correlation with Phase Transform) algorithm as a pure computation module (`fftEngine.ts`) with comprehensive unit tests against synthetic signals at known offsets. This phase produces the algorithm engine only -- no Web Worker wrapping, no UI changes, no pipeline integration. The scope is approximately 120-150 lines of algorithm code plus 150-200 lines of tests.

The implementation uses `fft.js` (v4.0.4, the latest on npm) as the sole new dependency -- a 5KB pure JavaScript Radix-4 FFT library. The algorithm accepts two Float32Array PCM signals and returns `{ offsetSamples: number, confidence: number }`. All critical algorithm details (FFT size calculation, Hann windowing, phase transform, parabolic peak interpolation, confidence scoring) are well-documented in the project's existing STACK.md and ARCHITECTURE.md research.

**Primary recommendation:** Implement `fftEngine.ts` as a single focused module containing all pure math functions (Hann window, GCC-PHAT cross-correlation, parabolic peak interpolation, confidence scoring). Test with four categories of synthetic signals: known-offset sine waves, filtered signals (different frequency responses), repetitive/looped waveforms, and edge cases (silence, identical signals). The fft.js type declarations need a small correction from the STACK.md spec (the library returns plain `Array`, not `Float32Array`).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Split GCC-PHAT into focused modules per STACK.md research layout: `fftEngine.ts` for core math (Hann window, GCC-PHAT cross-correlation, peak finding with parabolic interpolation, confidence scoring) -- approximately 120-150 lines
- **D-02:** This phase creates the algorithm module only. No `spectralSync.ts` worker wrapper or `spectralSyncWorker.ts` -- those belong in Phase 15 (Worker Integration)
- **D-03:** Use fft.js as the sole new dependency (pure JS, 5KB, MIT). Add TypeScript declarations via `src/types/fft.js.d.ts` per STACK.md spec
- **D-04:** Unit tests must cover all 4 success criteria from ROADMAP.md (known offsets, different frequency responses, repetitive signals, confidence discrimination)
- **D-05:** Test signals are generated synthetically in the test file (no external audio fixtures). Use known mathematical signals: sine waves, filtered noise, looped waveforms
- **D-06:** Confidence is based on peak-to-noise-floor ratio per STACK.md formula: `confidence = clamp((ratio - 2) / 13, 0, 1) * 100` where ratio = peakValue / meanNoiseFloor (excluding peak neighborhood)
- **D-07:** This produces interpretable scores: high confidence = one clear peak (unambiguous offset), low confidence = multiple candidate offsets or flat noise floor (ambiguous)
- **D-08:** Output range is 0-100 to match existing SyncResult interface. Threshold of ~25 indicates unreliable sync

### Claude's Discretion
- Exact Hann window implementation details
- Zero-padding strategy for FFT size (nextPowerOf2 of combined lengths per STACK.md)
- Epsilon value for phase transform division-by-zero protection (STACK.md suggests 1e-10)
- Peak neighborhood exclusion radius for noise floor calculation
- Edge case handling: silence returns low confidence, identical signals return offset 0 with high confidence, clips below minimum length throw clear error
- Internal function signatures and naming conventions

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ALG-01 | App uses GCC-PHAT (phase-normalized frequency-domain cross-correlation) instead of SynAudio Pearson correlation | Core algorithm in `fftEngine.ts`: FFT both signals, compute cross-power spectrum, normalize magnitude (phase transform), IFFT, find peak |
| ALG-02 | Robust to different recording devices (different frequency responses) | Phase transform normalizes magnitude to 1 for all frequency bins, eliminating spectral shape differences. Test with high-pass/low-pass filtered versions of same signal |
| ALG-03 | Handles repetitive audio without silently locking onto wrong beat | Confidence scoring detects ambiguity: multiple similar-height peaks produce low confidence. Test with looped waveforms |
| ALG-04 | Uses Hann windowing and zero-padding for correct linear (not circular) cross-correlation | `applyHannWindow()` function + `nextPowerOf2(ref.length + comp.length)` zero-padding ensures linear correlation |
| ALG-05 | Parabolic peak interpolation for sub-sample offset accuracy | `findPeakParabolic()` fits a parabola through peak and two neighbors for fractional sample precision |
| CONF-01 | Confidence based on peak-to-noise-floor ratio, not raw correlation magnitude | `computeConfidence()` divides peak value by mean noise floor (excluding peak neighborhood), maps ratio 2-15 to 0-100 |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fft.js | 4.0.4 (verified on npm 2026-03-28) | Radix-4 FFT (forward and inverse) | Pure JS, 5KB, MIT, zero dependencies, 44 npm dependents, works in Workers without WASM instantiation |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | 4.0.18 (project already has it) | Unit test framework | All fftEngine.test.ts tests |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| fft.js (5KB, pure JS) | KissFFT WASM (55KB) | 2-5x faster at large sizes, but WASM instantiation complexity and copying overhead. For 3-6 FFTs per sync session, pure JS is fast enough |
| Custom GCC-PHAT (~150 lines) | essentia.js (1.2MB WASM) | Full audio analysis framework, massive overkill for single cross-correlation operation |
| Parabolic interpolation | Gaussian or sinc interpolation | Gaussian is slightly more accurate for correlation peaks, but parabolic is standard for GCC-PHAT and simpler to implement. Sinc is highest accuracy but computationally expensive |

**Installation:**
```bash
npm install fft.js
```

**Version verification:** fft.js v4.0.4 is the latest on npm as of 2026-03-28. No `@types/fft.js` package exists -- custom `.d.ts` needed.

## Architecture Patterns

### Recommended Project Structure
```
src/
  lib/
    fftEngine.ts              # NEW - Pure math: Hann window, GCC-PHAT, peak finding, confidence
  lib/__tests__/
    fftEngine.test.ts         # NEW - Synthetic signal tests for all 4 success criteria
  types/
    fft.js.d.ts               # NEW - TypeScript declarations for fft.js (no @types available)
```

### Pattern 1: Pure Computation Module (No Side Effects)
**What:** `fftEngine.ts` exports only pure functions with no DOM, Worker, or global state dependencies.
**When to use:** Always for algorithm code that will later be imported into a Web Worker.
**Example:**
```typescript
// Source: ARCHITECTURE.md Module 3 spec + fft.js README
import FFT from 'fft.js';

export function gccPhat(
  reference: Float32Array,
  comparison: Float32Array,
  sampleRate: number,
  maxOffsetSeconds: number
): { offsetSamples: number; confidence: number } {
  // 1. Apply Hann window to both
  // 2. Zero-pad to nextPowerOf2(ref.length + comp.length)
  // 3. FFT both
  // 4. Cross-power spectrum with phase transform
  // 5. IFFT
  // 6. Find peak with parabolic interpolation
  // 7. Compute confidence from peak sharpness
}
```

### Pattern 2: Synthetic Test Signal Generation
**What:** Generate test signals mathematically rather than using audio fixtures.
**When to use:** For unit tests of DSP algorithms where the ground truth offset is known exactly.
**Example:**
```typescript
// Generate a sine wave with known parameters
function makeSine(freq: number, sampleRate: number, duration: number, offset: number = 0): Float32Array {
  const numSamples = Math.floor(sampleRate * duration);
  const signal = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    signal[i] = Math.sin(2 * Math.PI * freq * (i + offset) / sampleRate);
  }
  return signal;
}

// Create a delayed copy: reference starts at sample 0, comparison starts at sample N
// GCC-PHAT should find offset = N
```

### Pattern 3: Constrained Peak Search (Circular Correlation Wrap)
**What:** FFT-based correlation is circular. Positive offsets appear at low indices, negative offsets at high indices (wrapping around).
**When to use:** Always in the peak finding function.
**Example:**
```typescript
// Source: ARCHITECTURE.md Anti-Pattern 3
// Search only [0, maxOffset] for positive offsets
// and [fftSize - maxOffset, fftSize] for negative offsets
// Index mapping:
//   i < fftSize/2  -> offset = +i samples (comparison LATER than reference)
//   i >= fftSize/2 -> offset = i - fftSize samples (comparison EARLIER)
```

### Pattern 4: Parabolic Peak Interpolation for Sub-Sample Accuracy
**What:** Fit a parabola through the peak and its two neighbors to find the fractional sample offset.
**When to use:** After finding the integer peak index in the correlation output.
**Example:**
```typescript
// Source: DSP literature, standard technique
// Given peak at index k with neighbors k-1, k+1:
// alpha = correlation[k-1]
// beta  = correlation[k]    (the peak)
// gamma = correlation[k+1]
// fractionalOffset = 0.5 * (alpha - gamma) / (alpha - 2*beta + gamma)
// refinedOffset = k + fractionalOffset
```

### Anti-Patterns to Avoid
- **Running FFT on main thread:** Phase 14 is algorithm-only (no worker), but design the module to be worker-importable. No DOM dependencies, no global state.
- **Full spectrogram (STFT):** Do NOT compute time-frequency spectrograms. GCC-PHAT on full signal is faster and more accurate for time-delay estimation.
- **Not handling circular correlation wrap:** FFT correlation wraps around. Index `fftSize - 1` is offset -1, not offset `fftSize - 1`. Must map indices correctly.
- **Using fft.js `createComplexArray()` for large FFTs:** Returns plain `Array`, not typed array. For 8M-point FFTs, plain arrays waste 2x memory vs Float64Array. Allocate typed arrays manually for the output buffers.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| FFT computation | Custom DFT or Cooley-Tukey implementation | fft.js `realTransform` + `completeSpectrum` + `inverseTransform` | Radix-4 implementation is battle-tested, handles edge cases (power-of-2 sizing, numerical stability), 40% faster for real input |
| Complex number arithmetic | Custom complex number class | Interleaved [re, im, re, im, ...] arrays | Matches fft.js internal format, avoids object allocation overhead |

**Key insight:** The GCC-PHAT algorithm itself IS the custom code (~150 lines). It is too domain-specific and too small for a library. But the FFT underneath MUST be a library (fft.js) because FFT implementations have decades of edge cases.

## Common Pitfalls

### Pitfall 1: fft.js Array Type Mismatch
**What goes wrong:** The STACK.md type declarations specify `Float32Array` for `createComplexArray()` and other methods, but fft.js actually returns plain JavaScript `Array` objects.
**Why it happens:** The STACK.md `.d.ts` was written speculatively. The actual fft.js source uses `new Array(this._csize)`.
**How to avoid:** The `.d.ts` should use `number[]` for return types of `createComplexArray()`, `toComplexArray()`, and `fromComplexArray()`. However, fft.js methods use only bracket indexing internally, so `Float64Array` or `Float32Array` can be passed as output buffers if pre-allocated. The safest approach: declare returns as `number[]`, but in the implementation, allocate `Float64Array` for output buffers and pass them to fft.js (which works because fft.js only uses bracket indexing).
**Warning signs:** TypeScript compile errors about Array vs Float32Array, or runtime errors if Array methods are called on typed arrays.

### Pitfall 2: realTransform Only Fills Left Half
**What goes wrong:** `fft.realTransform(output, input)` fills only the left half of the output array. If you skip `completeSpectrum()`, the right half is zeros, corrupting the cross-power spectrum.
**Why it happens:** Real-valued signals have conjugate-symmetric spectra. `realTransform` exploits this for speed but requires `completeSpectrum()` to fill the conjugate half.
**How to avoid:** Always call `fft.completeSpectrum(spectrum)` after `fft.realTransform(spectrum, input)` before using the spectrum for cross-correlation.
**Warning signs:** Incorrect offset results, especially for negative offsets.

### Pitfall 3: Phase Transform Division by Zero
**What goes wrong:** When `|G(f)|` is near zero (quiet frequency bins, silence), dividing by zero produces NaN/Infinity that propagates through the entire IFFT.
**Why it happens:** Silence or very quiet signals have near-zero magnitude across all bins.
**How to avoid:** Use epsilon guard: `magnitude > 1e-10 ? 1.0 / magnitude : 0.0`. Zero out bins below epsilon rather than normalizing noise.
**Warning signs:** NaN in correlation output, confidence = NaN.

### Pitfall 4: Confidence Score Scaling (0-1 vs 0-100)
**What goes wrong:** The CONTEXT.md says output range is 0-100 (D-08), but the formula in D-06 says `clamp((ratio - 2) / 13, 0, 1) * 100`. Easy to forget the `* 100` or apply it twice.
**Why it happens:** Two different conventions in the system: internal 0-1 in `fftEngine.ts`, 0-100 in `SyncResult.confidence`.
**How to avoid:** The `fftEngine.ts` module should return confidence in 0-100 range directly (per D-08), since this module's output will eventually feed into SyncResult in Phase 15. Document the range clearly in the return type.
**Warning signs:** Confidence values all near 0 (forgot `* 100`) or values >100 (double-applied).

### Pitfall 5: Hann Window Edge Case for N=1
**What goes wrong:** The standard Hann formula `0.5 * (1 - cos(2*PI*i / (N-1)))` divides by zero when N=1.
**Why it happens:** Edge case with very short signals.
**How to avoid:** Guard against N <= 1: return the signal unchanged (or throw for signals below a minimum length). The CONTEXT.md says "clips below minimum length throw clear error" is at Claude's discretion.
**Warning signs:** NaN in windowed signal.

### Pitfall 6: Offset Sign Convention
**What goes wrong:** Confusion about whether a positive offset means "comparison starts LATER" or "comparison starts EARLIER" than reference.
**Why it happens:** The circular FFT correlation output requires careful index-to-offset mapping.
**How to avoid:** Establish and document the convention clearly: positive offset = comparison needs to be shifted forward (it started later). Verify with a simple test: create a delayed copy, confirm the sign matches the convention.
**Warning signs:** Offsets with wrong sign, sync results that move tracks in the wrong direction.

### Pitfall 7: Float64 vs Float32 Precision for Large FFTs
**What goes wrong:** Using Float32Array for intermediate FFT computations at large sizes (8M points) can accumulate floating-point errors that shift the peak by a sample or produce noisy correlation output.
**Why it happens:** Float32 has only ~7 decimal digits of precision. Cumulative multiply-add across millions of samples loses precision.
**How to avoid:** Use Float64Array (or plain arrays, which use float64 in JS) for all FFT intermediate buffers. The input PCM is Float32Array but should be copied to Float64Array for FFT processing. The performance difference is negligible for 3-6 FFT operations.
**Warning signs:** Tests pass for short signals but fail for longer signals; sub-sample interpolation produces nonsensical fractional offsets.

## Code Examples

Verified patterns from official sources:

### fft.js Basic Usage
```typescript
// Source: https://github.com/indutny/fft.js README
import FFT from 'fft.js';

const fftSize = 1024; // must be power of 2
const fft = new FFT(fftSize);

// For real-valued input (PCM audio):
const input = new Array(fftSize); // real values
const output = fft.createComplexArray(); // interleaved [re, im, re, im, ...]

fft.realTransform(output, input);   // fills LEFT HALF only
fft.completeSpectrum(output);       // mirrors conjugate to right half

// For inverse transform:
const timeOutput = fft.createComplexArray();
fft.inverseTransform(timeOutput, output);
// timeOutput is interleaved complex; extract real parts for correlation values
```

### Hann Window
```typescript
// Source: standard DSP, confirmed in ARCHITECTURE.md
export function applyHannWindow(signal: Float32Array): Float32Array {
  const N = signal.length;
  if (N <= 1) return new Float32Array(signal); // guard edge case
  const windowed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
    windowed[i] = signal[i] * w;
  }
  return windowed;
}
```

### Parabolic Peak Interpolation
```typescript
// Source: DSP literature standard, cross-referenced with multiple academic sources
// Given discrete peak at index k, refine to sub-sample precision
function parabolicInterpolation(
  correlation: number[],
  peakIndex: number
): number {
  if (peakIndex <= 0 || peakIndex >= correlation.length - 1) {
    return peakIndex; // can't interpolate at boundaries
  }
  const alpha = correlation[peakIndex - 1];
  const beta = correlation[peakIndex];
  const gamma = correlation[peakIndex + 1];
  const denominator = alpha - 2 * beta + gamma;
  if (Math.abs(denominator) < 1e-10) {
    return peakIndex; // flat peak, no refinement possible
  }
  const fractional = 0.5 * (alpha - gamma) / denominator;
  return peakIndex + fractional;
}
```

### Confidence Scoring (Peak-to-Noise-Floor Ratio)
```typescript
// Source: STACK.md + ARCHITECTURE.md confidence formula
function computeConfidence(
  correlation: number[],
  peakIndex: number,
  searchRangeStart: number,
  searchRangeEnd: number,
  neighborhoodRadius: number = 50
): number {
  const peakValue = Math.abs(correlation[peakIndex]);

  let sum = 0;
  let count = 0;
  for (let i = searchRangeStart; i < searchRangeEnd; i++) {
    if (Math.abs(i - peakIndex) > neighborhoodRadius) {
      sum += Math.abs(correlation[i]);
      count++;
    }
  }
  const meanNoise = count > 0 ? sum / count : 0;

  if (meanNoise === 0) return peakValue > 0 ? 100 : 0;
  const ratio = peakValue / meanNoise;

  // Map ratio 2-15 to confidence 0-100
  return Math.round(Math.min(100, Math.max(0, ((ratio - 2) / 13) * 100)));
}
```

### Synthetic Test Signal: Delayed Sine Wave
```typescript
// Source: standard DSP test methodology
function createDelayedSine(
  frequency: number,
  sampleRate: number,
  durationSeconds: number,
  delaySamples: number
): { reference: Float32Array; comparison: Float32Array } {
  const totalSamples = Math.floor(sampleRate * durationSeconds) + Math.abs(delaySamples);
  const refLength = Math.floor(sampleRate * durationSeconds);
  const compLength = refLength;

  const reference = new Float32Array(refLength);
  const comparison = new Float32Array(compLength);

  for (let i = 0; i < refLength; i++) {
    reference[i] = Math.sin(2 * Math.PI * frequency * i / sampleRate);
  }
  for (let i = 0; i < compLength; i++) {
    comparison[i] = Math.sin(2 * Math.PI * frequency * (i + delaySamples) / sampleRate);
  }

  return { reference, comparison };
}
```

### Synthetic Test Signal: Filtered Noise (Simulating Different Microphones)
```typescript
// Source: standard DSP test methodology for frequency response robustness
function applySimpleHighPass(signal: Float32Array, cutoff: number, sampleRate: number): Float32Array {
  // First-order IIR high-pass filter
  const RC = 1.0 / (2 * Math.PI * cutoff);
  const dt = 1.0 / sampleRate;
  const alpha = RC / (RC + dt);
  const filtered = new Float32Array(signal.length);
  filtered[0] = signal[0];
  for (let i = 1; i < signal.length; i++) {
    filtered[i] = alpha * (filtered[i - 1] + signal[i] - signal[i - 1]);
  }
  return filtered;
}

function applySimpleLowPass(signal: Float32Array, cutoff: number, sampleRate: number): Float32Array {
  // First-order IIR low-pass filter
  const RC = 1.0 / (2 * Math.PI * cutoff);
  const dt = 1.0 / sampleRate;
  const alpha = dt / (RC + dt);
  const filtered = new Float32Array(signal.length);
  filtered[0] = signal[0];
  for (let i = 1; i < signal.length; i++) {
    filtered[i] = filtered[i - 1] + alpha * (signal[i] - filtered[i - 1]);
  }
  return filtered;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SynAudio Pearson correlation on raw waveforms | GCC-PHAT phase-normalized cross-correlation | This milestone (v2.3) | Robust to mic differences, reverb, repetitive content |
| Sample-level offset precision | Sub-sample precision via parabolic interpolation | This milestone (v2.3) | ~62 microsecond precision at 16kHz vs 62.5 microsecond per-sample quantization |
| Correlation magnitude as confidence | Peak-to-noise-floor ratio as confidence | This milestone (v2.3) | Interpretable: "sharp peak" vs "ambiguous multiple peaks" |

**fft.js status:** v4.0.4 is the latest release, last published on npm. The library is stable and mature (334 GitHub stars, 44 npm dependents). No major API changes expected.

## fft.js API Corrections (vs STACK.md)

The STACK.md type declarations need correction. Key findings from source code analysis:

| STACK.md Declares | Actual Behavior | Impact |
|-------------------|-----------------|--------|
| `createComplexArray(): Float32Array` | Returns `Array` (plain JS array) | Type declaration must use `number[]` for return type |
| `toComplexArray(): Float32Array` | Returns `Array` | Same correction needed |
| `fromComplexArray(): Float32Array` | Returns `Array` | Same correction needed |
| `realTransform` fills full output | Fills LEFT HALF only | Must call `completeSpectrum()` after `realTransform()` |

**However:** fft.js uses only bracket indexing internally, so typed arrays (Float64Array) can be passed as output buffers and will work correctly. The recommendation is:

1. Declare `.d.ts` with return types as `number[]` for creation methods
2. Accept `ArrayLike<number>` for input parameters
3. In implementation, allocate `Float64Array` output buffers manually (not via `createComplexArray`) for memory efficiency at large FFT sizes
4. Pass these typed arrays to `realTransform`/`inverseTransform` -- works because fft.js only uses bracket indexing

### Corrected Type Declaration
```typescript
// src/types/fft.js.d.ts
declare module 'fft.js' {
  export default class FFT {
    constructor(size: number);
    readonly size: number;
    createComplexArray(): number[];
    toComplexArray(input: ArrayLike<number>, storage?: number[]): number[];
    fromComplexArray(complex: ArrayLike<number>, storage?: number[]): number[];
    realTransform(output: ArrayLike<number>, input: ArrayLike<number>): void;
    completeSpectrum(spectrum: ArrayLike<number>): void;
    transform(output: ArrayLike<number>, input: ArrayLike<number>): void;
    inverseTransform(output: ArrayLike<number>, input: ArrayLike<number>): void;
  }
}
```

## Open Questions

1. **Peak neighborhood exclusion radius for confidence**
   - What we know: ARCHITECTURE.md uses 50 samples as the neighborhood radius
   - What's unclear: Whether 50 is optimal for 16kHz audio. At 16kHz, 50 samples = 3.1ms, which should cover the main lobe of the GCC-PHAT peak
   - Recommendation: Start with 50, adjust if confidence tests show poor discrimination. This is at Claude's discretion per CONTEXT.md

2. **Float64Array vs plain Array for FFT buffers**
   - What we know: fft.js uses plain Array internally but accepts typed arrays via bracket indexing
   - What's unclear: Whether there are subtle edge cases where fft.js internal code path assumes plain Array behavior
   - Recommendation: Use Float64Array for output buffers (better memory, same precision as JS number). Test thoroughly with both short and long signals. If any issues arise, fall back to plain arrays.

3. **Minimum signal length**
   - What we know: CONTEXT.md says "clips below minimum length throw clear error" is at Claude's discretion
   - What's unclear: What the practical minimum is
   - Recommendation: Minimum of 1024 samples (64ms at 16kHz). Below this, FFT is meaningless for audio sync. Throw a descriptive error.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.18 |
| Config file | `vite.config.ts` (inline `test` block: `{ environment: 'node' }`) |
| Quick run command | `npx vitest run src/lib/__tests__/fftEngine.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ALG-01 | GCC-PHAT computes correct offset for known-delay signals | unit | `npx vitest run src/lib/__tests__/fftEngine.test.ts -t "known offset"` | Wave 0 |
| ALG-02 | Robust to different frequency responses (filtered signals) | unit | `npx vitest run src/lib/__tests__/fftEngine.test.ts -t "frequency response"` | Wave 0 |
| ALG-03 | Repetitive signals produce low confidence, not wrong offset | unit | `npx vitest run src/lib/__tests__/fftEngine.test.ts -t "repetitive"` | Wave 0 |
| ALG-04 | Hann windowing + zero-padding for linear correlation | unit | `npx vitest run src/lib/__tests__/fftEngine.test.ts -t "windowing"` | Wave 0 |
| ALG-05 | Parabolic interpolation for sub-sample accuracy | unit | `npx vitest run src/lib/__tests__/fftEngine.test.ts -t "sub-sample"` | Wave 0 |
| CONF-01 | Peak-to-noise-floor confidence distinguishes sharp vs flat | unit | `npx vitest run src/lib/__tests__/fftEngine.test.ts -t "confidence"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run src/lib/__tests__/fftEngine.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/lib/__tests__/fftEngine.test.ts` -- covers ALG-01 through ALG-05 and CONF-01
- [ ] Framework install: `npm install fft.js` -- new dependency needed before tests can import fftEngine.ts
- [ ] `src/types/fft.js.d.ts` -- TypeScript declarations for untyped fft.js package

## Test Signal Design Patterns

The four required test categories and recommended signal designs:

### Category 1: Known Offsets (ALG-01, ALG-04, ALG-05)
- **Positive offset:** Generate 1-second 440Hz sine at 16kHz. Create delayed copy offset by +160 samples (10ms). Verify GCC-PHAT returns 160 within sub-sample accuracy.
- **Negative offset:** Same signal, comparison offset by -80 samples. Verify GCC-PHAT correctly returns negative offset.
- **Zero offset:** Identical signals. Verify offset = 0, high confidence.
- **Non-integer offset for sub-sample test:** Generate signals with fractional-sample delay using phase shift in the sine. Verify parabolic interpolation recovers the fractional part.

### Category 2: Different Frequency Responses (ALG-02)
- Generate broadband noise (white noise or multi-frequency signal) at known offset
- Apply first-order high-pass filter (cutoff 500Hz) to one copy (simulating phone mic)
- Apply first-order low-pass filter (cutoff 2000Hz) to another copy (simulating DSLR)
- Verify GCC-PHAT finds the same offset regardless of filtering
- The phase transform normalizes magnitude, so spectral shape differences should not affect the result

### Category 3: Repetitive Signals (ALG-03, CONF-01)
- Generate a short pattern (e.g., 100ms click) and loop it every 500ms
- Create two copies with known offset
- GCC-PHAT should find SOME offset, but confidence should be LOW because multiple peaks exist at loop intervals
- Compare confidence against a non-repetitive signal at the same offset (should be HIGH)

### Category 4: Confidence Discrimination (CONF-01)
- **Sharp peak:** Two recordings of same impulse at known offset -- confidence should be high (>70)
- **Multiple peaks:** Repetitive/looped signal -- confidence should be low (<40)
- **Flat noise floor:** Two unrelated random noise signals -- confidence should be very low (<10)
- **Silence:** Near-zero signal -- confidence should be 0

## Sources

### Primary (HIGH confidence)
- [fft.js GitHub (indutny)](https://github.com/indutny/fft.js/) - API reference verified against source code. `realTransform` fills left half only, `completeSpectrum` mirrors conjugate. Returns plain Array, not typed array. Uses bracket indexing (typed array compatible).
- [fft.js npm](https://www.npmjs.com/package/fft.js) - Version 4.0.4 verified as latest
- [GCC-PHAT academic reference](https://xavieranguera.com/phdthesis/node92.html) - PHAT weighting mathematical foundation
- Project STACK.md (`.planning/research/STACK.md`) - Algorithm steps, parameter values, performance estimates
- Project ARCHITECTURE.md (`.planning/research/ARCHITECTURE.md`) - Module design, data flow, anti-patterns, confidence formula

### Secondary (MEDIUM confidence)
- [Delay Estimation by FFT (dsprelated.com)](https://www.dsprelated.com/showarticle/26.php) - FFT cross-correlation, zero-padding for linear correlation
- [PMC: Unbiased Subsample Interpolation](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3656167/) - Parabolic interpolation accuracy analysis, confirms standard formula
- [Phase correlation (Wikipedia)](https://en.wikipedia.org/wiki/Phase_correlation) - Parabolic sub-sample interpolation formula verification
- [MATLAB gccphat reference](https://www.mathworks.com/help/phased/ref/gccphat.html) - Cross-reference for algorithm correctness

### Tertiary (LOW confidence)
- [Acoustic Sensor Testing with GCC-PHAT (MDPI)](https://www.mdpi.com/2624-6511/9/1/17) - Confirms synthetic signal generation with known offsets is standard validation practice for GCC-PHAT

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - fft.js v4.0.4 verified on npm, API verified against source code, type behavior confirmed
- Architecture: HIGH - Module design fully specified in project ARCHITECTURE.md, algorithm steps from academic literature
- Pitfalls: HIGH - fft.js API corrections verified against actual source code, common DSP pitfalls well-documented in literature
- Test design: HIGH - Standard DSP testing methodology, four test categories directly match phase success criteria

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (stable domain, fft.js is mature)

---
*Phase: 14-dsp-foundation*
*Research completed: 2026-03-28*
