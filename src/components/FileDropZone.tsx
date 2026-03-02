import { useState, useCallback, useRef } from 'react';
import { validateFiles } from '../lib/fileValidation.ts';
import { MAX_FILES } from '../lib/constants.ts';

interface FileDropZoneProps {
  onFilesAccepted: (files: File[]) => void;
  currentFileCount: number;
  maxFiles: number;
}

export function FileDropZone({
  onFilesAccepted,
  currentFileCount,
  maxFiles,
}: FileDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      dragCounter.current = 0;

      const files = Array.from(e.dataTransfer.files);
      const result = validateFiles(files, currentFileCount, maxFiles);
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      onFilesAccepted(result.validFiles);
    },
    [currentFileCount, maxFiles, onFilesAccepted],
  );

  const handleBrowse = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      const result = validateFiles(files, currentFileCount, maxFiles);
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      onFilesAccepted(result.validFiles);
      e.target.value = '';
    },
    [currentFileCount, maxFiles, onFilesAccepted],
  );

  if (currentFileCount >= MAX_FILES) {
    return (
      <div className="border-2 border-dashed rounded-xl p-12 text-center border-gray-700 bg-gray-800/30">
        <p className="text-gray-400 text-lg">Maximum files reached</p>
        <p className="text-gray-500 text-sm mt-2">
          {currentFileCount} of {maxFiles} files added
        </p>
      </div>
    );
  }

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
        isDragging
          ? 'border-blue-500 bg-blue-500/10'
          : 'border-gray-600 bg-gray-800/50 hover:border-gray-500'
      }`}
    >
      <p className="text-gray-300 text-lg mb-4">
        Drag and drop video files here
      </p>
      <button
        type="button"
        onClick={handleBrowse}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors"
      >
        Browse Files
      </button>
      <p className="text-gray-500 text-xs mt-3">MP4, MOV, MKV, WebM</p>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="video/mp4,video/quicktime,video/x-matroska,video/webm,.mp4,.mov,.mkv,.webm"
        onChange={handleFileInput}
        className="hidden"
      />
      {error && <p className="text-red-400 mt-3 text-sm">{error}</p>}
      {currentFileCount > 0 && (
        <p className="text-gray-400 text-sm mt-2">
          {currentFileCount} of {maxFiles} files added
        </p>
      )}
    </div>
  );
}
