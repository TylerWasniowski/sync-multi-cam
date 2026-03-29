/**
 * Audio quality detection for pre-sync analysis.
 *
 * Pure functions that analyze Float32Array PCM data for silence and clipping,
 * returning typed AudioWarning arrays. Runs on the main thread before worker
 * initialization (per D-06) to catch issues early.
 */

/** RMS threshold: -50dB ~ 0.00316. Using 0.003 for round threshold */
const SILENCE_RMS_THRESHOLD = 0.003;

/** Clipping: if >0.5% of samples are at +/-1.0 (within epsilon) */
const CLIPPING_RATIO_THRESHOLD = 0.005;

/** Epsilon for clipping boundary detection */
const CLIP_EPSILON = 0.001;

export interface AudioWarning {
  type: 'silence' | 'clipping' | 'low-confidence';
  message: string;
}

/**
 * Analyze PCM audio data for quality issues that may affect sync reliability.
 *
 * Performs a single O(N) pass computing both RMS (for silence detection) and
 * clip count (for clipping detection). Returns an array of warnings; empty
 * array means no issues detected.
 *
 * @param pcm - Raw PCM audio samples as Float32Array
 * @returns Array of AudioWarning objects (may be empty)
 */
export function detectAudioWarnings(pcm: Float32Array): AudioWarning[] {
  const warnings: AudioWarning[] = [];
  const N = pcm.length;
  if (N === 0) return warnings;

  // Single-pass: compute sumSq for RMS and count clipped samples
  let sumSq = 0;
  let clipCount = 0;
  for (let i = 0; i < N; i++) {
    const s = pcm[i];
    sumSq += s * s;
    if (Math.abs(s) >= 1.0 - CLIP_EPSILON) {
      clipCount++;
    }
  }

  // Silence detection: RMS below threshold indicates unusable audio for sync
  const rms = Math.sqrt(sumSq / N);
  if (rms < SILENCE_RMS_THRESHOLD) {
    warnings.push({
      type: 'silence',
      message: 'Audio is silent or near-silent — sync may be unreliable',
    });
  }

  // Clipping detection: high ratio of samples at rails indicates distortion
  const clipRatio = clipCount / N;
  if (clipRatio > CLIPPING_RATIO_THRESHOLD) {
    warnings.push({
      type: 'clipping',
      message: 'Audio has clipping distortion — sync may be affected',
    });
  }

  return warnings;
}
