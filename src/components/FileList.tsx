import type { VideoFile } from '../types/index.ts';

interface FileListProps {
  files: VideoFile[];
  onRemove: (id: string) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function FileList({ files, onRemove }: FileListProps) {
  if (files.length === 0) return null;

  return (
    <div className="bg-gray-900 rounded-lg divide-y divide-gray-800">
      {files.map((file) => (
        <div
          key={file.id}
          className="flex items-center justify-between px-4 py-3"
        >
          <div className="min-w-0 flex-1">
            <p className="text-gray-200 font-medium truncate">{file.name}</p>
            <p className="text-gray-500 text-sm">
              {formatFileSize(file.size)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onRemove(file.id)}
            className="ml-4 text-gray-500 hover:text-red-400 transition-colors flex-shrink-0"
            aria-label={`Remove ${file.name}`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
