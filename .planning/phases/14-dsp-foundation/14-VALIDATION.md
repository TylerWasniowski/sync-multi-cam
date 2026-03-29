---
phase: 14
slug: dsp-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-29
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.0.18 |
| **Config file** | `vite.config.ts` (inline `test` block: `{ environment: 'node' }`) |
| **Quick run command** | `npx vitest run src/lib/__tests__/fftEngine.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/lib/__tests__/fftEngine.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 14-01-01 | 01 | 0 | ALG-01 | unit | `npx vitest run src/lib/__tests__/fftEngine.test.ts -t "known offset"` | ❌ W0 | ⬜ pending |
| 14-01-02 | 01 | 0 | ALG-02 | unit | `npx vitest run src/lib/__tests__/fftEngine.test.ts -t "frequency response"` | ❌ W0 | ⬜ pending |
| 14-01-03 | 01 | 0 | ALG-03 | unit | `npx vitest run src/lib/__tests__/fftEngine.test.ts -t "repetitive"` | ❌ W0 | ⬜ pending |
| 14-01-04 | 01 | 0 | ALG-04 | unit | `npx vitest run src/lib/__tests__/fftEngine.test.ts -t "windowing"` | ❌ W0 | ⬜ pending |
| 14-01-05 | 01 | 0 | ALG-05 | unit | `npx vitest run src/lib/__tests__/fftEngine.test.ts -t "sub-sample"` | ❌ W0 | ⬜ pending |
| 14-01-06 | 01 | 0 | CONF-01 | unit | `npx vitest run src/lib/__tests__/fftEngine.test.ts -t "confidence"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `npm install fft.js` — new dependency needed before tests can import fftEngine.ts
- [ ] `src/types/fft.js.d.ts` — TypeScript declarations for untyped fft.js package
- [ ] `src/lib/__tests__/fftEngine.test.ts` — stubs for ALG-01 through ALG-05 and CONF-01

*All test files are new — Wave 0 creates them alongside the implementation.*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
