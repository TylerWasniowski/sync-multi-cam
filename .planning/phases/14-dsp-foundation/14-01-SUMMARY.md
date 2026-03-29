---
phase: 14-dsp-foundation
plan: 01
subsystem: dsp
tags: [fft, gcc-phat, cross-correlation, audio-sync, fft.js, vitest, tdd]

# Dependency graph
requires: []
provides:
  - "GCC-PHAT algorithm engine (gccPhat function) for frequency-domain audio cross-correlation"
  - "Hann windowing function for spectral leakage reduction"
  - "Sub-sample offset precision via parabolic peak interpolation"
  - "Two-factor confidence scoring (peak strength + peak uniqueness)"
  - "TypeScript declarations for fft.js library"
affects: [15-worker-integration, 16-pipeline-swap]

# Tech tracking
tech-stack:
  added: [fft.js v4.0.4]
  patterns: [gcc-phat-cross-correlation, phat-phase-normalization, parabolic-interpolation, two-factor-confidence-scoring, synthetic-signal-testing]

key-files:
  created:
    - src/lib/fftEngine.ts
    - src/lib/__tests__/fftEngine.test.ts
    - src/types/fft.js.d.ts
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "Two-factor confidence formula (peakStrength * peakUniqueness) instead of plan's ratio-based formula -- plan formula assumed unnormalized IFFT output, but fft.js normalizes"
  - "Broadband noise for offset detection tests instead of pure sines -- pure sines have degenerate frequency content for GCC-PHAT (single bin after PHAT normalization)"
  - "100ms loop interval for repetitive signal tests instead of 500ms -- shorter interval creates ambiguous peaks within 300ms search window"
  - "Peak strength threshold at 0.6 (mapping 0.6-1.0 to 0-1) based on empirical measurement of GCC-PHAT noise floor peaks (~0.3-0.55 for uncorrelated signals)"

patterns-established:
  - "Pure computation modules in src/lib/ with no DOM/Worker/global state dependencies"
  - "Synthetic signal generation for DSP unit tests (deterministic seeded PRNG for reproducibility)"
  - "Float64Array for FFT intermediates to preserve precision at large FFT sizes"
  - "fft.js: always call completeSpectrum() after realTransform() to fill conjugate half"

requirements-completed: [ALG-01, ALG-02, ALG-03, ALG-04, ALG-05, CONF-01]

# Metrics
duration: 12min
completed: 2026-03-29
---

# Phase 14 Plan 01: DSP Foundation Summary

**GCC-PHAT cross-correlation engine with fft.js, Hann windowing, parabolic interpolation, and two-factor confidence scoring -- 17 unit tests covering all 6 requirements**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-29T07:17:24Z
- **Completed:** 2026-03-29T07:29:39Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Implemented complete GCC-PHAT algorithm in 295-line pure computation module
- 17 comprehensive unit tests covering offset detection, frequency response robustness, repetitive signal detection, and confidence discrimination
- Sub-sample precision via parabolic peak interpolation verified with multi-frequency signals
- Two-factor confidence scoring correctly distinguishes: impulse (>70), correlated broadband (>50), repetitive (<40), uncorrelated noise (<10), silence (0)
- Zero regressions across all 85 existing unit tests

## Task Commits

Each task was committed atomically (TDD: RED then GREEN):

1. **Task 1: Install fft.js, create type declarations, and write comprehensive test suite (RED)** - `9da0484` (test)
2. **Task 2: Implement GCC-PHAT algorithm to pass all tests (GREEN)** - `82689be` (feat)

## Files Created/Modified
- `src/lib/fftEngine.ts` - GCC-PHAT engine: applyHannWindow(), gccPhat(), findPeakParabolic(), computeConfidence()
- `src/lib/__tests__/fftEngine.test.ts` - 17 test cases with synthetic signal helpers (makeSine, makeBroadbandNoise, makeDelayedCopy, applySimpleHighPass/LowPass, makeLoopedClick, makeSilence)
- `src/types/fft.js.d.ts` - TypeScript declarations for fft.js with corrected return types (number[] not Float32Array)
- `package.json` - Added fft.js v4.0.4 dependency
- `package-lock.json` - Lock file update

## Decisions Made

1. **Two-factor confidence formula instead of plan's ratio-based formula**
   - Plan specified `confidence = clamp((ratio - 2) / 13, 0, 1) * 100` based on peak-to-noise-floor ratio
   - fft.js `inverseTransform` normalizes output, so peak values are 0-1 range and noise floor is extremely small (1e-4), producing ratios of 3000+ that always clamp to 100
   - Adopted: `peakStrength * peakUniqueness * 100` where peakStrength maps absolute peak value [0.6, 1.0] to [0, 1] and peakUniqueness = 1 - secondPeak/mainPeak
   - This correctly discriminates all signal types in the CONF-01 test suite

2. **Broadband noise for offset detection tests**
   - Plan specified 440Hz sine waves, but pure sines are degenerate for GCC-PHAT: after PHAT normalization, only 1 frequency bin has content while noise bins dominate
   - Adopted: seeded broadband noise (deterministic PRNG) which has energy across all frequencies, exactly matching real-world audio signals

3. **Shorter loop interval for repetitive signal tests**
   - Plan specified 500ms loop interval, but with 300ms max offset search window, repetitive peaks at 500ms intervals fall OUTSIDE the window, making the result correctly unambiguous
   - Adopted: 100ms loop interval (1600 samples) creates 3 peaks within the 4800-sample search window, correctly producing ambiguous/low-confidence results

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Confidence formula incompatible with fft.js normalized IFFT output**
- **Found during:** Task 2 (GCC-PHAT implementation)
- **Issue:** Plan's confidence formula `(ratio - 2) / 13 * 100` assumed unnormalized IFFT output. fft.js normalizes, producing peak values in [0, 1] range with extremely small noise floors, making the ratio always >1000 and confidence always 100
- **Fix:** Redesigned confidence as two-factor: peakStrength (absolute value mapping) * peakUniqueness (second-peak ratio). Empirically calibrated thresholds from actual GCC-PHAT output
- **Files modified:** src/lib/fftEngine.ts
- **Verification:** All 5 confidence tests pass (impulse >70, correlated >50, repetitive <40, noise <10, silence =0)
- **Committed in:** 82689be

**2. [Rule 1 - Bug] Pure sine waves degenerate for GCC-PHAT offset detection**
- **Found during:** Task 2 (running tests)
- **Issue:** Pure 440Hz sine has energy in only 1 FFT bin; after PHAT normalization, random noise bins dominate and the correlation peak is unreliable
- **Fix:** Changed offset detection tests from pure sines to broadband noise (seeded PRNG), which matches real audio characteristics and produces reliable GCC-PHAT results
- **Files modified:** src/lib/__tests__/fftEngine.test.ts
- **Verification:** All 4 offset detection tests pass with <1 sample accuracy
- **Committed in:** 82689be

**3. [Rule 1 - Bug] Repetitive signal test loop interval too long for search window**
- **Found during:** Task 2 (running tests)
- **Issue:** 500ms loop interval places repetitive peaks at 8000-sample intervals, but 300ms max offset search window only covers 4800 samples -- no ambiguous peaks visible
- **Fix:** Changed loop interval to 100ms (1600 samples), creating 3 peaks within search window that correctly produce low confidence
- **Files modified:** src/lib/__tests__/fftEngine.test.ts
- **Verification:** Both repetitive signal tests pass (confidence <40)
- **Committed in:** 82689be

---

**Total deviations:** 3 auto-fixed (3 bugs: confidence formula, test signal choice, test parameter)
**Impact on plan:** All auto-fixes necessary for algorithm correctness. The GCC-PHAT algorithm implementation follows the plan exactly; only the confidence scoring formula and test signal generation needed adjustment based on actual fft.js behavior. No scope creep.

## Issues Encountered
- fft.js `inverseTransform` normalization behavior was undocumented in the library; required empirical measurement to determine that output peaks range 0-1 for normalized IFFT (not raw magnitude)
- The Playwright export.spec.ts test file produces a framework conflict error when run through vitest (pre-existing issue, unrelated to this plan)

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `gccPhat()` function ready for Phase 15 Worker Integration import
- Function signature matches expected contract: `(ref: Float32Array, comp: Float32Array, sampleRate: number, maxOffsetSeconds: number) => { offsetSamples: number; confidence: number }`
- No DOM dependencies, no global state -- clean worker-importable module
- `applyHannWindow()` exported for potential reuse in spectral analysis

## Self-Check: PASSED

- FOUND: src/lib/fftEngine.ts
- FOUND: src/lib/__tests__/fftEngine.test.ts
- FOUND: src/types/fft.js.d.ts
- FOUND: .planning/phases/14-dsp-foundation/14-01-SUMMARY.md
- FOUND: commit 9da0484 (Task 1 RED)
- FOUND: commit 82689be (Task 2 GREEN)

---
*Phase: 14-dsp-foundation*
*Completed: 2026-03-29*
