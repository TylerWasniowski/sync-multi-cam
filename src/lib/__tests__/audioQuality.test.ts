import { describe, it, expect } from 'vitest';
import { detectAudioWarnings, AudioWarning } from '../audioQuality';

// --- Test signal helpers ---

/** Create a Float32Array filled with a constant amplitude value */
function makeConstantSignal(length: number, amplitude: number): Float32Array {
  const signal = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    signal[i] = amplitude;
  }
  return signal;
}

/** Create a signal with a percentage of samples clipped at +/-1.0 */
function makeClippedSignal(
  length: number,
  clipPercent: number,
  baseAmplitude: number = 0.5
): Float32Array {
  const signal = new Float32Array(length);
  const clipCount = Math.floor(length * clipPercent);

  // Fill with normal amplitude first (alternating sign for realism)
  for (let i = 0; i < length; i++) {
    signal[i] = baseAmplitude * (i % 2 === 0 ? 1 : -1);
  }

  // Overwrite first clipCount samples with clipped values (+/-1.0)
  for (let i = 0; i < clipCount; i++) {
    signal[i] = i % 2 === 0 ? 1.0 : -1.0;
  }

  return signal;
}

describe('detectAudioWarnings', () => {
  describe('silence detection (CONF-03)', () => {
    it('returns silence warning for completely silent signal (all zeros)', () => {
      const silent = new Float32Array(16000); // 1 second at 16kHz, all zeros
      const warnings = detectAudioWarnings(silent);

      expect(warnings.some((w) => w.type === 'silence')).toBe(true);
      const silenceWarning = warnings.find((w) => w.type === 'silence')!;
      expect(silenceWarning.message).toContain('silent or near-silent');
    });

    it('returns silence warning for near-silent signal (RMS < 0.003)', () => {
      // Amplitude 0.001 gives RMS = 0.001, well below 0.003 threshold
      const nearSilent = makeConstantSignal(16000, 0.001);
      const warnings = detectAudioWarnings(nearSilent);

      expect(warnings.some((w) => w.type === 'silence')).toBe(true);
    });

    it('returns NO silence warning for normal audio (RMS well above threshold)', () => {
      // Amplitude 0.1 gives RMS = 0.1, well above 0.003 threshold
      const normal = makeConstantSignal(16000, 0.1);
      const warnings = detectAudioWarnings(normal);

      expect(warnings.some((w) => w.type === 'silence')).toBe(false);
    });
  });

  describe('clipping detection (CONF-04)', () => {
    it('returns clipping warning for heavily clipped signal (>0.5% at +/-1.0)', () => {
      // 1% of samples clipped -- above 0.5% threshold
      const clipped = makeClippedSignal(16000, 0.01);
      const warnings = detectAudioWarnings(clipped);

      expect(warnings.some((w) => w.type === 'clipping')).toBe(true);
      const clipWarning = warnings.find((w) => w.type === 'clipping')!;
      expect(clipWarning.message).toContain('clipping distortion');
    });

    it('returns NO clipping warning for signal with occasional peaks (<0.5% at +/-1.0)', () => {
      // 0.1% of samples clipped -- below 0.5% threshold
      const lightlyPeaked = makeClippedSignal(16000, 0.001);
      const warnings = detectAudioWarnings(lightlyPeaked);

      expect(warnings.some((w) => w.type === 'clipping')).toBe(false);
    });
  });

  describe('combined and independent detection', () => {
    it('detects silence and clipping independently (warnings accumulate in array)', () => {
      // Note: With thresholds RMS<0.003 for silence and >0.5% clips for clipping,
      // having >0.5% samples at +/-1.0 forces RMS >= sqrt(0.005) = 0.071, which
      // exceeds the silence threshold. So both warnings cannot co-occur naturally.
      // This test verifies the detections are independent code paths by checking:
      // 1. Silence-only signal produces exactly one warning
      // 2. Clipping-only signal produces exactly one warning
      // 3. Normal signal produces zero warnings

      // Silence only
      const silent = new Float32Array(16000);
      const silenceWarnings = detectAudioWarnings(silent);
      expect(silenceWarnings.length).toBe(1);
      expect(silenceWarnings[0].type).toBe('silence');

      // Clipping only (base amplitude 0.5 ensures RMS is high, no silence)
      const clipped = makeClippedSignal(16000, 0.01, 0.5);
      const clipWarnings = detectAudioWarnings(clipped);
      expect(clipWarnings.some((w) => w.type === 'clipping')).toBe(true);
      expect(clipWarnings.some((w) => w.type === 'silence')).toBe(false);

      // Normal: neither warning
      const normal = makeConstantSignal(16000, 0.1);
      const normalWarnings = detectAudioWarnings(normal);
      expect(normalWarnings.length).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('returns empty warnings array for empty Float32Array (length 0)', () => {
      const empty = new Float32Array(0);
      const warnings = detectAudioWarnings(empty);

      expect(warnings).toEqual([]);
      expect(warnings.length).toBe(0);
    });
  });

  describe('AudioWarning type shape', () => {
    it('warning objects have type and message fields with correct types', () => {
      const silent = new Float32Array(16000); // triggers silence warning
      const warnings = detectAudioWarnings(silent);

      expect(warnings.length).toBeGreaterThan(0);
      const warning: AudioWarning = warnings[0];
      expect(warning).toHaveProperty('type');
      expect(warning).toHaveProperty('message');
      expect(typeof warning.type).toBe('string');
      expect(typeof warning.message).toBe('string');
    });
  });
});
