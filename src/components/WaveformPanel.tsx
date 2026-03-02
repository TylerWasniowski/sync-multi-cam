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

  // Default samplesPerPixel: fit longest track in panel width (minus px-4 padding + w-40 label = 176px)
  const canvasWidth = Math.max(panelWidth - 176, 200);
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

  // --- Wheel zoom at panel level (covers tracks + gaps) ---
  const MIN_SAMPLES_PER_PIXEL = 1;
  const maxSamplesPerPixel = Math.ceil(maxTotalSamples / 200);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault(); // prevent page scroll when over waveform panel

    const el = panelRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // Account for px-4 padding (16px) + label column w-40 (160px)
    const offsetX = e.clientX - rect.left - 176;
    const clampedX = Math.max(0, Math.min(offsetX, canvasWidth));
    const factor = e.deltaY > 0 ? 1.1 : 0.9;
    const oldSPP = viewState.samplesPerPixel;
    const newSPP = Math.max(MIN_SAMPLES_PER_PIXEL, Math.min(maxSamplesPerPixel, oldSPP * factor));

    // Keep the cursor sample position stable under the pointer
    const cursorSample = viewState.scrollOffset + clampedX * oldSPP;
    const newOffset = cursorSample - clampedX * newSPP;

    handleViewStateChange({
      samplesPerPixel: newSPP,
      scrollOffset: Math.max(0, newOffset),
    });
  }, [viewState.samplesPerPixel, viewState.scrollOffset, maxSamplesPerPixel, canvasWidth, handleViewStateChange]);

  // Attach native wheel listener with passive: false so preventDefault() works
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // --- Panel-level pointer drag (pan) for gaps between tracks ---
  const panelDragRef = useRef(false);
  const panelDragStartXRef = useRef(0);
  const panelDragStartOffsetRef = useRef(0);
  const panelRafRef = useRef<number>(0);

  const handlePanelPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    // Skip if a track's canvas area is handling this (tracks have their own drag)
    if ((e.target as HTMLElement).closest('[data-waveform-canvas]')) return;
    panelDragRef.current = true;
    panelDragStartXRef.current = e.clientX;
    panelDragStartOffsetRef.current = viewState.scrollOffset;
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  }, [viewState.scrollOffset]);

  const handlePanelPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (panelDragRef.current) {
      // Drag panning
      const deltaX = panelDragStartXRef.current - e.clientX;
      const deltaSamples = deltaX * viewState.samplesPerPixel;
      const newOffset = panelDragStartOffsetRef.current + deltaSamples;

      if (panelRafRef.current) cancelAnimationFrame(panelRafRef.current);
      panelRafRef.current = requestAnimationFrame(() => {
        handleViewStateChange({ scrollOffset: Math.max(0, newOffset) });
      });
    } else {
      // Hover cursor tracking in gap areas
      const el = panelRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const offsetX = e.clientX - rect.left - 176;
      const clampedX = Math.max(0, offsetX);
      const time = (viewState.scrollOffset + clampedX * viewState.samplesPerPixel) / sampleRate;
      handleViewStateChange({ cursorTime: time });
    }
  }, [viewState.samplesPerPixel, viewState.scrollOffset, sampleRate, handleViewStateChange]);

  const handlePanelPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!panelDragRef.current) return;
    panelDragRef.current = false;
    (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);

    const deltaX = panelDragStartXRef.current - e.clientX;
    const deltaSamples = deltaX * viewState.samplesPerPixel;
    const newOffset = panelDragStartOffsetRef.current + deltaSamples;
    handleViewStateChange({ scrollOffset: Math.max(0, newOffset) });
  }, [viewState.samplesPerPixel, handleViewStateChange]);

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

      <div
        ref={panelRef}
        className="divide-y divide-gray-800"
        style={{ cursor: 'grab', userSelect: 'none' }}
        onPointerDown={handlePanelPointerDown}
        onPointerMove={handlePanelPointerMove}
        onPointerUp={handlePanelPointerUp}
        onPointerLeave={handlePointerLeaveAll}
      >
        {trackEntries.map((entry) => (
          <div key={entry.key} className="px-4 py-1" data-waveform-track>
            <WaveformTrack
              fileName={entry.fileName}
              isReference={entry.isReference}
              peaks={entry.peaks}
              syncResult={entry.syncResult}
              viewState={viewState}
              maxSamplesPerPixel={maxSamplesPerPixel}
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
