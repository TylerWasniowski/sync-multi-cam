# Phase 16: Validation + Confidence Tuning - Research

**Researched:** 2026-03-28
**Domain:** Edge CDP browser automation, GCC-PHAT validation, confidence tuning
**Confidence:** HIGH

## Summary

Phase 16 is a validation-and-tuning phase, not a feature-building phase. The work involves creating Edge CDP automated tests that load real test videos through the full app pipeline (file drop -> FFmpeg audio extraction -> GCC-PHAT sync -> results display), then verifying that sync offsets and confidence scores meet expectations. If confidence scores don't meaningfully distinguish clear matches from ambiguous ones, the `fftEngine.ts` confidence parameters are adjusted.

The project already has a mature Edge CDP testing pattern (from the export pipeline tests in Phase 8) with Playwright connecting via `chromium.connectOverCDP('http://localhost:9222')` and in-browser `fetch()` to bypass the 50MB CDP file transfer limit. Test videos are organized into two subdirectories under `test-videos/`: "Playing with Bruno" (3 files, 316MB-513MB each, dialogue/ambient content) and "Taylor Switft Concert" (2 files, 24MB-30MB each, repetitive music). The sync test harness needs to be created fresh since no sync-specific test harness exists yet (only export harnesses exist).

**Primary recommendation:** Create a `test-sync-real.html` + `test-sync-real-harness.ts` pair following the exact pattern of the existing export test harness, with a Playwright test in `tests/sync-validation.spec.ts` that loads videos from subdirectories, triggers sync, and asserts offset/confidence values. Use the Taylor Swift concert videos first (smaller, faster) since they are the motivating failure case.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Use Edge CDP browser automation (existing project infrastructure) to load real test videos via the dev server, trigger sync, and verify results
- **D-02:** Automated tests verify offsets against expected values with tolerances. Visual alignment is confirmed via screenshots or manual spot-check
- **D-03:** Tests run against the live app in Edge -- exercises the full pipeline end-to-end (file loading -> audio extraction -> GCC-PHAT sync -> results display)
- **D-04:** Empirical tuning based on actual test results -- run sync on both test sets, observe raw confidence values from the GCC-PHAT engine
- **D-05:** If confidence scores don't meaningfully distinguish clear matches from ambiguous ones, adjust the formula parameters in `fftEngine.ts` (the `clamp((ratio - 2) / 13, 0, 1)` mapping)
- **D-06:** Tuning changes must not break Phase 14 unit tests -- any parameter adjustments must be validated against synthetic signals too
- **D-07:** Test videos stored locally (not committed to git). Tests reference them by path. Edge CDP loads them from the dev server via fetch (bypasses 50MB CDP file transfer limit per project memory)
- **D-08:** Test script documents expected video file names and where to obtain them
- **D-09:** Offset tolerance for dialogue/ambient content (Playing with Bruno): within 100ms of expected offset
- **D-10:** Offset tolerance for repetitive music content (Taylor Swift concert): within 500ms -- wider tolerance because repetitive content may have multiple valid sync points
- **D-11:** Confidence scores: >50 expected for clear matches (Bruno), lower expected for repetitive content (Taylor Swift) with warnings visible
- **D-12:** All existing unit tests (fftEngine, audioSync, audioQuality) must continue passing -- no regressions

### Claude's Discretion
- Exact Edge CDP test script structure and assertions
- Whether to use Playwright test framework or raw CDP script
- Screenshot capture strategy for visual verification
- How to handle missing test video files (skip gracefully vs fail)
- Exact confidence threshold adjustments if needed
- Number and duration of test video clips

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VAL-01 | Taylor Swift concert test videos sync correctly (previously failing case) | Edge CDP test loads `test-videos/Taylor Switft Concert/*.mp4`, triggers sync, asserts offset within 500ms tolerance. Confidence expected lower than Bruno due to repetitive content. |
| VAL-02 | Playing with Bruno test videos continue to sync correctly (regression check) | Edge CDP test loads `test-videos/Playing with Bruno/*.MOV` and `.mp4`, triggers sync, asserts offset within 100ms tolerance, confidence >50. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @playwright/test | 1.58.2 | Edge CDP browser automation | Already installed, proven pattern in project |
| vitest | 4.0.18 | Unit test runner for fftEngine/audioSync | Already installed, existing test suite |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| fft.js | 4.0.4 | GCC-PHAT engine dependency | Already installed, used by fftEngine.ts |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Playwright + Edge CDP | Raw CDP via chrome-remote-interface | Playwright already set up, has assertions, screenshot support, test.skip() for missing files |
| Edge CDP test | Headless Chromium test | Cannot decode HEVC (MOV files), Edge provides hardware codec support |

No new dependencies needed. All tooling is already installed.

## Architecture Patterns

### Recommended Project Structure
```
test-sync-real.html              # HTML harness page (Vite serves it)
src/test-sync-real-harness.ts    # Browser-side sync test logic
tests/sync-validation.spec.ts   # Playwright Edge CDP test runner
```

### Pattern 1: Test Harness Page (existing pattern)
**What:** A minimal HTML page with a hidden file input, a `#log` pre element, and a `#status` div. A TypeScript harness module listens for file input changes, runs the pipeline, and reports results.
**When to use:** Always for Edge CDP tests that need to interact with the app's JS modules.
**Example:**
```typescript
// Source: existing test-export-real.html + test-export-real-harness.ts pattern
// HTML: <input type="file" id="file-input" multiple> <pre id="log"> <div id="status">WAITING</div>
// Harness: listens for file input change, runs sync, reports PASS/FAIL to #status
// Playwright: uses in-browser fetch() to load files from dev server, dispatches change event
```

### Pattern 2: Edge CDP File Loading via In-Browser Fetch
**What:** Instead of Playwright's `setInputFiles()` (which has a 50MB CDP transfer limit), the test evaluates JavaScript in the browser that fetches files from the dev server (Vite serves `test-videos/` as static assets).
**When to use:** When test video files exceed 50MB.
**Example:**
```typescript
// Source: existing tests/edge-cdp-test.ts lines 60-77
await page.evaluate(async (fileNames: string[]) => {
  const files: File[] = [];
  for (const name of fileNames) {
    const resp = await fetch(`/test-videos/${encodeURIComponent(name)}`);
    const blob = await resp.blob();
    files.push(new File([blob], name, { type: blob.type || 'video/mp4' }));
  }
  const input = document.getElementById('file-input') as HTMLInputElement;
  const dt = new DataTransfer();
  for (const f of files) dt.items.add(f);
  input.files = dt.files;
  input.dispatchEvent(new Event('change'));
}, fileNames);
```

### Pattern 3: Subdir-Aware Video Loading
**What:** Test videos are organized in subdirectories (`test-videos/Playing with Bruno/`, `test-videos/Taylor Switft Concert/`). The fetch URLs must include the subdirectory path with proper encoding.
**When to use:** This phase specifically, since prior tests used flat `test-videos/` directory.
**Critical detail:** The subdirectory names contain spaces. URL encoding is required: `/test-videos/Playing%20with%20Bruno/IMG_7908.MOV`.

### Pattern 4: Sync Results Extraction from Harness
**What:** The harness runs `syncAudioTracks()` (from `audioSync.ts`) and writes structured results to the DOM for Playwright to read.
**When to use:** To extract offsetSeconds, confidence, and warning data from the browser.
**Example:**
```typescript
// Harness writes JSON results to a data attribute or text content
const resultEl = document.getElementById('results')!;
resultEl.textContent = JSON.stringify(results.map(r => ({
  fileName: r.fileName,
  offsetSeconds: r.offsetSeconds,
  confidence: r.confidence,
  isReference: r.isReference,
})));
```

### Anti-Patterns to Avoid
- **Loading all 3 Bruno videos at once in Edge CDP:** The MOV files are 262-513MB each. Loading all 3 simultaneously would consume ~1.1GB of browser memory for file fetch alone, plus audio extraction memory. Load only 2 at a time (the minimum for sync).
- **Using `setInputFiles()` for large files:** The 50MB CDP transfer limit means MOV files cannot be loaded this way. Must use in-browser fetch().
- **Hardcoding expected offsets before first run:** The expected offsets are unknown until the first test run. The test must be run once to establish baseline offsets, then those values become the expected values for regression.
- **Modifying confidence formula without re-running Phase 14 unit tests:** D-06 requires any tuning changes to pass existing synthetic signal tests.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Browser automation | Raw WebSocket CDP | Playwright `connectOverCDP` | Already set up, assertions, timeouts, screenshots |
| Audio extraction in test | Custom WAV parsing | App's own `extractAudio()` -> `syncAudioTracks()` pipeline | The whole point is testing the real pipeline |
| File input simulation | Custom drag-drop events | DataTransfer API + input change event | Proven pattern in existing edge-cdp-test.ts |

**Key insight:** This phase tests the existing pipeline, not building a new one. The harness should call the same functions the app calls.

## Common Pitfalls

### Pitfall 1: Unknown Expected Offsets
**What goes wrong:** Writing assertions for offsets you don't yet know.
**Why it happens:** The expected sync offset between two cameras depends on when recording started, which we don't know in advance.
**How to avoid:** Phase must include an initial "discovery run" step: run sync, record the offsets, verify visually/aurally, then hardcode those as expected values. The test harness should output raw offset/confidence values for the first run.
**Warning signs:** Picking arbitrary offset values without running the sync first.

### Pitfall 2: Vite Not Serving Subdirectories
**What goes wrong:** `fetch('/test-videos/Playing with Bruno/IMG_7908.MOV')` returns 404.
**Why it happens:** Vite's static asset serving may not automatically serve the `test-videos/` directory if it's not in `public/`.
**How to avoid:** Vite serves files from the project root by default during dev mode. The `test-videos/` directory at project root should be accessible. If not, configure `server.fs.allow` in `vite.config.ts` to include it. The existing export tests already use `/test-videos/` via fetch, confirming this works.
**Warning signs:** 404 errors when fetching test videos in the browser.

### Pitfall 3: Timeout During Audio Extraction of Large Files
**What goes wrong:** FFmpeg WASM extraction of 500MB MOV files takes much longer than expected, causing Playwright timeouts.
**Why it happens:** FFmpeg WASM is slow for large files. Audio extraction of a 500MB MOV at 16kHz mono could take 30-60 seconds.
**How to avoid:** Set generous Playwright timeouts (5 minutes for the full sync test). Use the Taylor Swift mp4 files first (24-30MB, much faster). For Bruno tests, consider using only 2 of the 3 files (the two smallest: 262MB MOV and 331MB MOV).
**Warning signs:** Test hanging at "Extracting audio..." stage.

### Pitfall 4: Confidence Formula Produces All-Zero for Real Audio
**What goes wrong:** The current confidence formula (peakStrength * peakUniqueness) might produce very low scores for real-world audio that doesn't match the synthetic signal characteristics tested in Phase 14.
**Why it happens:** The peakStrength factor maps from [0.6, 1.0] to [0, 1], but real-world GCC-PHAT peak values might be lower than 0.6 even for clearly correlated signals (due to environmental noise, different microphone characteristics, etc.).
**How to avoid:** Log raw peak values, noise floor, peakStrength, and peakUniqueness during the discovery run. If peakStrength is always 0, the 0.6 threshold is too high and needs lowering.
**Warning signs:** Confidence = 0 for all tracks despite correct offsets.

### Pitfall 5: Taylor Swift Concert "Correct" Offset is Ambiguous
**What goes wrong:** The test asserts a specific offset, but repetitive music means multiple offsets are arguably "correct" (any beat boundary could match).
**Why it happens:** GCC-PHAT with repetitive content produces multiple peaks of similar height. The highest peak may not be the "true" offset.
**How to avoid:** D-10 already accounts for this with 500ms tolerance. But additionally, the test should verify that confidence is lower (reflecting ambiguity) and that the low-confidence warning is displayed. The offset correctness is secondary to confidence accuracy for this test case.
**Warning signs:** Offset jumps between runs for the concert videos.

### Pitfall 6: File Encoding in Subdirectory Paths
**What goes wrong:** `encodeURIComponent('Playing with Bruno/IMG_7908.MOV')` encodes the `/` as `%2F`, breaking the path.
**Why it happens:** `encodeURIComponent` encodes all special characters including `/`.
**How to avoid:** Encode each path segment separately: `encodeURIComponent('Playing with Bruno') + '/' + encodeURIComponent('IMG_7908.MOV')`. Or use the full path and only encode spaces.
**Warning signs:** 404 errors despite the file existing at the expected path.

## Code Examples

### Test Harness: Sync Pipeline (to be created)
```typescript
// Source: pattern from existing test-export-real-harness.ts, adapted for sync
import { getFFmpeg } from './lib/ffmpeg.ts';
import { extractAudio } from './lib/audioExtractor.ts';
import { syncAudioTracks, getConfidenceLevel } from './lib/audioSync.ts';
import { detectAudioWarnings } from './lib/audioQuality.ts';

async function runSyncTest(files: File[]): Promise<void> {
  // 1. Extract audio from each file (same as App.tsx pipeline)
  const tracks = [];
  for (const file of files) {
    log(`Extracting audio: ${file.name}...`);
    const audio = await extractAudio(file);
    tracks.push({ fileId: file.name, fileName: file.name, audio });
  }

  // 2. Detect audio quality warnings
  for (const track of tracks) {
    const warnings = detectAudioWarnings(track.audio.channelData[0]);
    log(`Warnings for ${track.fileName}: ${JSON.stringify(warnings)}`);
  }

  // 3. Run sync
  log('Running sync...');
  const results = await syncAudioTracks(tracks, ({ current, total }) => {
    log(`  Aligning camera ${current} of ${total}...`);
  });

  // 4. Report results
  for (const r of results) {
    log(`${r.fileName}: offset=${r.offsetSeconds.toFixed(3)}s confidence=${r.confidence} ref=${r.isReference}`);
  }

  // Write structured results for Playwright
  document.getElementById('results')!.textContent = JSON.stringify(results);
  document.getElementById('status')!.textContent = 'COMPLETE';
}
```

### Playwright Test: Edge CDP Sync Validation
```typescript
// Source: pattern from existing tests/edge-cdp-test.ts
import { test, expect, chromium } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

test('Taylor Swift concert videos sync with correct confidence', async () => {
  const dir = path.resolve(__dirname, '..', 'test-videos', 'Taylor Switft Concert');
  if (!fs.existsSync(dir)) {
    test.skip(true, 'Taylor Swift test videos not found');
    return;
  }

  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('http://localhost:5173/test-sync-real.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#log')).toContainText('Harness ready', { timeout: 10_000 });

  // Load files via in-browser fetch (bypasses 50MB limit)
  const fileNames = fs.readdirSync(dir).filter(f => /\.(mp4|mov)$/i.test(f));
  await page.evaluate(async (args: { dir: string; names: string[] }) => {
    const files: File[] = [];
    for (const name of args.names) {
      const resp = await fetch(`/test-videos/Taylor%20Switft%20Concert/${encodeURIComponent(name)}`);
      const blob = await resp.blob();
      files.push(new File([blob], name, { type: blob.type || 'video/mp4' }));
    }
    const input = document.getElementById('file-input') as HTMLInputElement;
    const dt = new DataTransfer();
    for (const f of files) dt.items.add(f);
    input.files = dt.files;
    input.dispatchEvent(new Event('change'));
  }, { dir, names: fileNames });

  // Wait for sync to complete (generous timeout for FFmpeg + GCC-PHAT)
  await expect(page.locator('#status')).toHaveText('COMPLETE', { timeout: 300_000 });

  // Extract and validate results
  const resultsJson = await page.locator('#results').textContent();
  const results = JSON.parse(resultsJson!);
  // ... assertions on offset tolerance and confidence
});
```

### Confidence Formula (current implementation for reference)
```typescript
// Source: src/lib/fftEngine.ts lines 241-289
// Two-factor confidence: peakStrength * peakUniqueness * 100
//   peakStrength: maps peak value from [0.6, 1.0] to [0, 1]
//   peakUniqueness: 1.0 - (secondPeak / mainPeak)
// Thresholds in audioSync.ts:
//   getConfidenceLevel(): >= 70 = high, >= 40 = medium, < 40 = low
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Pearson correlation (SynAudio) | GCC-PHAT (fftEngine.ts) | Phase 14-15 (v2.3) | Robust to different frequency responses and repetitive content |
| WASM dependency (synaudio) | Pure JS (fft.js) | Phase 15 (v2.3) | 5KB vs ~200KB, no WASM loading issues |
| Raw correlation confidence | Peak-to-noise-floor ratio | Phase 14 (v2.3) | Distinguishes clear vs ambiguous matches |

## Open Questions

1. **What are the expected sync offsets for each test video set?**
   - What we know: Test videos exist in two subdirectories. We know file names and sizes.
   - What's unclear: The actual correct sync offsets can only be determined by running the sync and verifying visually/aurally.
   - Recommendation: The plan must include a "discovery run" step before writing offset assertions. Run sync, record offsets, user verifies alignment, then hardcode expected values.

2. **Will the confidence formula produce meaningful scores for real audio?**
   - What we know: The formula works well for synthetic signals in Phase 14 tests. It uses peakStrength (requires peak > 0.6) and peakUniqueness.
   - What's unclear: Real-world GCC-PHAT peak values for multi-camera audio may be lower than 0.6 due to environmental noise, microphone differences, and room acoustics.
   - Recommendation: Log raw peak values during the first test run. If confidence is universally low despite correct offsets, the peakStrength threshold (0.6) needs lowering.

3. **Can Vite serve files from subdirectories with spaces in the name?**
   - What we know: Vite serves `test-videos/` in dev mode (existing export tests use this). The existing tests used flat directory structure.
   - What's unclear: Whether subdirectory names with spaces work correctly with Vite's dev server.
   - Recommendation: Test this early. If it fails, consider symlinking or renaming directories.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Playwright | Edge CDP tests | Yes | 1.58.2 | -- |
| Vitest | Unit tests | Yes | 4.0.18 | -- |
| Edge browser | CDP connection | Requires manual launch on Windows | -- | Cannot run without Edge |
| Dev server (Vite) | File serving | Yes (npm run dev) | 7.3.1 | -- |
| FFmpeg WASM | Audio extraction | Yes (in-browser) | 0.12.15 | -- |
| test-videos/ | VAL-01, VAL-02 | Yes | -- | Tests skip gracefully |

**Missing dependencies with no fallback:**
- Edge browser must be manually launched with `--remote-debugging-port=9222` before tests run

**Missing dependencies with fallback:**
- None

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright 1.58.2 (Edge CDP) + Vitest 4.0.18 (unit) |
| Config file | `playwright.config.ts` (exists), `vite.config.ts` (vitest config exists) |
| Quick run command | `npx vitest run src/lib/__tests__/fftEngine.test.ts` |
| Full suite command | `npx vitest run && TMPDIR="/tmp/claude-1000" PLAYWRIGHT_BROWSERS_PATH="/tmp/claude-1000/pw-browsers" npx playwright test tests/sync-validation.spec.ts --project=edge-cdp` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VAL-01 | Taylor Swift concert videos sync correctly | E2E (Edge CDP) | `npx playwright test tests/sync-validation.spec.ts --project=edge-cdp -g "Taylor Swift"` | Wave 0 |
| VAL-02 | Playing with Bruno videos continue to sync correctly | E2E (Edge CDP) | `npx playwright test tests/sync-validation.spec.ts --project=edge-cdp -g "Bruno"` | Wave 0 |
| D-06 | Existing unit tests still pass after tuning | Unit | `npx vitest run` | Exists (fftEngine.test.ts, audioSync.test.ts) |
| D-12 | All existing unit tests pass (regression) | Unit | `npx vitest run` | Exists |

### Sampling Rate
- **Per task commit:** `npx vitest run` (unit tests, <5 seconds)
- **Per wave merge:** Full suite including Edge CDP validation
- **Phase gate:** All unit tests green + both VAL-01 and VAL-02 Edge CDP tests passing

### Wave 0 Gaps
- [ ] `test-sync-real.html` -- HTML harness page for sync validation
- [ ] `src/test-sync-real-harness.ts` -- Browser-side sync test logic
- [ ] `tests/sync-validation.spec.ts` -- Playwright Edge CDP test for both test video sets

## Sources

### Primary (HIGH confidence)
- Project codebase: `src/lib/fftEngine.ts`, `src/lib/audioSync.ts`, `src/lib/spectralSyncWorker.ts` -- current algorithm implementation
- Project codebase: `tests/edge-cdp-test.ts`, `test-export-real.html`, `src/test-export-real-harness.ts` -- existing Edge CDP test pattern
- Project codebase: `playwright.config.ts` -- existing Playwright configuration with edge-cdp project
- Local filesystem: `test-videos/` directory structure and file listing

### Secondary (MEDIUM confidence)
- Phase 14 CONTEXT.md: Algorithm decisions and confidence formula rationale
- Phase 15 CONTEXT.md: Pipeline integration decisions and warning display

### Tertiary (LOW confidence)
- Expected sync offsets for test videos -- unknown until first discovery run
- Whether confidence formula produces meaningful scores for real audio -- needs empirical validation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all tools already installed and proven in project
- Architecture: HIGH -- follows exact existing pattern from export tests
- Pitfalls: HIGH -- identified from direct code analysis and real file sizes
- Offset expectations: LOW -- cannot be known until first test run

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (stable -- validation phase, no external dependencies changing)
