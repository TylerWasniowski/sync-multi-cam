import { describe, it, expect } from 'vitest';
import { gccPhat, applyHannWindow } from '../fftEngine';

// --- Test signal helper functions ---

/** Generate a sine wave with optional sample delay (phase shift) */
function makeSine(
  freq: number,
  sampleRate: number,
  durationSec: number,
  delaySamples: number = 0
): Float32Array {
  const numSamples = Math.floor(sampleRate * durationSec);
  const signal = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    signal[i] = Math.sin((2 * Math.PI * freq * (i + delaySamples)) / sampleRate);
  }
  return signal;
}

/** Generate deterministic pseudo-random broadband noise using a seeded PRNG */
function makeBroadbandNoise(
  sampleRate: number,
  durationSec: number,
  seed: number
): Float32Array {
  const numSamples = Math.floor(sampleRate * durationSec);
  const signal = new Float32Array(numSamples);
  let x = seed;
  for (let i = 0; i < numSamples; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    signal[i] = (x / 0x7fffffff) * 2 - 1;
  }
  return signal;
}

/** First-order IIR high-pass filter */
function applySimpleHighPass(
  signal: Float32Array,
  cutoff: number,
  sampleRate: number
): Float32Array {
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

/** First-order IIR low-pass filter */
function applySimpleLowPass(
  signal: Float32Array,
  cutoff: number,
  sampleRate: number
): Float32Array {
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

/** Generate a repeating click pattern */
function makeLoopedClick(
  clickLengthMs: number,
  loopIntervalMs: number,
  sampleRate: number,
  durationSec: number
): Float32Array {
  const numSamples = Math.floor(sampleRate * durationSec);
  const signal = new Float32Array(numSamples);
  const clickSamples = Math.floor((clickLengthMs / 1000) * sampleRate);
  const loopSamples = Math.floor((loopIntervalMs / 1000) * sampleRate);

  for (let start = 0; start < numSamples; start += loopSamples) {
    for (let j = 0; j < clickSamples && start + j < numSamples; j++) {
      signal[start + j] = 1.0;
    }
  }
  return signal;
}

/** Generate silence (all zeros) */
function makeSilence(sampleRate: number, durationSec: number): Float32Array {
  return new Float32Array(Math.floor(sampleRate * durationSec));
}

// --- Tests ---

describe('applyHannWindow', () => {
  it('produces values near 0 at boundaries and near 1 in the middle', () => {
    const signal = new Float32Array(1024).fill(1.0);
    const windowed = applyHannWindow(signal);

    // First and last samples should be near 0
    expect(Math.abs(windowed[0])).toBeLessThan(0.001);
    expect(Math.abs(windowed[1023])).toBeLessThan(0.001);

    // Middle sample should be near 1
    expect(windowed[512]).toBeGreaterThan(0.99);
  });

  it('returns a copy (does not modify input)', () => {
    const signal = new Float32Array([1, 2, 3, 4, 5]);
    const original = new Float32Array(signal);
    applyHannWindow(signal);

    expect(signal).toEqual(original);
  });

  it('handles empty or length-1 signals gracefully', () => {
    const empty = new Float32Array(0);
    expect(applyHannWindow(empty).length).toBe(0);

    const single = new Float32Array([0.5]);
    const result = applyHannWindow(single);
    expect(result.length).toBe(1);
    expect(result[0]).toBe(0.5);
  });
});

describe('gccPhat', () => {
  describe('known offset detection (ALG-01, ALG-04)', () => {
    it('detects +160 sample offset for 440Hz sine at 16kHz', () => {
      const ref = makeSine(440, 16000, 1.0, 0);
      const comp = makeSine(440, 16000, 1.0, 160);

      const result = gccPhat(ref, comp, 16000, 0.3);
      expect(result.offsetSamples).toBeCloseTo(160, 0);
      expect(Math.abs(result.offsetSamples - 160)).toBeLessThan(1.0);
    });

    it('detects -80 sample offset', () => {
      const ref = makeSine(440, 16000, 1.0, 0);
      const comp = makeSine(440, 16000, 1.0, -80);

      const result = gccPhat(ref, comp, 16000, 0.3);
      expect(Math.abs(result.offsetSamples - -80)).toBeLessThan(1.0);
    });

    it('detects zero offset for identical signals', () => {
      const signal = makeSine(440, 16000, 1.0, 0);

      const result = gccPhat(signal, signal, 16000, 0.3);
      expect(Math.abs(result.offsetSamples)).toBeLessThan(1.0);
      expect(result.confidence).toBeGreaterThan(50);
    });

    it('detects large offset (+4800 samples = 300ms)', () => {
      const ref = makeSine(440, 16000, 2.0, 0);
      const comp = makeSine(440, 16000, 2.0, 4800);

      const result = gccPhat(ref, comp, 16000, 0.5);
      expect(Math.abs(result.offsetSamples - 4800)).toBeLessThan(1.0);
    });
  });

  describe('sub-sample accuracy via parabolic interpolation (ALG-05)', () => {
    it('returns fractional offsetSamples (not integer)', () => {
      // Use a multi-frequency signal to get non-integer peak
      const numSamples = Math.floor(16000 * 1.0);
      const ref = new Float32Array(numSamples);
      const comp = new Float32Array(numSamples);
      const fractionalDelay = 160.5;

      for (let i = 0; i < numSamples; i++) {
        ref[i] =
          Math.sin((2 * Math.PI * 200 * i) / 16000) +
          Math.sin((2 * Math.PI * 800 * i) / 16000) +
          Math.sin((2 * Math.PI * 2000 * i) / 16000);
        comp[i] =
          Math.sin((2 * Math.PI * 200 * (i + fractionalDelay)) / 16000) +
          Math.sin((2 * Math.PI * 800 * (i + fractionalDelay)) / 16000) +
          Math.sin((2 * Math.PI * 2000 * (i + fractionalDelay)) / 16000);
      }

      const result = gccPhat(ref, comp, 16000, 0.3);
      // Verify sub-sample precision: result should have a fractional part
      const fractionalPart = Math.abs(
        result.offsetSamples - Math.round(result.offsetSamples)
      );
      expect(fractionalPart).toBeGreaterThan(0.01);
    });
  });

  describe('robustness to different frequency responses (ALG-02)', () => {
    it('finds correct offset when signals have different spectral shapes', () => {
      // Generate broadband noise at 16kHz for 1 second
      const noise = makeBroadbandNoise(16000, 1.0, 42);

      // Create the reference (will be high-pass filtered)
      const refNoise = new Float32Array(noise.length);
      refNoise.set(noise);

      // Create delayed comparison (will be low-pass filtered)
      const delaySamples = 200;
      const compNoise = new Float32Array(noise.length);
      for (let i = 0; i < noise.length; i++) {
        const srcIdx = i + delaySamples;
        compNoise[i] = srcIdx < noise.length ? noise[srcIdx] : 0;
      }

      // Apply different frequency responses
      const refFiltered = applySimpleHighPass(refNoise, 500, 16000);
      const compFiltered = applySimpleLowPass(compNoise, 2000, 16000);

      const result = gccPhat(refFiltered, compFiltered, 16000, 0.3);
      expect(Math.abs(result.offsetSamples - delaySamples)).toBeLessThan(2.0);
    });
  });

  describe('repetitive signal handling (ALG-03)', () => {
    it('returns low confidence for looped/repetitive signals', () => {
      const ref = makeLoopedClick(10, 500, 16000, 2.0);

      // Create offset version
      const delaySamples = 200;
      const comp = new Float32Array(ref.length);
      for (let i = 0; i < ref.length; i++) {
        const srcIdx = i + delaySamples;
        comp[i] = srcIdx < ref.length ? ref[srcIdx] : 0;
      }

      const result = gccPhat(ref, comp, 16000, 0.3);
      expect(result.confidence).toBeLessThan(40);
    });
  });

  describe('confidence scoring (CONF-01)', () => {
    it('returns high confidence (>70) for clear impulse-like match', () => {
      // Generate a single broadband burst (50ms noise in 2s of silence)
      const numSamples = Math.floor(16000 * 2.0);
      const signal = new Float32Array(numSamples);
      const burstLength = Math.floor(16000 * 0.05); // 50ms
      const burstStart = 8000; // place burst at 0.5s

      // Fill burst with noise
      let x = 42;
      for (let i = 0; i < burstLength; i++) {
        x = (x * 1103515245 + 12345) & 0x7fffffff;
        signal[burstStart + i] = (x / 0x7fffffff) * 2 - 1;
      }

      // Create delayed copy
      const delaySamples = 320;
      const comp = new Float32Array(numSamples);
      for (let i = 0; i < numSamples; i++) {
        const srcIdx = i + delaySamples;
        comp[i] = srcIdx < numSamples ? signal[srcIdx] : 0;
      }

      const result = gccPhat(signal, comp, 16000, 0.3);
      expect(result.confidence).toBeGreaterThan(70);
    });

    it('returns low confidence (<40) for repetitive signals', () => {
      const ref = makeLoopedClick(10, 500, 16000, 2.0);
      const delaySamples = 200;
      const comp = new Float32Array(ref.length);
      for (let i = 0; i < ref.length; i++) {
        const srcIdx = i + delaySamples;
        comp[i] = srcIdx < ref.length ? ref[srcIdx] : 0;
      }

      const result = gccPhat(ref, comp, 16000, 0.3);
      expect(result.confidence).toBeLessThan(40);
    });

    it('returns very low confidence (<10) for unrelated signals', () => {
      const sig1 = makeBroadbandNoise(16000, 1.0, 1);
      const sig2 = makeBroadbandNoise(16000, 1.0, 999);

      const result = gccPhat(sig1, sig2, 16000, 0.3);
      expect(result.confidence).toBeLessThan(10);
    });

    it('returns confidence 0 for silence', () => {
      const silence1 = makeSilence(16000, 1.0);
      const silence2 = makeSilence(16000, 1.0);

      const result = gccPhat(silence1, silence2, 16000, 0.3);
      expect(result.confidence).toBe(0);
    });

    it('confidence is in range 0-100', () => {
      const ref = makeSine(440, 16000, 1.0, 0);
      const comp = makeSine(440, 16000, 1.0, 160);

      const result = gccPhat(ref, comp, 16000, 0.3);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(100);
    });
  });

  describe('edge cases', () => {
    it('throws for signals shorter than minimum length', () => {
      const short = new Float32Array(100);

      expect(() => gccPhat(short, short, 16000, 0.3)).toThrow(/minimum/);
    });

    it('handles signals of different lengths', () => {
      const ref = makeSine(440, 16000, 1.0, 0);
      const comp = makeSine(440, 16000, 0.5, 160);

      const result = gccPhat(ref, comp, 16000, 0.3);
      expect(Math.abs(result.offsetSamples - 160)).toBeLessThan(2.0);
    });
  });
});
