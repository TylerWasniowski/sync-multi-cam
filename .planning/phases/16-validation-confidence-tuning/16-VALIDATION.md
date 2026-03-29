---
phase: 16
slug: validation-confidence-tuning
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-29
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright 1.58.2 (Edge CDP) + Vitest 4.0.18 (unit) |
| **Config file** | `playwright.config.ts` + `vite.config.ts` |
| **Quick run command** | `npx vitest run` |
| **Full suite command** | `npx vitest run && TMPDIR="/tmp/claude-1000" PLAYWRIGHT_BROWSERS_PATH="/tmp/claude-1000/pw-browsers" npx playwright test tests/sync-validation.spec.ts --project=edge-cdp` |
| **Estimated runtime** | ~30 seconds (unit) + ~60 seconds (E2E with real videos) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run`
- **After every plan wave:** Run full suite including Edge CDP
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 16-01-01 | 01 | 1 | VAL-01 | E2E | `npx playwright test tests/sync-validation.spec.ts --project=edge-cdp -g "Taylor Swift"` | ❌ W0 | ⬜ pending |
| 16-01-02 | 01 | 1 | VAL-02 | E2E | `npx playwright test tests/sync-validation.spec.ts --project=edge-cdp -g "Bruno"` | ❌ W0 | ⬜ pending |
| 16-01-03 | 01 | 1 | D-06/D-12 | unit | `npx vitest run` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test-sync-real.html` — HTML harness page for sync validation
- [ ] `src/test-sync-real-harness.ts` — Browser-side sync test logic
- [ ] `tests/sync-validation.spec.ts` — Playwright Edge CDP test for both test video sets

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual alignment in grid player | VAL-01, VAL-02 | Audio/video alignment requires human perception | Load test videos, sync, play in grid, verify audio lines up visually |
| Confidence scores are "meaningful" | SC-3 | Subjective assessment | Check that clear matches show high confidence, repetitive content shows lower |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
