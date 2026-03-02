import { ACCEPTED_MIME_TYPES, ACCEPTED_EXTENSIONS } from './constants.ts';

function getExtension(filename: string): string {
  const idx = filename.lastIndexOf('.');
  return idx >= 0 ? filename.slice(idx).toLowerCase() : '';
}

function isVideoFile(file: File): boolean {
  if (ACCEPTED_MIME_TYPES.has(file.type)) return true;
  return ACCEPTED_EXTENSIONS.has(getExtension(file.name));
}

export function validateFiles(
  files: File[],
  currentCount: number,
  maxFiles: number,
): { validFiles: File[]; error: string | null } {
  const videoFiles = files.filter(isVideoFile);

  if (videoFiles.length === 0 && files.length > 0) {
    return {
      validFiles: [],
      error:
        'No supported video files found. Accepted formats: MP4, MOV, MKV, WebM.',
    };
  }

  const totalAfterAdd = currentCount + videoFiles.length;

  if (totalAfterAdd > maxFiles) {
    return {
      validFiles: [],
      error: `Maximum ${maxFiles} files allowed. You have ${currentCount}, tried to add ${videoFiles.length}.`,
    };
  }

  return { validFiles: videoFiles, error: null };
}
