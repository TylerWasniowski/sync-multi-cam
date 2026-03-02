import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { MultiResolutionPeaks, ViewState, DownloadableResult } from '../types/index.ts';
import { WaveformTrack } from './WaveformTrack.tsx';

export interface WaveformPanelProps {
  peaksMap: Map<string, MultiResolutionPeaks>;
  results: DownloadableResult[];
}

export function WaveformPanel({ peaksMap, results }: WaveformPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelWidth, setPanelWidth] = useState(0);

  // rAF gating for view state updates
  const pendingUpdateRef = useRef<Partial<ViewState> | null>(null);
  const rafIdRef = useRef<number>(0);

  // Measure panel width
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setPanelWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Find the longest track for default zoom
  const maxDuration = useMemo(() => {
    let max = 0;
    for (const peaks of peaksMap.values()) {
      if (peaks.duration > max) max = peaks.duration;
    }
    return max;
  }, [peaksMap]);

  const sampleRate = useMemo(() => {
    for (const peaks of peaksMap.values()) {
      return peaks.sampleRate;
    }
    return 16000; // fallback
  }, [peaksMap]);

  // Default samplesPerPixel: fit longest track in panel width (minus label area ~160px)
  const canvasWidth = Math.max(panelWidth - 160, 200);
  const defaultSPP = maxDuration > 0 && canvasWidth > 0
    ? (maxDuration * sampleRate) / canvasWidth
    : 100;

  const [viewState, setViewState] = useState<ViewState>({
    samplesPerPixel: defaultSPP,
    scrollOffset: 0,
    cursorTime: null,
  });

  // Update default SPP when panel resizes and user hasn't zoomed yet
  const hasUserZoomedRef = useRef(false);
  useEffect(() => {
    if (!hasUserZoomedRef.current && defaultSPP > 0) {
      setViewState((prev) => ({
        ...prev,
        samplesPerPixel: defaultSPP,
      }));
    }
  }, [defaultSPP]);

  // Max scroll offset
  const maxTotalSamples = useMemo(() => {
    let max = 0;
    for (const peaks of peaksMap.values()) {
      if (peaks.totalSamples > max) max = peaks.totalSamples;
    }
    return max;
  }, [peaksMap]);

  const handleViewStateChange = useCallback((update: Partial<ViewState>) => {
    // Track if user has zoomed
    if (update.samplesPerPixel !== undefined) {
      hasUserZoomedRef.current = true;
    }

    pendingUpdateRef.current = { ...pendingUpdateRef.current, ...update };

    if (rafIdRef.current) return; // already scheduled

    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = 0;
      const pending = pendingUpdateRef.current;
      if (!pending) return;
      pendingUpdateRef.current = null;

      setViewState((prev) => {
        const next = { ...prev, ...pending };

        // Clamp scrollOffset
        const maxOffset = Math.max(0, maxTotalSamples - canvasWidth * next.samplesPerPixel);
        next.scrollOffset = Math.max(0, Math.min(next.scrollOffset, maxOffset));

        return next;
      });
    });
  }, [maxTotalSamples, canvasWidth]);

  const handlePointerLeaveAll = useCallback(() => {
    handleViewStateChange({ cursorTime: null });
  }, [handleViewStateChange]);

  // No-op for enter (cursor is tracked via pointer move)
  const handlePointerEnter = useCallback(() => {}, []);

  // Memoize track list to avoid re-creating on viewState changes
  const trackEntries = useMemo(() => {
    return results.map((result) => {
      const peaks = peaksMap.get(result.fileId);
      if (!peaks) return null;
      return {
        key: result.fileId,
        fileName: result.fileName,
        isReference: result.isReference,
        peaks,
        syncResult: {
          offsetSeconds: result.offsetSeconds,
          confidence: result.confidence,
        },
      };
    }).filter(Boolean) as {
      key: string;
      fileName: string;
      isReference: boolean;
      peaks: MultiResolutionPeaks;
      syncResult: { offsetSeconds: number; confidence: number };
    }[];
  }, [results, peaksMap]);

  if (peaksMap.size === 0) return null;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800">
        <h2 className="text-sm font-medium text-gray-300">Audio Waveforms</h2>
      </div>

      <div ref={panelRef} className="divide-y divide-gray-800" onPointerLeave={handlePointerLeaveAll}>
        {trackEntries.map((entry) => (
          <div key={entry.key} className="px-4 py-1">
            <WaveformTrack
              fileName={entry.fileName}
              isReference={entry.isReference}
              peaks={entry.peaks}
              syncResult={entry.syncResult}
              viewState={viewState}
              onViewStateChange={handleViewStateChange}
              onPointerEnter={handlePointerEnter}
              onPointerLeave={handlePointerLeaveAll}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
