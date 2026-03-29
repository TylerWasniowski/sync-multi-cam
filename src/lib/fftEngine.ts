/**
 * GCC-PHAT (Generalized Cross-Correlation with Phase Transform) engine.
 *
 * Pure computation module — no DOM, Worker, or global state dependencies.
 * Accepts two Float32Array PCM signals and returns { offsetSamples, confidence }.
 *
 * Positive offsetSamples means the comparison signal started LATER than the reference.
 * Confidence is 0-100: high = clear unique peak, low = ambiguous or no correlation.
 */

import FFT from 'fft.js';

/** Minimum signal length for meaningful FFT correlation */
const MIN_SIGNAL_LENGTH = 1024;

/** Epsilon for division-by-zero protection in phase transform */
const EPSILON = 1e-10;

/** Peak neighborhood exclusion radius (samples) for noise floor calculation */
const NEIGHBORHOOD_RADIUS = 50;

/**
 * Apply a Hann window to the signal, reducing spectral leakage.
 * Returns a new Float32Array (does not mutate input).
 */
export function applyHannWindow(signal: Float32Array): Float32Array {
  const N = signal.length;
  if (N <= 1) return new Float32Array(signal);

  const windowed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
    windowed[i] = signal[i] * w;
  }
  return windowed;
}

/**
 * GCC-PHAT cross-correlation between two signals.
 *
 * @param reference - Reference signal (Float32Array PCM)
 * @param comparison - Comparison signal (Float32Array PCM)
 * @param sampleRate - Sample rate in Hz (e.g. 16000)
 * @param maxOffsetSeconds - Maximum plausible offset in seconds (limits search range)
 * @returns { offsetSamples, confidence } where offsetSamples is sub-sample precise
 */
export function gccPhat(
  reference: Float32Array,
  comparison: Float32Array,
  sampleRate: number,
  maxOffsetSeconds: number
): { offsetSamples: number; confidence: number } {
  // Validate minimum length
  if (reference.length < MIN_SIGNAL_LENGTH || comparison.length < MIN_SIGNAL_LENGTH) {
    throw new Error(
      `Signals must be at least ${MIN_SIGNAL_LENGTH} samples (minimum for meaningful correlation)`
    );
  }

  // 1. Apply Hann window to both signals (ALG-04)
  const refWindowed = applyHannWindow(reference);
  const compWindowed = applyHannWindow(comparison);

  // 2. Calculate FFT size: next power of 2 >= sum of lengths (zero-padding for linear correlation)
  const fftSize = nextPowerOf2(reference.length + comparison.length);
  const fft = new FFT(fftSize);

  // 3. Zero-pad into Float64Array for precision (Pitfall 7: use Float64 for intermediates)
  const refPadded = new Float64Array(fftSize);
  refPadded.set(refWindowed);
  const compPadded = new Float64Array(fftSize);
  compPadded.set(compWindowed);

  // 4. Allocate complex output buffers as Float64Array
  // Interleaved complex format: [re0, im0, re1, im1, ...]
  const refSpectrum = new Float64Array(fftSize * 2);
  const compSpectrum = new Float64Array(fftSize * 2);

  // 5. FFT both signals (ALG-01: frequency-domain cross-correlation)
  fft.realTransform(refSpectrum, refPadded);
  fft.completeSpectrum(refSpectrum); // CRITICAL: Pitfall 2 — fill right half
  fft.realTransform(compSpectrum, compPadded);
  fft.completeSpectrum(compSpectrum);

  // 6. Cross-power spectrum with phase transform (GCC-PHAT)
  // G(f) = FFT(ref) * conj(FFT(comp))
  // W(f) = G(f) / |G(f)| — phase transform normalizes magnitude (ALG-02)
  const crossSpectrum = new Float64Array(fftSize * 2);
  for (let i = 0; i < fftSize; i++) {
    const refRe = refSpectrum[2 * i];
    const refIm = refSpectrum[2 * i + 1];
    const compRe = compSpectrum[2 * i];
    const compIm = compSpectrum[2 * i + 1];

    // Cross-power: ref * conj(comp)
    const crossRe = refRe * compRe + refIm * compIm;
    const crossIm = refIm * compRe - refRe * compIm;

    // Phase transform: normalize by magnitude
    const magnitude = Math.sqrt(crossRe * crossRe + crossIm * crossIm);
    if (magnitude > EPSILON) {
      crossSpectrum[2 * i] = crossRe / magnitude;
      crossSpectrum[2 * i + 1] = crossIm / magnitude;
    } else {
      crossSpectrum[2 * i] = 0;
      crossSpectrum[2 * i + 1] = 0;
    }
  }

  // 7. IFFT to get GCC-PHAT correlation
  const corrComplex = new Float64Array(fftSize * 2);
  fft.inverseTransform(corrComplex, crossSpectrum);

  // Extract real parts into correlation array
  const correlation = new Float64Array(fftSize);
  for (let i = 0; i < fftSize; i++) {
    correlation[i] = corrComplex[2 * i];
  }

  // 8. Find peak within plausible offset range (ALG-05: parabolic interpolation)
  const maxOffsetSamples = Math.min(
    Math.floor(maxOffsetSeconds * sampleRate),
    Math.floor(fftSize / 2) - 1
  );

  // Search positive offsets [0, maxOffsetSamples] and negative offsets [fftSize-maxOffsetSamples, fftSize)
  const peak = findPeakParabolic(correlation, maxOffsetSamples, fftSize);

  // 9. Compute confidence (CONF-01: peak-to-noise-floor ratio)
  const confidence = computeConfidence(
    correlation,
    peak.rawIndex,
    peak.value,
    maxOffsetSamples,
    fftSize
  );

  // 10. Map circular index to signed offset
  let offsetSamples = peak.refinedIndex;
  if (peak.refinedIndex > fftSize / 2) {
    offsetSamples = peak.refinedIndex - fftSize;
  }

  return { offsetSamples, confidence };
}

/** Returns the smallest power of 2 >= n */
function nextPowerOf2(n: number): number {
  let p = 1;
  while (p < n) {
    p <<= 1;
  }
  return p;
}

/**
 * Find the peak in the correlation array within the search range,
 * then refine to sub-sample accuracy via parabolic interpolation.
 *
 * Searches:
 *   - Positive offsets: indices [0, maxOffsetSamples]
 *   - Negative offsets: indices [fftSize - maxOffsetSamples, fftSize)
 */
function findPeakParabolic(
  correlation: Float64Array,
  maxOffsetSamples: number,
  fftSize: number
): { refinedIndex: number; value: number; rawIndex: number } {
  let bestIndex = 0;
  let bestValue = -Infinity;

  // Search positive offsets [0, maxOffsetSamples]
  for (let i = 0; i <= maxOffsetSamples; i++) {
    const v = Math.abs(correlation[i]);
    if (v > bestValue) {
      bestValue = v;
      bestIndex = i;
    }
  }

  // Search negative offsets [fftSize - maxOffsetSamples, fftSize)
  const negStart = fftSize - maxOffsetSamples;
  for (let i = negStart; i < fftSize; i++) {
    const v = Math.abs(correlation[i]);
    if (v > bestValue) {
      bestValue = v;
      bestIndex = i;
    }
  }

  // Parabolic interpolation for sub-sample accuracy
  const rawIndex = bestIndex;
  let refinedIndex = bestIndex;

  // Get neighbors, handling circular wrap
  const prevIdx = bestIndex === 0 ? fftSize - 1 : bestIndex - 1;
  const nextIdx = bestIndex === fftSize - 1 ? 0 : bestIndex + 1;

  // Only interpolate if neighbors are within the search range
  const prevInRange =
    prevIdx <= maxOffsetSamples || prevIdx >= fftSize - maxOffsetSamples;
  const nextInRange =
    nextIdx <= maxOffsetSamples || nextIdx >= fftSize - maxOffsetSamples;

  if (prevInRange && nextInRange) {
    const alpha = correlation[prevIdx];
    const beta = correlation[bestIndex];
    const gamma = correlation[nextIdx];
    const denominator = alpha - 2 * beta + gamma;

    if (Math.abs(denominator) > EPSILON) {
      const fractional = 0.5 * (alpha - gamma) / denominator;
      refinedIndex = bestIndex + fractional;
    }
  }

  return { refinedIndex, value: bestValue, rawIndex };
}

/**
 * Compute confidence score using two factors:
 *
 * 1. Peak strength: How close the absolute peak value is to the theoretical
 *    maximum (1.0 for perfectly correlated signals after PHAT normalization).
 *    Uncorrelated noise peaks at ~0.3-0.6 depending on signal length.
 *
 * 2. Peak uniqueness: How much the main peak stands out from the second-highest
 *    peak outside its neighborhood. Repetitive signals have multiple peaks of
 *    similar height, reducing uniqueness.
 *
 * Combined: confidence = peakStrength * peakUniqueness * 100
 *
 * Result interpretation:
 * - High (>70): Clear, unique correlation peak (reliable sync)
 * - Medium (25-70): Moderate peak, may have some ambiguity
 * - Low (<25): Weak or ambiguous, sync unreliable
 * - Zero: Silence or no signal
 *
 * @returns Integer confidence 0-100
 */
function computeConfidence(
  correlation: Float64Array,
  peakIndex: number,
  peakValue: number,
  maxOffsetSamples: number,
  fftSize: number
): number {
  // If peak value is essentially zero, return 0 (silence)
  if (peakValue < EPSILON) {
    return 0;
  }

  // Factor 1: Peak strength
  // Map peak value from [0.6, 1.0] to [0, 1]. Values below 0.6 are noise-level
  // for typical GCC-PHAT output (uncorrelated signals peak at ~0.3-0.55 depending
  // on signal length and FFT size).
  const peakStrength = Math.min(1, Math.max(0, (peakValue - 0.6) / 0.4));

  // Factor 2: Peak uniqueness — find second-highest peak outside neighborhood
  let secondPeak = 0;

  // Scan positive offsets [0, maxOffsetSamples]
  for (let i = 0; i <= maxOffsetSamples; i++) {
    if (distanceCircular(i, peakIndex, fftSize) > NEIGHBORHOOD_RADIUS) {
      const v = Math.abs(correlation[i]);
      if (v > secondPeak) {
        secondPeak = v;
      }
    }
  }

  // Scan negative offsets [fftSize - maxOffsetSamples, fftSize)
  const negStart = fftSize - maxOffsetSamples;
  for (let i = negStart; i < fftSize; i++) {
    if (distanceCircular(i, peakIndex, fftSize) > NEIGHBORHOOD_RADIUS) {
      const v = Math.abs(correlation[i]);
      if (v > secondPeak) {
        secondPeak = v;
      }
    }
  }

  // peakUniqueness: 1.0 if second peak is negligible, 0.0 if equal to main peak
  const peakUniqueness =
    secondPeak < EPSILON ? 1.0 : 1.0 - secondPeak / peakValue;

  const raw = peakStrength * peakUniqueness * 100;
  return Math.round(Math.min(100, Math.max(0, raw)));
}

/** Circular distance between two indices in an array of given size */
function distanceCircular(a: number, b: number, size: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, size - d);
}
