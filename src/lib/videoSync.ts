/**
 * Standalone timeline clock that keeps all videos synced to a shared timeline.
 * No video is privileged — the clock drives time via rAF + performance.now()
 * and drift-corrects every video equally.
 */

const DRIFT_THRESHOLD_NUDGE = 0.05; // 50ms -- nudge playbackRate
const DRIFT_THRESHOLD_SEEK = 0.1; // 100ms -- hard seek correction
const PLAYBACK_RATE_FAST = 1.03;
const PLAYBACK_RATE_SLOW = 0.97;
const PLAYBACK_RATE_NORMAL = 1.0;

export interface SyncEngine {
  start: () => void;
  stop: () => void;
  seek: (time: number) => void;
  destroy: () => void;
}

/**
 * Creates a timeline clock that keeps all videos aligned to a shared timeline.
 *
 * @param videos - All video elements to keep in sync
 * @param offsets - Per-video offset in seconds on the shared timeline (positive)
 * @param onFrame - Callback fired each frame with the current timeline time
 * @param options - totalDuration and onComplete callback
 */
export function createTimelineClock(
  videos: HTMLVideoElement[],
  offsets: number[],
  onFrame?: (time: number) => void,
  options?: { totalDuration?: number; onComplete?: () => void },
): SyncEngine {
  let active = false;
  let rafId = 0;
  let clockStartWall = 0; // performance.now() when start() was called
  let clockStartTime = 0; // timeline time when start() was called
  let currentTime = 0; // authoritative timeline position

  const totalDuration = options?.totalDuration ?? Infinity;
  const onComplete = options?.onComplete;

  function syncAllVideos(time: number): void {
    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      const expectedLocal = time - offsets[i];

      // Before this track's start
      if (expectedLocal < 0) {
        if (!video.paused) video.pause();
        video.playbackRate = PLAYBACK_RATE_NORMAL;
        continue;
      }

      // Past this track's end
      const dur = video.duration || Infinity;
      if (expectedLocal >= dur) {
        if (!video.paused) video.pause();
        video.playbackRate = PLAYBACK_RATE_NORMAL;
        continue;
      }

      // Auto-start if paused and clock is active
      if (video.paused && active) {
        video.currentTime = expectedLocal;
        video.play().catch(() => {});
      }

      // Drift correction
      const drift = video.currentTime - expectedLocal;
      if (Math.abs(drift) > DRIFT_THRESHOLD_SEEK) {
        video.currentTime = expectedLocal;
        video.playbackRate = PLAYBACK_RATE_NORMAL;
      } else if (Math.abs(drift) > DRIFT_THRESHOLD_NUDGE) {
        video.playbackRate = drift > 0 ? PLAYBACK_RATE_SLOW : PLAYBACK_RATE_FAST;
      } else {
        video.playbackRate = PLAYBACK_RATE_NORMAL;
      }
    }
  }

  function tick(): void {
    if (!active) return;
    const elapsed = (performance.now() - clockStartWall) / 1000;
    currentTime = clockStartTime + elapsed;

    if (currentTime >= totalDuration) {
      currentTime = totalDuration;
      active = false;
      syncAllVideos(currentTime);
      onFrame?.(currentTime);
      onComplete?.();
      return;
    }

    syncAllVideos(currentTime);
    onFrame?.(currentTime);
    rafId = requestAnimationFrame(tick);
  }

  return {
    start(): void {
      active = true;
      clockStartWall = performance.now();
      clockStartTime = currentTime;
      rafId = requestAnimationFrame(tick);
    },

    stop(): void {
      active = false;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      for (const v of videos) {
        v.playbackRate = PLAYBACK_RATE_NORMAL;
      }
    },

    seek(time: number): void {
      currentTime = time;
      for (let i = 0; i < videos.length; i++) {
        const expectedLocal = time - offsets[i];
        if (expectedLocal < 0) {
          videos[i].currentTime = 0;
          if (!videos[i].paused) videos[i].pause();
        } else {
          videos[i].currentTime = Math.min(expectedLocal, videos[i].duration || Infinity);
        }
        videos[i].playbackRate = PLAYBACK_RATE_NORMAL;
      }
    },

    destroy(): void {
      this.stop();
    },
  };
}
