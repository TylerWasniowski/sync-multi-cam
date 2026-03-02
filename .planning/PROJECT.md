# Sync Multi-Cam

## What This Is

A browser-based tool that synchronizes multiple video files by analyzing their audio tracks. Users drop in up to 30 video files from a multi-camera shoot, the app finds sync points via audio cross-correlation, trims videos to a common start point using stream-copy (preserving original codecs including HEVC/HDR), and provides downloadable results with interactive waveform visualization. Runs entirely client-side using FFmpeg WASM + SynAudio WASM SIMD, hosted statically on Cloudflare Pages.

## Core Value

Accurately sync multiple camera angles by audio so users get aligned video files without installing any software.

## Requirements

### Validated

- ✓ User can drag-and-drop or browse to add up to 30 video files (MP4, MOV, MKV, WebM) — v1.0
- ✓ App extracts audio tracks from uploaded videos using FFmpeg WASM — v1.0
- ✓ App cross-correlates audio waveforms to determine time offsets with confidence scoring — v1.0
- ✓ App trims videos to aligned start points via keyframe-aware stream-copy (no re-encode) — v1.0
- ✓ UI displays timecode offsets and confidence scores for each video after sync — v1.0
- ✓ App provides ZIP of all synced/trimmed video files with per-file and full-ZIP download buttons — v1.0
- ✓ App renders interactive audio waveforms with sync markers, linked zoom/pan/cursor — v1.0
- ✓ Multi-stage progress indicator shows pipeline status (extracting, analyzing, trimming, zipping) — v1.0
- ✓ Entire app runs client-side with no server dependencies — v1.0
- ✓ App deployed as static site on Cloudflare Pages with COOP/COEP headers — v1.0

### Active

<!-- Current milestone: v2.0 Synced Playback & Export -->

- [ ] Synced multi-cam video grid playback with dynamic aspect-ratio-aware packing
- [ ] Two display modes: preserve original aspect ratios vs fill tiles (crop)
- [ ] Waveform-as-scrubbar integration with video playback (click to seek, scroll during play)
- [ ] Audio mixing: all tracks by default, dropdown to select per-camera audio
- [ ] GPU-accelerated export of grid composite as single MP4 (H.264) at 4K/1080p/720p
- [ ] Progressive loading: waveforms interactive immediately while video buffers in background

### Out of Scope

- Server-side processing — everything runs in-browser via WASM
- Real-time preview/playback of synced videos — output is downloadable files
- Video editing features (cutting, merging, effects) — sync and trim only
- Mobile-optimized UI — desktop browser focus, FFmpeg WASM too memory-intensive for mobile
- Audio drift compensation — extremely complex, only matters for 30+ min recordings
- Account system / cloud storage — users want stateless tool, no signup

## Context

- **Shipped v1.0** with 3,334 LOC TypeScript across 4 phases in 2 days
- **Tech stack:** Vite + React 19 + Tailwind CSS v4 + FFmpeg WASM + SynAudio WASM SIMD + mp4box.js + fflate
- **Deployed at:** https://sync-multi-cam.pages.dev
- Target users: people doing multi-camera shoots (events, podcasts, interviews) who need a quick way to align angles

## Constraints

- **Hosting**: Cloudflare Pages static deployment — no server-side compute
- **Processing**: All video/audio work must happen in-browser via WASM
- **File size**: Limited by browser memory — practical limit around moderate-length videos
- **Browser support**: Modern browsers with WASM and SharedArrayBuffer support
- **Trim precision**: Stream-copy trims at keyframe boundaries only (sub-GOP alignment handled by NLEs)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| FFmpeg WASM for video processing | Battle-tested, handles extraction and trimming, works in-browser | ✓ Good — reliable for extraction and stream-copy |
| SynAudio WASM SIMD for correlation | Fast cross-correlation with Web Worker support | ✓ Good — syncWorker mode avoids threading bugs |
| Audio cross-correlation for sync | Standard, reliable approach for finding temporal alignment | ✓ Good — accurate results with confidence scoring |
| Trim-to-earliest strategy | Align start points, keep all footage — no forced end trim | ✓ Good |
| Stream-copy via mp4box.js keyframes | No re-encoding preserves HEVC/HDR; mp4box.js reads container index without decoding | ✓ Good — replaced broken smart rendering approach |
| Dark/modern UI theme | Professional video tool aesthetic | ✓ Good |
| Drag-and-drop single-page flow | Simple UX — drop files, hit sync, get results | ✓ Good |
| MAX_FILES = 30 | User feedback during development; original limit of 4 was too restrictive | ✓ Good |
| Multi-resolution peaks (3 LOD levels) | Zoom-responsive waveform rendering without recomputing | ✓ Good |
| Panel-level zoom/pan handlers | Covers gaps between tracks; avoids dead zones | ✓ Good |

## Current Milestone: v2.0 Synced Playback & Export

**Goal:** Add synced multi-cam video playback in a dynamic grid layout with GPU-accelerated composite export.

**Target features:**
- Dynamic grid player with aspect-ratio-aware packing algorithm
- Two display modes (preserve AR / fill tiles)
- Synced playback with waveform scrubbar
- Audio track selection (all mixed / per-camera)
- GPU-rendered composite MP4 export (H.264, 4K/1080p/720p)
- Progressive loading (audio-first, video buffers in background)

---
*Last updated: 2026-03-02 after v2.0 milestone start*
