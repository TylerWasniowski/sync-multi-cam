---
phase: 15
slug: worker-integration-pipeline-swap
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-29
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.0.18 |
| **Config file** | `vite.config.ts` (inline `test` block: `{ environment: 'node' }`) |
| **Quick run command** | `npx vitest run src/lib/__tests__/audioSync.test.ts src/lib/__tests__/audioQuality.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~8 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/lib/__tests__/audioSync.test.ts src/lib/__tests__/audioQuality.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 8 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 15-01-01 | 01 | 1 | PIPE-01 | unit (worker mock) | `npx vitest run src/lib/__tests__/audioSync.test.ts -t "worker"` | ❌ W0 | ⬜ pending |
| 15-01-02 | 01 | 1 | PIPE-02 | unit | `npx vitest run src/lib/__tests__/audioSync.test.ts -t "SyncResult"` | ❌ W0 | ⬜ pending |
| 15-01-03 | 01 | 1 | PIPE-03 | unit | `npx vitest run` (build fails if synaudio imported) | N/A | ⬜ pending |
| 15-01-04 | 01 | 1 | PIPE-04 | unit (mock) | `npx vitest run src/lib/__tests__/audioSync.test.ts -t "transfer"` | ❌ W0 | ⬜ pending |
| 15-01-05 | 01 | 1 | CONF-02 | unit | `npx vitest run src/lib/__tests__/audioQuality.test.ts` | ❌ W0 | ⬜ pending |
| 15-01-06 | 01 | 1 | CONF-03 | unit | `npx vitest run src/lib/__tests__/audioQuality.test.ts -t "silence"` | ❌ W0 | ⬜ pending |
| 15-01-07 | 01 | 1 | CONF-04 | unit | `npx vitest run src/lib/__tests__/audioQuality.test.ts -t "clipping"` | ❌ W0 | ⬜ pending |
| 15-01-08 | 01 | 1 | PROG-01 | unit | `npx vitest run src/lib/__tests__/audioSync.test.ts -t "progress"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/__tests__/audioSync.test.ts` — rewrite to mock Worker instead of SynAudio
- [ ] `src/lib/__tests__/audioQuality.test.ts` — new file for CONF-02, CONF-03, CONF-04
- [ ] `@vitest/web-worker` dev dependency — install for Worker testing support

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| UI remains responsive during sync | PIPE-01 | Requires real browser interaction | Load 3+ files, click Sync, verify UI is not frozen |
| Warning messages visible in UI | CONF-02, CONF-03, CONF-04 | Visual verification needed | Use silent/clipped audio files and verify warning text appears |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 8s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
