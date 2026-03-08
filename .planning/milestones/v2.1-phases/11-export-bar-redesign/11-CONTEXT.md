# Phase 11: Export Bar Redesign - Context

**Gathered:** 2026-03-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Redesign the bottom export bar to center controls, enlarge the export button, and create clear visual hierarchy. The bar currently has a flat left-aligned layout where everything is the same small size. This phase reorganizes layout and styling only — no new export features or settings.

</domain>

<decisions>
## Implementation Decisions

### Layout & Centering
- Centered group layout: resolution picker and export button as a centered cluster in the bar
- Taller bar: increase vertical padding (from py-2 to py-3 or py-4) for more breathing room
- During export, the progress bar replaces the export controls (resolution picker + button hidden, progress + cancel shown in their place)
- All states (idle, preparing, encoding, complete, error, cancelled) use the same centered position — controls swap in/out smoothly

### Export Button Prominence
- Noticeably larger than current: bump from text-sm/px-4/py-1.5 to approximately text-base or text-lg with more padding
- The button should be the clear primary action — visually dominant over the resolution picker

### Progress & Status Display
- Wide centered progress bar replaces controls during export (not shown alongside)
- Progress bar + percentage text + cancel button, all centered
- Completion: brief green checkmark + "Download ready" for ~2 seconds, then auto-reset to export controls
- Error state: also replaces controls (consistent with progress pattern) — error message + retry button centered
- Cancelled state: brief message, then auto-reset (keep current behavior, just centered)

### Resolution Picker
- Keep as a styled `<select>` dropdown (not segmented pills) — accessible and space-efficient
- Style it to be consistent height/rounding with the redesigned export button

### Claude's Discretion
- Exact button size (text-base vs text-lg, exact padding values)
- Whether to use gradient + subtle glow or solid color for the export button
- Whether to include a download arrow icon on the button or keep text-only
- Button text: "Export MP4" vs "Export" vs other
- Bar background treatment (subtle distinction from main bg or keep current border-t only)
- Resolution label format: short ("1080p") vs with dimensions ("1080p (1920x1080)")
- Spacing between resolution picker and export button (adjacent gap vs visually grouped)
- Preparing state transition: immediate replace vs disable-then-replace
- Transition animations between states (fade, slide, etc.)

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches within the decisions above.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ExportPanel.tsx`: Current export bar component — all logic (state machine, WebCodecs check, export/cancel handlers) stays, only JSX layout and styling changes
- `EXPORT_RESOLUTIONS` from `exportComposite.ts`: Resolution options already defined with labels
- `triggerDownload` from `downloadHelper.ts`: Download helper already working

### Established Patterns
- Tailwind CSS for all styling (no CSS modules or styled-components)
- Dark theme: bg-gray-900 main, bg-gray-700/border-gray-600 for inputs, blue-600 for primary actions
- Inline state management with useState hooks (no external state library)
- ExportState type already handles: 'idle' | 'preparing' | 'encoding' | 'complete' | 'error' | 'cancelled'

### Integration Points
- `ExportPanel` is rendered at the bottom of `PlaybackSection.tsx` (line 498) — no layout changes needed in parent
- The component is self-contained: all props come from PlaybackSection, all state is internal

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 11-export-bar-redesign*
*Context gathered: 2026-03-07*
