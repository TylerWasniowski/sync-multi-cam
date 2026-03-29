# Phase 16: Validation + Confidence Tuning - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-29
**Phase:** 16-validation-confidence-tuning
**Areas discussed:** Test methodology, Confidence threshold tuning, Test video handling, Regression criteria
**Mode:** --auto (all decisions auto-selected using recommended defaults)

---

## Test methodology

| Option | Description | Selected |
|--------|-------------|----------|
| Edge CDP automation | Full E2E via Edge browser, existing project infrastructure | ✓ |
| Unit test only | Mock audio data, no real videos | |
| Manual testing only | No automation, human-driven | |

**User's choice:** [auto] Edge CDP automation (recommended default — leverages existing infrastructure)

---

## Confidence threshold tuning

| Option | Description | Selected |
|--------|-------------|----------|
| Empirical data-driven | Run real tests, observe scores, adjust if needed | ✓ |
| Preset thresholds | Set thresholds in advance without real data | |
| Skip tuning | Accept whatever the formula produces | |

**User's choice:** [auto] Empirical data-driven (recommended default)

---

## Test video handling

| Option | Description | Selected |
|--------|-------------|----------|
| Local files via dev server | Videos stored locally, loaded via in-browser fetch | ✓ |
| Git LFS | Committed to repo via LFS | |
| External URL | Fetch from cloud storage | |

**User's choice:** [auto] Local files via dev server (recommended default)

---

## Regression criteria

| Option | Description | Selected |
|--------|-------------|----------|
| Toleranced comparison | 100ms for dialogue, 500ms for music, confidence thresholds | ✓ |
| Exact match | Zero tolerance on offsets | |
| Visual only | No numeric criteria | |

**User's choice:** [auto] Toleranced comparison (recommended default)

---

## Claude's Discretion

- CDP test script structure, Playwright vs raw CDP
- Screenshot strategy, missing file handling
- Confidence adjustments, test clip details

## Deferred Ideas

None.
