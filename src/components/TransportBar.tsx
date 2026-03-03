import type { DisplayMode } from '../types/index.ts';

export interface TransportBarProps {
  isPlaying: boolean;
  allReady: boolean;
  currentTime: number;
  duration: number;
  displayMode: DisplayMode;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (time: number) => void;
  onDisplayModeToggle: () => void;
}

function formatTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function TransportBar({
  isPlaying,
  allReady,
  currentTime,
  duration,
  displayMode,
  onPlay,
  onPause,
  onSeek,
  onDisplayModeToggle,
}: TransportBarProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 border-t border-gray-800">
      {/* Play/Pause button */}
      <button
        type="button"
        onClick={isPlaying ? onPause : onPlay}
        disabled={!allReady}
        className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg px-3 py-1.5 text-sm font-medium text-white transition-colors"
      >
        {isPlaying ? (
          // Pause icon: two vertical bars
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="currentColor"
            className="inline-block"
          >
            <rect x="2" y="1" width="3.5" height="12" rx="0.5" />
            <rect x="8.5" y="1" width="3.5" height="12" rx="0.5" />
          </svg>
        ) : (
          // Play icon: triangle
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="currentColor"
            className="inline-block"
          >
            <path d="M3 1.5v11l9-5.5L3 1.5z" />
          </svg>
        )}
      </button>

      {/* Loading indicator when not ready */}
      {!allReady && (
        <span className="text-xs text-gray-500">Loading videos...</span>
      )}

      {/* Timecode display */}
      <span className="font-mono text-xs text-gray-400">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>

      {/* Seek bar */}
      <input
        type="range"
        min={0}
        max={duration || 0}
        step={0.01}
        value={currentTime}
        onChange={(e) => onSeek(Number(e.target.value))}
        disabled={!allReady}
        className="flex-1 accent-blue-500 disabled:opacity-50"
      />

      {/* Display mode toggle */}
      <button
        type="button"
        onClick={onDisplayModeToggle}
        className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded px-2 py-1 transition-colors"
      >
        {displayMode === 'fill' ? 'Fill' : 'Letterbox'}
      </button>

    </div>
  );
}
