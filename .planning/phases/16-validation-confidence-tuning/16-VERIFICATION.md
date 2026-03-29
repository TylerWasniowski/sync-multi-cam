---
phase: 16-validation-confidence-tuning
verified: 2026-03-28T09:15:00Z
status: human_needed
score: 4/6 must-haves verified
re_verification: false
human_verification:
  - test: "Run Edge CDP discovery tests against Taylor Swift concert videos"
    expected: "Both tests reach COMPLETE status, DISCOVERY output contains non-zero offsetSeconds and confidence values, Taylor Swift offset within 0.5s of true offset"
    why_human: "Requires Edge browser running with --remote-debugging-port=9222, dev server on port 5173, and test-videos/Taylor Switft Concert/ populated with real video files. Cannot be verified programmatically."
  - test: "Run Edge CDP discovery tests against Playing with Bruno videos"
    expected: "DISCOVERY output shows offsetSeconds and confidence values, Bruno confidence >50, offset within 0.1s of true offset after calibration"
    why_human: "Same Edge+dev-server prerequisites. Additionally, EXPECTED_BRUNO_OFFSET constant must be updated with discovered value before the 100ms tolerance assertion is meaningful."
  - test: "Calibrate EXPECTED_TAYLOR_OFFSET and EXPECTED_BRUNO_OFFSET with real values"
    expected: "Both constants in tests/sync-validation.spec.ts updated from 0 to actual discovered offsets, with calibration date comment"
    why_human: "Calibration requires running the discovery tests (above) and recording the DISCOVERY log output to determine correct expected values."
  - test: "Final validation run: both Playwright tests pass with calibrated assertions"
    expected: "npx playwright test tests/sync-validation.spec.ts --project=edge-cdp exits with 0 failures"
    why_human: "Depends on calibrated offset constants and real video files in Edge browser. Cannot be verified without running the full E2E stack."
---

# Phase 16: Validation and Confidence Tuning — Verification Report

**Phase Goal:** The new sync engine produces correct offsets for real multi-camera recordings that previously failed, without regressing on recordings that already worked
**Verified:** 2026-03-28T09:15:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                             | Status       | Evidence                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------- |
| 1   | Edge CDP test loads Taylor Swift concert videos and outputs offset + confidence values             | ? HUMAN      | Infrastructure verified complete; requires Edge browser + real videos to produce actual output            |
| 2   | Edge CDP test loads Playing with Bruno videos and outputs offset + confidence values               | ? HUMAN      | Infrastructure verified complete; requires Edge browser + real videos to produce actual output            |
| 3   | Tests skip gracefully when test-videos directory or Edge browser is unavailable                   | ✓ VERIFIED   | `fs.existsSync(dir)` guard + `test.skip(true, ...)` on both test cases (lines 47-48, 143-144 of spec)   |
| 4   | Test harness calls the same extractAudio -> detectAudioWarnings -> syncAudioTracks pipeline as App.tsx | ✓ VERIFIED | harness.ts imports and calls all three functions in correct order (lines 21-23, 51, 64, 79)              |
| 5   | Taylor Swift test passes with correct offset within 500ms tolerance                               | ? HUMAN      | Assertion code correct (`< 0.5`), but `EXPECTED_TAYLOR_OFFSET = 0` is a placeholder pending discovery run |
| 6   | Playing with Bruno test passes with 100ms tolerance and confidence >50                            | ? HUMAN      | Assertion code correct (`< 0.1`, `toBeGreaterThan(50)`), but `EXPECTED_BRUNO_OFFSET = 0` is placeholder  |

**Score:** 2/6 truths fully verified (4/6 infrastructure verified, 2 human-verified truths pending discovery run)

Note: Truths 1-2 are blocked by the same root cause as truths 5-6 — the offset constants are intentional placeholders per the plan's design. The infrastructure is complete and correct; the calibration step requires a human-run discovery session.

### Required Artifacts

| Artifact                          | Expected                                             | Status      | Details                                                                                       |
| --------------------------------- | ---------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------- |
| `test-sync-real.html`             | HTML harness page for sync validation                | ✓ VERIFIED  | Exists, 15 lines, contains file-input, log, status, results, warnings; links to harness .ts  |
| `src/test-sync-real-harness.ts`   | Browser-side sync test logic calling real pipeline   | ✓ VERIFIED  | 127 lines, imports extractAudio/syncAudioTracks/detectAudioWarnings, full pipeline present    |
| `tests/sync-validation.spec.ts`   | Playwright Edge CDP tests for both video sets        | ✓ VERIFIED  | 244 lines, two test cases, skip guards, discovery logging, offset/confidence assertions       |
| `playwright.config.ts`            | Updated config including sync-validation in edge-cdp | ✓ VERIFIED  | `testMatch: /edge-cdp-test|sync-validation/` confirmed at line 25                            |
| `src/lib/fftEngine.ts`            | Confidence formula (unchanged — no empirical data yet) | ✓ VERIFIED | `computeConfidence` function exists (line 241), unchanged from Phase 14                       |
| `vite.config.ts`                  | Excludes tests/ from vitest (side fix)               | ✓ VERIFIED  | `exclude: ['tests/**', 'node_modules/**']` in test config (line 20)                          |

### Key Link Verification

| From                            | To                          | Via                         | Status      | Details                                                              |
| ------------------------------- | --------------------------- | --------------------------- | ----------- | -------------------------------------------------------------------- |
| `test-sync-real.html`           | `src/test-sync-real-harness.ts` | `<script type="module">` | ✓ WIRED     | Line 13: `src="/src/test-sync-real-harness.ts"`                     |
| `src/test-sync-real-harness.ts` | `src/lib/audioSync.ts`      | `import syncAudioTracks`    | ✓ WIRED     | Line 22: `import { syncAudioTracks, getConfidenceLevel } from './lib/audioSync.ts'` and called at line 79 |
| `tests/sync-validation.spec.ts` | `test-sync-real.html`       | `page.goto`                 | ✓ WIRED     | Lines 74, 180: `page.goto('http://localhost:5173/test-sync-real.html')` |
| `src/lib/fftEngine.ts`          | `src/lib/__tests__/fftEngine.test.ts` | unit test coverage  | ✓ WIRED     | `computeConfidence` indirectly tested via `gccPhat`; test file imports from `../fftEngine` |

### Data-Flow Trace (Level 4)

The test harness is a runner, not a component that renders dynamic data independently. The data flow is:

- Harness reads files from `#file-input` (set by Playwright)
- Calls `extractAudio` -> `detectAudioWarnings` -> `syncAudioTracks`
- Writes JSON results to `#results` DOM element
- Playwright reads `#results` text content and parses JSON

The pipeline calls are substantive (no static returns, no hardcoded data). The output depends entirely on real audio content from the input files. Data flow is architecturally correct; runtime correctness requires human validation with real files.

| Artifact                        | Data Variable  | Source                  | Produces Real Data | Status         |
| ------------------------------- | -------------- | ----------------------- | ------------------ | -------------- |
| `src/test-sync-real-harness.ts` | `enrichedResults` | `syncAudioTracks()` return | Yes (from FFT engine) | ✓ FLOWING |
| `tests/sync-validation.spec.ts` | `results` (assertions) | `#results` DOM text | Depends on harness running | ? HUMAN   |

### Behavioral Spot-Checks

Step 7b: PARTIALLY SKIPPED — the test entry point is an Edge CDP Playwright test that requires a running Edge browser instance. Unit tests (which can be run without external services) were verified.

| Behavior                              | Command                               | Result            | Status   |
| ------------------------------------- | ------------------------------------- | ----------------- | -------- |
| Unit tests pass (D-06, D-12 regression) | `npx vitest run src/lib/__tests__/`  | 554 passed, 0 failed | ✓ PASS |
| Edge CDP tests run with real videos   | `npx playwright test sync-validation` | Requires Edge + videos | ? SKIP |

### Requirements Coverage

| Requirement | Source Plan | Description                                                          | Status       | Evidence                                                                                                       |
| ----------- | ----------- | -------------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------- |
| VAL-01      | 16-01, 16-02 | Taylor Swift concert test videos sync correctly (previously failing) | ? HUMAN      | Test infrastructure built and wired; actual pass requires calibrated offset + real Edge CDP run                |
| VAL-02      | 16-01, 16-02 | Playing with Bruno test videos continue to sync correctly (regression) | ? HUMAN    | Test infrastructure built and wired; actual pass requires calibrated offset + real Edge CDP run                |

Both requirements are claimed by both plans (16-01 and 16-02). No orphaned requirements — REQUIREMENTS.md maps both VAL-01 and VAL-02 to Phase 16 only.

### Anti-Patterns Found

| File                              | Line | Pattern                                    | Severity | Impact                                                                                        |
| --------------------------------- | ---- | ------------------------------------------ | -------- | --------------------------------------------------------------------------------------------- |
| `tests/sync-validation.spec.ts`   | 26   | `EXPECTED_TAYLOR_OFFSET = 0` (placeholder) | ⚠️ Warning | Intentional per plan design — offset assertions pass for any offset within 0.5s of zero until calibrated |
| `tests/sync-validation.spec.ts`   | 27   | `EXPECTED_BRUNO_OFFSET = 0` (placeholder)  | ⚠️ Warning | Intentional per plan design — 100ms tolerance assertion trivially passes for offsets near 0 until calibrated |

These are NOT blockers to infrastructure completeness. They are known stubs documented in 16-02-SUMMARY.md. The assertions only become meaningful regression guards after the human calibration run. Both constants have calibration-comment documentation.

### Human Verification Required

#### 1. Edge CDP Discovery Run (Taylor Swift + Bruno)

**Test:** With Edge launched (`--remote-debugging-port=9222`) and dev server running (`npm run dev` on port 5173), run:
```
TMPDIR="/tmp/claude-1000" PLAYWRIGHT_BROWSERS_PATH="/tmp/claude-1000/pw-browsers" npx playwright test tests/sync-validation.spec.ts --project=edge-cdp
```

**Expected:** Both tests reach `COMPLETE` status in the harness. Console output contains `DISCOVERY:` lines with non-zero `offsetSeconds` and `confidence` values for both video sets. Bruno `confidence` is >50.

**Why human:** Requires Edge browser with real debugging port, dev server, and test video files in `test-videos/Taylor Switft Concert/` and `test-videos/Playing with Bruno/` subdirectories. Cannot be run in CI sandbox.

#### 2. Offset Calibration

**Test:** After discovery run, update `tests/sync-validation.spec.ts`:
- Replace `EXPECTED_TAYLOR_OFFSET = 0` with actual discovered Taylor Swift offset (add `// Calibrated: Xs on YYYY-MM-DD` comment)
- Replace `EXPECTED_BRUNO_OFFSET = 0` with actual discovered Bruno offset (same comment pattern)

**Expected:** Updated constants reflect real video sync offsets. If confidence scores are unexpectedly all-zero, lower the `peakStrength` threshold in `src/lib/fftEngine.ts` (see Plan 02 Task 2 for guidance).

**Why human:** Only the person running the discovery tests can record the actual DISCOVERY output values.

#### 3. Final Validation Run

**Test:** After calibration, re-run the Playwright tests:
```
TMPDIR="/tmp/claude-1000" PLAYWRIGHT_BROWSERS_PATH="/tmp/claude-1000/pw-browsers" npx playwright test tests/sync-validation.spec.ts --project=edge-cdp
```

**Expected:** Both tests pass. Taylor Swift offset within 0.5s of calibrated value. Bruno offset within 0.1s of calibrated value AND confidence >50.

**Why human:** Same Edge browser prerequisite. Also confirms phase goal — "correct offsets for real multi-camera recordings that previously failed" — which is inherently a real-data behavioral assertion.

### Gaps Summary

No blocking infrastructure gaps. All four artifacts exist and are substantively implemented. All key links are wired. Unit tests pass.

The phase is `human_needed` rather than `passed` for a single clear reason: the phase goal is "produces correct offsets for real recordings" — this can only be confirmed by running the Edge CDP tests against actual video files. The test infrastructure is the prerequisite deliverable, and it is complete. The calibration and final E2E run are the remaining steps that require a human with the test videos and Edge browser.

Plan 02 was explicitly designed as a human-in-the-loop plan with blocking checkpoint tasks (Task 1: discovery run, Task 3: final validation). Both were auto-approved without execution. The offset constants remain at `0` as documented.

---

_Verified: 2026-03-28T09:15:00Z_
_Verifier: Claude (gsd-verifier)_
