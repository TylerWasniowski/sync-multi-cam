---
status: diagnosed
trigger: "Waveform appears blocky at intermediate zoom levels"
created: 2026-03-02T00:00:00Z
updated: 2026-03-02T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED - three interacting bugs cause the blocky waveform
test: complete - traced full rendering math with numerical simulation
expecting: n/a
next_action: report root cause

## Symptoms

expected: Waveform detail transitions smoothly when zooming - no blocky zone between resolution levels
actual: When zooming in, there is a visible blocky zone at intermediate zoom levels before becoming sharp at higher zoom
errors: none (visual artifact)
reproduction: Zoom into waveform - at certain intermediate zoom levels the waveform appears blocky
started: Since multi-resolution peak implementation

## Eliminated

- hypothesis: LOD selection picks too-coarse a level at intermediate zoom
  evidence: selectPeakLevel correctly ensures level.length >= neededBuckets, which guarantees samplesPerBucket <= samplesPerPixel (bucket spacing <= 1px). The level selection logic itself is sound.
  timestamp: 2026-03-02T00:05:00Z

## Evidence

- timestamp: 2026-03-02T00:01:00Z
  checked: src/lib/waveformPeaks.ts - computeMultiResolutionPeaks
  found: Three fixed resolution tiers - overview=2000, medium=20000, detail=100000 buckets. 10x jump between each level.
  implication: Large ratio between levels means a coarse level may be selected when the viewport actually needs much finer resolution for the visible portion

- timestamp: 2026-03-02T00:02:00Z
  checked: src/lib/waveformPeaks.ts - selectPeakLevel (lines 90-108)
  found: Selection logic computes neededBuckets = totalSamples / samplesPerPixel, then picks first level where level.length >= neededBuckets. Logic is correct for choosing the appropriate level.
  implication: Level selection is sound; the bug is in the rendering code that consumes the selected level.

- timestamp: 2026-03-02T00:03:00Z
  checked: WaveformCanvas.tsx line 73 - endBucket calculation
  found: "endBucket = Math.min(startBucket + width, peaks.length)" adds canvas pixel width (800) to a bucket index. This is a UNIT MISMATCH. The correct formula is Math.min(Math.ceil((scrollOffset + width * samplesPerPixel) / peaks.samplesPerBucket), peaks.length).
  implication: PRIMARY BUG. When a fine level is selected (e.g. medium with spb=10) but SPP is high (e.g. 99), only 800 buckets are iterated covering 800*10=8000 samples = 80.8px of 800px canvas. The waveform renders as a compressed block filling only ~10% of the canvas at the overview->medium transition.

- timestamp: 2026-03-02T00:06:00Z
  checked: Full rendering trace at all zoom levels (Python simulation)
  found: At every level transition, the waveform collapses from ~100% canvas fill to ~10-20% canvas fill, then gradually grows back as you zoom in. The pattern repeats at each of the three level boundaries. At SPP=250 (default zoom-to-fit for 12.5s audio), the waveform fills only 40% of the canvas.
  implication: This is the "blocky" behavior the user reports - the waveform appears as a dense block on the left with empty space on the right, not a smoothly filling rendering.

- timestamp: 2026-03-02T00:07:00Z
  checked: WaveformCanvas.tsx line 101 - rect width
  found: Each bucket is drawn as ctx.rect(x, yTop, 1, barHeight) - hardcoded 1px width. When bucket spacing is fractional (e.g. 0.7px), sub-pixel positioning causes some physical pixels to receive 2 rects and others to receive 0, creating a faint striped/aliased pattern.
  implication: SECONDARY BUG. Causes subtle visual artifacts at near-1:1 zoom levels. The rect width should be Math.max(1, Math.ceil(peaks.samplesPerBucket / samplesPerPixel)) to properly fill the pixel span of each bucket.

- timestamp: 2026-03-02T00:08:00Z
  checked: waveformPeaks.ts line 67 - samplesPerBucket calculation
  found: Uses Math.floor(samples.length / min.length) which truncates fractional values. For non-evenly-divisible sample counts, the stored integer spb drifts from the actual float spb over the bucket range. E.g. 195000 samples / 100000 detail buckets = actual 1.95, stored 1. At bucket 99999: rendered position = 99999, actual position = 194998, drift = 95000 samples.
  implication: TERTIARY BUG. Causes bucket positions to drift from their actual sample positions, creating visible misalignment especially in the detail level with non-round sample counts. The renderer positions buckets based on the truncated integer, but the actual peak data in each bucket covers a different sample range.

## Resolution

root_cause: |
  Three interacting bugs in the waveform rendering pipeline:

  BUG 1 (PRIMARY) - Unit mismatch in endBucket calculation:
  WaveformCanvas.tsx line 73: endBucket = startBucket + width
  Adds pixel count to bucket index. Should be:
  endBucket = Math.ceil((scrollOffset + width * samplesPerPixel) / peaks.samplesPerBucket)

  BUG 2 (SECONDARY) - Hardcoded 1px rect width:
  WaveformCanvas.tsx line 101: ctx.rect(x, yTop, 1, barHeight)
  Should scale rect width to match bucket's pixel span:
  ctx.rect(x, yTop, Math.max(1, Math.ceil(peaks.samplesPerBucket / samplesPerPixel)), barHeight)

  BUG 3 (TERTIARY) - Integer truncation of samplesPerBucket:
  waveformPeaks.ts line 67: Math.floor(samples.length / min.length)
  Should store the actual float value to prevent positional drift in the renderer.
  Alternatively, the renderer should compute bucket positions using the actual ratio
  (totalSamples / bucketCount) rather than the stored integer.

fix: not applied (diagnosis only)
verification: not performed
files_changed: []
