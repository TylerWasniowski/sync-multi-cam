import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { DownloadableResult, DisplayMode } from '../types/index.ts';
import { computeGridLayout } from '../lib/gridLayout.ts';
import { VideoTile } from './VideoTile.tsx';

export interface VideoGridProps {
  results: DownloadableResult[];
  displayMode: DisplayMode;
  posterUrls: (string | null)[];
  videoRefs: React.RefObject<(HTMLVideoElement | null)[]>;
  onAllReady: () => void;
}

export function VideoGrid({
  results,
  displayMode,
  posterUrls,
  videoRefs,
  onAllReady,
}: VideoGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [aspectRatio, setAspectRatio] = useState(16 / 9);
  const readyCountRef = useRef(0);
  const allReadyFiredRef = useRef(false);

  // Create individual refs for each video element
  const tileRefs = useRef<(React.RefObject<HTMLVideoElement | null>)[]>([]);

  // Ensure we have a ref for each result
  if (tileRefs.current.length !== results.length) {
    tileRefs.current = results.map(
      (_, i) => tileRefs.current[i] ?? { current: null },
    );
  }

  // Sync individual tile refs back to the parent videoRefs array
  useEffect(() => {
    const syncRefs = () => {
      videoRefs.current = tileRefs.current.map((ref) => ref.current);
    };

    // Use a MutationObserver-like approach: update after each render
    syncRefs();
  });

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

  // Detect intrinsic aspect ratio from the first loaded video
  useEffect(() => {
    const firstRef = tileRefs.current[0];
    if (!firstRef) return;

    const checkMetadata = () => {
      const video = firstRef.current;
      if (video && video.videoWidth > 0 && video.videoHeight > 0) {
        setAspectRatio(video.videoWidth / video.videoHeight);
      }
    };

    // Check periodically until we get metadata (video may not be mounted yet)
    const interval = setInterval(() => {
      const video = firstRef.current;
      if (!video) return;

      if (video.videoWidth > 0 && video.videoHeight > 0) {
        setAspectRatio(video.videoWidth / video.videoHeight);
        clearInterval(interval);
        return;
      }

      video.addEventListener('loadedmetadata', checkMetadata, { once: true });
    }, 100);

    return () => clearInterval(interval);
  }, [results.length]);

  // Compute layout
  const layout = useMemo(() => {
    if (containerWidth <= 0 || results.length === 0) return null;
    // Compute a proportional container height based on the width
    // Use a 16:9 container aspect ratio as default
    const containerHeight = containerWidth / (16 / 9);
    return computeGridLayout(containerWidth, containerHeight, results.length, aspectRatio);
  }, [containerWidth, results.length, aspectRatio]);

  // Compute container height from layout
  const containerHeight = useMemo(() => {
    if (!layout || containerWidth <= 0) return 0;
    // Scale layout gridHeight relative to the actual containerWidth
    // The layout was computed with containerWidth as-is, so gridHeight is already proportional
    return layout.gridHeight;
  }, [layout, containerWidth]);

  // Track ready state
  const handleTileReady = useCallback(() => {
    readyCountRef.current++;
    if (readyCountRef.current >= results.length && !allReadyFiredRef.current) {
      allReadyFiredRef.current = true;
      onAllReady();
    }
  }, [results.length, onAllReady]);

  // Reset ready tracking when results change
  useEffect(() => {
    readyCountRef.current = 0;
    allReadyFiredRef.current = false;
  }, [results]);

  if (results.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="relative w-full bg-black"
      style={{ height: containerHeight > 0 ? containerHeight : 'auto' }}
    >
      {layout &&
        layout.tiles.map((tile, index) => {
          const result = results[index];
          if (!result) return null;
          return (
            <VideoTile
              key={result.fileId}
              file={result.originalFile}
              posterUrl={posterUrls[index] ?? null}
              displayMode={displayMode}
              style={{
                left: tile.x,
                top: tile.y,
                width: tile.width,
                height: tile.height,
              }}
              videoRef={tileRefs.current[index]}
              onReady={handleTileReady}
            />
          );
        })}
    </div>
  );
}
