import { useState, useCallback, useRef, useEffect } from 'react';
import type { VideoFile, PipelineProgress as PipelineProgressType, DownloadableResult, MultiResolutionPeaks } from '../types/index.ts';
import { MAX_FILES } from '../lib/constants.ts';
import { validateFiles } from '../lib/fileValidation.ts';
import { getFFmpeg } from '../lib/ffmpeg.ts';
import { extractAudio } from '../lib/audioExtractor.ts';
import { syncAudioTracks } from '../lib/audioSync.ts';
import { computeMultiResolutionPeaks } from '../lib/waveformPeaks.ts';
import { PrivacyBanner } from './PrivacyBanner.tsx';
import { FileDropZone } from './FileDropZone.tsx';
import { FileList } from './FileList.tsx';
import { FFmpegStatus } from './FFmpegStatus.tsx';
import { SyncButton } from './SyncButton.tsx';
import { PipelineProgress } from './PipelineProgress.tsx';
import { PlaybackSection } from './PlaybackSection.tsx';

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

  const [syncProgress, setSyncProgress] = useState<PipelineProgressType>({
    stage: 'idle', current: 0, total: 0, message: '',
  });
  const [syncResults, setSyncResults] = useState<DownloadableResult[]>([]);
  const [syncError, setSyncError] = useState<string | undefined>(undefined);
  const [waveformPeaks, setWaveformPeaks] = useState<Map<string, MultiResolutionPeaks>>(new Map());

  const handleSync = useCallback(async () => {
    if (files.length < 2) return;

    // Reset all state for new pipeline run
    setSyncResults([]);
    setSyncError(undefined);
    setWaveformPeaks(new Map());
    setSyncProgress({ stage: 'extracting', current: 0, total: files.length, message: 'Starting audio extraction...' });

    try {
      // Phase 1: Extract audio from all videos sequentially
      const audioTracks = [];
      for (let i = 0; i < files.length; i++) {
        setSyncProgress({
          stage: 'extracting',
          current: i + 1,
          total: files.length,
          message: `Extracting audio from ${files[i].name}...`,
        });

        const audio = await extractAudio(files[i].file);
        // Compute waveform peaks while we have the raw audio data
        const peaks = computeMultiResolutionPeaks(audio.channelData[0], audio.sampleRate);
        setWaveformPeaks(prev => new Map(prev).set(files[i].id, peaks));
        audioTracks.push({
          fileId: files[i].id,
          fileName: files[i].name,
          audio,
        });
      }

      // Phase 2: Correlate all tracks
      setSyncProgress({
        stage: 'correlating',
        current: 0,
        total: files.length - 1,
        message: 'Analyzing audio for sync points...',
      });

      const results = await syncAudioTracks(audioTracks, ({ current, total }) => {
        setSyncProgress({
          stage: 'correlating',
          current,
          total,
          message: `Aligning camera ${current} of ${total}...`,
        });
      });

      // Build simplified downloadable results (no trimming/ZIP needed)
      const downloadableResults: DownloadableResult[] = results.map(syncResult => {
        const videoFile = files.find(f => f.id === syncResult.fileId)!;
        return { ...syncResult, originalFile: videoFile.file };
      });
      setSyncResults(downloadableResults);

      setSyncProgress({
        stage: 'complete',
        current: files.length,
        total: files.length,
        message: `Sync complete — ${files.length} files aligned`,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Pipeline failed';
      setSyncError(message);
      setSyncProgress({
        stage: 'error',
        current: 0,
        total: files.length,
        message,
      });
    }
  }, [files]);

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

        {/* Sync Controls -- below file list */}
        {files.length > 0 && (
          <div className="mt-6">
            <SyncButton
              fileCount={files.length}
              isSyncing={['extracting', 'correlating'].includes(syncProgress.stage)}
              onClick={handleSync}
            />
          </div>
        )}

        {/* Progress -- visible during pipeline */}
        {syncProgress.stage !== 'idle' && (
          <div className="mt-4">
            <PipelineProgress progress={syncProgress} />
          </div>
        )}

        {/* Error -- visible on failure */}
        {syncError && (
          <div className="mt-4 bg-red-900/30 border border-red-800 rounded-lg p-4">
            <p className="text-sm text-red-400">{syncError}</p>
          </div>
        )}

        {/* Playback section: video grid + waveforms */}
        {syncResults.length > 0 && waveformPeaks.size > 0 && (
          <div className="mt-6">
            <PlaybackSection peaksMap={waveformPeaks} results={syncResults} />
          </div>
        )}
      </main>
    </div>
  );
}
