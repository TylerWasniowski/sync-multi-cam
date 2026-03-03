import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { MultiResolutionPeaks, ViewState, DownloadableResult, MutedTracks } from '../types/index.ts';
import { WaveformTrack } from './WaveformTrack.tsx';

export interface WaveformPanelProps {
  peaksMap: Map<string, MultiResolutionPeaks>;
  results: DownloadableResult[];
  mutedTracks: MutedTracks;
  onToggleMute: (index: number) => void;
  onScrub?: (time: number | null) => void;
  playheadTime?: number | null;
  isPlaying?: boolean;
  onSeek?: (time: number) => void;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
  onScrubSeek?: (time: number) => void;
}

export function WaveformPanel({ peaksMap, results, mutedTracks, onToggleMute, onScrub, playheadTime, isPlaying, onSeek, onScrubStart, onScrubEnd, onScrubSeek }: WaveformPanelProps) {
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

  // Max scroll offset (accounts for offset + duration on shared timeline)
  const maxTotalSamples = useMemo(() => {
    let max = 0;
    for (const result of results) {
      const peaks = peaksMap.get(result.fileId);
      if (!peaks) continue;
      const end = result.offsetSeconds * peaks.sampleRate + peaks.totalSamples;
      if (end > max) max = end;
    }
    return max;
  }, [results, peaksMap]);

  const handleViewStateChange = useCallback((update: Partial<ViewState>) => {
    // Track if user has zoomed
    if (update.samplesPerPixel !== undefined) {
      hasUserZoomedRef.current = true;
    }

    // Cursor time updates are visual-only (hover indicator).

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
  }, [maxTotalSamples, canvasWidth, onScrub]);

  // Track whether user is actively interacting (pan or scrub) to suppress auto-follow and playhead-anchored zoom
  const userInteractingRef = useRef(false);

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

    if (isPlaying && playheadTime != null && !userInteractingRef.current) {
      // Anchor zoom on playhead during active playback
      const anchorSample = playheadTime * sampleRate;
      const playheadPixel = (anchorSample - viewState.scrollOffset) / viewState.samplesPerPixel;
      const clampedPlayheadX = Math.max(0, Math.min(playheadPixel, canvasWidth));
      const newOffset = anchorSample - clampedPlayheadX * newSPP;
      handleViewStateChange({
        samplesPerPixel: newSPP,
        scrollOffset: Math.max(0, newOffset),
      });
    } else {
      // Pointer-anchored zoom (paused, scrubbing, or not playing)
      const cursorSample = viewState.scrollOffset + clampedX * oldSPP;
      const newOffset = cursorSample - clampedX * newSPP;
      handleViewStateChange({
        samplesPerPixel: newSPP,
        scrollOffset: Math.max(0, newOffset),
      });
    }
  }, [viewState.samplesPerPixel, viewState.scrollOffset, maxSamplesPerPixel, canvasWidth, handleViewStateChange, isPlaying, playheadTime, sampleRate]);

  // Attach native wheel listener with passive: false so preventDefault() works
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // --- Playhead follow mode: auto-scroll to keep playhead visible during playback ---
  useEffect(() => {
    if (!isPlaying || playheadTime == null || userInteractingRef.current) return;

    const playheadSample = playheadTime * sampleRate;
    const viewStart = viewState.scrollOffset;
    const viewEnd = viewState.scrollOffset + canvasWidth * viewState.samplesPerPixel;

    // If playhead is outside visible viewport, page-turn forward
    if (playheadSample < viewStart || playheadSample > viewEnd) {
      // Page turn: place playhead at ~10% from left edge (not centered, to show upcoming content)
      const newOffset = playheadSample - canvasWidth * viewState.samplesPerPixel * 0.1;
      handleViewStateChange({ scrollOffset: Math.max(0, newOffset) });
    }
  }, [playheadTime, isPlaying, sampleRate, viewState.scrollOffset, viewState.samplesPerPixel, canvasWidth, handleViewStateChange]);

  // --- Panel-level pointer drag for gaps between tracks ---
  // Bare click/drag = seek/scrub, Shift+drag = pan

  const panelModeRef = useRef<'idle' | 'pan' | 'scrub'>('idle');
  const panelDragStartXRef = useRef(0);
  const panelDragStartOffsetRef = useRef(0);
  const panelRafRef = useRef<number>(0);

  // Shift key tracking for dynamic cursor
  const [shiftHeld, setShiftHeld] = useState(false);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Shift') setShiftHeld(true); };
    const onKeyUp = (e: KeyboardEvent) => { if (e.key === 'Shift') setShiftHeld(false); };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // Compute time from pointer position in panel gap areas
  const panelPointerToTime = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = panelRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const offsetX = e.clientX - rect.left - 176;
    const clampedX = Math.max(0, offsetX);
    return (viewState.scrollOffset + clampedX * viewState.samplesPerPixel) / sampleRate;
  }, [viewState.scrollOffset, viewState.samplesPerPixel, sampleRate]);

  const handlePanelPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    // Skip if a track's canvas area is handling this (tracks have their own drag)
    if ((e.target as HTMLElement).closest('[data-waveform-canvas]')) return;

    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);

    if (e.shiftKey) {
      // Shift+drag: pan mode
      panelModeRef.current = 'pan';
      userInteractingRef.current = true;
      panelDragStartXRef.current = e.clientX;
      panelDragStartOffsetRef.current = viewState.scrollOffset;
    } else {
      // Bare click/drag: seek/scrub mode
      panelModeRef.current = 'scrub';
      userInteractingRef.current = true;
      onScrubStart?.();
      const time = panelPointerToTime(e);
      onScrubSeek?.(Math.max(0, time));
    }
  }, [viewState.scrollOffset, onScrubStart, onScrubSeek, panelPointerToTime]);

  const handlePanelPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (panelModeRef.current === 'pan') {
      // Shift+drag panning
      const deltaX = panelDragStartXRef.current - e.clientX;
      const deltaSamples = deltaX * viewState.samplesPerPixel;
      const newOffset = panelDragStartOffsetRef.current + deltaSamples;

      if (panelRafRef.current) cancelAnimationFrame(panelRafRef.current);
      panelRafRef.current = requestAnimationFrame(() => {
        handleViewStateChange({ scrollOffset: Math.max(0, newOffset) });
      });
    } else if (panelModeRef.current === 'scrub') {
      // Bare drag: continuous scrub seek
      const time = panelPointerToTime(e);
      if (panelRafRef.current) cancelAnimationFrame(panelRafRef.current);
      panelRafRef.current = requestAnimationFrame(() => {
        onScrubSeek?.(Math.max(0, time));
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
  }, [viewState.samplesPerPixel, viewState.scrollOffset, sampleRate, handleViewStateChange, onScrubSeek, panelPointerToTime]);

  const handlePanelPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const mode = panelModeRef.current;
    if (mode === 'idle') return;

    (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);

    if (mode === 'pan') {
      const deltaX = panelDragStartXRef.current - e.clientX;
      const deltaSamples = deltaX * viewState.samplesPerPixel;
      const newOffset = panelDragStartOffsetRef.current + deltaSamples;
      handleViewStateChange({ scrollOffset: Math.max(0, newOffset) });
    } else if (mode === 'scrub') {
      onScrubEnd?.();
    }

    panelModeRef.current = 'idle';
    userInteractingRef.current = false;
  }, [viewState.samplesPerPixel, handleViewStateChange, onScrubEnd]);

  const handlePointerLeaveAll = useCallback(() => {
    handleViewStateChange({ cursorTime: null });
    onScrub?.(null);
  }, [handleViewStateChange, onScrub]);

  // No-op for enter (cursor is tracked via pointer move)
  const handlePointerEnter = useCallback(() => {}, []);

  // Memoize track list to avoid re-creating on viewState changes
  const trackEntries = useMemo(() => {
    return results.map((result, index) => {
      const peaks = peaksMap.get(result.fileId);
      if (!peaks) return null;
      return {
        key: result.fileId,
        index,
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
      index: number;
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
        style={{ cursor: shiftHeld ? 'grab' : 'crosshair', userSelect: 'none' }}
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
              isMuted={mutedTracks.has(entry.index)}
              onToggleMute={() => onToggleMute(entry.index)}
              onViewStateChange={handleViewStateChange}
              onPointerEnter={handlePointerEnter}
              onPointerLeave={handlePointerLeaveAll}
              playheadTime={playheadTime}
              onScrubSeek={onScrubSeek}
              onScrubStart={onScrubStart}
              onScrubEnd={onScrubEnd}
            />
          </div>
        ))}
      </div>
      <div className="px-4 py-1 text-[10px] text-gray-600 text-right select-none">
        Shift + drag to pan &middot; Scroll to zoom
      </div>
    </div>
  );
}
