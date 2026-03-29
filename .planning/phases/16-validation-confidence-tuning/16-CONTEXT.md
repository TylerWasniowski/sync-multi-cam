# Phase 16: Validation + Confidence Tuning - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Validate the new GCC-PHAT sync engine against real multi-camera recordings. Verify that previously failing cases (Taylor Swift concert with repetitive music) now sync correctly, and previously working cases (Playing with Bruno dialogue/ambient content) don't regress. Tune confidence thresholds if needed based on real-world data. This phase produces Edge CDP automated tests and may adjust algorithm parameters — no new features.

</domain>

<decisions>
## Implementation Decisions

### Test methodology
- **D-01:** Use Edge CDP browser automation (existing project infrastructure) to load real test videos via the dev server, trigger sync, and verify results
- **D-02:** Automated tests verify offsets against expected values with tolerances. Visual alignment is confirmed via screenshots or manual spot-check
- **D-03:** Tests run against the live app in Edge — exercises the full pipeline end-to-end (file loading → audio extraction → GCC-PHAT sync → results display)

### Confidence threshold tuning
- **D-04:** Empirical tuning based on actual test results — run sync on both test sets, observe raw confidence values from the GCC-PHAT engine
- **D-05:** If confidence scores don't meaningfully distinguish clear matches from ambiguous ones, adjust the formula parameters in `fftEngine.ts` (the `clamp((ratio - 2) / 13, 0, 1)` mapping)
- **D-06:** Tuning changes must not break Phase 14 unit tests — any parameter adjustments must be validated against synthetic signals too

### Test video handling
- **D-07:** Test videos stored locally (not committed to git). Tests reference them by path. Edge CDP loads them from the dev server via fetch (bypasses 50MB CDP file transfer limit per project memory)
- **D-08:** Test script documents expected video file names and where to obtain them

### Regression criteria
- **D-09:** Offset tolerance for dialogue/ambient content (Playing with Bruno): within 100ms of expected offset
- **D-10:** Offset tolerance for repetitive music content (Taylor Swift concert): within 500ms — wider tolerance because repetitive content may have multiple valid sync points
- **D-11:** Confidence scores: >50 expected for clear matches (Bruno), lower expected for repetitive content (Taylor Swift) with warnings visible
- **D-12:** All existing unit tests (fftEngine, audioSync, audioQuality) must continue passing — no regressions

### Claude's Discretion
- Exact Edge CDP test script structure and assertions
- Whether to use Playwright test framework or raw CDP script
- Screenshot capture strategy for visual verification
- How to handle missing test video files (skip gracefully vs fail)
- Exact confidence threshold adjustments if needed
- Number and duration of test video clips

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — VAL-01 (Taylor Swift sync) and VAL-02 (Bruno regression check)
- `.planning/ROADMAP.md` §Phase 16 — Success criteria (3 criteria that must be TRUE)

### Algorithm to potentially tune
- `src/lib/fftEngine.ts` — GCC-PHAT confidence formula, peak-to-noise-floor ratio parameters
- `src/lib/__tests__/fftEngine.test.ts` — Synthetic signal tests that must keep passing

### Pipeline being validated
- `src/lib/audioSync.ts` — Worker-based sync entry point (`syncAudioTracks()`)
- `src/lib/spectralSyncWorker.ts` — GCC-PHAT Web Worker
- `src/lib/audioQuality.ts` — Audio quality detection (silence/clipping warnings)

### Edge CDP testing infrastructure
- `tests/edge-cdp-test.ts` — Existing Edge CDP test pattern (if exists)
- Project memory documents Edge CDP setup: launch Edge with `--remote-debugging-port=9222`, Playwright connects via `chromium.connectOverCDP`, WSL2 mirrored networking required

### Prior phase context
- `.planning/phases/14-dsp-foundation/14-CONTEXT.md` — Algorithm decisions, confidence formula
- `.planning/phases/15-worker-integration-pipeline-swap/15-CONTEXT.md` — Pipeline decisions, warning display

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Edge CDP test infrastructure (from project memory): Launch Edge with remote debugging, Playwright connects via CDP, in-browser fetch from dev server for file transfer
- `fftEngine.ts` confidence parameters: `NEIGHBORHOOD_RADIUS = 50`, epsilon `1e-10`, formula `clamp((ratio - 2) / 13, 0, 1) * 100`
- Existing Playwright config in project (if any)
- `getConfidenceLevel()` in `audioSync.ts`: thresholds at 70 (high) and 40 (medium/low)

### Established Patterns
- Edge CDP testing with WSL2 mirrored networking
- Dev server on port 5173 for file serving
- In-browser fetch() to bypass 50MB CDP file transfer limit

### Integration Points
- Tests interact with the deployed app via CDP — no code changes needed for basic validation
- If confidence tuning is needed, `fftEngine.ts` parameters are adjusted and Phase 14 tests re-run

</code_context>

<specifics>
## Specific Ideas

- Taylor Swift concert videos were the motivating use case for the v2.3 milestone — repetitive music that confused the old Pearson correlation
- Playing with Bruno videos are the regression baseline — they already worked with SynAudio
- This phase is more about validation and potential parameter tuning than new feature development

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 16-validation-confidence-tuning*
*Context gathered: 2026-03-29*
