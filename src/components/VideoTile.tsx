import { useState, useEffect, useMemo } from 'react';
import type { DisplayMode } from '../types/index.ts';

export interface VideoTileProps {
  file: File;
  posterUrl: string | null;
  displayMode: DisplayMode;
  style: React.CSSProperties;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onReady: () => void;
}

export function VideoTile({
  file,
  posterUrl,
  displayMode,
  style,
  videoRef,
  onReady,
}: VideoTileProps) {
  const [loading, setLoading] = useState(true);

  // Create a stable blob URL from the File
  const blobUrl = useMemo(() => URL.createObjectURL(file), [file]);

  // Revoke blob URL on unmount
  useEffect(() => {
    return () => {
      URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  // Listen for canplay event and check readyState on mount
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleCanPlay = () => {
      setLoading(false);
      onReady();
    };

    // Check if already ready (e.g. cached)
    if (video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
      handleCanPlay();
      return;
    }

    video.addEventListener('canplay', handleCanPlay, { once: true });
    return () => {
      video.removeEventListener('canplay', handleCanPlay);
    };
  }, [videoRef, onReady]);

  const objectFit = displayMode === 'fill' ? 'cover' : 'contain';

  return (
    <div
      style={{
        ...style,
        position: 'absolute',
        overflow: 'hidden',
      }}
    >
      <video
        ref={videoRef}
        src={blobUrl}
        poster={posterUrl ?? undefined}
        preload="auto"
        muted
        playsInline
        style={{
          width: '100%',
          height: '100%',
          objectFit,
          backgroundColor: '#000',
          display: 'block',
        }}
      />
      {loading && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/50"
        >
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-600 border-t-gray-200" />
        </div>
      )}
    </div>
  );
}
