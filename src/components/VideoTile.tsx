import { useState, useEffect, useRef, useCallback } from 'react';
import type { DisplayMode } from '../types/index.ts';

export interface VideoTileProps {
  file: File;
  posterUrl: string | null;
  displayMode: DisplayMode;
  style: React.CSSProperties;
  videoRef: (el: HTMLVideoElement | null) => void;
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
  const localRef = useRef<HTMLVideoElement | null>(null);

  // Blob URL managed in useEffect so each StrictMode cycle gets a fresh URL
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setBlobUrl(url);
    return () => {
      URL.revokeObjectURL(url);
      setBlobUrl(null);
    };
  }, [file]);

  // Combined ref callback: sets both local ref and parent callback
  const setRef = useCallback((el: HTMLVideoElement | null) => {
    localRef.current = el;
    videoRef(el);
  }, [videoRef]);

  // Listen for canplay event and check readyState on mount
  useEffect(() => {
    const video = localRef.current;
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
  }, [onReady, blobUrl]);

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
        ref={setRef}
        src={blobUrl ?? undefined}
        poster={posterUrl ?? undefined}
        preload="auto"
        playsInline
        style={{
          width: '100%',
          height: '100%',
          objectFit,
          backgroundColor: '#000',
          display: 'block',
        }}
      />
      <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-gradient-to-t from-black/70 to-transparent pointer-events-none">
        <span className="text-xs text-white truncate block drop-shadow-sm">
          {file.name}
        </span>
      </div>
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
