import type { PipelineProgress as PipelineProgressType } from '../types/index.ts';

interface PipelineProgressProps {
  progress: PipelineProgressType;
}

export function PipelineProgress({ progress }: PipelineProgressProps) {
  if (progress.stage === 'idle') return null;

  const stageLabels: Record<string, string> = {
    extracting: 'Extracting Audio',
    correlating: 'Analyzing Sync',
    complete: 'Complete',
    error: 'Failed',
  };

  const percentage = progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-300">
          {stageLabels[progress.stage] || progress.stage}
        </span>
        <span className="text-sm text-gray-500">
          {progress.current}/{progress.total}
        </span>
      </div>
      <div className="w-full bg-gray-800 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all duration-300 ${
            progress.stage === 'error' ? 'bg-red-500' :
            progress.stage === 'complete' ? 'bg-green-500' :
            'bg-blue-500'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <p className="text-xs text-gray-500 mt-2">{progress.message}</p>
    </div>
  );
}
