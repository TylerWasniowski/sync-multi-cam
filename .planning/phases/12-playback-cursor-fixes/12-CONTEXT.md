# Phase 12: Playback Cursor Fixes - Context

**Gathered:** 2026-03-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix two bugs in cursor/playback behavior: (1) cursor state doesn't match cursor preview position 1:1 in audio tracks (GH#1), and (2) play starts from beginning instead of cursor position or sync start point (GH#2). No visual changes, no behavior changes beyond fixing these two specific bugs.

</domain>

<decisions>
## Implementation Decisions

### Visual style
- Keep all current visuals exactly as-is: gray hover cursor, red playhead, no changes to colors/thickness/style
- No new visual indicators needed — playhead already serves as persistent seek marker

### End-of-playback behavior
- Keep current behavior unchanged — no modifications to what happens when playback reaches the end

### Play-from position (GH#2)
- If user has clicked/seeked on the waveform: play from that position
- If user hasn't interacted: play from the sync start point (maxOffset — where all cameras have content)
- Never start from time 0 unless the user explicitly seeked there

### Claude's Discretion
- Root cause diagnosis and fix approach for the cursor mismatch bug (GH#1)
- Implementation details for ensuring play-from-cursor-or-sync-start behavior

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `WaveformCanvas.tsx`: Stateless canvas renderer — draws cursor (gray), playhead (red), sync markers, waveform bars
- `videoSync.ts`: `createTimelineClock` — rAF-based sync engine with `seek()`, `start()`, `stop()` methods
- `WaveformPanel.tsx`: Panel-level interaction handler with `viewState.cursorTime` for hover tracking
- `WaveformTrack.tsx`: Per-track interaction handler with scrub/seek/pan modes

### Established Patterns
- `viewState.cursorTime` = hover indicator (set on pointer move, cleared on pointer leave)
- `playheadTime` = current playback position (red line, persists across interactions)
- `handleScrubSeek` updates `currentTime` state which becomes `playheadTime`
- `currentTime` initialized to `maxOffset` when `allVideosReady` fires (PlaybackSection.tsx:175)
- Panel-level pointer handlers subtract hardcoded 176px for label offset (may be wrong after v2.1 mute button restructure)

### Integration Points
- `PlaybackSection.tsx`: Orchestrates play/pause/seek, manages `currentTime` state
- `TransportBar.tsx`: Play button calls `onPlay` which is `handlePlay` — plays from `currentTime`
- `WaveformTrack.tsx:handlePointerDown` (line 112-116): Calculates seek time from pointer position using `peaks.sampleRate`
- `WaveformCanvas.tsx:drawCursor` (line 231-278): Draws cursor at `cursorTime` using reverse calculation

</code_context>

<specifics>
## Specific Ideas

- The cursor mismatch may relate to the hardcoded 176px label offset in WaveformPanel vs the actual layout after v2.1's mute button restructure (button moved outside dimmed container, changing the flex layout widths)
- The play-from-beginning bug likely relates to `currentTime` state starting at 0 (PlaybackSection.tsx:29) before `allVideosReady` sets it to `maxOffset` — there may be a race or the value resets somewhere

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 12-playback-cursor-fixes*
*Context gathered: 2026-03-08*
