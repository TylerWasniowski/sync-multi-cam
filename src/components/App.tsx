import { useState, useCallback, useRef, useEffect } from 'react';
import type { VideoFile, PipelineProgress as PipelineProgressType, DownloadableResult, TrimmedFile, MultiResolutionPeaks } from '../types/index.ts';
import { MAX_FILES } from '../lib/constants.ts';
import { validateFiles } from '../lib/fileValidation.ts';
import { getFFmpeg } from '../lib/ffmpeg.ts';
import { extractAudio } from '../lib/audioExtractor.ts';
import { syncAudioTracks } from '../lib/audioSync.ts';
import { trimVideo, calculateAlignedTrims } from '../lib/videoTrimmer.ts';
import { buildZip } from '../lib/zipBuilder.ts';
import { computeMultiResolutionPeaks } from '../lib/waveformPeaks.ts';
import { PrivacyBanner } from './PrivacyBanner.tsx';
import { FileDropZone } from './FileDropZone.tsx';
import { FileList } from './FileList.tsx';
import { FFmpegStatus } from './FFmpegStatus.tsx';
import { SyncButton } from './SyncButton.tsx';
import { PipelineProgress } from './PipelineProgress.tsx';
import { SyncResults } from './SyncResults.tsx';
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
  const [zipData, setZipData] = useState<Uint8Array | null>(null);
  const [waveformPeaks, setWaveformPeaks] = useState<Map<string, MultiResolutionPeaks>>(new Map());

  const handleSync = useCallback(async () => {
    if (files.length < 2) return;

    // Reset all state for new pipeline run
    setSyncResults([]);
    setSyncError(undefined);
    setZipData(null);
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

      const results = await syncAudioTracks(audioTracks, (progress) => {
        const completed = Math.round((progress / 100) * (files.length - 1));
        setSyncProgress({
          stage: 'correlating',
          current: completed,
          total: files.length - 1,
          message: `Correlating track ${completed} of ${files.length - 1}...`,
        });
      });

      // Phase 3: Trim videos
      // Calculate trim amounts: align all files to the latest-starting track
      const maxOffset = Math.max(...results.map(r => r.offsetSeconds));

      setSyncProgress({
        stage: 'trimming',
        current: 0,
        total: files.length,
        message: 'Calculating keyframe-aligned trim points...',
      });

      // Build per-file ideal trims and get coordinated snap points
      const idealTrims = results.map(r => {
        const videoFile = files.find(f => f.id === r.fileId)!;
        return { file: videoFile.file, idealTrimSeconds: maxOffset - r.offsetSeconds };
      });
      const alignedTrims = await calculateAlignedTrims(idealTrims);

      const downloadableResults: DownloadableResult[] = [];
      let trimFailCount = 0;

      for (let i = 0; i < results.length; i++) {
        const syncResult = results[i];
        const videoFile = files.find(f => f.id === syncResult.fileId);
        if (!videoFile) continue;

        const trimSeconds = alignedTrims[i].snapTrimSeconds;

        setSyncProgress({
          stage: 'trimming',
          current: i + 1,
          total: files.length,
          message: `Trimming ${syncResult.fileName}...`,
        });

        let trimmedData: Uint8Array | null = null;
        try {
          trimmedData = await trimVideo(videoFile.file, trimSeconds);
        } catch (err: unknown) {
          console.warn(
            `Failed to trim ${syncResult.fileName}:`,
            err instanceof Error ? err.message : err
          );
          trimFailCount++;
        }

        downloadableResults.push({
          fileId: syncResult.fileId,
          fileName: syncResult.fileName,
          offsetSeconds: syncResult.offsetSeconds,
          offsetSamples: syncResult.offsetSamples,
          confidence: syncResult.confidence,
          isReference: syncResult.isReference,
          trimmedData,
          trimSeconds,
          originalFile: videoFile.file,
        });
      }

      // If ALL files failed trimming, set error state
      if (trimFailCount === files.length) {
        throw new Error('All files failed to trim. Please try again with different files.');
      }

      setSyncResults(downloadableResults);

      // Phase 4: Build ZIP
      setSyncProgress({
        stage: 'zipping',
        current: 0,
        total: 1,
        message: 'Creating ZIP archive...',
      });

      const zipFiles: TrimmedFile[] = [];
      for (const result of downloadableResults) {
        if (result.trimmedData) {
          zipFiles.push({
            name: `synced_${result.fileName}`,
            data: result.trimmedData,
          });
        } else {
          // Skipped file (reference/latest): include original
          const buffer = await result.originalFile.arrayBuffer();
          zipFiles.push({
            name: result.fileName,
            data: new Uint8Array(buffer),
          });
        }
      }

      const zip = buildZip(zipFiles);
      setZipData(zip);

      setSyncProgress({
        stage: 'zipping',
        current: 1,
        total: 1,
        message: 'ZIP ready',
      });

      setSyncProgress({
        stage: 'complete',
        current: files.length,
        total: files.length,
        message: `Pipeline complete — ${files.length} files synced and ready for download`,
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
              isSyncing={['extracting', 'correlating', 'trimming', 'zipping'].includes(syncProgress.stage)}
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

        {/* Results -- visible after sync completes */}
        {syncResults.length > 0 && (
          <div className="mt-6">
            <SyncResults results={syncResults} zipData={zipData} />
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
