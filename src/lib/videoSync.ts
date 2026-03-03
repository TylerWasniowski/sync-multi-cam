/**
 * Leader-follower video sync engine using requestVideoFrameCallback (rVFC)
 * with requestAnimationFrame fallback. Keeps follower videos aligned with
 * a leader via two-threshold drift correction.
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
 * Creates a sync engine that keeps follower videos aligned with a leader.
 * Uses rVFC when available, falls back to rAF.
 *
 * @param leader - The leader video element that drives timing
 * @param followers - Array of follower video elements to keep in sync
 * @param offsets - Per-follower offset in seconds relative to the leader
 * @param onFrame - Optional callback fired on each sync frame with the leader's media time
 */
export function createSyncEngine(
  leader: HTMLVideoElement,
  followers: HTMLVideoElement[],
  offsets: number[],
  onFrame?: (time: number) => void,
): SyncEngine {
  let active = false;
  let rafId = 0;

  const hasRVFC = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;

  function syncFollowers(leaderTime: number): void {
    for (let i = 0; i < followers.length; i++) {
      const follower = followers[i];
      const expectedTime = leaderTime + offsets[i];

      // Not yet active — keep paused at time 0
      if (expectedTime < 0) {
        if (!follower.paused) follower.pause();
        follower.playbackRate = PLAYBACK_RATE_NORMAL;
        continue;
      }

      // Past end — keep paused at last frame
      const dur = follower.duration || Infinity;
      if (expectedTime >= dur) {
        if (!follower.paused) follower.pause();
        follower.playbackRate = PLAYBACK_RATE_NORMAL;
        continue;
      }

      // Auto-start if paused and should be active
      if (follower.paused && active) {
        follower.currentTime = expectedTime;
        follower.play().catch(() => {});
      }

      // Clamp to valid range
      const clampedExpected = Math.min(expectedTime, dur);
      const actualTime = follower.currentTime;
      const drift = actualTime - clampedExpected;

      if (Math.abs(drift) > DRIFT_THRESHOLD_SEEK) {
        // Large drift: hard seek
        follower.currentTime = clampedExpected;
        follower.playbackRate = PLAYBACK_RATE_NORMAL;
      } else if (Math.abs(drift) > DRIFT_THRESHOLD_NUDGE) {
        // Small drift: nudge playback rate
        follower.playbackRate = drift > 0 ? PLAYBACK_RATE_SLOW : PLAYBACK_RATE_FAST;
      } else {
        // In sync: reset playback rate (critical per Pitfall 2)
        follower.playbackRate = PLAYBACK_RATE_NORMAL;
      }
    }
  }

  function onVideoFrame(
    _now: DOMHighResTimeStamp,
    metadata: VideoFrameCallbackMetadata,
  ): void {
    if (!active) return;
    const leaderTime = metadata.mediaTime;
    syncFollowers(leaderTime);
    onFrame?.(leaderTime);
    // Re-register for next frame
    leader.requestVideoFrameCallback(onVideoFrame);
  }

  function onAnimationFrame(): void {
    if (!active) return;
    const leaderTime = leader.currentTime;
    syncFollowers(leaderTime);
    onFrame?.(leaderTime);
    rafId = requestAnimationFrame(onAnimationFrame);
  }

  return {
    start(): void {
      active = true;
      if (hasRVFC) {
        leader.requestVideoFrameCallback(onVideoFrame);
      } else {
        rafId = requestAnimationFrame(onAnimationFrame);
      }
    },

    stop(): void {
      active = false;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      // Reset all followers' playback rates (critical per Pitfall 2)
      for (const f of followers) {
        f.playbackRate = PLAYBACK_RATE_NORMAL;
      }
    },

    seek(time: number): void {
      leader.currentTime = time;
      for (let i = 0; i < followers.length; i++) {
        const expectedTime = time + offsets[i];
        if (expectedTime < 0) {
          followers[i].currentTime = 0;
          if (!followers[i].paused) followers[i].pause();
        } else {
          followers[i].currentTime = Math.min(expectedTime, followers[i].duration || Infinity);
        }
        followers[i].playbackRate = PLAYBACK_RATE_NORMAL;
      }
    },

    destroy(): void {
      this.stop();
    },
  };
}
