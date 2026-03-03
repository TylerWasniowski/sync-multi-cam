import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { DownloadableResult, MultiResolutionPeaks, DisplayMode, MutedTracks } from '../types/index.ts';
import { createPosterExtractor } from '../lib/posterFrame.ts';
import { createTimelineClock } from '../lib/videoSync.ts';
import type { SyncEngine } from '../lib/videoSync.ts';
import { createAudioMixer } from '../lib/audioMixer.ts';
import type { AudioMixer } from '../lib/audioMixer.ts';
import { VideoGrid } from './VideoGrid.tsx';
import { TransportBar } from './TransportBar.tsx';
import { WaveformPanel } from './WaveformPanel.tsx';
import { ExportPanel } from './ExportPanel.tsx';

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

  // Scrub lifecycle: track whether playback was active before scrub started
  const wasPlayingBeforeScrubRef = useRef(false);

  // Throttle timestamp for scrub
  const lastExtractTimeRef = useRef(0);
  const scrubRafRef = useRef(0);

  // Sync point: the earliest time where all cameras have content
  const maxOffset = useMemo(() => {
    if (results.length === 0) return 0;
    return Math.max(...results.map(r => r.offsetSeconds));
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

    // Extract initial poster frames at the sync point (maxOffset = where all cameras overlap)
    const maxOff = Math.max(...results.map(r => r.offsetSeconds));
    const initialUrls: (string | null)[] = results.map(() => null);
    setPosterUrls(initialUrls);

    let cancelled = false;

    results.forEach((result, index) => {
      const extractor = extractors[index];
      const initialTime = Math.max(0, maxOff - result.offsetSeconds);

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

  // Update video tile visibility based on shared timeline position
  // Videos before their offset or after their end show as black (opacity 0, bg-black grid shows through)
  const updateVideoVisibility = useCallback((time: number) => {
    for (let i = 0; i < results.length; i++) {
      const video = videoRefs.current[i];
      if (video) {
        const start = results[i].offsetSeconds;
        const end = start + video.duration;
        video.style.opacity = (time >= start && time < end) ? '1' : '0';
      }
    }
  }, [results]);

  // When allVideosReady becomes true, set up the timeline clock
  useEffect(() => {
    if (!allVideosReady || results.length === 0) return;

    const refs = videoRefs.current;

    // Set initial positions at the sync point (maxOffset) so all cameras have content
    for (let i = 0; i < results.length; i++) {
      const video = refs[i];
      if (video) {
        video.currentTime = Math.max(0, maxOffset - results[i].offsetSeconds);
      }
    }

    // Compute total timeline duration: max(offset + video duration) across all tracks
    let totalDuration = 0;
    const videoEls: HTMLVideoElement[] = [];
    const videoOffsets: number[] = [];
    for (let i = 0; i < results.length; i++) {
      const el = refs[i];
      if (el) {
        videoEls.push(el);
        videoOffsets.push(results[i].offsetSeconds);
        const end = results[i].offsetSeconds + el.duration;
        if (end > totalDuration) totalDuration = end;
      }
    }
    setDuration(isFinite(totalDuration) && totalDuration > 0 ? totalDuration : 0);
    setCurrentTime(maxOffset);
    updateVideoVisibility(maxOffset);

    // Create the timeline clock — all videos are equal, no leader
    const engine = createTimelineClock(
      videoEls,
      videoOffsets,
      (time: number) => {
        setCurrentTime(time);
        updateVideoVisibility(time);
      },
      {
        totalDuration,
        onComplete: () => {
          engine.stop();
          setIsPlaying(false);
        },
      },
    );
    syncEngineRef.current = engine;

    return () => {
      engine.destroy();
      syncEngineRef.current = null;
      audioMixerRef.current?.destroy();
      audioMixerRef.current = null;
    };
  }, [allVideosReady, results, maxOffset, updateVideoVisibility]);

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
        for (const idx of mutedTracks) {
          audioMixerRef.current.setTrackMuted(idx, true);
        }
      }
    }

    // Play all videos that are active at the current timeline position
    const playPromises: Promise<void>[] = [];
    for (let i = 0; i < results.length; i++) {
      const video = refs[i];
      if (video && currentTime >= results[i].offsetSeconds &&
          currentTime < results[i].offsetSeconds + video.duration) {
        playPromises.push(video.play());
      }
    }

    Promise.all(playPromises)
      .then(() => {
        engine.start();
        setIsPlaying(true);
      })
      .catch(() => {
        for (const video of refs) {
          if (video) video.pause();
        }
        engine.stop();
        setIsPlaying(false);
      });
  }, [mutedTracks, currentTime, results]);

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

    engine.seek(seekTime);
    setCurrentTime(seekTime);
    updateVideoVisibility(seekTime);

    // If was playing, wait for all seeked events then resume
    if (wasPlaying) {
      const activeRefs = refs.filter((v): v is HTMLVideoElement => v !== null);
      const seekPromises = activeRefs.map(
        (video) =>
          new Promise<void>((resolve) => {
            video.addEventListener('seeked', () => resolve(), { once: true });
          }),
      );

      Promise.all(seekPromises).then(() => {
        const playPromises: Promise<void>[] = [];
        for (let i = 0; i < results.length; i++) {
          const video = refs[i];
          if (video && seekTime >= results[i].offsetSeconds &&
              seekTime < results[i].offsetSeconds + video.duration) {
            playPromises.push(video.play());
          }
        }
        Promise.all(playPromises)
          .then(() => {
            engine.start();
            setIsPlaying(true);
          })
          .catch(() => {
            setIsPlaying(false);
          });
      });
    }
  }, [isPlaying, updateVideoVisibility, results]);

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

          // Compute per-video time from shared timeline
          const perVideoTime = time - result.offsetSeconds;
          if (perVideoTime < 0) return; // before this track's offset — skip

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

  // Scrub lifecycle: pause on start, seek without pause/resume during drag, resume on end
  const handleScrubStart = useCallback(() => {
    wasPlayingBeforeScrubRef.current = isPlaying;
    if (isPlaying) {
      // Pause directly -- do NOT go through handlePause() to preserve was-playing state
      const refs = videoRefs.current;
      for (const video of refs) {
        if (video) video.pause();
      }
      syncEngineRef.current?.stop();
      setIsPlaying(false);
    }
  }, [isPlaying]);

  const handleScrubEnd = useCallback(() => {
    if (wasPlayingBeforeScrubRef.current) {
      handlePlay();
    }
  }, [handlePlay]);

  const handleScrubSeek = useCallback((seekTime: number) => {
    const engine = syncEngineRef.current;
    if (!engine) return;
    engine.seek(seekTime);
    setCurrentTime(seekTime);
    updateVideoVisibility(seekTime);
  }, [updateVideoVisibility]);

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

      {/* Waveform panel -- interactive scrubbar with seek/scrub/playhead */}
      <WaveformPanel
        peaksMap={peaksMap}
        results={results}
        mutedTracks={mutedTracks}
        onToggleMute={handleToggleMute}
        onScrub={handleScrub}
        playheadTime={currentTime}
        isPlaying={isPlaying}
        onSeek={handleSeek}
        onScrubStart={handleScrubStart}
        onScrubEnd={handleScrubEnd}
        onScrubSeek={handleScrubSeek}
      />

      {/* Export panel -- resolution picker, export button, progress bar */}
      <ExportPanel
        results={results}
        mutedTracks={mutedTracks}
        totalDurationSeconds={duration}
        disabled={!allVideosReady}
      />
    </div>
  );
}
