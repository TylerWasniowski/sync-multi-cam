interface FFmpegStatusProps {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error?: string;
}

export function FFmpegStatus({ status, error }: FFmpegStatusProps) {
  if (status === 'idle') return null;

  if (status === 'loading') {
    return (
      <div className="flex items-center gap-2 text-gray-400 text-sm">
        <span className="inline-block h-2 w-2 rounded-full bg-gray-400 animate-pulse" />
        Initializing FFmpeg...
      </div>
    );
  }

  if (status === 'ready') {
    return (
      <div className="flex items-center gap-2 text-green-400 text-sm">
        <svg
          className="h-4 w-4"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
            clipRule="evenodd"
          />
        </svg>
        FFmpeg ready
        <span className="text-gray-500">
          ({typeof SharedArrayBuffer !== 'undefined' ? 'multi-thread' : 'single-thread'})
        </span>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex items-center gap-2 text-red-400 text-sm">
        <svg
          className="h-4 w-4"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
            clipRule="evenodd"
          />
        </svg>
        {error ?? 'FFmpeg failed to load'}
      </div>
    );
  }

  return null;
}
