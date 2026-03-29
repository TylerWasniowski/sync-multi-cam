# Phase 14: DSP Foundation - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement the GCC-PHAT (Generalized Cross-Correlation with Phase Transform) algorithm as a pure computation module with unit tests against synthetic signals. This phase produces the algorithm engine only — no Web Worker wrapping, no UI changes, no pipeline integration. The module must correctly compute time-delay offsets and confidence scores, proven by tests at known offsets.

</domain>

<decisions>
## Implementation Decisions

### Module structure
- **D-01:** Split GCC-PHAT into focused modules per STACK.md research layout: `fftEngine.ts` for core math (Hann window, GCC-PHAT cross-correlation, peak finding with parabolic interpolation, confidence scoring) — approximately 120-150 lines
- **D-02:** This phase creates the algorithm module only. No `spectralSync.ts` worker wrapper or `spectralSyncWorker.ts` — those belong in Phase 15 (Worker Integration)
- **D-03:** Use fft.js as the sole new dependency (pure JS, 5KB, MIT). Add TypeScript declarations via `src/types/fft.js.d.ts` per STACK.md spec

### Test signal design
- **D-04:** Unit tests must cover all 4 success criteria from ROADMAP.md:
  1. Synthetic sine waves with known offsets (positive, negative, zero) — computed offset matches within sub-sample accuracy
  2. Signals with different simulated frequency responses (high-pass, low-pass filtered versions of the same signal) — offset still correct despite spectral differences
  3. Repetitive/looped signals — confidence score drops to reflect ambiguity rather than returning a wrong offset
  4. Sharp single peak vs. multiple similar-height peaks vs. flat noise floor — confidence clearly distinguishes these cases
- **D-05:** Test signals are generated synthetically in the test file (no external audio fixtures). Use known mathematical signals: sine waves, filtered noise, looped waveforms

### Confidence calibration
- **D-06:** Confidence is based on peak-to-noise-floor ratio per STACK.md formula: `confidence = clamp((ratio - 2) / 13, 0, 1) * 100` where ratio = peakValue / meanNoiseFloor (excluding peak neighborhood)
- **D-07:** This produces interpretable scores: high confidence = one clear peak (unambiguous offset), low confidence = multiple candidate offsets or flat noise floor (ambiguous)
- **D-08:** Output range is 0-100 to match existing SyncResult interface. Threshold of ~25 indicates unreliable sync

### Claude's Discretion
- Exact Hann window implementation details
- Zero-padding strategy for FFT size (nextPowerOf2 of combined lengths per STACK.md)
- Epsilon value for phase transform division-by-zero protection (STACK.md suggests 1e-10)
- Peak neighborhood exclusion radius for noise floor calculation
- Edge case handling: silence returns low confidence, identical signals return offset 0 with high confidence, clips below minimum length throw clear error
- Internal function signatures and naming conventions

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Algorithm specification
- `.planning/research/STACK.md` — Complete GCC-PHAT algorithm steps, fft.js API, confidence formula, parameter values, file structure, performance estimates
- `.planning/research/ARCHITECTURE.md` — System architecture, anti-patterns (no full spectrogram), integration boundaries

### Requirements
- `.planning/REQUIREMENTS.md` — ALG-01 through ALG-05 and CONF-01 define what Phase 14 must deliver
- `.planning/ROADMAP.md` §Phase 14 — Success criteria (4 test categories that must pass)

### Existing code to understand
- `src/lib/audioSync.ts` — Current SynAudio-based sync (will be replaced in Phase 15, but understand its interface)
- `src/types/index.ts` — `SyncResult` and `AudioData` interfaces that must be preserved
- `src/lib/constants.ts` — Current sync constants (`SYNC_SAMPLE_RATE = 16000`, etc.)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AudioData` interface (`src/types/index.ts`): `{ channelData: Float32Array[], samplesDecoded: number, sampleRate: number }` — the GCC-PHAT engine will consume Float32Array directly
- `SYNC_SAMPLE_RATE = 16000` (`src/lib/constants.ts`): Existing sample rate constant, reuse as-is
- Vitest test infrastructure: Existing test setup with `vi.mock`, `describe/it/expect` patterns in `src/lib/__tests__/`

### Established Patterns
- Pure computation modules in `src/lib/` — algorithm code lives here, not in components
- Test files in `src/lib/__tests__/` with `.test.ts` suffix
- Type declarations in `src/types/` for untyped npm packages
- Constants centralized in `src/lib/constants.ts`

### Integration Points
- Phase 14 output is a standalone module — no integration with UI or workers yet
- Phase 15 will wrap this module in a Web Worker and wire it into `syncAudioTracks()`
- The module's function signature should accept `Float32Array` inputs and return `{ offsetSamples: number, confidence: number }` to match what Phase 15 needs

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. The STACK.md research provides detailed algorithm steps and the recommended implementation approach.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 14-dsp-foundation*
*Context gathered: 2026-03-28*
