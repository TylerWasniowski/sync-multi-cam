# Phase 3: Video Trimming and Output - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Trim videos to aligned start points using sync offsets from Phase 2 and deliver downloadable synced files. Includes re-encoding for frame-precise cuts, per-file download buttons, and auto-zip download. Waveform visualization is Phase 4.

</domain>

<decisions>
## Implementation Decisions

### Trimming trigger flow
- Trimming auto-starts immediately after sync completes — no separate "Export" button
- Full pipeline is one-click: user hits "Sync Videos" → extraction → correlation → trimming → downloads ready
- Progress is displayed throughout the entire pipeline including trimming

### Download delivery
- Both per-file download buttons AND zip download available
- Zip auto-downloads when trimming completes (matches roadmap OUT-03)
- Per-file buttons appear in the results list for individual grabs

### Keyframe precision
- Re-encode for frame-precise cuts (not stream-copy)
- Accept slower processing time in exchange for exact sync alignment
- This means FFmpeg will transcode video, not just copy streams

### Progress architecture
- Re-architect SyncProgress into a generic pipeline progress component
- Same component used for extraction, correlation, and trimming stages (different params as needed)
- Not a bolt-on — refactor the existing component to be stage-agnostic

### Claude's Discretion
- Output file naming convention (prefix/suffix/zip name)
- Reference file handling in zip (include as-is or exclude)
- Error handling strategy for individual file trim failures
- Re-encode codec/quality settings (should match source quality)
- Exact progress detail level (per-file counts vs percentage)

</decisions>

<specifics>
## Specific Ideas

No specific references — open to standard approaches. Key constraint: re-encode must produce quality comparable to source files.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `getFFmpeg()` singleton (src/lib/ffmpeg.ts): Already loaded, reuse for trimming commands
- `extractAudio()` pattern (src/lib/audioExtractor.ts): Shows FFmpeg FS write/exec/read/cleanup pattern — trimming follows same shape
- `SyncResults` component: Will need download buttons added per-file
- `SyncProgress` component: Will be re-architected to support trimming stages
- `SyncStage` type: Currently `idle | extracting | correlating | complete | error` — needs trimming/zipping stages

### Established Patterns
- Sequential FFmpeg operations with try/finally cleanup (audioExtractor.ts)
- State machine via SyncStage type driving conditional UI rendering
- useCallback for async pipeline handlers in App.tsx
- Tailwind dark theme with gray-900/800 card styling, blue-600 primary actions

### Integration Points
- `handleSync` in App.tsx: Pipeline entry point — trimming extends this after correlation
- `SyncResult[]`: Contains offsetSeconds per file — input for trim calculations
- `VideoFile.file`: Original File reference needed for FFmpeg trimming input
- `SyncProgress` state: Drives progress UI — needs new stages for trimming

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 03-video-trimming-and-output*
*Context gathered: 2026-03-01*
