import { useState, useCallback, useRef, useEffect } from 'react';
import type { VideoFile } from '../types/index.ts';
import { MAX_FILES } from '../lib/constants.ts';
import { validateFiles } from '../lib/fileValidation.ts';
import { getFFmpeg } from '../lib/ffmpeg.ts';
import { PrivacyBanner } from './PrivacyBanner.tsx';
import { FileDropZone } from './FileDropZone.tsx';
import { FileList } from './FileList.tsx';
import { FFmpegStatus } from './FFmpegStatus.tsx';

type FFmpegLoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export default function App() {
  const [files, setFiles] = useState<VideoFile[]>([]);
  const [isDraggingOnPage, setIsDraggingOnPage] = useState(false);
  const [ffmpegStatus, setFfmpegStatus] = useState<FFmpegLoadStatus>('idle');
  const [ffmpegError, setFfmpegError] = useState<string | undefined>(undefined);
  const ffmpegLoadingRef = useRef(false);
  const dragCounterRef = useRef(0);

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

  // Full-page drag-and-drop: listen on window so users can drop anywhere
  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current++;
      setIsDraggingOnPage(true);
    };
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
    };
    const onDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current--;
      if (dragCounterRef.current === 0) {
        setIsDraggingOnPage(false);
      }
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsDraggingOnPage(false);

      const droppedFiles = Array.from(e.dataTransfer?.files ?? []);
      const result = validateFiles(droppedFiles, files.length, MAX_FILES);
      if (!result.error && result.validFiles.length > 0) {
        handleFilesAccepted(result.validFiles);
      }
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [files.length, handleFilesAccepted]);

  return (
    <div className={`min-h-screen bg-gray-950 text-gray-100 transition-colors ${
      isDraggingOnPage ? 'ring-2 ring-inset ring-blue-500 bg-blue-950/20' : ''
    }`}>
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
