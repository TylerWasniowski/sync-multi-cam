---
status: partial
phase: 16-validation-confidence-tuning
source: [16-VERIFICATION.md]
started: 2026-03-29T02:00:00Z
updated: 2026-03-29T02:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Edge CDP Discovery Run
expected: Run both Taylor Swift and Bruno test cases via Edge CDP, record DISCOVERY output (raw offsetSeconds and confidence values)
result: [pending]

### 2. Offset Calibration
expected: Update EXPECTED_TAYLOR_OFFSET and EXPECTED_BRUNO_OFFSET in tests/sync-validation.spec.ts from 0 to actual discovered values; tune fftEngine.ts confidence formula if all scores are near-zero
result: [pending]

### 3. Final E2E Validation Run
expected: Re-run Edge CDP tests with calibrated constants — both Taylor Swift (VAL-01, 500ms tolerance) and Bruno (VAL-02, 100ms tolerance, confidence >50) must pass
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
