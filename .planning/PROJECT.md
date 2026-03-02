# Sync Multi-Cam

## What This Is

A browser-based tool that synchronizes multiple video files by analyzing their audio tracks. Users drop in 2-4 video files from a multi-camera shoot, the app finds the sync point via audio cross-correlation, and delivers trimmed videos aligned to a common start point. Runs entirely client-side using FFmpeg WASM, hosted statically on Cloudflare Pages.

## Core Value

Accurately sync multiple camera angles by audio so users get aligned video files without installing any software.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] User can drag-and-drop or browse to add 2-4 video files
- [ ] App extracts audio tracks from uploaded videos using FFmpeg WASM
- [ ] App cross-correlates audio waveforms to determine time offsets between videos
- [ ] App trims videos to align start points based on detected offsets (keeping full remaining footage per video)
- [ ] UI displays timecode offsets for each video after sync
- [ ] App auto-downloads a zip of all synced/trimmed video files
- [ ] UI presents individual synced videos in a list with offset info and per-file download buttons
- [ ] Entire app runs client-side with no server dependencies
- [ ] App can be deployed as a static site on Cloudflare Pages

### Out of Scope

- Server-side processing — everything runs in-browser via WASM
- Real-time preview/playback of synced videos — output is downloadable files
- Video editing features (cutting, merging, effects) — sync and trim only
- Mobile-optimized UI — desktop browser focus
- More than 4 simultaneous videos — 2-4 is the target range

## Context

- FFmpeg WASM (ffmpeg.wasm) provides in-browser video/audio processing
- Audio cross-correlation is the standard technique for multi-cam sync — compare waveforms to find the offset that maximizes similarity
- Static hosting on Cloudflare Pages means no backend, no API, no storage — pure client-side app
- Target users are people doing multi-camera shoots (events, podcasts, interviews) who need a quick way to align angles

## Constraints

- **Hosting**: Cloudflare Pages static deployment — no server-side compute
- **Processing**: All video/audio work must happen in-browser via WASM
- **File size**: Limited by browser memory — practical limit around 2-4 videos of moderate length
- **Browser support**: Modern browsers with WASM and SharedArrayBuffer support

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| FFmpeg WASM for video processing | Battle-tested, handles extraction and trimming, works in-browser | — Pending |
| Audio cross-correlation for sync | Standard, reliable approach for finding temporal alignment | — Pending |
| Trim-to-earliest strategy | Align start points, keep all footage — no forced end trim | — Pending |
| Dark/modern UI theme | Professional video tool aesthetic | — Pending |
| Drag-and-drop single-page flow | Simple UX — drop files, hit sync, get results | — Pending |

---
*Last updated: 2026-03-01 after initialization*
