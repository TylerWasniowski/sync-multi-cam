# Phase 13: UI Cleanup - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Remove the Sync Results download area and move offset information inline onto waveform tracks with professional-grade precision. The pipeline is simplified by removing trimming/ZIP stages entirely.

</domain>

<decisions>
## Implementation Decisions

### Download & Trimming Removal
- Remove `SyncResults` component and its rendering in `App.tsx`
- Remove the entire trimming pipeline: `videoTrimmer.ts`, `zipBuilder.ts`, related state (`zipData`, `trimmedData` fields, `setSyncResults` trimming logic)
- Remove `SyncResults.tsx` file
- Pipeline stops after audio correlation — no file processing after sync completes
- `downloadHelper.ts` and `triggerDownload` stay (used by ExportPanel for composite export)
- Clean break: delete all dead code, no preservation for "maybe later"

### Pipeline Progress
- Keep two stages in progress UI: "Extracting Audio" and "Analyzing Sync"
- Remove "Trimming" and "Building ZIP" stages from progress indicator
- Pipeline is now: extract audio → correlate → done (offsets feed playback alignment + waveform display)

### Claude's Discretion
- Offset display format: Requirements specify `+1.234s (00:00:01:07 @ 30fps)` — Claude decides exact layout, typography, and whether one line or two in the label column
- Reference track display: Currently shows "REF" — Claude decides how to differentiate reference track after cleanup
- Confidence display: Currently shows `XX%` per track — Claude decides whether to keep, restyle, or remove
- NLE timecode fps source: Claude decides whether to use video's actual fps or a standard (24/30)
- Label column width: Currently `w-32` — Claude can adjust if needed to fit new offset format

</decisions>

<specifics>
## Specific Ideas

No specific requirements beyond what's in REQUIREMENTS.md:
- UI-01: Sync Results download area removed from UI
- UI-02: Waveform tracks display offset with millisecond precision and NLE timecode format (e.g., `+1.234s (00:00:01:07 @ 30fps)`)

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `formatOffset()` in `audioSync.ts`: Already formats to 3 decimal places (`+X.XXXs`) — extend or add companion for NLE timecode
- `WaveformTrack.tsx` label column (lines 302-317): Already renders filename + basic offset + confidence — modify in place
- `downloadHelper.ts` / `triggerDownload()`: Keep for ExportPanel composite download

### Established Patterns
- Inline styles for transitions (opacity/filter on mute) — used in WaveformTrack
- Tailwind for layout/typography — `text-[10px] font-mono` for offset display
- ResizeObserver for container measurement

### Integration Points
- `App.tsx` renders `<SyncResults>` conditionally on `syncResults.length > 0` (line 334-337) — remove this block
- `App.tsx` pipeline in `handleSync()` — remove trimming phase (after correlation results), remove ZIP phase
- `PipelineProgress` component — remove trimming/ZIP stages
- `WaveformTrack.tsx` `syncResult` prop already carries `offsetSeconds` and `confidence`
- `types/index.ts` — `DownloadableResult` type may need cleanup (trimmedData field, etc.)

### Files to Remove
- `src/components/SyncResults.tsx`
- `src/lib/videoTrimmer.ts`
- `src/lib/zipBuilder.ts`
- `src/lib/__tests__/videoTrimmer.test.ts`
- `src/lib/__tests__/zipBuilder.test.ts`

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 13-ui-cleanup*
*Context gathered: 2026-03-28*
