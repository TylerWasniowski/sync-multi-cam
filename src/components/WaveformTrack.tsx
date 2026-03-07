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
  isMuted: boolean;
  onToggleMute: () => void;
  onViewStateChange: (update: Partial<ViewState>) => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  playheadTime?: number | null;
  onScrubSeek?: (time: number) => void;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
}

export function WaveformTrack({
  fileName,
  isReference,
  peaks,
  syncResult,
  viewState,
  maxSamplesPerPixel,
  isMuted,
  onToggleMute,
  onViewStateChange,
  onPointerEnter,
  onPointerLeave,
  playheadTime,
  onScrubSeek,
  onScrubStart,
  onScrubEnd,
}: WaveformTrackProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Interaction mode: bare click/drag = scrub, Shift+drag = pan
  const modeRef = useRef<'idle' | 'pan' | 'scrub'>('idle');
  const dragStartXRef = useRef(0);
  const dragStartOffsetRef = useRef(0);
  const rafRef = useRef<number>(0);
  const [isDragging, setIsDragging] = useState(false);

  // Shift key tracking for dynamic cursor style
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


  // --- Pointer interaction: bare click/drag = seek/scrub, Shift+drag = pan ---
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);

    if (e.shiftKey) {
      // Shift+drag: pan mode (existing behavior)
      modeRef.current = 'pan';
      dragStartXRef.current = e.clientX;
      dragStartOffsetRef.current = viewState.scrollOffset;
      setIsDragging(true);
    } else {
      // Bare click/drag: seek/scrub mode
      modeRef.current = 'scrub';
      dragStartXRef.current = e.clientX;
      setIsDragging(true);
      onScrubStart?.();

      // Immediately seek to click position
      const rect = e.currentTarget.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const time = (viewState.scrollOffset + offsetX * viewState.samplesPerPixel) / peaks.sampleRate;
      onScrubSeek?.(Math.max(0, time));
    }
  }, [viewState.scrollOffset, viewState.samplesPerPixel, peaks.sampleRate, onScrubSeek, onScrubStart]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (modeRef.current === 'pan') {
      // Shift+drag panning
      const deltaX = dragStartXRef.current - e.clientX;
      const deltaSamples = deltaX * viewState.samplesPerPixel;
      const newOffset = dragStartOffsetRef.current + deltaSamples;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        onViewStateChange({ scrollOffset: Math.max(0, newOffset) });
      });
    } else if (modeRef.current === 'scrub') {
      // Bare drag: continuous scrub seek
      const rect = e.currentTarget.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const time = (viewState.scrollOffset + offsetX * viewState.samplesPerPixel) / peaks.sampleRate;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        onScrubSeek?.(Math.max(0, time));
      });
    } else {
      // Hover cursor tracking (no drag active)
      const rect = e.currentTarget.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const time = (viewState.scrollOffset + offsetX * viewState.samplesPerPixel) / peaks.sampleRate;
      onViewStateChange({ cursorTime: time });
    }
  }, [viewState.samplesPerPixel, viewState.scrollOffset, peaks.sampleRate, onViewStateChange, onScrubSeek]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const mode = modeRef.current;
    if (mode === 'idle') return;

    (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);

    if (mode === 'pan') {
      // Commit final pan offset
      const deltaX = dragStartXRef.current - e.clientX;
      const deltaSamples = deltaX * viewState.samplesPerPixel;
      const newOffset = dragStartOffsetRef.current + deltaSamples;
      onViewStateChange({ scrollOffset: Math.max(0, newOffset) });
    } else if (mode === 'scrub') {
      onScrubEnd?.();
    }

    modeRef.current = 'idle';
    setIsDragging(false);
  }, [viewState.samplesPerPixel, onViewStateChange, onScrubEnd]);

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
      {/* Mute toggle — outside dimmed scope so it stays at full opacity */}
      <button
        type="button"
        onClick={onToggleMute}
        onPointerDown={(e) => e.stopPropagation()}
        className={`flex-shrink-0 p-1 rounded transition-colors cursor-pointer ${
          isMuted
            ? 'text-red-400 hover:text-red-300'
            : 'text-gray-400 hover:text-gray-200'
        }`}
        title={isMuted ? 'Unmute' : 'Mute'}
      >
        {isMuted ? (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <path d="M3.5 4.5v5h2.5l3 3V1.5l-3 3H3.5z" />
            <path d="M10.5 4.5l3 5M13.5 4.5l-3 5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <path d="M3.5 4.5v5h2.5l3 3V1.5l-3 3H3.5z" />
            <path d="M10.5 3.5c.8.8 1.2 1.9 1.2 3.1s-.4 2.3-1.2 3.1" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        )}
      </button>

      {/* Dimmable content — dims when track is muted */}
      <div
        className="flex items-center flex-1 min-w-0"
        style={{
          opacity: isMuted ? 0.4 : 1,
          filter: isMuted ? 'grayscale(1)' : 'none',
          transition: 'opacity 300ms ease-in-out, filter 300ms ease-in-out',
        }}
      >
        {/* Label column */}
        <div className="w-32 shrink-0 pr-3 flex items-center overflow-hidden">
          <div className="flex flex-col justify-center min-w-0">
            <span className="text-xs text-gray-300 truncate" title={fileName}>
              {fileName}
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-[10px] font-mono ${isReference ? 'text-blue-400' : 'text-gray-500'}`}>
                {offsetLabel}
              </span>
              <span className="text-[10px] text-gray-600">
                {syncResult.confidence}%
              </span>
            </div>
          </div>
        </div>

        {/* Canvas container */}
        <div
          ref={containerRef}
          className="flex-1 min-w-0"
          data-waveform-canvas
          style={{
            touchAction: 'none',
            cursor: isDragging
              ? (modeRef.current === 'pan' ? 'grabbing' : 'col-resize')
              : (shiftHeld ? 'grab' : 'crosshair'),
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
              playheadTime={playheadTime}
              waveformColor={isMuted ? 'rgba(156, 163, 175, 0.5)' : undefined}
            />
          )}
        </div>
      </div>
    </div>
  );
}
