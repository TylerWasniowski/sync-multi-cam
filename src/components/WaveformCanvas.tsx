import { useRef, useEffect } from 'react';
import type { WaveformPeaks, ViewState } from '../types/index.ts';

export interface WaveformCanvasProps {
  peaks: WaveformPeaks;
  viewState: ViewState;
  syncOffsetSeconds: number; // this track's offset
  isReference: boolean;
  width: number; // CSS pixel width
  height: number; // CSS pixel height (recommend 80)
}

const WAVEFORM_COLOR = 'rgba(59, 130, 246, 0.6)'; // blue-500 at 60%
const CENTER_LINE_COLOR = '#374151'; // gray-700
const SYNC_MARKER_COLOR = '#3b82f6'; // blue-500
const CURSOR_COLOR = '#9ca3af'; // gray-400
const TRIM_OVERLAY_COLOR = 'rgba(0, 0, 0, 0.3)';
const TRACK_END_COLOR = 'rgba(0, 0, 0, 0.35)'; // dimmed overlay beyond audio end
const TRACK_END_LINE_COLOR = 'rgba(107, 114, 128, 0.5)'; // gray-500 at 50%
const LABEL_FONT = '10px ui-monospace, monospace';
const LABEL_COLOR = '#d1d5db'; // gray-300
const LABEL_BG = 'rgba(0, 0, 0, 0.6)';

/**
 * Stateless canvas renderer for audio waveforms.
 * Draws a mirrored waveform from peak data, sync markers, cursor line,
 * and trimmed region overlay. Has NO interaction handlers and NO state.
 */
export function WaveformCanvas({
  peaks,
  viewState,
  syncOffsetSeconds,
  isReference,
  width,
  height,
}: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  // Setup canvas dimensions with devicePixelRatio
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctxRef.current = ctx;
  }, [width, height]);

  // Draw everything when peaks, viewState, or dimensions change
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;

    // Reset transform and clear (needed because scale accumulates)
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    const halfHeight = height / 2;
    const { samplesPerPixel, scrollOffset } = viewState;

    // Calculate visible bucket range
    const startBucket = Math.floor(scrollOffset / peaks.samplesPerBucket);
    const endBucket = Math.min(
      Math.ceil((scrollOffset + width * samplesPerPixel) / peaks.samplesPerBucket),
      peaks.length,
    );

    // Draw trimmed region overlay (before waveform so it's behind)
    if (!isReference && syncOffsetSeconds > 0) {
      const trimEndX =
        (syncOffsetSeconds * peaks.sampleRate - scrollOffset) / samplesPerPixel;
      if (trimEndX > 0) {
        ctx.fillStyle = TRIM_OVERLAY_COLOR;
        ctx.fillRect(0, 0, Math.min(trimEndX, width), height);
      }
    }

    // Draw waveform
    ctx.fillStyle = WAVEFORM_COLOR;
    const barWidth = Math.max(1, Math.ceil(peaks.samplesPerBucket / samplesPerPixel));
    ctx.beginPath();
    for (let i = startBucket; i < endBucket; i++) {
      const x =
        (i * peaks.samplesPerBucket - scrollOffset) / samplesPerPixel;
      if (x < -barWidth || x > width + 1) continue;

      const minVal = peaks.min[i];
      const maxVal = peaks.max[i];

      // Mirrored waveform: max goes up from center, min goes down
      const yTop = halfHeight - maxVal * halfHeight;
      const yBottom = halfHeight - minVal * halfHeight;
      const barHeight = Math.max(1, yBottom - yTop);

      ctx.rect(x, yTop, barWidth, barHeight);
    }
    ctx.fill();

    // Draw center line
    ctx.strokeStyle = CENTER_LINE_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, halfHeight);
    ctx.lineTo(width, halfHeight);
    ctx.stroke();

    // Draw track-end boundary (dims empty space beyond audio)
    drawTrackEnd(ctx, peaks.duration, viewState, peaks.sampleRate, width, height);

    // Draw sync marker
    drawSyncMarker(ctx, syncOffsetSeconds, isReference, viewState, peaks.sampleRate, width, height);

    // Draw cursor line
    drawCursor(ctx, viewState.cursorTime, viewState, peaks.sampleRate, width, height);
  }, [peaks, viewState, syncOffsetSeconds, isReference, width, height]);

  return (
    <canvas
      ref={canvasRef}
      className="block"
    />
  );
}

/**
 * Draw a vertical dashed line at the sync offset position with label.
 */
function drawSyncMarker(
  ctx: CanvasRenderingContext2D,
  offsetSeconds: number,
  isReference: boolean,
  viewState: ViewState,
  sampleRate: number,
  canvasWidth: number,
  canvasHeight: number,
): void {
  const x =
    (offsetSeconds * sampleRate - viewState.scrollOffset) /
    viewState.samplesPerPixel;

  if (x < -10 || x > canvasWidth + 10) return;

  // Dashed vertical line
  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = SYNC_MARKER_COLOR;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, canvasHeight);
  ctx.stroke();
  ctx.setLineDash([]);

  // Label above the line
  const label = isReference ? 'REF' : `+${offsetSeconds.toFixed(2)}s`;
  ctx.font = LABEL_FONT;
  const textMetrics = ctx.measureText(label);
  const padding = 3;
  const labelWidth = textMetrics.width + padding * 2;
  const labelHeight = 14;
  const labelX = Math.min(x - labelWidth / 2, canvasWidth - labelWidth);
  const labelY = 2;

  // Label background
  ctx.fillStyle = LABEL_BG;
  ctx.fillRect(
    Math.max(0, labelX),
    labelY,
    labelWidth,
    labelHeight,
  );

  // Label text
  ctx.fillStyle = LABEL_COLOR;
  ctx.textBaseline = 'top';
  ctx.fillText(label, Math.max(0, labelX) + padding, labelY + 2);
  ctx.restore();
}

/**
 * Draw a dimmed overlay and vertical line at the track-end boundary,
 * showing where the audio content ends and empty space begins.
 */
function drawTrackEnd(
  ctx: CanvasRenderingContext2D,
  duration: number,
  viewState: ViewState,
  sampleRate: number,
  canvasWidth: number,
  canvasHeight: number,
): void {
  const endX = (duration * sampleRate - viewState.scrollOffset) / viewState.samplesPerPixel;
  if (endX >= canvasWidth || endX < 0) return; // not visible or fully past

  // Draw dimmed overlay for region beyond audio end
  ctx.fillStyle = TRACK_END_COLOR;
  ctx.fillRect(endX, 0, canvasWidth - endX, canvasHeight);

  // Draw a thin vertical line at the track end boundary
  ctx.strokeStyle = TRACK_END_LINE_COLOR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(endX, 0);
  ctx.lineTo(endX, canvasHeight);
  ctx.stroke();
}

/**
 * Draw a thin vertical cursor line at the hover time position with time label.
 */
function drawCursor(
  ctx: CanvasRenderingContext2D,
  cursorTime: number | null,
  viewState: ViewState,
  sampleRate: number,
  canvasWidth: number,
  canvasHeight: number,
): void {
  if (cursorTime === null) return;

  const x =
    (cursorTime * sampleRate - viewState.scrollOffset) /
    viewState.samplesPerPixel;

  if (x < 0 || x > canvasWidth) return;

  // Cursor vertical line
  ctx.save();
  ctx.strokeStyle = CURSOR_COLOR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, canvasHeight);
  ctx.stroke();

  // Time label at top
  const label = `${cursorTime.toFixed(2)}s`;
  ctx.font = LABEL_FONT;
  const textMetrics = ctx.measureText(label);
  const padding = 3;
  const labelWidth = textMetrics.width + padding * 2;
  const labelHeight = 14;
  const labelX = Math.min(x + 4, canvasWidth - labelWidth);
  const labelY = 2;

  ctx.fillStyle = LABEL_BG;
  ctx.fillRect(
    Math.max(0, labelX),
    labelY,
    labelWidth,
    labelHeight,
  );

  ctx.fillStyle = CURSOR_COLOR;
  ctx.textBaseline = 'top';
  ctx.fillText(label, Math.max(0, labelX) + padding, labelY + 2);
  ctx.restore();
}
