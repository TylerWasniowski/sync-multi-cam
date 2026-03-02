---
status: diagnosed
trigger: "Waveform zoom requires Ctrl modifier - should zoom with bare scroll wheel"
created: 2026-03-02T00:00:00Z
updated: 2026-03-02T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED - handleWheel guards zoom behind ctrlKey/metaKey check on line 71
test: Read WaveformTrack.tsx handleWheel callback
expecting: Early return when Ctrl not held
next_action: Report diagnosis

## Symptoms

expected: Scroll wheel over waveform area zooms waveforms without any modifier key
actual: Scroll wheel zoom requires holding Ctrl, which conflicts with browser zoom
errors: N/A (behavioral issue, not error)
reproduction: Hover over waveform, scroll wheel without Ctrl - no zoom happens
started: Unknown - may have been designed this way

## Eliminated

## Evidence

- timestamp: 2026-03-02T00:01:00Z
  checked: Grep for ctrlKey/wheel/onWheel across src/
  found: Only WaveformTrack.tsx contains wheel/zoom logic
  implication: Single file is the sole location for this behavior

- timestamp: 2026-03-02T00:02:00Z
  checked: WaveformTrack.tsx lines 69-88 (handleWheel callback)
  found: |
    Line 71: `if (!(e.ctrlKey || e.metaKey)) return;` - early return when no modifier held.
    Line 72: `e.preventDefault()` - only called AFTER the modifier check.
    Line 258: `onWheel={handleWheel}` - React synthetic event bound to the canvas container div.
  implication: |
    (1) The guard on line 71 is the direct cause - bare scroll wheel is ignored.
    (2) preventDefault is only called when Ctrl/Meta is held, meaning bare scroll
        currently propagates to the page (normal page scroll behavior).
    (3) The div already has `touchAction: 'none'` (line 255) for touch gestures
        but no equivalent protection for wheel events.

- timestamp: 2026-03-02T00:03:00Z
  checked: WaveformPanel.tsx and WaveformCanvas.tsx
  found: Neither component has any wheel/zoom handling. All zoom logic is in WaveformTrack.
  implication: Fix is isolated to WaveformTrack.tsx

## Resolution

root_cause: |
  In WaveformTrack.tsx line 71, the handleWheel callback has an early-return guard:
    `if (!(e.ctrlKey || e.metaKey)) return;`
  This requires Ctrl (or Meta on Mac) to be held for scroll-wheel zoom to activate.
  Without the modifier, the wheel event is ignored and propagates to the browser as
  normal page scroll. This was likely a deliberate UX decision to avoid "stealing"
  scroll events, but it conflicts with user expectation of direct scroll-to-zoom
  over the waveform area.

fix:
verification:
files_changed: []
