import { useState, useRef, useCallback } from 'react';
import type { DownloadableResult, MultiResolutionPeaks, DisplayMode } from '../types/index.ts';
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

  // Poster URLs state -- will be wired in Task 3
  const [posterUrls, setPosterUrls] = useState<(string | null)[]>(
    () => results.map(() => null),
  );

  const handleAllReady = useCallback(() => {
    setAllVideosReady(true);
  }, []);

  const toggleDisplayMode = useCallback(() => {
    setDisplayMode((prev) => (prev === 'fill' ? 'letterbox' : 'fill'));
  }, []);

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
      <WaveformPanel peaksMap={peaksMap} results={results} />
    </div>
  );
}
