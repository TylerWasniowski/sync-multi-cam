---
phase: 16-validation-confidence-tuning
plan: 01
subsystem: testing
tags: [playwright, edge-cdp, gcc-phat, sync-validation, e2e]

# Dependency graph
requires:
  - phase: 15-worker-integration-pipeline-swap
    provides: GCC-PHAT sync pipeline (syncAudioTracks, extractAudio, detectAudioWarnings)
provides:
  - Edge CDP sync validation test infrastructure (test harness + Playwright spec)
  - Discovery-mode test constants for offset calibration
  - Two test cases: Taylor Swift concert (VAL-01) and Playing with Bruno (VAL-02)
affects: [16-02 confidence tuning, future regression testing]

# Tech tracking
tech-stack:
  added: []
  patterns: [sync test harness pattern mirroring App.tsx pipeline, subdirectory-aware video loading via hardcoded %20 encoding]

key-files:
  created:
    - test-sync-real.html
    - src/test-sync-real-harness.ts
    - tests/sync-validation.spec.ts
  modified:
    - playwright.config.ts
    - vite.config.ts

key-decisions:
  - "Excluded tests/ directory from vitest to prevent Playwright spec import errors (pre-existing issue)"
  - "Discovery values EXPECTED_TAYLOR_OFFSET and EXPECTED_BRUNO_OFFSET set to 0 with comments for post-first-run calibration"
  - "Hardcoded %20 for subdirectory spaces in fetch URLs, encodeURIComponent only for filenames (Pitfall 6)"

patterns-established:
  - "Sync test harness: HTML page + TS module calling extractAudio -> detectAudioWarnings -> syncAudioTracks with structured JSON output"
  - "Subdirectory-aware video loading: hardcode %20 for known spaces, encodeURIComponent per filename segment"

requirements-completed: [VAL-01, VAL-02]

# Metrics
duration: 3min
completed: 2026-03-29
---

# Phase 16 Plan 01: Edge CDP Sync Validation Summary

**Edge CDP test infrastructure for real multi-camera sync validation with Taylor Swift concert and Playing with Bruno test cases, discovery-mode offset logging, and tolerance-based assertions**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-29T08:39:59Z
- **Completed:** 2026-03-29T08:43:55Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created sync test harness (HTML + TypeScript) mirroring App.tsx pipeline exactly: extractAudio -> detectAudioWarnings -> syncAudioTracks -> getConfidenceLevel
- Created Playwright Edge CDP spec with two test cases: Taylor Swift concert (500ms tolerance, D-10) and Playing with Bruno (100ms tolerance, D-09, confidence >50, D-11)
- Both tests skip gracefully when test video directories or Edge browser are unavailable
- All 96 existing unit tests continue passing (D-12)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create sync test harness (HTML + TypeScript)** - `8defc61` (feat)
2. **Task 2: Create Playwright Edge CDP sync validation spec and update config** - `000b6cc` (feat)

## Files Created/Modified
- `test-sync-real.html` - Minimal HTML harness page with file-input, log, status, results, and warnings elements
- `src/test-sync-real-harness.ts` - Browser-side sync test logic calling real pipeline (extractAudio, detectAudioWarnings, syncAudioTracks, getConfidenceLevel)
- `tests/sync-validation.spec.ts` - Playwright Edge CDP tests for Taylor Swift concert and Playing with Bruno video sets with offset/confidence assertions
- `playwright.config.ts` - Updated edge-cdp project testMatch to include sync-validation
- `vite.config.ts` - Excluded tests/ directory from vitest (Playwright-only tests were causing import failures)

## Decisions Made
- Excluded `tests/` directory from vitest config. The `tests/` directory contains Playwright specs that import `@playwright/test`, which fails when vitest tries to run them. This was a pre-existing issue (export.spec.ts was already failing) that became blocking with the new sync-validation.spec.ts.
- Discovery values set to 0 with calibration comments. The expected sync offsets are unknown until the first real run, so `EXPECTED_TAYLOR_OFFSET` and `EXPECTED_BRUNO_OFFSET` are placeholder zeros with clear comments to update after the first successful discovery run.
- URL encoding strategy: hardcoded `%20` for known subdirectory spaces, `encodeURIComponent()` only on individual filenames to avoid encoding `/` separators.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Excluded tests/ directory from vitest config**
- **Found during:** Task 2 (verification step)
- **Issue:** Vitest was picking up Playwright specs in `tests/` and failing because `@playwright/test` is not a vitest-compatible import. Pre-existing with `tests/export.spec.ts`, now also affecting `tests/sync-validation.spec.ts`.
- **Fix:** Added `exclude: ['tests/**', 'node_modules/**']` to the `test` section of `vite.config.ts`
- **Files modified:** `vite.config.ts`
- **Verification:** `npx vitest run` now passes all 96 tests in 8 files with no failures
- **Committed in:** `000b6cc` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Auto-fix necessary to make vitest pass cleanly. Pre-existing issue, not caused by plan changes. No scope creep.

## Issues Encountered
None beyond the vitest/Playwright test directory conflict documented above.

## User Setup Required
None - no external service configuration required. Edge CDP tests require Edge browser launched with `--remote-debugging-port=9222` and dev server on port 5173, but these are documented in the test file headers and are the same setup as existing edge-cdp-test.ts.

## Next Phase Readiness
- Test infrastructure ready for discovery runs and confidence tuning (16-02)
- After first successful Edge CDP run, update EXPECTED_TAYLOR_OFFSET and EXPECTED_BRUNO_OFFSET constants with real values
- If confidence scores need tuning, fftEngine.ts parameters can be adjusted with Phase 14 unit tests as regression guard

---
*Phase: 16-validation-confidence-tuning*
*Completed: 2026-03-29*
