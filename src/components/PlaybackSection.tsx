import { useState, useRef, useCallback, useEffect } from 'react';
import type { DownloadableResult, MultiResolutionPeaks, DisplayMode } from '../types/index.ts';
import { createPosterExtractor } from '../lib/posterFrame.ts';
import { VideoGrid } from './VideoGrid.tsx';
import { WaveformPanel } from './WaveformPanel.tsx';

export interface PlaybackSectionProps {
  results: DownloadableResult[];
  peaksMap: Map<string, MultiResolutionPeaks>;
}

export function PlaybackSection({ results, peaksMap }: PlaybackSectionProps) {
  const [displayMode, setDisplayMode] = useState<DisplayMode>('fill');
  const [allVideosReady, setAllVideosReady] = useState(false);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);

  // Poster URLs state
  const [posterUrls, setPosterUrls] = useState<(string | null)[]>(
    () => results.map(() => null),
  );

  // Track previous poster URLs for revocation
  const prevPosterUrlsRef = useRef<(string | null)[]>([]);

  // Poster extractors ref
  const extractorsRef = useRef<ReturnType<typeof createPosterExtractor>[]>([]);

  // Throttle timestamp for scrub
  const lastExtractTimeRef = useRef(0);
  const scrubRafRef = useRef(0);

  // Create poster extractors when results change
  useEffect(() => {
    // Destroy previous extractors
    for (const ext of extractorsRef.current) {
      ext.destroy();
    }

    // Revoke all previous poster URLs
    for (const url of prevPosterUrlsRef.current) {
      if (url) URL.revokeObjectURL(url);
    }
    prevPosterUrlsRef.current = [];

    if (results.length === 0) {
      extractorsRef.current = [];
      setPosterUrls([]);
      return;
    }

    // Create new extractors
    const extractors = results.map((result) =>
      createPosterExtractor(result.originalFile),
    );
    extractorsRef.current = extractors;

    // Extract initial poster frames at each video's trim offset
    const initialUrls: (string | null)[] = results.map(() => null);
    setPosterUrls(initialUrls);

    let cancelled = false;

    results.forEach((result, index) => {
      const extractor = extractors[index];
      const initialTime = result.trimSeconds;

      extractor
        .extract(initialTime)
        .then((url) => {
          if (cancelled) {
            URL.revokeObjectURL(url);
            return;
          }
          setPosterUrls((prev) => {
            const next = [...prev];
            // Revoke previous URL for this index
            const old = next[index];
            if (old) URL.revokeObjectURL(old);
            next[index] = url;
            prevPosterUrlsRef.current = next;
            return next;
          });
        })
        .catch(() => {
          // Silently ignore initial poster extraction failures
        });
    });

    return () => {
      cancelled = true;
      for (const ext of extractors) {
        ext.destroy();
      }
      // Revoke any poster URLs still active
      for (const url of prevPosterUrlsRef.current) {
        if (url) URL.revokeObjectURL(url);
      }
      prevPosterUrlsRef.current = [];
    };
  }, [results]);

  const handleAllReady = useCallback(() => {
    setAllVideosReady(true);
  }, []);

  const toggleDisplayMode = useCallback(() => {
    setDisplayMode((prev) => (prev === 'fill' ? 'letterbox' : 'fill'));
  }, []);

  // Scrub-to-poster pipeline
  const handleScrub = useCallback(
    (time: number | null) => {
      // On pointer leave, keep current poster frames visible
      if (time === null) return;

      // Throttle to ~10fps (100ms)
      const now = performance.now();
      if (now - lastExtractTimeRef.current < 100) return;
      lastExtractTimeRef.current = now;

      // Gate through rAF to avoid scheduling during layout
      if (scrubRafRef.current) cancelAnimationFrame(scrubRafRef.current);
      scrubRafRef.current = requestAnimationFrame(() => {
        scrubRafRef.current = 0;

        const extractors = extractorsRef.current;
        if (extractors.length === 0) return;

        results.forEach((result, index) => {
          const extractor = extractors[index];
          if (!extractor) return;

          // Compute per-video time: waveform time is aligned time,
          // add trim offset to get absolute video time
          const perVideoTime = time + result.trimSeconds;

          extractor
            .extract(perVideoTime)
            .then((url) => {
              setPosterUrls((prev) => {
                const next = [...prev];
                // Revoke previous URL for this index
                const old = next[index];
                if (old) URL.revokeObjectURL(old);
                next[index] = url;
                prevPosterUrlsRef.current = next;
                return next;
              });
            })
            .catch(() => {
              // Stale or failed extraction -- ignore
            });
        });
      });
    },
    [results],
  );

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
      {/* Section header */}
      <div className="px-4 py-3 border-b border-gray-800">
        <h2 className="text-sm font-medium text-gray-300">Playback</h2>
      </div>

      {/* Video grid */}
      <VideoGrid
        results={results}
        displayMode={displayMode}
        posterUrls={posterUrls}
        videoRefs={videoRefs}
        onAllReady={handleAllReady}
      />

      {/* Display mode toolbar */}
      <div className="px-4 py-2 border-b border-gray-800 flex items-center gap-2">
        <button
          type="button"
          onClick={toggleDisplayMode}
          className="px-3 py-1 text-xs font-medium rounded bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
        >
          {displayMode === 'fill' ? 'Fill (Crop)' : 'Letterbox (Fit)'}
        </button>
        {!allVideosReady && (
          <span className="text-xs text-gray-500">Loading videos...</span>
        )}
      </div>

      {/* Waveform panel -- rendered as-is to preserve existing behavior */}
      <WaveformPanel peaksMap={peaksMap} results={results} onScrub={handleScrub} />
    </div>
  );
}
