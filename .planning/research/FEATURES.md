# Feature Research

**Domain:** Browser-based multi-camera video synchronization tool
**Researched:** 2026-03-01
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Drag-and-drop file input | Every modern web tool supports this; browse fallback also expected | LOW | Must accept common video formats (MP4, MOV, MKV, WebM). Show clear drop zone with visual feedback on hover/drop. |
| Audio-based automatic sync | This is the entire product premise. PluralEyes, Syncaila, DaVinci Resolve, Premiere Pro all do this. Users will not manually align clips. | HIGH | Core algorithm: audio fingerprinting for coarse alignment + cross-correlation (GCC-PHAT) for sample-accurate refinement. SyncSink.wasm proves this is feasible in-browser. |
| Frame-accurate offset detection | Professional tools achieve sub-frame (sample-level) accuracy. Anything worse than 1-frame precision is unacceptable. | HIGH | Cross-correlation naturally provides sample-level precision. Display offsets in timecode format (HH:MM:SS:FF) not just seconds. |
| Trimmed/aligned output files | Users expect to get back video files they can immediately use. The output must be downloadable, trimmed video files aligned to a common start point. | MEDIUM | Use FFmpeg WASM to trim without re-encoding (stream copy) where possible. Re-encoding is slow and lossy. |
| Per-file download | Users want to download individual synced files, not be forced into a zip. Essential for large files where zip creation may fail due to memory. | LOW | Simple download links per output file. |
| Processing progress feedback | Video processing takes significant time (minutes for large files). Users need to know it's working and roughly how long. | MEDIUM | Multi-stage progress: (1) loading files, (2) extracting audio, (3) analyzing/correlating, (4) trimming. Show current stage + progress within stage. |
| Offset display per video | Users need to see what offset was detected for each video relative to the reference. PluralEyes and Syncaila both show this. | LOW | Display offset in both timecode and seconds. Show which file is the reference (0 offset). |
| Support for 2-4 videos simultaneously | The product scope. Podcast/interview setups commonly use 2-3 cameras. | MEDIUM | Memory management is the real challenge. Must handle 2-4 moderate-length videos without crashing the browser tab. |
| No installation required | This is the core differentiator of being browser-based. If users have to install anything, they'd use PluralEyes or their NLE. | LOW | Static site, no plugins, no extensions. SharedArrayBuffer requirement may need COOP/COEP headers. |
| Privacy / client-side processing | Users handling pre-release or client footage expect their files never leave their machine. | LOW | Prominently communicate "your files never leave your browser." This is a trust feature. |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Zero-install browser-based workflow | PluralEyes is discontinued/maintenance mode. Syncaila and Tentacle Sync Studio are paid desktop apps ($49-$199). NLE sync requires owning expensive software. This tool is free, instant, no signup. | LOW (arch decision, not feature work) | The "just works in a browser" factor is the primary differentiator. Every competitor requires download + install + license. |
| Sync confidence score | Show users how confident the algorithm is in the detected alignment (e.g., correlation coefficient as a percentage). Synchron shows reliability scores; most desktop tools do not surface this. | LOW | The cross-correlation peak value naturally provides this. Normalize to 0-100% and display per pair. Flag low-confidence results (< 70%) with a warning. |
| Visual waveform display | Show audio waveforms for each file with alignment markers overlaid. Helps users visually verify sync is correct before downloading. | MEDIUM | Render downsampled waveforms on canvas. Draw vertical lines showing detected sync points. Interactive but not editable. |
| Stream-copy (no re-encode) trimming | Output files trimmed without re-encoding = fast processing, no quality loss. Most browser tools re-encode everything because it's simpler. | MEDIUM | FFmpeg `-c copy -ss [offset]` for stream copy. Caveat: keyframe alignment means the trim point may not be frame-exact. Offer re-encode fallback for precise trimming. |
| Batch zip download | One-click download of all synced files as a zip. Convenient but optional (per-file is table stakes). | MEDIUM | Use JSZip or similar. Memory-intensive for large files -- only offer when total output < ~500MB. Show file size estimate before download. |
| Reference file selection | Let user choose which video is the "anchor" (offset = 0). Default: longest file or first file. | LOW | Simple dropdown or click-to-select in the file list. Re-runs offset calculation relative to new reference. |
| Dark/professional UI theme | Video professionals expect dark interfaces (every NLE is dark). Matches the "pro tool" aesthetic established in PROJECT.md. | LOW | Dark color scheme from the start. Not a toggle -- just be dark by default. |
| Manual offset adjustment | After auto-sync, let users nudge offsets by frames if the auto-detection was slightly off. | MEDIUM | Frame-accurate +/- buttons or numeric input per file. Requires re-trimming on adjustment. Useful for edge cases where audio correlation is imperfect. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Real-time synced playback/preview | Users want to verify sync by watching all angles simultaneously before downloading | Requires decoding multiple video streams in real-time in the browser. Massive memory/CPU usage. Complex to build (synchronized `<video>` elements with sub-frame accuracy). Far exceeds MVP scope. | Show waveform alignment visualization + confidence score instead. Users can verify by downloading and checking in their NLE. |
| Video editing (cut, merge, transitions) | Natural extension of "I have synced videos" | Scope creep into NLE territory. Impossible to compete with Premiere/Resolve. Massively increases complexity. | Stay focused: sync and trim only. Users take aligned files into their preferred editor. |
| Multi-camera angle switching editor | PluralEyes feeds into NLE multicam editing. Users might expect a similar workflow. | Building a multicam editor is a separate product entirely. Months of work for questionable value when the output files work in any NLE. | Export aligned files. Optionally export an XML/EDL project file users can import into their NLE with angles pre-configured. |
| Server-side processing fallback | Browser memory limits cap practical file sizes at ~2GB per file. Users with larger files will hit this. | Requires backend infrastructure, hosting costs, privacy concerns, upload bandwidth. Contradicts the "runs entirely client-side" premise. | Communicate file size limits clearly upfront. Suggest desktop alternatives for very large files. Target the 80% use case (podcast/interview clips under 1GB each). |
| Mobile support | Some users shoot on phones and want to sync on phones | FFmpeg WASM is memory-intensive. Mobile browsers have tighter memory limits. Touch-based drag-and-drop is awkward. Small screens make waveform visualization useless. | Desktop-only. State this clearly. Mobile users can use the tool on a desktop/laptop browser. |
| Account system / cloud storage | Saving sync projects, history, sharing results | Requires backend, auth, storage infrastructure. Privacy implications. Users just want to sync and download -- not create an account. | Stateless tool. No accounts, no storage, no tracking. |
| Support for >4 videos | Some productions use 5-10+ cameras | Memory usage scales linearly with file count. Cross-correlation complexity scales quadratically with file count (each pair must be compared). Browser will crash with 6+ large video files. | Hard limit at 4 with clear messaging. Users with more cameras need desktop tools. |
| Automatic audio drift compensation | PluralEyes handles drift (cameras running at slightly different speeds over long recordings) | Drift detection and correction is extremely complex. Requires resampling audio, which means re-encoding video. Only matters for very long recordings (30+ min). | V1: ignore drift. Document that the tool works best for recordings under 30 minutes. V2+: consider drift detection if user feedback demands it. |

## Feature Dependencies

```
[Drag-and-drop file input]
    |
    v
[Audio extraction via FFmpeg WASM]
    |
    v
[Audio cross-correlation / offset detection]
    |
    +---> [Offset display per video]
    |
    +---> [Sync confidence score]
    |
    +---> [Visual waveform display]
    |
    v
[Video trimming via FFmpeg WASM]
    |
    +---> [Per-file download]
    |
    +---> [Batch zip download]

[Reference file selection] --modifies--> [Audio cross-correlation]

[Manual offset adjustment] --modifies--> [Video trimming]

[Stream-copy trimming] --conflicts--> [Frame-exact trim precision]
    (stream copy aligns to nearest keyframe; re-encode needed for frame-exact)
```

### Dependency Notes

- **Audio extraction requires FFmpeg WASM loaded:** FFmpeg WASM is ~25MB and takes several seconds to load. Must be initialized before any processing begins. Load eagerly on page load, not on first file drop.
- **Cross-correlation requires extracted audio:** Audio must be extracted, downmixed to mono, and resampled to a common sample rate (8kHz is sufficient for sync detection and dramatically reduces computation).
- **Trimming requires detected offsets:** Can only trim after offsets are calculated. The trim operation itself is a separate FFmpeg call per file.
- **Stream-copy vs re-encode is a key tradeoff:** Stream copy is fast (seconds) but aligns to the nearest keyframe (could be off by up to ~0.5s for some codecs). Re-encoding is slow (minutes) but frame-exact. Default to stream copy with a "precise mode" toggle for re-encode.
- **Zip download depends on per-file outputs existing:** Zip is assembled from already-trimmed files. Memory doubles during zip creation (trimmed files + zip buffer).
- **Waveform display is independent of trimming:** Can show waveforms as soon as audio is extracted, before trimming starts. Good for early visual feedback.

## MVP Definition

### Launch With (v1)

Minimum viable product -- what's needed to validate the concept.

- [ ] **Drag-and-drop file input** -- core UX entry point; support browse fallback
- [ ] **Audio extraction via FFmpeg WASM** -- extract mono audio at 8kHz for analysis
- [ ] **Audio cross-correlation for offset detection** -- fingerprint coarse pass + cross-correlation refinement
- [ ] **Offset display per video** -- show detected offsets in timecode format
- [ ] **Video trimming (stream copy)** -- fast trim without re-encoding
- [ ] **Per-file download** -- individual download buttons per synced file
- [ ] **Processing progress feedback** -- multi-stage progress indicator
- [ ] **Privacy messaging** -- "files never leave your browser" prominently displayed
- [ ] **Dark theme UI** -- professional aesthetic from day one

### Add After Validation (v1.x)

Features to add once core is working.

- [ ] **Sync confidence score** -- display correlation strength as percentage; warn on low confidence
- [ ] **Visual waveform display** -- canvas-rendered waveforms with sync point markers
- [ ] **Reference file selection** -- let user choose the anchor video
- [ ] **Batch zip download** -- one-click zip of all output files (with size guard)
- [ ] **Manual offset adjustment** -- frame-level nudge controls for fine-tuning

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] **Re-encode mode for frame-exact trimming** -- toggle for precision over speed
- [ ] **NLE project file export** -- generate FCP XML or Premiere XML with pre-aligned clips so users can import directly into their editor
- [ ] **Audio drift detection/warning** -- detect clock drift between cameras in long recordings
- [ ] **Keyboard shortcuts** -- power user workflow acceleration
- [ ] **Drag-to-reorder files** -- cosmetic but useful for organizing angles

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Drag-and-drop file input | HIGH | LOW | P1 |
| Audio extraction (FFmpeg WASM) | HIGH | MEDIUM | P1 |
| Audio cross-correlation sync | HIGH | HIGH | P1 |
| Offset display per video | HIGH | LOW | P1 |
| Video trimming (stream copy) | HIGH | MEDIUM | P1 |
| Per-file download | HIGH | LOW | P1 |
| Progress feedback | HIGH | MEDIUM | P1 |
| Privacy messaging | MEDIUM | LOW | P1 |
| Dark theme | MEDIUM | LOW | P1 |
| Sync confidence score | MEDIUM | LOW | P2 |
| Visual waveform display | MEDIUM | MEDIUM | P2 |
| Reference file selection | MEDIUM | LOW | P2 |
| Batch zip download | MEDIUM | MEDIUM | P2 |
| Manual offset adjustment | MEDIUM | MEDIUM | P2 |
| Re-encode precise trimming | LOW | MEDIUM | P3 |
| NLE project file export | MEDIUM | MEDIUM | P3 |
| Audio drift detection | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | PluralEyes 4 | Syncaila | Tentacle Sync Studio | SyncSink.wasm | DaVinci Resolve (built-in) | Our Approach |
|---------|---------------|----------|----------------------|---------------|---------------------------|--------------|
| Audio waveform sync | Yes (core feature) | Yes (core feature) | Yes + timecode | Yes (fingerprint + cross-correlation) | Yes | Audio fingerprint + cross-correlation, same as SyncSink.wasm |
| Sync accuracy | Frame-accurate with drift compensation | Frame-accurate | Sample-accurate (timecode) | Sample-accurate | Frame-accurate | Sample-accurate via cross-correlation |
| Confidence/quality indicator | No | No | No | No (shows correlation plot) | No | Yes -- display correlation coefficient as % score |
| Waveform visualization | No | No | No | Yes (timebox plot) | Yes (in timeline) | Yes -- canvas-rendered waveforms with sync markers |
| Output format | Synced timeline in NLE | XML for NLE import | XML/AAF/ProRes | JSON offsets only (no video output) | Multicam clip in timeline | Trimmed video files (download) |
| Trimming/re-encoding | Via NLE | Via NLE | Transcode on export | None (offsets only) | Via NLE | In-browser via FFmpeg WASM |
| Runs in browser | No (desktop app) | No (desktop app) | No (macOS only) | Yes | No (desktop app) | Yes |
| Cost | $299 (discontinued) | $49-$199 | $99 | Free (AGPL) | Free (with Resolve) | Free |
| Installation required | Yes | Yes | Yes (macOS only) | No | Yes | No |
| Max cameras | Unlimited | License-tier based (2-track free) | Unlimited | Unlimited (but offsets only) | Unlimited | 2-4 |
| Drift compensation | Yes | No | Via timecode | No | No | No (v1), maybe v2 |

### Key Competitive Insight

SyncSink.wasm is the closest prior art but it only outputs JSON offset data -- it does NOT trim or produce aligned video files. Our tool closes that gap: same browser-based convenience, but with actual downloadable aligned videos. This is the core value proposition that no existing browser tool provides.

PluralEyes is discontinued. Syncaila is the active desktop competitor but costs money and requires installation. DaVinci Resolve has built-in sync but requires learning a full NLE. Our tool serves the user who wants to drop files in, get aligned files out, and move on.

## Sources

- [SyncSink.wasm - Browser-based media sync via audio alignment](https://github.com/JorenSix/SyncSink.wasm) -- direct prior art, AGPL licensed
- [ffmpeg.wasm - FFmpeg for browser](https://github.com/ffmpegwasm/ffmpeg.wasm) -- core processing engine
- [ffmpeg.wasm large file discussion](https://github.com/ffmpegwasm/ffmpeg.wasm/discussions/516) -- memory limits documentation
- [Syncaila - Multi-camera sync software](https://syncaila.com/) -- desktop competitor
- [PluralEyes vs Syncaila shootout](https://www.provideocoalition.com/sync-shootout-pluraleyes-vs-syncaila/) -- competitor comparison
- [PluralEyes discontinued](https://www.provideocoalition.com/fare-thee-well-pluraleyes-you-were-truly-revolutionary/) -- market gap
- [Tentacle Sync Studio](https://tentaclesync.com/sync-studio) -- timecode-based competitor
- [Premiere Pro multicam documentation](https://helpx.adobe.com/premiere-pro/using/create-multi-camera-source-sequence.html) -- NLE built-in sync reference
- [Audio cross-correlation research](https://www.researchgate.net/publication/263925127_Fast_second_screen_TV_synchronization_combining_audio_fingerprint_technique_and_generalized_cross_correlation) -- algorithm approach
- [Synchron - sync with reliability scores](https://www.synchronvideo.com/) -- confidence score prior art

---
*Feature research for: Browser-based multi-camera video synchronization*
*Researched: 2026-03-01*
