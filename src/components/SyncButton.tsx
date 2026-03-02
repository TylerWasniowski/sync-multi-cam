import { MIN_FILES } from '../lib/constants.ts';

interface SyncButtonProps {
  fileCount: number;
  isSyncing: boolean;
  onClick: () => void;
}

export function SyncButton({ fileCount, isSyncing, onClick }: SyncButtonProps) {
  const isDisabled = fileCount < MIN_FILES || isSyncing;
  const label = isSyncing
    ? 'Syncing...'
    : fileCount < MIN_FILES
      ? `Add ${MIN_FILES - fileCount} more file${MIN_FILES - fileCount > 1 ? 's' : ''} to sync`
      : 'Sync Videos';

  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      className={`w-full py-3 px-6 rounded-lg font-medium text-sm transition-colors ${
        isDisabled
          ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
          : 'bg-blue-600 hover:bg-blue-500 text-white cursor-pointer'
      }`}
    >
      {label}
    </button>
  );
}
