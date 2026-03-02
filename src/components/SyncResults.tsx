import type { SyncResult } from '../types/index.ts';
import { formatOffset, getConfidenceLevel } from '../lib/audioSync.ts';

interface SyncResultsProps {
  results: SyncResult[];
}

export function SyncResults({ results }: SyncResultsProps) {
  if (results.length === 0) return null;

  const confidenceColors = {
    high: 'text-green-400',
    medium: 'text-yellow-400',
    low: 'text-red-400',
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800">
        <h2 className="text-sm font-medium text-gray-300">Sync Results</h2>
      </div>
      <div className="divide-y divide-gray-800">
        {results.map((result) => {
          const level = getConfidenceLevel(result.confidence);
          return (
            <div
              key={result.fileId}
              className="px-4 py-3 flex items-center justify-between"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-sm text-gray-100 truncate">
                  {result.fileName}
                </span>
                {result.isReference && (
                  <span className="text-xs bg-blue-900/50 text-blue-400 px-2 py-0.5 rounded-full whitespace-nowrap">
                    Reference
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 shrink-0 ml-4">
                <span className="text-sm font-mono text-gray-400">
                  {formatOffset(result.offsetSeconds)}
                </span>
                <span className={`text-sm font-medium ${confidenceColors[level]}`}>
                  {result.confidence}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
