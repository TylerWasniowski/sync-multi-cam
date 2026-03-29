# Phase 15: Worker Integration + Pipeline Swap - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-29
**Phase:** 15-worker-integration-pipeline-swap
**Areas discussed:** Worker message protocol, Audio quality detection, Warning UI design, Progress granularity
**Mode:** --auto (all decisions auto-selected using recommended defaults)

---

## Worker message protocol

| Option | Description | Selected |
|--------|-------------|----------|
| Follow exportWorker.ts pattern | Typed message unions, Vite module Worker, init/compare/progress/result/error messages | ✓ |
| Custom protocol | New message pattern different from existing codebase | |
| SharedArrayBuffer direct access | Shared memory instead of message passing | |

**User's choice:** [auto] Follow exportWorker.ts pattern (recommended default — consistency with existing codebase)
**Notes:** STACK.md specifies reference buffer must be copied, comparison buffers can be transferred (zero-copy). Worker created per-sync, terminated after.

---

## Audio quality detection

| Option | Description | Selected |
|--------|-------------|----------|
| Pre-sync PCM analysis | RMS for silence, ±1.0 sample percentage for clipping, run before worker | ✓ |
| In-worker detection | Detect during FFT processing inside worker | |
| Post-sync confidence only | Rely on confidence scores alone, no explicit detection | |

**User's choice:** [auto] Pre-sync PCM analysis (recommended default — catches issues early, simple signal analysis)
**Notes:** Results are per-track warnings. Runs on main thread before worker init.

---

## Warning UI design

| Option | Description | Selected |
|--------|-------------|----------|
| Inline per-track warnings | Yellow/amber in results area, non-blocking | ✓ |
| Toast notifications | Temporary popups for each warning | |
| Modal summary | Single modal listing all warnings before proceeding | |

**User's choice:** [auto] Inline per-track warnings (recommended default — non-intrusive, fits existing UI)
**Notes:** Sync proceeds regardless. Text says "may be unreliable" not "failed".

---

## Progress granularity

| Option | Description | Selected |
|--------|-------------|----------|
| Per-pair with camera names | "Aligning camera 3 of 8" matching PROG-01 exactly | ✓ |
| Per-pair with percentage | "50% complete" style | |
| Sub-pair FFT stages | Show FFT/cross-power/peak stages per pair | |

**User's choice:** [auto] Per-pair with camera names (recommended default — matches requirement precisely)
**Notes:** No sub-pair stage reporting needed. Updates existing PipelineProgress correlating message.

---

## Claude's Discretion

- RMS silence threshold, clipping percentage threshold
- Worker error handling
- Internal message type naming
- Warning attachment strategy (SyncResult vs separate callback)
- Warning message wording

## Deferred Ideas

None — all discussion stayed within Phase 15 scope.
