export const ACCEPTED_MIME_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/x-matroska',
  'video/webm',
]);

export const ACCEPTED_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.webm']);

export const MIN_FILES = 2;
export const MAX_FILES = 30;

export const SYNC_SAMPLE_RATE = 16000;
export const CORRELATION_SAMPLE_SIZE = 11025;
export const INITIAL_GRANULARITY = 16;
