import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { DownloadableResult, MultiResolutionPeaks, DisplayMode, MutedTracks } from '../types/index.ts';
import { createPosterExtractor } from '../lib/posterFrame.ts';
import { createSyncEngine } from '../lib/videoSync.ts';
import type { SyncEngine } from '../lib/videoSync.ts';
import { createAudioMixer } from '../lib/audioMixer.ts';
import type { AudioMixer } from '../lib/audioMixer.ts';
import { VideoGrid } from './VideoGrid.tsx';
import { TransportBar } from './TransportBar.tsx';
import { WaveformPanel } from './WaveformPanel.tsx';

export interface PlaybackSectionProps {
  results: DownloadableResult[];
  peaksMap: Map<string, MultiResolutionPeaks>;
}

export function PlaybackSection({ results, peaksMap }: PlaybackSectionProps) {
  const [displayMode, setDisplayMode] = useState<DisplayMode>('fill');
  const [allVideosReady, setAllVideosReady] = useState(false);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Sync engine ref
  const syncEngineRef = useRef<SyncEngine | null>(null);

  // Audio mixer ref and state
  const audioMixerRef = useRef<AudioMixer | null>(null);
  const [mutedTracks, setMutedTracks] = useState<MutedTracks>(new Set());

  // Poster URLs state
  const [posterUrls, setPosterUrls] = useState<(string | null)[]>(
    () => results.map(() => null),
  );

  // Track previous poster URLs for revocation
  const prevPosterUrlsRef = useRef<(string | null)[]>([]);

  // Poster extractors ref
  const extractorsRef = useRef<ReturnType<typeof createPosterExtractor>[]>([]);

  // Throttle timestamp for scrub
  const lastExtractTimeRef = useRef(0);
  const scrubRafRef = useRef(0);

  // Determine leader and follower indices from results
  // Leader: the video with the minimum trimSeconds (reference or latest-starting)
  const { leaderIndex, followerIndices, leaderTrimSeconds } = useMemo(() => {
    if (results.length === 0) {
      return { leaderIndex: -1, followerIndices: [] as number[], leaderTrimSeconds: 0 };
    }
    let minIdx = 0;
    let minTrim = results[0].trimSeconds;
    for (let i = 1; i < results.length; i++) {
      if (results[i].trimSeconds < minTrim) {
        minTrim = results[i].trimSeconds;
        minIdx = i;
      }
    }
    const followers: number[] = [];
    for (let i = 0; i < results.length; i++) {
      if (i !== minIdx) followers.push(i);
    }
    return { leaderIndex: minIdx, followerIndices: followers, leaderTrimSeconds: minTrim };
  }, [results]);

  // Create poster extractors when results change
  useEffect(() => {
    // Destroy previous extractors
    for (const ext of extractorsRef.current) {
      ext.destroy();
    }

    // Revoke all previous poster URLs
    for (const url of prevPosterUrlsRef.current) {
      if (url) URL.revokeObjectURL(url);
    }
    prevPosterUrlsRef.current = [];

    if (results.length === 0) {
      extractorsRef.current = [];
      setPosterUrls([]);
      return;
    }

    // Create new extractors
    const extractors = results.map((result) =>
      createPosterExtractor(result.originalFile),
    );
    extractorsRef.current = extractors;

    // Extract initial poster frames at each video's trim offset
    const initialUrls: (string | null)[] = results.map(() => null);
    setPosterUrls(initialUrls);

    let cancelled = false;

    results.forEach((result, index) => {
      const extractor = extractors[index];
      const initialTime = result.trimSeconds;

      extractor
        .extract(initialTime)
        .then((url) => {
          if (cancelled) {
            URL.revokeObjectURL(url);
            return;
          }
          setPosterUrls((prev) => {
            const next = [...prev];
            // Revoke previous URL for this index
            const old = next[index];
            if (old) URL.revokeObjectURL(old);
            next[index] = url;
            prevPosterUrlsRef.current = next;
            return next;
          });
        })
        .catch(() => {
          // Silently ignore initial poster extraction failures
        });
    });

    return () => {
      cancelled = true;
      for (const ext of extractors) {
        ext.destroy();
      }
      // Revoke any poster URLs still active
      for (const url of prevPosterUrlsRef.current) {
        if (url) URL.revokeObjectURL(url);
      }
      prevPosterUrlsRef.current = [];
    };
  }, [results]);

  // When allVideosReady becomes true, set up the sync engine
  useEffect(() => {
    if (!allVideosReady || results.length === 0 || leaderIndex < 0) return;

    const refs = videoRefs.current;
    const leaderEl = refs[leaderIndex];
    if (!leaderEl) return;

    // Set initial currentTime on all videos to their respective trimSeconds positions
    for (let i = 0; i < results.length; i++) {
      const video = refs[i];
      if (video) {
        video.currentTime = results[i].trimSeconds;
      }
    }

    // Compute playable duration from the leader
    const playableDuration = leaderEl.duration - leaderTrimSeconds;
    setDuration(isFinite(playableDuration) && playableDuration > 0 ? playableDuration : 0);
    setCurrentTime(0);

    // Gather follower elements and their offsets
    const followerEls: HTMLVideoElement[] = [];
    const followerOffsets: number[] = [];
    for (const fi of followerIndices) {
      const el = refs[fi];
      if (el) {
        followerEls.push(el);
        // Offset: follower's trimSeconds minus leader's trimSeconds
        followerOffsets.push(results[fi].trimSeconds - leaderTrimSeconds);
      }
    }

    // Create the sync engine
    const engine = createSyncEngine(
      leaderEl,
      followerEls,
      followerOffsets,
      (time: number) => {
        // Normalize to 0-based playback time
        setCurrentTime(time - leaderTrimSeconds);
      },
    );
    syncEngineRef.current = engine;

    // Listen for ended event on the leader to auto-pause
    const handleEnded = () => {
      engine.stop();
      setIsPlaying(false);
    };
    leaderEl.addEventListener('ended', handleEnded);

    return () => {
      leaderEl.removeEventListener('ended', handleEnded);
      engine.destroy();
      syncEngineRef.current = null;
      audioMixerRef.current?.destroy();
      audioMixerRef.current = null;
    };
  }, [allVideosReady, results, leaderIndex, followerIndices, leaderTrimSeconds]);

  const handleAllReady = useCallback(() => {
    setAllVideosReady(true);
  }, []);

  const toggleDisplayMode = useCallback(() => {
    setDisplayMode((prev) => (prev === 'fill' ? 'letterbox' : 'fill'));
  }, []);

  // Mute toggle handler
  const handleToggleMute = useCallback((index: number) => {
    setMutedTracks((prev) => {
      const next = new Set(prev);
      const nowMuted = !next.has(index);
      if (nowMuted) {
        next.add(index);
      } else {
        next.delete(index);
      }
      audioMixerRef.current?.setTrackMuted(index, nowMuted);
      return next;
    });
  }, []);

  // Play handler
  const handlePlay = useCallback(() => {
    const refs = videoRefs.current;
    const engine = syncEngineRef.current;
    if (!engine) return;

    // Create audio mixer lazily on first play (user gesture satisfies autoplay policy)
    if (!audioMixerRef.current) {
      const videoEls = refs.filter(
        (v): v is HTMLVideoElement => v !== null,
      );
      if (videoEls.length > 0) {
        audioMixerRef.current = createAudioMixer(videoEls);
        // Apply any muted tracks
        for (const idx of mutedTracks) {
          audioMixerRef.current.setTrackMuted(idx, true);
        }
      }
    }

    // Play all video elements
    const playPromises: Promise<void>[] = [];
    for (const video of refs) {
      if (video) {
        playPromises.push(video.play());
      }
    }

    // Start the sync engine after all play promises resolve
    Promise.all(playPromises)
      .then(() => {
        engine.start();
        setIsPlaying(true);
      })
      .catch(() => {
        // If play fails (e.g. autoplay policy), stop everything
        for (const video of refs) {
          if (video) video.pause();
        }
        engine.stop();
        setIsPlaying(false);
      });
  }, [mutedTracks]);

  // Pause handler
  const handlePause = useCallback(() => {
    const refs = videoRefs.current;
    const engine = syncEngineRef.current;

    // Pause all video elements
    for (const video of refs) {
      if (video) video.pause();
    }

    // Stop the sync engine
    if (engine) engine.stop();
    setIsPlaying(false);
  }, []);

  // Seek handler
  const handleSeek = useCallback((seekTime: number) => {
    const engine = syncEngineRef.current;
    if (!engine) return;

    const refs = videoRefs.current;
    const wasPlaying = isPlaying;

    // Pause all videos first (per Pitfall 3)
    for (const video of refs) {
      if (video) video.pause();
    }
    if (wasPlaying) {
      engine.stop();
    }

    // Convert 0-based UI time back to absolute video time
    const absoluteTime = seekTime + leaderTrimSeconds;
    engine.seek(absoluteTime);
    setCurrentTime(seekTime);

    // If was playing, wait for all seeked events then resume
    if (wasPlaying) {
      const seekPromises = refs
        .filter((v): v is HTMLVideoElement => v !== null)
        .map(
          (video) =>
            new Promise<void>((resolve) => {
              video.addEventListener('seeked', () => resolve(), { once: true });
            }),
        );

      Promise.all(seekPromises).then(() => {
        const playPromises: Promise<void>[] = [];
        for (const video of refs) {
          if (video) playPromises.push(video.play());
        }
        Promise.all(playPromises)
          .then(() => {
            engine.start();
            setIsPlaying(true);
          })
          .catch(() => {
            // Play failed after seek -- stay paused
            setIsPlaying(false);
          });
      });
    }
  }, [isPlaying, leaderTrimSeconds]);

  // Scrub-to-poster pipeline
  const handleScrub = useCallback(
    (time: number | null) => {
      // On pointer leave, keep current poster frames visible
      if (time === null) return;

      // Throttle to ~10fps (100ms)
      const now = performance.now();
      if (now - lastExtractTimeRef.current < 100) return;
      lastExtractTimeRef.current = now;

      // Gate through rAF to avoid scheduling during layout
      if (scrubRafRef.current) cancelAnimationFrame(scrubRafRef.current);
      scrubRafRef.current = requestAnimationFrame(() => {
        scrubRafRef.current = 0;

        const extractors = extractorsRef.current;
        if (extractors.length === 0) return;

        results.forEach((result, index) => {
          const extractor = extractors[index];
          if (!extractor) return;

          // Compute per-video time: waveform time is aligned time,
          // add trim offset to get absolute video time
          const perVideoTime = time + result.trimSeconds;

          extractor
            .extract(perVideoTime)
            .then((url) => {
              setPosterUrls((prev) => {
                const next = [...prev];
                // Revoke previous URL for this index
                const old = next[index];
                if (old) URL.revokeObjectURL(old);
                next[index] = url;
                prevPosterUrlsRef.current = next;
                return next;
              });
            })
            .catch(() => {
              // Stale or failed extraction -- ignore
            });
        });
      });
    },
    [results],
  );

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
      {/* Section header */}
      <div className="px-4 py-3 border-b border-gray-800">
        <h2 className="text-sm font-medium text-gray-300">Playback</h2>
      </div>

      {/* Video grid */}
      <VideoGrid
        results={results}
        displayMode={displayMode}
        posterUrls={posterUrls}
        videoRefs={videoRefs}
        onAllReady={handleAllReady}
      />

      {/* Transport bar -- between grid and waveforms */}
      <TransportBar
        isPlaying={isPlaying}
        allReady={allVideosReady}
        currentTime={currentTime}
        duration={duration}
        displayMode={displayMode}
        onPlay={handlePlay}
        onPause={handlePause}
        onSeek={handleSeek}
        onDisplayModeToggle={toggleDisplayMode}
      />

      {/* Waveform panel -- rendered as-is to preserve existing behavior */}
      <WaveformPanel peaksMap={peaksMap} results={results} mutedTracks={mutedTracks} onToggleMute={handleToggleMute} onScrub={handleScrub} />
    </div>
  );
}
