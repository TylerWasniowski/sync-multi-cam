---
status: testing
phase: 05-video-grid-synchronized-playback
source: 05-01-SUMMARY.md, 05-02-SUMMARY.md, 05-03-SUMMARY.md
started: 2026-03-03T02:00:00Z
updated: 2026-03-03T02:00:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: 1
name: Video Grid Appears After Sync
expected: |
  Sync 2+ video files. After sync completes, below the Sync Results table, a "Playback" section appears containing video tiles arranged in a tight grid with zero gaps between tiles.
awaiting: user response

## Tests

### 1. Video Grid Appears After Sync
expected: Sync 2+ video files. After sync completes, below the Sync Results table, a "Playback" section appears containing video tiles arranged in a tight grid with zero gaps between tiles.
result: issue
reported: "Frames show but: 1) Videos never actually play. 2) Both Letterbox and Fill don't fill the whole frame. 3) The 3rd tile (odd count) should be centered."
severity: blocker

### 2. Grid Adapts to Camera Count
expected: Tiles pack efficiently based on count. With 2 cameras: side by side. With 4: 2x2. Tiles fill available space with no wasted blank areas.
result: [pending]

### 3. Display Mode Toggle
expected: A display mode toggle is visible in the transport/control area. Default is "fill" mode — videos crop to fill tiles with no black bars. Switching to "letterbox" shows full frames with black bars where needed. Grid updates immediately on toggle.
result: [pending]

### 4. Grid Resizes with Browser Window
expected: Resize the browser window. The video grid adapts tile sizes immediately — no manual refresh or interaction needed.
result: [pending]

### 5. Poster Frames While Videos Load
expected: While video elements load, each tile shows a poster frame (still image from the video) rather than a blank/black tile. A loading spinner overlays each tile until its video is ready.
result: [pending]

### 6. Poster Frames Update on Waveform Scrub
expected: Hover and move along the waveform tracks. The poster frames in the video tiles update to show the frame at the scrubbed time position — even before playback starts.
result: [pending]

### 7. Waveforms Interactive During Video Loading
expected: Immediately after sync completes, waveform tracks are zoomable (scroll wheel) and pannable (drag) even while video tiles are still loading. No waiting for videos to use waveforms.
result: [pending]

### 8. Play/Pause All Videos
expected: Press the play button — all videos start playing simultaneously. Press pause — all videos pause together. Single control for all cameras.
result: [pending]

### 9. Videos Stay in Sync During Playback
expected: During playback, all camera angles stay visually synchronized. No visible drift or stagger between different cameras — they play in lockstep.
result: [pending]

### 10. Seek to Any Position
expected: Use the seek bar to jump to a different position. All videos jump to the correct offset position simultaneously. If playing, playback resumes from the new position.
result: [pending]

### 11. Transport Controls Disabled Until Ready
expected: Before all video elements have finished loading, the play button is disabled/greyed out. It becomes active only after all videos report ready.
result: [pending]

## Summary

total: 11
passed: 0
issues: 0
pending: 11
skipped: 0

## Gaps

[none yet]
