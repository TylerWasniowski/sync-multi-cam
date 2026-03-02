import { describe, it, expect } from 'vitest';
import {
  computePeaks,
  computeMultiResolutionPeaks,
  selectPeakLevel,
} from '../waveformPeaks';

describe('computePeaks', () => {
  it('returns min/max Float32Arrays with correct length', () => {
    const samples = new Float32Array([0.1, -0.2, 0.3, -0.4, 0.5, -0.6]);
    const result = computePeaks(samples, 3);
    expect(result.min).toBeInstanceOf(Float32Array);
    expect(result.max).toBeInstanceOf(Float32Array);
    expect(result.min.length).toBe(3);
    expect(result.max.length).toBe(3);
  });

  it('computes correct min/max per bucket', () => {
    // 6 samples, 3 buckets -> 2 samples per bucket
    const samples = new Float32Array([0.1, -0.2, 0.3, -0.4, 0.5, -0.6]);
    const result = computePeaks(samples, 3);
    // Bucket 0: [0.1, -0.2] -> min=-0.2, max=0.1
    expect(result.min[0]).toBeCloseTo(-0.2);
    expect(result.max[0]).toBeCloseTo(0.1);
    // Bucket 1: [0.3, -0.4] -> min=-0.4, max=0.3
    expect(result.min[1]).toBeCloseTo(-0.4);
    expect(result.max[1]).toBeCloseTo(0.3);
    // Bucket 2: [0.5, -0.6] -> min=-0.6, max=0.5
    expect(result.min[2]).toBeCloseTo(-0.6);
    expect(result.max[2]).toBeCloseTo(0.5);
  });

  it('returns empty arrays for empty samples', () => {
    const samples = new Float32Array([]);
    const result = computePeaks(samples, 10);
    expect(result.min.length).toBe(0);
    expect(result.max.length).toBe(0);
  });

  it('clamps bucketCount to sample count when bucketCount > samples.length', () => {
    const samples = new Float32Array([0.5, -0.3]);
    const result = computePeaks(samples, 100);
    // Should clamp to 2 buckets (one per sample)
    expect(result.min.length).toBe(2);
    expect(result.max.length).toBe(2);
    expect(result.min[0]).toBeCloseTo(0.5);
    expect(result.max[0]).toBeCloseTo(0.5);
    expect(result.min[1]).toBeCloseTo(-0.3);
    expect(result.max[1]).toBeCloseTo(-0.3);
  });

  it('handles bucketCount <= 0 by returning empty arrays', () => {
    const samples = new Float32Array([0.1, 0.2, 0.3]);
    const result = computePeaks(samples, 0);
    expect(result.min.length).toBe(0);
    expect(result.max.length).toBe(0);

    const result2 = computePeaks(samples, -5);
    expect(result2.min.length).toBe(0);
    expect(result2.max.length).toBe(0);
  });

  it('correctly finds min/max in a sine-like pattern', () => {
    // 8 samples representing a simple wave, 2 buckets (4 per bucket)
    const samples = new Float32Array([0, 0.5, 1.0, 0.5, 0, -0.5, -1.0, -0.5]);
    const result = computePeaks(samples, 2);
    // Bucket 0: [0, 0.5, 1.0, 0.5] -> min=0, max=1.0
    expect(result.min[0]).toBeCloseTo(0);
    expect(result.max[0]).toBeCloseTo(1.0);
    // Bucket 1: [0, -0.5, -1.0, -0.5] -> min=-1.0, max=0
    expect(result.min[1]).toBeCloseTo(-1.0);
    expect(result.max[1]).toBeCloseTo(0);
  });

  it('handles single bucket covering all samples', () => {
    const samples = new Float32Array([0.3, -0.7, 0.9, -0.1, 0.0]);
    const result = computePeaks(samples, 1);
    expect(result.min.length).toBe(1);
    expect(result.max.length).toBe(1);
    expect(result.min[0]).toBeCloseTo(-0.7);
    expect(result.max[0]).toBeCloseTo(0.9);
  });
});

describe('computeMultiResolutionPeaks', () => {
  it('returns overview, medium, and detail levels', () => {
    // Create a large-ish sample set (200,000 samples at 16kHz = 12.5 seconds)
    const sampleRate = 16000;
    const length = 200000;
    const samples = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      samples[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate);
    }

    const result = computeMultiResolutionPeaks(samples, sampleRate);

    expect(result.overview).toBeDefined();
    expect(result.medium).toBeDefined();
    expect(result.detail).toBeDefined();
    expect(result.totalSamples).toBe(length);
    expect(result.sampleRate).toBe(sampleRate);
  });

  it('overview has ~2000 buckets, medium ~20000, detail ~100000', () => {
    const sampleRate = 16000;
    const length = 200000;
    const samples = new Float32Array(length);

    const result = computeMultiResolutionPeaks(samples, sampleRate);

    expect(result.overview.length).toBe(2000);
    expect(result.medium.length).toBe(20000);
    // detail is min(100000, samples.length)
    expect(result.detail.length).toBe(Math.min(100000, length));
  });

  it('each level includes correct duration and sampleRate', () => {
    const sampleRate = 16000;
    const length = 160000; // 10 seconds
    const samples = new Float32Array(length);

    const result = computeMultiResolutionPeaks(samples, sampleRate);
    const expectedDuration = length / sampleRate;

    expect(result.duration).toBeCloseTo(expectedDuration);
    expect(result.overview.duration).toBeCloseTo(expectedDuration);
    expect(result.medium.duration).toBeCloseTo(expectedDuration);
    expect(result.detail.duration).toBeCloseTo(expectedDuration);
    expect(result.overview.sampleRate).toBe(sampleRate);
  });

  it('each level includes correct samplesPerBucket', () => {
    const sampleRate = 16000;
    const length = 200000;
    const samples = new Float32Array(length);

    const result = computeMultiResolutionPeaks(samples, sampleRate);

    expect(result.overview.samplesPerBucket).toBe(
      Math.floor(length / 2000),
    );
    expect(result.medium.samplesPerBucket).toBe(
      Math.floor(length / 20000),
    );
    expect(result.detail.samplesPerBucket).toBe(
      Math.floor(length / 100000),
    );
  });

  it('detail level clamps to sample count for short audio', () => {
    const sampleRate = 16000;
    const length = 5000; // short audio
    const samples = new Float32Array(length);

    const result = computeMultiResolutionPeaks(samples, sampleRate);

    // detail should be min(100000, 5000) = 5000
    expect(result.detail.length).toBe(5000);
  });
});

describe('selectPeakLevel', () => {
  // Helper to create a MultiResolutionPeaks from a given sample count
  function makeMultiRes(totalSamples: number, sampleRate: number = 16000) {
    const samples = new Float32Array(totalSamples);
    return computeMultiResolutionPeaks(samples, sampleRate);
  }

  it('returns overview when zoomed out far', () => {
    // totalSamples = 200000, canvasWidth = 1000
    // needed buckets = totalSamples / samplesPerPixel
    // At samplesPerPixel = 200, needed = 1000 => overview (2000) is sufficient
    const multiRes = makeMultiRes(200000);
    const result = selectPeakLevel(multiRes, 200, 1000);
    expect(result).toBe(multiRes.overview);
  });

  it('returns medium when at moderate zoom', () => {
    // totalSamples = 200000, samplesPerPixel = 10, canvasWidth = 1000
    // needed = 200000 / 10 = 20000 => medium (20000) is sufficient
    const multiRes = makeMultiRes(200000);
    const result = selectPeakLevel(multiRes, 10, 1000);
    expect(result).toBe(multiRes.medium);
  });

  it('returns detail when zoomed in close', () => {
    // totalSamples = 200000, samplesPerPixel = 2, canvasWidth = 1000
    // needed = 200000 / 2 = 100000 => detail (100000) is sufficient
    const multiRes = makeMultiRes(200000);
    const result = selectPeakLevel(multiRes, 2, 1000);
    expect(result).toBe(multiRes.detail);
  });

  it('falls back to detail when all levels are too coarse', () => {
    // totalSamples = 200000, samplesPerPixel = 1
    // needed = 200000, all levels < 200000 => detail (highest resolution)
    const multiRes = makeMultiRes(200000);
    const result = selectPeakLevel(multiRes, 1, 1000);
    expect(result).toBe(multiRes.detail);
  });

  it('returns overview for very wide canvas at low zoom', () => {
    const multiRes = makeMultiRes(200000);
    // samplesPerPixel = 500, needed = 400 => overview (2000) is plenty
    const result = selectPeakLevel(multiRes, 500, 2000);
    expect(result).toBe(multiRes.overview);
  });
});
