import type { WaveformPeaks, MultiResolutionPeaks } from '../types';

const OVERVIEW_BUCKETS = 2000;
const MEDIUM_BUCKETS = 20000;
const DETAIL_BUCKETS = 100000;

/**
 * Downsample raw audio samples into min/max peak pairs at a given bucket count.
 * Each bucket represents the min and max amplitude within a range of samples.
 */
export function computePeaks(
  samples: Float32Array,
  bucketCount: number,
): { min: Float32Array; max: Float32Array } {
  if (samples.length === 0 || bucketCount <= 0) {
    return { min: new Float32Array(0), max: new Float32Array(0) };
  }

  // Clamp bucketCount to sample count
  const effectiveBuckets = Math.min(bucketCount, samples.length);
  const samplesPerBucket = samples.length / effectiveBuckets;

  const min = new Float32Array(effectiveBuckets);
  const max = new Float32Array(effectiveBuckets);

  for (let i = 0; i < effectiveBuckets; i++) {
    const start = Math.floor(i * samplesPerBucket);
    const end = Math.min(Math.floor((i + 1) * samplesPerBucket), samples.length);
    let lo = Infinity;
    let hi = -Infinity;
    for (let j = start; j < end; j++) {
      const v = samples[j];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    min[i] = lo === Infinity ? 0 : lo;
    max[i] = hi === -Infinity ? 0 : hi;
  }

  return { min, max };
}

/**
 * Generate peak data at 3 resolution levels for efficient rendering at any zoom level.
 * - overview: ~2,000 buckets (zoomed out)
 * - medium: ~20,000 buckets (moderate zoom)
 * - detail: up to ~100,000 buckets (deep zoom)
 */
export function computeMultiResolutionPeaks(
  samples: Float32Array,
  sampleRate: number,
): MultiResolutionPeaks {
  const duration = samples.length / sampleRate;

  const overviewBuckets = Math.min(OVERVIEW_BUCKETS, samples.length);
  const mediumBuckets = Math.min(MEDIUM_BUCKETS, samples.length);
  const detailBuckets = Math.min(DETAIL_BUCKETS, samples.length);

  function buildLevel(buckets: number): WaveformPeaks {
    const { min, max } = computePeaks(samples, buckets);
    return {
      min,
      max,
      length: min.length,
      sampleRate,
      duration,
      samplesPerBucket: samples.length / min.length,
    };
  }

  const overview = buildLevel(overviewBuckets);
  const medium = buildLevel(mediumBuckets);
  const detail = buildLevel(detailBuckets);

  return {
    overview,
    medium,
    detail,
    totalSamples: samples.length,
    sampleRate,
    duration,
  };
}

/**
 * Select the peak resolution level closest to what the viewport needs,
 * without under-sampling (the selected level must have at least as many
 * buckets as the viewport requires).
 */
export function selectPeakLevel(
  peaks: MultiResolutionPeaks,
  samplesPerPixel: number,
  _canvasWidth: number,
): WaveformPeaks {
  // How many buckets would we ideally need to cover the entire audio?
  const neededBuckets = Math.ceil(peaks.totalSamples / samplesPerPixel);

  // Check levels from coarsest to finest -- pick the first one
  // whose bucket count is >= what we need
  if (peaks.overview.length >= neededBuckets) {
    return peaks.overview;
  }
  if (peaks.medium.length >= neededBuckets) {
    return peaks.medium;
  }
  // Fallback to detail (highest resolution available)
  return peaks.detail;
}
