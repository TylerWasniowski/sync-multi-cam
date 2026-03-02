---
status: diagnosed
trigger: "Waveform clipped/cut off when zoomed in"
created: 2026-03-02T00:00:00Z
updated: 2026-03-02T00:02:00Z
---

## Current Focus

hypothesis: CONFIRMED - Two bugs cause waveform clipping
test: Math traced with concrete examples at multiple zoom levels
expecting: n/a - root cause found
next_action: Report diagnosis

## Symptoms

expected: Waveform renders fully at all zoom levels - no clipping at track boundaries
actual: When zoomed in on waveforms, the content cuts off prematurely at the end
errors: none (visual bug)
reproduction: Zoom into a waveform track; observe the end is clipped
started: unknown

## Eliminated

(No hypotheses were eliminated; first hypothesis confirmed)

## Evidence

- timestamp: 2026-03-02T00:00:30Z
  checked: WaveformCanvas.tsx line 73 endBucket calculation
  found: endBucket = startBucket + width (pixels), but the correct formula is startBucket + width * samplesPerPixel / samplesPerBucket
  implication: When SPP != SPB, the loop iterates the wrong number of buckets. At default zoom with overview level, only 800 of 2000 needed buckets are drawn (40%).

- timestamp: 2026-03-02T00:00:45Z
  checked: waveformPeaks.ts line 67 samplesPerBucket stored value
  found: Uses Math.floor(samples.length / min.length) which truncates fractional SPB. computePeaks internally uses the exact float value.
  implication: Bucket-to-pixel mapping drifts progressively; waveform compressed horizontally.

- timestamp: 2026-03-02T00:01:00Z
  checked: Worked example with 160k samples, 100k detail buckets
  found: Real SPB=1.6, stored SPB=1. Last bucket maps to sample 99999 instead of 159998. Waveform spans only 62.5% of actual audio.
  implication: Even without the endBucket bug, the waveform is compressed and clipped due to SPB truncation.

- timestamp: 2026-03-02T00:01:30Z
  checked: Default zoom math (WaveformPanel defaultSPP + selectPeakLevel interaction)
  found: defaultSPP = totalSamples/canvasWidth. Overview SPB = totalSamples/2000. Ratio SPP/SPB = 2000/canvasWidth. For 800px canvas, need 2000 buckets but endBucket = 800. Waveform fills only 320px of 800px.
  implication: Bug exists at ALL zoom levels, not just zoomed in. Gets worse as zoom increases (SPP decreases while SPB stays constant for selected level).

- timestamp: 2026-03-02T00:01:45Z
  checked: selectPeakLevel interaction
  found: selectPeakLevel picks coarsest level with enough total buckets (length >= neededBuckets). This means selected level always has SPB <= SPP (approximately). So the ratio width * SPP / SPB is always >= width, and endBucket = startBucket + width always underestimates.
  implication: The bug is systematic - endBucket is ALWAYS too small when using any level selected by selectPeakLevel.

## Resolution

root_cause: Two interacting bugs cause waveform clipping.

**Bug 1 (PRIMARY) - Wrong endBucket in WaveformCanvas.tsx line 73:**
`endBucket = startBucket + width` conflates pixel count with bucket count. The viewport spans `width * samplesPerPixel` samples, which covers `width * samplesPerPixel / samplesPerBucket` buckets. Since selectPeakLevel always picks a level where SPB <= SPP, the true bucket count is always >= width, so the waveform is always clipped.

**Bug 2 (SECONDARY) - Truncated samplesPerBucket in waveformPeaks.ts line 67:**
`Math.floor(samples.length / min.length)` drops the fractional part. The renderer uses this truncated integer for x-position mapping, causing progressive drift. The waveform appears compressed and doesn't reach the true audio end.

fix:
verification:
files_changed: []
