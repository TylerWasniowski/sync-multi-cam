# Sync Multi-Cam

## What This Is

A browser-based tool that synchronizes multiple video files by analyzing their audio tracks, then lets users preview all angles in a synced grid player and export a single composited MP4. Users drop in up to 30 video files from a multi-camera shoot, the app finds sync points via audio cross-correlation, displays precise offsets (ms + NLE timecode) on waveform tracks, and provides GPU-accelerated composite export. Runs entirely client-side, hosted statically on Cloudflare Pages.

## Core Value

Accurately sync multiple camera angles by audio so users get aligned video files without installing any software.

## Requirements

### Validated

- ✓ User can drag-and-drop or browse to add up to 30 video files (MP4, MOV, MKV, WebM) — v1.0
- ✓ App extracts audio tracks from uploaded videos using FFmpeg WASM — v1.0
- ✓ App cross-correlates audio waveforms to determine time offsets with confidence scoring — v1.0
- ✓ App trims videos to aligned start points via keyframe-aware stream-copy (no re-encode) — v1.0 (trimming pipeline removed in v2.2; composite export replaces individual file downloads)
- ✓ UI displays timecode offsets and confidence scores for each video after sync — v1.0 (enhanced to NLE timecode in v2.2)
- ✓ App provides ZIP of all synced/trimmed video files with per-file and full-ZIP download buttons — v1.0 (removed in v2.2; composite export covers use case)
- ✓ App renders interactive audio waveforms with sync markers, linked zoom/pan/cursor — v1.0
- ✓ Multi-stage progress indicator shows pipeline status (extracting, analyzing) — v1.0 (simplified in v2.2)
- ✓ Entire app runs client-side with no server dependencies — v1.0
- ✓ App deployed as static site on Cloudflare Pages with COOP/COEP headers — v1.0
- ✓ Synced multi-cam video grid playback with dynamic aspect-ratio-aware packing — v2.0
- ✓ Two display modes: preserve original aspect ratios vs fill tiles (crop) — v2.0
- ✓ Waveform-as-scrubbar integration with video playback (click to seek, drag to scrub, animated playhead) — v2.0
- ✓ Audio mixing with per-track mute/unmute toggles — v2.0
- ✓ GPU-accelerated export of grid composite as single MP4 (H.264) at 4K/1080p/720p — v2.0
- ✓ Progressive loading: waveforms interactive immediately while video buffers in background — v2.0
- ✓ Camera filename labels on video tiles — v2.0
- ✓ Keyboard shortcuts for transport controls (Space, arrow keys) — v2.0
- ✓ Muted waveform track visual — dim/gray the entire waveform row when muted — v2.1
- ✓ Privacy messaging prominence — shield icon and message in drop zone — v2.1
- ✓ Export controls redesign — centered bar, enlarged button, persistent completion state — v2.1
- ✓ Cursor state matches cursor preview position 1:1 in audio tracks — v2.2
- ✓ Play starts from cursor position or sync start point (not beginning) — v2.2
- ✓ Sync Results download area removed; trimming/ZIP pipeline removed — v2.2
- ✓ Waveform tracks display offset with ms precision and NLE timecode format — v2.2
- ✓ GCC-PHAT spectral cross-correlation replaces SynAudio Pearson correlation for robust sync — v2.3
- ✓ Sync runs in Web Worker with zero-copy buffer transfers, SynAudio WASM dependency removed — v2.3
- ✓ Per-pair progress reporting ("Aligning camera N of M") during sync — v2.3
- ✓ Audio quality warnings: silence detection, clipping detection, low confidence — v2.3
- ✓ Color-coded confidence scoring (green/yellow/red) with peak-to-noise-floor ratio — v2.3
- ✓ Edge CDP E2E validation test infrastructure for real multi-camera recordings — v2.3

### Active

### Out of Scope

- Server-side processing — everything runs in-browser via WASM
- Video editing features (cutting, merging, effects) — sync, preview, and composite export only
- Mobile-optimized UI — desktop browser focus, FFmpeg WASM too memory-intensive for mobile
- Audio drift compensation — extremely complex, only matters for 30+ min recordings
- Account system / cloud storage — users want stateless tool, no signup
- Click-to-expand fullscreen tile — implemented and removed per user feedback (v2.0)
- WebCodecs export for Firefox/Safari — Firefox H.264 encoder broken, Safari pre-26 absent (defer to v3+)
- More than 8 cameras in export — FFmpeg WASM memory constraint

## Context

- **Shipped v2.3** with 7,086 LOC TypeScript across 16 phases (4 v1.0 + 5 v2.0 + 2 v2.1 + 2 v2.2 + 3 v2.3) over 29 days
- **Tech stack:** Vite + React 19 + Tailwind CSS v4 + FFmpeg WASM + fft.js + mp4box.js + Mediabunny (WebCodecs) + Web Audio API
- **Deployed at:** https://sync-multi-cam.pages.dev
- Target users: people doing multi-camera shoots (events, podcasts, interviews) who need a quick way to align angles, preview sync, and export a composite
- **Known limitation:** Mixed aspect ratio videos use first video's AR for all export cells (future work)

## Constraints

- **Hosting**: Cloudflare Pages static deployment — no server-side compute
- **Processing**: All video/audio work must happen in-browser via WASM/WebCodecs
- **File size**: Limited by browser memory — practical limit around moderate-length videos
- **Browser support**: Modern browsers with WASM, SharedArrayBuffer, and WebCodecs support
- **Trim precision**: Stream-copy trimming removed in v2.2 (composite export replaced individual file downloads)
- **Export codec**: H.264 only (WebCodecs hardware encoder availability)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| FFmpeg WASM for video processing | Battle-tested, handles extraction and trimming, works in-browser | ✓ Good — reliable for extraction and stream-copy |
| SynAudio WASM SIMD for correlation | Fast cross-correlation with Web Worker support | ⚠️ Replaced in v2.3 — Pearson on raw waveforms fails for different mics and repetitive content |
| Audio cross-correlation for sync | Standard, reliable approach for finding temporal alignment | ✓ Good — upgraded to GCC-PHAT spectral method in v2.3 |
| GCC-PHAT replacing SynAudio | Phase-normalized frequency-domain correlation robust to mic differences and reverb | ✓ Good — correct offsets for concert + dialogue content |
| fft.js (5KB pure JS) over WASM FFT | Simpler than KissFFT WASM, adequate performance for ~3 FFTs per sync pair | ✓ Good — net reduction in bundle size, no WASM complexity |
| Peak-to-noise-floor confidence | Scale-invariant confidence scoring that works regardless of FFT size | ✓ Good — replaced broken absolute threshold that always produced 0% on real audio |
| Pre-sync audio quality detection | Detect silence/clipping before sync starts, warn but don't block | ✓ Good — non-intrusive, catches unusable tracks early |
| Trim-to-earliest strategy | Align start points, keep all footage — no forced end trim | ✓ Good |
| Stream-copy via mp4box.js keyframes | No re-encoding preserves HEVC/HDR; mp4box.js reads container index without decoding | ✓ Good — replaced broken smart rendering approach |
| Dark/modern UI theme | Professional video tool aesthetic | ✓ Good |
| Drag-and-drop single-page flow | Simple UX — drop files, hit sync, get results | ✓ Good |
| MAX_FILES = 30 | User feedback during development; original limit of 4 was too restrictive | ✓ Good |
| Multi-resolution peaks (3 LOD levels) | Zoom-responsive waveform rendering without recomputing | ✓ Good |
| Panel-level zoom/pan handlers | Covers gaps between tracks; avoids dead zones | ✓ Good |
| Native video elements in CSS grid for playback | Fights browser compositor less than canvas compositing | ✓ Good — smooth, hardware-decoded playback |
| rAF standalone timeline clock | Leader-follower sync had drift issues; wall-clock approach is simpler and more accurate | ✓ Good — replaced leader-follower in Phase 7 |
| WebCodecs + Mediabunny for export | FFmpeg WASM compositing too slow; WebCodecs uses GPU hardware encoder | ✓ Good — ~5s for 3s export vs minutes with FFmpeg |
| Web Audio API GainNode graph for mixing | Per-track mute/unmute without re-encoding; lazy init in user gesture | ✓ Good |
| Shift+drag for waveform pan | Bare drag = scrub (most common action), Shift modifier for pan | ✓ Good — intuitive after hint |
| Drop POL-02 click-to-expand | User didn't find fullscreen tile useful after trying it | ⚠️ Revisit — may want different expand UX later |
| Persistent export completion state | User feedback: auto-reset was confusing, prefer explicit "Export Another" reset | ✓ Good — clearer UX |
| Mute button outside dim container | Structural isolation preserves full clickability vs CSS counter-opacity | ✓ Good |
| Inline styles for dim transitions | Tailwind transition-all doesn't reliably cover CSS filter property | ✓ Good |
| Dynamic label offset measurement | querySelector + getBoundingClientRect for layout-dependent cursor offsets | ✓ Good — accurate cursor alignment |
| engine.seek(maxOffset) after creation | Set initial timeline position without modifying constructor API | ✓ Good — simple, non-invasive |
| Remove trimming/ZIP pipeline entirely | Composite export replaces individual file downloads; clean break over dead code | ✓ Good — -649 lines, simpler pipeline |
| 30fps NLE timecode default | NTSC standard, most common NLE timeline rate | ✓ Good — professional standard |
| Widen label column w-32 → w-36 | Fit 3-line offset display (filename, ms offset, NLE timecode) | ✓ Good |

---
*Last updated: 2026-03-29 after v2.3 Robust Audio Sync milestone shipped*
