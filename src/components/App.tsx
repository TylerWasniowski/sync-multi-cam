import { useState, useCallback, useRef } from 'react';
import type { VideoFile } from '../types/index.ts';
import { MAX_FILES } from '../lib/constants.ts';
import { getFFmpeg } from '../lib/ffmpeg.ts';
import { PrivacyBanner } from './PrivacyBanner.tsx';
import { FileDropZone } from './FileDropZone.tsx';
import { FileList } from './FileList.tsx';
import { FFmpegStatus } from './FFmpegStatus.tsx';

type FFmpegLoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export default function App() {
  const [files, setFiles] = useState<VideoFile[]>([]);
  const [ffmpegStatus, setFfmpegStatus] = useState<FFmpegLoadStatus>('idle');
  const [ffmpegError, setFfmpegError] = useState<string | undefined>(undefined);
  const ffmpegLoadingRef = useRef(false);

  const loadFFmpeg = useCallback(() => {
    if (ffmpegLoadingRef.current) return;
    ffmpegLoadingRef.current = true;
    setFfmpegStatus('loading');

    getFFmpeg()
      .then(() => {
        setFfmpegStatus('ready');
      })
      .catch((err: unknown) => {
        setFfmpegStatus('error');
        setFfmpegError(err instanceof Error ? err.message : 'Failed to load FFmpeg');
        ffmpegLoadingRef.current = false;
      });
  }, []);

  const handleFilesAccepted = useCallback((newFiles: File[]) => {
    const videoFiles: VideoFile[] = newFiles.map((file) => ({
      id: crypto.randomUUID(),
      file,
      name: file.name,
      size: file.size,
      type: file.type,
    }));
    setFiles((prev) => [...prev, ...videoFiles]);

    if (!ffmpegLoadingRef.current) {
      loadFFmpeg();
    }
  }, [loadFFmpeg]);

  const handleRemoveFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight">
            Sync Multi-Cam
          </h1>
          <PrivacyBanner />
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-6 py-12">
        <FileDropZone
          onFilesAccepted={handleFilesAccepted}
          currentFileCount={files.length}
          maxFiles={MAX_FILES}
        />
        <div className="mt-4">
          <FFmpegStatus status={ffmpegStatus} error={ffmpegError} />
        </div>
        <div className="mt-6">
          <FileList files={files} onRemove={handleRemoveFile} />
        </div>
      </main>
    </div>
  );
}
