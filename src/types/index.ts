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

export interface TrimResult {
  fileId: string;
  fileName: string;
  data: Uint8Array | null; // null when skipped (trimSeconds === 0)
  trimSeconds: number;
  skipped: boolean;
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
