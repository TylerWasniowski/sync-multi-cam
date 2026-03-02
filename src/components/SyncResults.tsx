import type { DownloadableResult } from '../types/index.ts';
import { formatOffset, getConfidenceLevel } from '../lib/audioSync.ts';
import { triggerDownload } from '../lib/downloadHelper.ts';

interface SyncResultsProps {
  results: DownloadableResult[];
  zipData: Uint8Array | null;
}

export function SyncResults({ results, zipData }: SyncResultsProps) {
  if (results.length === 0) return null;

  const confidenceColors = {
    high: 'text-green-400',
    medium: 'text-yellow-400',
    low: 'text-red-400',
  };

  const handleFileDownload = async (result: DownloadableResult) => {
    if (result.trimmedData) {
      // Trimmed file: download the trimmed data
      triggerDownload(result.trimmedData, `synced_${result.fileName}`, 'video/mp4');
    } else {
      // Skipped file (reference/latest): download the original
      const buffer = await result.originalFile.arrayBuffer();
      triggerDownload(new Uint8Array(buffer), result.fileName, result.originalFile.type || 'video/mp4');
    }
  };

  const handleZipDownload = () => {
    if (zipData) {
      triggerDownload(zipData, 'synced_videos.zip', 'application/zip');
    }
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <h2 className="text-sm font-medium text-gray-300">Sync Results</h2>
        {zipData && (
          <button
            onClick={handleZipDownload}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-md transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download ZIP
          </button>
        )}
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
                <button
                  onClick={() => handleFileDownload(result)}
                  className="flex items-center gap-1 px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded transition-colors"
                  title={`Download ${result.trimmedData ? `synced_${result.fileName}` : result.fileName}`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
