---
phase: 07-waveform-scrubbar-integration
plan: 02
subsystem: ui
tags: [react, waveform, playhead, zoom, auto-scroll, timeline-clock]

requires:
  - phase: 07-waveform-scrubbar-integration
    provides: "Interactive waveform scrubbar with click-to-seek, drag-to-scrub, playhead rendering"
provides:
  - "Playhead-aware viewport auto-follow with page-turn scrolling"
  - "Playhead-anchored zoom during playback, pointer-anchored when paused"
  - "Standalone timeline clock replacing leader-follower sync model"
  - "Offset-based shared timeline with correct end-of-playback and pan range"
affects: [08-export]

tech-stack:
  added: []
  patterns: ["Standalone timeline clock: rAF + performance.now() wall-clock drives all videos equally", "Offset-based shared timeline: videos positioned by offsetSeconds, no leader/follower distinction"]

key-files:
  created: []
  modified:
    - src/lib/videoSync.ts
    - src/components/PlaybackSection.tsx
    - src/components/WaveformPanel.tsx
    - src/components/WaveformCanvas.tsx

key-decisions:
  - "Standalone timeline clock replaces leader-follower sync — eliminates virtual mode, lastSeekTime shadow state, and leader-specific branching"
  - "rAF + performance.now() wall-clock sufficient for multi-video sync (drift thresholds are 50-100ms, rAF fires at ~16ms)"
  - "Offset-based shared timeline: waveforms shift by offsetSeconds, video visibility via CSS opacity for pre-offset/post-duration ranges"
  - "10% waveform overscroll so panning to the end has breathing room"
  - "Page-turn auto-follow: viewport jumps when playhead exits, not smooth-scroll per frame"

patterns-established:
  - "Timeline clock pattern: createTimelineClock(videos, offsets, onFrame, options) — all videos are equal peers"
  - "Active-range check: currentTime >= offset && currentTime < offset + duration for uniform play/seek logic"

requirements-completed: [WAVE-05]

duration: 45min
completed: 2026-03-03
---

# Phase 7 Plan 02: Playhead Follow Mode & Zoom Anchoring Summary

**Playhead-aware auto-follow, playhead-anchored zoom, and standalone timeline clock replacing leader-follower sync model**

## Performance

- **Duration:** ~45 min (across multiple sessions including refactor)
- **Started:** 2026-03-03T06:14:16Z
- **Completed:** 2026-03-03T10:00:00Z
- **Tasks:** 2 (1 auto + 1 human-verify checkpoint)
- **Files modified:** 4

## Accomplishments
- Viewport auto-scrolls (page-turn) to keep playhead visible during playback
- Zoom anchors on playhead position during active playback, on mouse pointer when paused
- Replaced leader-follower sync engine with standalone timeline clock — eliminated virtual mode, lastSeekTime, and all leader-specific branching
- Fixed end-of-playback visibility bug (videos show last frame, not black)
- Fixed seek/scrub past reference video end (timeline clock handles positions beyond any video's duration)
- Waveform pan range and default zoom now account for offset + duration across all tracks
- 10% overscroll on waveform pan for breathing room at timeline end

## Task Commits

1. **Task 1: Add playhead follow mode and playhead-anchored zoom** - `2a232e4` (feat)
2. **Offset-based shared timeline + bugfixes** - `2c616f7` (wip)
3. **Timeline clock refactor + all fixes** - `24cbc8b` (refactor)

## Files Created/Modified
- `src/lib/videoSync.ts` - Replaced createSyncEngine (196 lines) with createTimelineClock (130 lines), standalone wall-clock, uniform drift correction
- `src/components/PlaybackSection.tsx` - Removed leaderIndex/followerIndices, simplified setup/play/seek with uniform active-range checks
- `src/components/WaveformPanel.tsx` - maxDuration uses offset+duration, 10% overscroll, playhead follow mode, playhead-anchored zoom
- `src/components/WaveformCanvas.tsx` - Waveform drawing shifted by offsetSamples for shared timeline

## Decisions Made
- Standalone timeline clock over leader-follower: leader model created 3 categories of hacks (virtual mode, lastSeekTime, skip-leader branching) — wall-clock eliminates all of them
- Dropped rVFC in favor of rAF + performance.now(): for multi-video sync with 50-100ms drift thresholds, ~16ms rAF granularity is sufficient
- Offset sign convention: positive offsets (matching results[i].offsetSeconds), local time = timelineTime - offset
- Page-turn follow mode over smooth scroll: avoids visual jank, only triggers when playhead exits viewport

## Deviations from Plan

### Additional Work Beyond Plan Scope

**1. Offset-based shared timeline refactor**
- **Issue:** User noticed trimSeconds-based model had keyframe-snapping imprecision in playback
- **Fix:** Switched entire playback model from trimSeconds to offsetSeconds
- **Impact:** More accurate sync, waveform labels now match visual position

**2. Timeline clock refactor (replacing leader-follower)**
- **Issue:** Leader-follower model created bugs when seeking/scrubbing past leader's end, and when leader ended before timeline
- **Fix:** Replaced with standalone createTimelineClock — all videos are equal peers
- **Impact:** Eliminated 3 categories of bugs, reduced code by 66 lines net

**3. End-of-playback and pan range fixes**
- **Issue:** Videos went black at end of playback; waveform couldn't pan to timeline end
- **Fix:** Removed updateVideoVisibility(Infinity), updated maxDuration and pan bounds to use offset+duration

## Issues Encountered
- End-of-playback visibility: handleEnded called updateVideoVisibility(Infinity) making all videos black — removed
- Seek past leader duration: browser clamped leader.currentTime — eliminated by timeline clock owning time directly
- Waveform pan range: maxDuration only used individual track durations, not offset+duration — fixed

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All waveform scrubbar features verified: seek, scrub, playhead, pan, auto-follow, zoom anchoring
- Timeline clock model is clean foundation for Phase 8 export
- All 88 tests pass, TypeScript compiles clean

## Self-Check: PASSED

All 4 modified files verified present. Task commits verified in git log.

---
*Phase: 07-waveform-scrubbar-integration*
*Completed: 2026-03-03*
