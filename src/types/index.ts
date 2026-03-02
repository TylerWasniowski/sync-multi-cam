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

export type SyncStage =
  | 'idle'
  | 'extracting'
  | 'correlating'
  | 'complete'
  | 'error';

export interface SyncProgress {
  stage: SyncStage;
  current: number;      // Current file index (0-based)
  total: number;         // Total files
  message: string;       // Human-readable progress message
}
