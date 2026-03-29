# Phase 14: DSP Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-29
**Phase:** 14-dsp-foundation
**Areas discussed:** Module structure, Test signal design, Confidence calibration, Edge case handling
**Mode:** --auto (all decisions auto-selected using recommended defaults)

---

## Module structure

| Option | Description | Selected |
|--------|-------------|----------|
| Split into focused modules | fftEngine.ts for core math (~120-150 lines), type declarations separate, per STACK.md layout | ✓ |
| Single file | All GCC-PHAT code in one file | |
| Separate window/core/peak files | Three files per STACK.md suggestion (window functions, GCC-PHAT core, peak finding) | |

**User's choice:** [auto] Split into focused modules (recommended default — matches research layout, keeps core algorithm testable)
**Notes:** STACK.md suggests ~150 lines across 3 files but Phase 14 scope excludes worker wrapper (Phase 15), so a single fftEngine.ts for all core math is sufficient.

---

## Test signal design

| Option | Description | Selected |
|--------|-------------|----------|
| Comprehensive coverage | All 4 ROADMAP.md success criteria: sine waves at known offsets, filtered variants, repetitive signals, confidence discrimination | ✓ |
| Minimal smoke tests | Basic offset detection only | |
| External audio fixtures | Use recorded WAV files as test data | |

**User's choice:** [auto] Comprehensive coverage (recommended default — maps directly to success criteria)
**Notes:** Synthetic signal generation in test file avoids external fixture management. Mathematical signals provide deterministic, reproducible tests.

---

## Confidence calibration

| Option | Description | Selected |
|--------|-------------|----------|
| Peak-to-noise-floor ratio | STACK.md formula: clamp((ratio - 2) / 13, 0, 1) * 100 | ✓ |
| Correlation magnitude | Simple peak height (like current SynAudio approach) | |
| Multi-metric composite | Combine peak sharpness + spectral coherence + SNR | |

**User's choice:** [auto] Peak-to-noise-floor ratio (recommended default — research-backed, directly measures offset ambiguity)
**Notes:** This replaces the current `Math.abs(correlation) * 100` which conflates signal quality with sync quality.

---

## Edge case handling

| Option | Description | Selected |
|--------|-------------|----------|
| Claude's discretion | Silence → low confidence, identical → offset 0 + high confidence, too-short → error | ✓ |
| Strict validation | Explicit pre-checks for all edge cases before running algorithm | |

**User's choice:** [auto] Claude's discretion (recommended default — implementation details for planner)
**Notes:** Edge cases are real but the exact handling strategy is an implementation detail, not a vision decision.

---

## Claude's Discretion

- Hann window implementation details
- Zero-padding strategy
- Epsilon value for phase transform
- Peak neighborhood exclusion radius
- Internal function signatures

## Deferred Ideas

None — all discussion stayed within Phase 14 scope.
