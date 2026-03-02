---
status: resolved
trigger: "Unwanted zoom indicator overlay on waveforms"
created: 2026-03-02T00:00:00Z
updated: 2026-03-02T00:00:00Z
---

## Current Focus

hypothesis: WaveformPanel renders a zoom label ("Nx zoom") in the panel header bar
test: Read WaveformPanel.tsx and locate the zoom display code
expecting: A DOM element rendering zoom level text
next_action: Report findings

## Symptoms

expected: No zoom indicator overlay displayed on waveforms
actual: A zoom indicator/overlay is displayed on waveforms
errors: N/A (visual/UX issue, not an error)
reproduction: Load the app with waveform data visible
started: Present since WaveformPanel was implemented

## Eliminated

(none needed - root cause found on first pass)

## Evidence

- timestamp: 2026-03-02T00:00:00Z
  checked: src/components/WaveformPanel.tsx lines 141-151
  found: Lines 142-145 compute zoomLevel and zoomLabel. Line 151 renders `<span className="text-xs text-gray-500">{zoomLabel} zoom</span>` inside the panel header bar.
  implication: This is the zoom indicator the user wants removed.

## Resolution

root_cause: WaveformPanel.tsx computes and renders a zoom level indicator in the panel header. Lines 142-145 compute the zoom ratio and format it as a label (e.g. "1.0x"). Line 151 renders it as a `<span>` inside the header's flex container.
fix: Remove lines 142-145 (zoomLevel/zoomLabel computation) and line 151 (the `<span>` rendering the zoom label). Alternatively, if the entire header is unwanted, the outer header `<div>` at lines 149-152 could be removed.
verification: (pending)
files_changed: []
