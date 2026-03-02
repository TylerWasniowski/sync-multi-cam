import { useRef, useState, useEffect, useCallback } from 'react';
import type { MultiResolutionPeaks, ViewState } from '../types/index.ts';
import { selectPeakLevel } from '../lib/waveformPeaks.ts';
import { WaveformCanvas } from './WaveformCanvas.tsx';

const MIN_SAMPLES_PER_PIXEL = 1;
const TRACK_HEIGHT = 80;

export interface WaveformTrackProps {
  fileName: string;
  isReference: boolean;
  peaks: MultiResolutionPeaks;
  syncResult: { offsetSeconds: number; confidence: number };
  viewState: ViewState;
  maxSamplesPerPixel: number;
  onViewStateChange: (update: Partial<ViewState>) => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}

export function WaveformTrack({
  fileName,
  isReference,
  peaks,
  syncResult,
  viewState,
  maxSamplesPerPixel,
  onViewStateChange,
  onPointerEnter,
  onPointerLeave,
}: WaveformTrackProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Drag state refs (not React state to avoid re-renders during drag)
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartOffsetRef = useRef(0);
  const rafRef = useRef<number>(0);
  const [isDragging, setIsDragging] = useState(false);

  // Touch state refs
  const activeTouchesRef = useRef<{ id: number; clientX: number; clientY: number }[]>([]);
  const isPinchingRef = useRef(false);
  const pinchStartDistRef = useRef(0);
  const pinchStartSPPRef = useRef(0);
  const lastSingleTouchXRef = useRef(0);

  // Measure container width via ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Select the right peak resolution for current zoom
  const selectedPeaks = containerWidth > 0
    ? selectPeakLevel(peaks, viewState.samplesPerPixel, containerWidth)
    : peaks.overview;


  // --- Pointer drag (pan) ---
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    isDraggingRef.current = true;
    dragStartXRef.current = e.clientX;
    dragStartOffsetRef.current = viewState.scrollOffset;
    setIsDragging(true);
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  }, [viewState.scrollOffset]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingRef.current) {
      // Drag panning
      const deltaX = dragStartXRef.current - e.clientX;
      const deltaSamples = deltaX * viewState.samplesPerPixel;
      const newOffset = dragStartOffsetRef.current + deltaSamples;

      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        onViewStateChange({ scrollOffset: Math.max(0, newOffset) });
      });
    } else {
      // Hover cursor tracking
      const rect = e.currentTarget.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const time = (viewState.scrollOffset + offsetX * viewState.samplesPerPixel) / peaks.sampleRate;
      onViewStateChange({ cursorTime: time });
    }
  }, [viewState.samplesPerPixel, viewState.scrollOffset, peaks.sampleRate, onViewStateChange]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsDragging(false);
    (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);

    // Commit final offset
    const deltaX = dragStartXRef.current - e.clientX;
    const deltaSamples = deltaX * viewState.samplesPerPixel;
    const newOffset = dragStartOffsetRef.current + deltaSamples;
    onViewStateChange({ scrollOffset: Math.max(0, newOffset) });
  }, [viewState.samplesPerPixel, onViewStateChange]);

  // --- Touch gesture handlers ---
  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const touches: { id: number; clientX: number; clientY: number }[] = [];
    for (let i = 0; i < e.touches.length; i++) {
      const t = e.touches[i];
      touches.push({ id: t.identifier, clientX: t.clientX, clientY: t.clientY });
    }
    activeTouchesRef.current = touches;

    if (touches.length === 2) {
      const dist = Math.hypot(
        touches[0].clientX - touches[1].clientX,
        touches[0].clientY - touches[1].clientY,
      );
      pinchStartDistRef.current = dist;
      pinchStartSPPRef.current = viewState.samplesPerPixel;
      isPinchingRef.current = true;
    } else if (touches.length === 1) {
      lastSingleTouchXRef.current = touches[0].clientX;
      dragStartOffsetRef.current = viewState.scrollOffset;
    }
  }, [viewState.samplesPerPixel, viewState.scrollOffset]);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();

    const touches: { id: number; clientX: number; clientY: number }[] = [];
    for (let i = 0; i < e.touches.length; i++) {
      const t = e.touches[i];
      touches.push({ id: t.identifier, clientX: t.clientX, clientY: t.clientY });
    }

    if (isPinchingRef.current && touches.length === 2) {
      // Pinch-to-zoom
      const newDist = Math.hypot(
        touches[0].clientX - touches[1].clientX,
        touches[0].clientY - touches[1].clientY,
      );
      const ratio = newDist / pinchStartDistRef.current;
      const newSPP = Math.max(
        MIN_SAMPLES_PER_PIXEL,
        Math.min(maxSamplesPerPixel, pinchStartSPPRef.current / ratio),
      );

      // Anchor zoom at midpoint of two touches
      const rect = e.currentTarget.getBoundingClientRect();
      const midX = (touches[0].clientX + touches[1].clientX) / 2 - rect.left;
      const anchorSample = viewState.scrollOffset + midX * viewState.samplesPerPixel;
      const newOffset = anchorSample - midX * newSPP;

      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        onViewStateChange({
          samplesPerPixel: newSPP,
          scrollOffset: Math.max(0, newOffset),
        });
      });

      // Update for continuous tracking
      pinchStartDistRef.current = newDist;
      pinchStartSPPRef.current = newSPP;
    } else if (!isPinchingRef.current && touches.length === 1) {
      // Single-finger swipe to pan
      const deltaX = lastSingleTouchXRef.current - touches[0].clientX;
      const deltaSamples = deltaX * viewState.samplesPerPixel;
      lastSingleTouchXRef.current = touches[0].clientX;
      dragStartOffsetRef.current = viewState.scrollOffset + deltaSamples;

      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        onViewStateChange({ scrollOffset: Math.max(0, dragStartOffsetRef.current) });
      });
    }

    activeTouchesRef.current = touches;
  }, [viewState.samplesPerPixel, viewState.scrollOffset, maxSamplesPerPixel, onViewStateChange]);

  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const remaining: { id: number; clientX: number; clientY: number }[] = [];
    for (let i = 0; i < e.touches.length; i++) {
      const t = e.touches[i];
      remaining.push({ id: t.identifier, clientX: t.clientX, clientY: t.clientY });
    }
    activeTouchesRef.current = remaining;

    if (remaining.length < 2) {
      isPinchingRef.current = false;
    }
    if (remaining.length === 1) {
      lastSingleTouchXRef.current = remaining[0].clientX;
      dragStartOffsetRef.current = viewState.scrollOffset;
    }
  }, [viewState.scrollOffset]);

  const offsetLabel = isReference
    ? 'REF'
    : `+${syncResult.offsetSeconds.toFixed(2)}s`;

  return (
    <div className="flex items-center" style={{ height: TRACK_HEIGHT }}>
      {/* Label column */}
      <div className="w-40 shrink-0 pr-3 flex flex-col justify-center overflow-hidden">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-300 truncate" title={fileName}>
            {fileName}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-[10px] font-mono ${isReference ? 'text-blue-400' : 'text-gray-500'}`}>
            {offsetLabel}
          </span>
          <span className="text-[10px] text-gray-600">
            {syncResult.confidence}%
          </span>
        </div>
      </div>

      {/* Canvas container */}
      <div
        ref={containerRef}
        className="flex-1 min-w-0"
        style={{
          touchAction: 'none',
          cursor: isDragging ? 'grabbing' : 'grab',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        {containerWidth > 0 && (
          <WaveformCanvas
            peaks={selectedPeaks}
            viewState={viewState}
            syncOffsetSeconds={syncResult.offsetSeconds}
            isReference={isReference}
            width={containerWidth}
            height={TRACK_HEIGHT}
          />
        )}
      </div>
    </div>
  );
}
