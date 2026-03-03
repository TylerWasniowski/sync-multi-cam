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
  onAspectRatioDetected?: (ratio: number) => void;
  expandedIndex?: number | null;
  onTileClick?: (index: number) => void;
}

export function VideoGrid({
  results,
  displayMode,
  posterUrls,
  videoRefs,
  onAllReady,
  onAspectRatioDetected,
  expandedIndex,
  onTileClick,
}: VideoGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [aspectRatio, setAspectRatio] = useState(16 / 9);
  const readyCountRef = useRef(0);
  const allReadyFiredRef = useRef(false);

  // Ensure videoRefs array has the right length
  if (videoRefs.current.length !== results.length) {
    videoRefs.current = new Array(results.length).fill(null);
  }

  // Stable callback refs that write directly to videoRefs.current[i]
  const videoRefCallbacks = useMemo(
    () =>
      results.map(
        (_, i) => (el: HTMLVideoElement | null) => {
          videoRefs.current[i] = el;
        },
      ),
    [results.length, videoRefs],
  );

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
    // Check periodically until we get metadata (video may not be mounted yet)
    const interval = setInterval(() => {
      const video = videoRefs.current[0];
      if (!video) return;

      if (video.videoWidth > 0 && video.videoHeight > 0) {
        const ar = video.videoWidth / video.videoHeight;
        setAspectRatio(ar);
        onAspectRatioDetected?.(ar);
        clearInterval(interval);
        return;
      }

      const checkMetadata = () => {
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          const ar = video.videoWidth / video.videoHeight;
          setAspectRatio(ar);
          onAspectRatioDetected?.(ar);
          clearInterval(interval);
        }
      };
      video.addEventListener('loadedmetadata', checkMetadata, { once: true });
    }, 100);

    return () => clearInterval(interval);
  }, [results.length, videoRefs]);

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
          const isExpanded = expandedIndex === index;
          const tileStyle = isExpanded
            ? { left: 0, top: 0, width: containerWidth, height: containerHeight, zIndex: 10 }
            : { left: tile.x, top: tile.y, width: tile.width, height: tile.height };
          return (
            <VideoTile
              key={result.fileId}
              file={result.originalFile}
              posterUrl={posterUrls[index] ?? null}
              displayMode={isExpanded ? 'letterbox' : displayMode}
              style={{
                ...tileStyle,
                transition: 'all 200ms ease-in-out',
              }}
              videoRef={videoRefCallbacks[index]}
              onReady={handleTileReady}
              onClick={() => onTileClick?.(index)}
            />
          );
        })}
    </div>
  );
}
