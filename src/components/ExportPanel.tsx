import { useState, useCallback, useEffect } from 'react';
import type { DownloadableResult, MutedTracks, ExportState, AudioConfig } from '../types/index.ts';
import {
  startExport,
  cancelExport,
  checkWebCodecsSupport,
  EXPORT_RESOLUTIONS,
  type ResolutionKey,
} from '../lib/exportComposite.ts';
import { triggerDownload } from '../lib/downloadHelper.ts';

interface ExportPanelProps {
  results: DownloadableResult[];
  mutedTracks: MutedTracks;
  totalDurationSeconds: number;
  tileAspectRatio: number;
  disabled?: boolean;
}

export function ExportPanel({
  results,
  mutedTracks,
  totalDurationSeconds,
  tileAspectRatio,
  disabled = false,
}: ExportPanelProps) {
  const [resolution, setResolution] = useState<ResolutionKey>('1080p');
  const [exportState, setExportState] = useState<ExportState>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [webCodecsSupported, setWebCodecsSupported] = useState<boolean | null>(null);
  const [webCodecsReason, setWebCodecsReason] = useState<string | undefined>();

  // Check WebCodecs support on mount
  useEffect(() => {
    const check = checkWebCodecsSupport();
    setWebCodecsSupported(check.supported);
    if (!check.supported) setWebCodecsReason(check.reason);
  }, []);

  const handleExport = useCallback(() => {
    setExportState('preparing');
    setProgress(0);
    setErrorMessage(null);

    // Derive AudioConfig from mutedTracks
    let audioConfig: AudioConfig;
    if (mutedTracks.size === results.length) {
      audioConfig = { mode: 'none' };
    } else {
      const trackIndices: number[] = [];
      for (let i = 0; i < results.length; i++) {
        if (!mutedTracks.has(i)) {
          trackIndices.push(i);
        }
      }
      audioConfig = { mode: 'mix', trackIndices };
    }

    // Build resolution config
    const res = EXPORT_RESOLUTIONS[resolution];

    setExportState('encoding');

    startExport(
      {
        type: 'start',
        files: results.map(r => r.originalFile),
        offsets: results.map(r => r.offsetSeconds),
        resolution: { width: res.width, height: res.height },
        fps: 30,
        bitrate: res.bitrate,
        audioConfig,
        totalDurationSeconds,
        tileAspectRatio,
      },
      {
        onProgress: (ratio) => setProgress(ratio),
        onComplete: (data) => {
          triggerDownload(new Uint8Array(data), 'composite.mp4', 'video/mp4');
          setExportState('complete');
          setTimeout(() => {
            setExportState('idle');
            setProgress(0);
          }, 2000);
        },
        onError: (msg) => {
          setExportState('error');
          setErrorMessage(msg);
        },
        onCancelled: () => {
          setExportState('cancelled');
          setTimeout(() => {
            setExportState('idle');
            setProgress(0);
          }, 1500);
        },
      },
    );
  }, [results, mutedTracks, totalDurationSeconds, tileAspectRatio, resolution]);

  const handleCancel = useCallback(() => {
    cancelExport();
  }, []);

  const handleRetry = useCallback(() => {
    setExportState('idle');
    setProgress(0);
    setErrorMessage(null);
  }, []);

  const isExporting = exportState === 'preparing' || exportState === 'encoding';

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-t border-gray-800">
      {/* Resolution picker */}
      <select
        value={resolution}
        onChange={(e) => setResolution(e.target.value as ResolutionKey)}
        disabled={isExporting}
        className="bg-gray-700 text-gray-300 text-xs rounded px-2 py-1.5
                   border border-gray-600 focus:outline-none focus:border-gray-500
                   disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {(Object.keys(EXPORT_RESOLUTIONS) as ResolutionKey[]).map((key) => (
          <option key={key} value={key}>
            {EXPORT_RESOLUTIONS[key].label}
          </option>
        ))}
      </select>

      {/* Export button or WebCodecs warning */}
      {webCodecsSupported === false ? (
        <span className="text-amber-500 text-xs">
          {webCodecsReason ?? 'Export requires Chrome or Edge browser'}
        </span>
      ) : (
        <button
          onClick={handleExport}
          disabled={disabled || isExporting || webCodecsSupported === false}
          className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium
                     rounded px-4 py-1.5 transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
        >
          Export MP4
        </button>
      )}

      {/* Status area */}
      <div className="flex-1 flex items-center gap-2 min-w-0">
        {exportState === 'preparing' && (
          <span className="text-gray-400 text-xs animate-pulse">
            Preparing...
          </span>
        )}

        {exportState === 'encoding' && (
          <div className="flex items-center gap-2 flex-1">
            <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
              {progress === 0 ? (
                <div className="h-full w-1/4 bg-blue-600 rounded-full animate-pulse" />
              ) : (
                <div
                  className="h-full bg-blue-600 rounded-full transition-all duration-300"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              )}
            </div>
            <span className="text-gray-400 text-xs whitespace-nowrap">
              {progress === 0 ? 'Encoding...' : `${Math.round(progress * 100)}%`}
            </span>
            <button
              onClick={handleCancel}
              className="text-gray-400 hover:text-red-400 text-xs shrink-0 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {exportState === 'complete' && (
          <span className="text-green-400 text-xs">Download ready</span>
        )}

        {exportState === 'cancelled' && (
          <span className="text-amber-400 text-xs">Export cancelled</span>
        )}

        {exportState === 'error' && (
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-red-400 text-xs truncate">
              {errorMessage ?? 'Export failed'}
            </span>
            <button
              onClick={handleRetry}
              className="text-gray-300 text-xs underline hover:text-white shrink-0"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
