import { zipSync } from 'fflate';
import type { TrimmedFile } from '../types/index.ts';

/**
 * Bundle trimmed video files into a ZIP archive using store mode (level 0).
 * No compression is applied since video files are already compressed (H.264/AAC).
 */
export function buildZip(files: TrimmedFile[]): Uint8Array {
  const zipData: Record<string, [Uint8Array, { level: 0 }]> = {};
  for (const file of files) {
    zipData[file.name] = [file.data, { level: 0 }];
  }
  return zipSync(zipData);
}
