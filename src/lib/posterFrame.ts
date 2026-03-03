/**
 * Poster frame extraction utility.
 *
 * Seeks a hidden video element to a target time, draws the frame
 * to an offscreen canvas, and returns a blob URL for the image.
 *
 * Two variants:
 * - extractPosterFrame: one-shot extraction (creates/destroys video element)
 * - createPosterExtractor: reusable extractor for repeated scrub operations
 */

/**
 * One-shot poster frame extraction.
 * Creates a hidden video, seeks to the given time, captures the frame,
 * then cleans up. Returns a blob URL that the caller must revoke.
 */
export async function extractPosterFrame(
  file: File,
  timeSeconds: number,
): Promise<string> {
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.muted = true;
  video.playsInline = true;

  const srcUrl = URL.createObjectURL(file);
  video.src = srcUrl;

  try {
    // Wait for metadata
    await new Promise<void>((resolve, reject) => {
      video.addEventListener('loadedmetadata', () => resolve(), { once: true });
      video.addEventListener('error', () => reject(new Error('Failed to load video metadata')), { once: true });
    });

    // Seek to target time (avoid exact 0 to prevent potential black frame)
    video.currentTime = Math.max(0.001, timeSeconds);

    await new Promise<void>((resolve, reject) => {
      video.addEventListener('seeked', () => resolve(), { once: true });
      video.addEventListener('error', () => reject(new Error('Failed to seek video')), { once: true });
    });

    // Draw to canvas
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get canvas 2d context');
    ctx.drawImage(video, 0, 0);

    // Convert to blob
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))),
        'image/jpeg',
        0.85,
      );
    });

    return URL.createObjectURL(blob);
  } finally {
    URL.revokeObjectURL(srcUrl);
    video.removeAttribute('src');
    video.load(); // release resources
  }
}

/**
 * Reusable poster frame extractor for a single file.
 * Keeps a hidden video element alive between extractions so that
 * rapid scrub operations (~10fps) don't create/destroy elements.
 *
 * Uses an incrementing request ID to discard stale seek results
 * when a newer extract() call arrives before the previous completes.
 */
export function createPosterExtractor(file: File): {
  extract: (timeSeconds: number) => Promise<string>;
  destroy: () => void;
} {
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.muted = true;
  video.playsInline = true;

  const srcUrl = URL.createObjectURL(file);
  video.src = srcUrl;

  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let requestId = 0;
  let destroyed = false;

  // Ready promise: resolves once metadata is loaded
  const readyPromise = new Promise<void>((resolve, reject) => {
    video.addEventListener('loadedmetadata', () => resolve(), { once: true });
    video.addEventListener('error', () => reject(new Error('Failed to load video metadata')), { once: true });
  });

  const extract = async (timeSeconds: number): Promise<string> => {
    if (destroyed) throw new Error('Extractor has been destroyed');

    const myId = ++requestId;

    await readyPromise;
    if (destroyed || myId !== requestId) throw new Error('stale');

    // Initialize canvas on first use
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Failed to get canvas 2d context');
    }

    // Seek
    video.currentTime = Math.max(0.001, timeSeconds);

    await new Promise<void>((resolve, reject) => {
      video.addEventListener('seeked', () => resolve(), { once: true });
      video.addEventListener('error', () => reject(new Error('Seek failed')), { once: true });
    });

    if (destroyed || myId !== requestId) throw new Error('stale');

    // Draw frame
    ctx!.drawImage(video, 0, 0);

    // Convert to blob
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas!.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))),
        'image/jpeg',
        0.85,
      );
    });

    if (destroyed || myId !== requestId) throw new Error('stale');

    return URL.createObjectURL(blob);
  };

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    requestId++; // invalidate any pending requests
    URL.revokeObjectURL(srcUrl);
    video.removeAttribute('src');
    video.load(); // release resources
    canvas = null;
    ctx = null;
  };

  return { extract, destroy };
}
