---
status: diagnosed
trigger: "No visual indicator for track audio boundaries"
created: 2026-03-02T00:00:00Z
updated: 2026-03-02T00:00:00Z
---

## Current Focus

hypothesis: WaveformCanvas has no concept of per-track duration; it draws peaks from startBucket to endBucket based on viewport but never marks where the audio content ends
test: Searched for "duration" usage in WaveformCanvas.tsx and WaveformTrack.tsx
expecting: No references to duration in the rendering code
next_action: Report root cause

## Symptoms

expected: Clear visual indicator showing where audio content ends and silence/empty space begins in each waveform track
actual: No visual distinction between audio content region and empty space beyond the track's end
errors: N/A (missing feature, not an error)
reproduction: Look at any waveform track -- the waveform just stops but there is no marker or background change
started: Always -- feature never implemented

## Eliminated

(none -- root cause found on first hypothesis)

## Evidence

- timestamp: 2026-03-02T00:00:00Z
  checked: WaveformPeaks type definition (src/types/index.ts:51-58)
  found: WaveformPeaks includes `duration` (seconds) and `sampleRate` fields
  implication: Duration data is available in the peak data structure

- timestamp: 2026-03-02T00:00:00Z
  checked: MultiResolutionPeaks type (src/types/index.ts:60-67)
  found: Also carries top-level `duration`, `totalSamples`, `sampleRate`
  implication: Per-track duration is fully known at every level

- timestamp: 2026-03-02T00:00:00Z
  checked: WaveformCanvas.tsx rendering loop (lines 86-103)
  found: Draws peaks from startBucket to endBucket based on viewport; no boundary marker drawn
  implication: Canvas rendering has no concept of "end of audio"

- timestamp: 2026-03-02T00:00:00Z
  checked: Grep for "duration" in WaveformCanvas.tsx and WaveformTrack.tsx
  found: Zero references to duration in either component
  implication: Duration data flows into the component (via peaks.duration) but is never consumed for rendering

- timestamp: 2026-03-02T00:00:00Z
  checked: WaveformCanvas already draws sync markers and trim overlays
  found: drawSyncMarker() and trim overlay code demonstrate the pattern for positional visual indicators
  implication: Adding an end-of-track marker would follow the same established pattern

## Resolution

root_cause: WaveformCanvas.tsx never renders a visual indicator for track duration boundary. The `duration` field exists on WaveformPeaks (and is passed through via `peaks`), but the canvas draw loop (lines 86-103) only iterates over visible peak buckets without marking where the track's audio content ends. There is no "end of audio" marker, background color change, or any other visual cue.
fix: (not applied -- diagnosis only)
verification: (not applicable)
files_changed: []
