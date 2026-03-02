import { useState, useCallback } from 'react';
import type { VideoFile } from '../types/index.ts';
import { MAX_FILES } from '../lib/constants.ts';
import { PrivacyBanner } from './PrivacyBanner.tsx';
import { FileDropZone } from './FileDropZone.tsx';
import { FileList } from './FileList.tsx';

export default function App() {
  const [files, setFiles] = useState<VideoFile[]>([]);

  const handleFilesAccepted = useCallback((newFiles: File[]) => {
    const videoFiles: VideoFile[] = newFiles.map((file) => ({
      id: crypto.randomUUID(),
      file,
      name: file.name,
      size: file.size,
      type: file.type,
    }));
    setFiles((prev) => [...prev, ...videoFiles]);
  }, []);

  const handleRemoveFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight">
            Sync Multi-Cam
          </h1>
          <PrivacyBanner />
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-6 py-12">
        <FileDropZone
          onFilesAccepted={handleFilesAccepted}
          currentFileCount={files.length}
          maxFiles={MAX_FILES}
        />
        <div className="mt-6">
          <FileList files={files} onRemove={handleRemoveFile} />
        </div>
      </main>
    </div>
  );
}
