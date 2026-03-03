export interface VideoFile {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
}

export interface AudioData {
  channelData: Float32Array[];
  samplesDecoded: number;
  sampleRate: number;
}

export interface SyncResult {
  fileId: string;
  fileName: string;
  offsetSeconds: number;
  offsetSamples: number;
  confidence: number; // 0-100 percentage
  isReference: boolean;
}

export type PipelineStage =
  | 'idle'
  | 'extracting'
  | 'correlating'
  | 'trimming'
  | 'zipping'
  | 'complete'
  | 'error';

export interface PipelineProgress {
  stage: PipelineStage;
  current: number;
  total: number;
  message: string;
}

export interface TrimmedFile {
  name: string;
  data: Uint8Array;
}

export interface DownloadableResult extends SyncResult {
  trimmedData: Uint8Array | null; // null means skipped (use original file)
  trimSeconds: number;
  originalFile: File; // reference to original File for skipped downloads
}

export interface WaveformPeaks {
  min: Float32Array;
  max: Float32Array;
  length: number; // number of buckets
  sampleRate: number; // original sample rate (16000)
  duration: number; // total duration in seconds
  samplesPerBucket: number; // how many raw samples per bucket
}

export interface MultiResolutionPeaks {
  overview: WaveformPeaks; // ~2,000 buckets
  medium: WaveformPeaks; // ~20,000 buckets
  detail: WaveformPeaks; // ~100,000 buckets
  totalSamples: number;
  sampleRate: number;
  duration: number;
}

export interface ViewState {
  samplesPerPixel: number; // controls zoom level
  scrollOffset: number; // horizontal scroll position in samples
  cursorTime: number | null; // hover position in seconds, null when not hovering
}

/** Video tile display mode: 'fill' crops to fill tiles, 'letterbox' preserves aspect ratio */
export type DisplayMode = 'fill' | 'letterbox';

/** Audio mixing mode: 'all' mixes all cameras, number solos that camera index */
export type AudioMode = 'all' | number;
