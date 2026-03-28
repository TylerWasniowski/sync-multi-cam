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
  | 'complete'
  | 'error';

export interface PipelineProgress {
  stage: PipelineStage;
  current: number;
  total: number;
  message: string;
}

export interface DownloadableResult extends SyncResult {
  originalFile: File;
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

/** Set of track indices that are currently muted */
export type MutedTracks = Set<number>;

/** Export pipeline state machine */
export type ExportState = 'idle' | 'preparing' | 'encoding' | 'complete' | 'error' | 'cancelled';

/** Audio track selection for export */
export type AudioConfig =
  | { mode: 'single'; trackIndex: number }
  | { mode: 'mix'; trackIndices: number[] }
  | { mode: 'none' };

/** Messages sent TO the export worker */
export type ExportWorkerCommand =
  | {
      type: 'start';
      files: File[];
      offsets: number[];
      resolution: { width: number; height: number };
      fps: number;
      bitrate: number;
      audioConfig: AudioConfig;
      totalDurationSeconds: number;
      tileAspectRatio: number;
      displayMode: DisplayMode;
    }
  | { type: 'cancel' };

/** Messages sent FROM the export worker */
export type ExportWorkerMessage =
  | { type: 'progress'; ratio: number }
  | { type: 'complete'; data: ArrayBuffer }
  | { type: 'error'; message: string }
  | { type: 'cancelled' };
