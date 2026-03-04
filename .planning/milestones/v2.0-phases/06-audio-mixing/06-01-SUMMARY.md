---
phase: 06-audio-mixing
plan: 01
subsystem: audio
tags: [web-audio-api, gain-node, audio-mixing, mute-toggle]

# Dependency graph
requires:
  - phase: 05-video-grid-synchronized-playback
    provides: "Video elements in PlaybackSection for Web Audio API routing"
provides:
  - "AudioMixer module with per-track mute/unmute via GainNode graph"
  - "Per-track mute toggle UI next to each waveform track"
  - "MutedTracks state management in PlaybackSection"
affects: [07-waveform-scrubbar-integration, 08-composite-export]

# Tech tracking
tech-stack:
  added: [Web Audio API (AudioContext, createMediaElementSource, GainNode)]
  patterns: [per-track-mute-via-gain-nodes, lazy-audio-context-creation-in-user-gesture]

key-files:
  created:
    - src/lib/audioMixer.ts
  modified:
    - src/types/index.ts
    - src/components/PlaybackSection.tsx
    - src/components/TransportBar.tsx
    - src/components/WaveformPanel.tsx
    - src/components/WaveformTrack.tsx

key-decisions:
  - "Per-track mute toggles next to waveforms instead of transport bar dropdown (user preference)"
  - "Each track starts at gain 1.0 (all audible) with per-track mute instead of 1/N all-mix"
  - "MutedTracks represented as Set<number> for O(1) lookup"
  - "AudioMixer created lazily in play handler to satisfy AudioContext autoplay policy"

patterns-established:
  - "Per-track audio controls: mute toggles live in WaveformTrack label column"
  - "Lazy AudioContext creation: always inside user gesture handler, never in useEffect"

requirements-completed: [AUD-01, AUD-02, AUD-03]

# Metrics
duration: 15min
completed: 2026-03-02
---

# Phase 6 Plan 1: Audio Mixing Summary

**Web Audio API per-track mute/unmute with GainNode graph and inline waveform toggle controls**

## Performance

- **Duration:** ~15 min (across checkpoint interaction)
- **Started:** 2026-03-02T21:19:00Z
- **Completed:** 2026-03-02T21:45:00Z
- **Tasks:** 3 (2 auto + 1 human-verify checkpoint)
- **Files modified:** 6

## Accomplishments
- Audio mixer module routing each video element through Web Audio API GainNode graph
- Per-track mute toggle buttons next to each waveform with speaker/muted icons
- Smooth gain transitions using setTargetAtTime (no clicks or pops)
- Audio state persists across seek, pause, and play actions
- Lazy AudioContext creation inside user gesture handler satisfies autoplay policy

## Task Commits

Each task was committed atomically:

1. **Task 1: Create audioMixer module and AudioMode type** - `03c5ce5` (feat)
2. **Task 2: Integrate audio mixer into PlaybackSection and TransportBar** - `bd3d8ce` (feat)
3. **Task 3: Verify audio mixing behavior + redesign to per-track mute toggles** - `cba8ba6` (feat)

## Files Created/Modified
- `src/lib/audioMixer.ts` - AudioMixer factory with per-track setTrackMuted and GainNode graph
- `src/types/index.ts` - Added MutedTracks type (Set<number>)
- `src/components/PlaybackSection.tsx` - Audio mixer lifecycle, mutedTracks state, wiring to WaveformPanel
- `src/components/TransportBar.tsx` - Removed audio dropdown (moved to per-track toggles)
- `src/components/WaveformPanel.tsx` - Passes mutedTracks Set and onToggleMute callback to tracks
- `src/components/WaveformTrack.tsx` - Mute toggle button in label column with speaker/muted icons

## Decisions Made
- **Per-track mute toggles instead of dropdown:** User preferred inline mute buttons next to each waveform over a centralized transport bar dropdown. More intuitive for multi-camera workflows where you want to quickly toggle individual tracks.
- **All tracks audible by default at gain 1.0:** Instead of 1/N gain for all-mix mode, each track starts at full volume. Users mute tracks they don't want to hear.
- **Lazy AudioContext in play handler:** createMediaElementSource can only be called once per video element, and AudioContext requires a user gesture. Creating in the play handler solves both constraints.

## Deviations from Plan

### User-directed Design Change

**1. [Checkpoint Feedback] Replaced transport bar dropdown with per-track mute toggles**
- **Found during:** Task 3 (human-verify checkpoint)
- **Issue:** Plan specified a centralized dropdown in TransportBar for audio mode (all/solo). User preferred per-track mute toggle buttons next to each waveform for more intuitive control.
- **Changes:**
  - `audioMixer.ts`: Replaced `setMode(all | number)` with `setTrackMuted(index, muted)`, each track starts at gain 1.0
  - `TransportBar.tsx`: Removed audio dropdown entirely
  - `WaveformTrack.tsx`: Added mute toggle button with speaker icon in label column (red X when muted)
  - `WaveformPanel.tsx`: Passes mutedTracks Set and onToggleMute callback to each track
  - `PlaybackSection.tsx`: Manages mutedTracks as `Set<number>`, wires to mixer and WaveformPanel
  - `types/index.ts`: Replaced `AudioMode` type with `MutedTracks = Set<number>`
- **Committed in:** `cba8ba6`
- **Verification:** User confirmed audio muting works, persists across seek/pause/play, smooth transitions

---

**Total deviations:** 1 user-directed design change
**Impact on plan:** Same requirements fulfilled (AUD-01, AUD-02, AUD-03) with better UX. Core Web Audio API approach unchanged.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Audio mixing complete, ready for Phase 7 (Waveform Scrubbar Integration)
- WaveformTrack now has interactive controls in label column -- Phase 7 will add click-to-seek and drag-to-scrub on the waveform itself
- Phase 8 (Export) will need to decide audio strategy for composite export (which tracks to include)

## Self-Check: PASSED

All 7 files verified present. All 3 commits (03c5ce5, bd3d8ce, cba8ba6) verified in git log.

---
*Phase: 06-audio-mixing*
*Completed: 2026-03-02*
