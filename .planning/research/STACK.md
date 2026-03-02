# Technology Stack

**Project:** Sync Multi-Cam
**Researched:** 2026-03-01

## Recommended Stack

### Build Tool & Framework

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Vite | ^7.3.1 | Build tool, dev server, bundler | First-class WASM support, native Cloudflare Pages integration via `@cloudflare/vite-plugin`, fastest HMR. Vite 7 is current stable (8 is in development with Rolldown). React template scaffolding is built-in. | HIGH |
| React | ^19.2.4 | UI framework | Stable release with improved concurrent features. Component model fits this app well: drag-drop zone, progress indicators, file list, download actions. No SSR needed -- pure SPA. | HIGH |
| TypeScript | ^5.9.3 | Type safety | Current stable. TS 6.0 is in beta (bridge release before Go-based 7.0) -- stick with 5.9 for production stability. WASM interop benefits enormously from typed interfaces. | HIGH |

### Styling

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Tailwind CSS | ^4.2.1 | Utility-first CSS | v4 has first-party Vite plugin (`@tailwindcss/vite`), zero-config auto-detection, 5x faster builds. Dark theme is trivial with `dark:` variants. Professional video tool aesthetic maps well to utility classes. | HIGH |

### Video/Audio Processing (Core)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| @ffmpeg/ffmpeg | ^0.12.15 | FFmpeg WASM wrapper API | Official package. Provides `load()`, `writeFile()`, `exec()`, `readFile()` API for running FFmpeg commands in-browser. Spawns a Web Worker internally. TypeScript types included. | HIGH |
| @ffmpeg/util | ^0.12.x | Utility functions (fetchFile, etc.) | Required companion to @ffmpeg/ffmpeg. Provides `fetchFile()` for loading files into the virtual filesystem and `toBlobURL()` for loading core from CDN. | HIGH |
| @ffmpeg/core-mt | ^0.12.10 | Multi-threaded FFmpeg WASM core | Multi-threaded variant uses SharedArrayBuffer for parallel processing. Significant speedup for audio extraction and video trimming. **Requires COOP/COEP headers** (see Infrastructure). Single-thread fallback: `@ffmpeg/core` ^0.12.10. | HIGH |

### Audio Cross-Correlation

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| fft.js | ^4.0.4 | Fast Fourier Transform | Fastest pure-JS FFT implementation (Radix-4/Radix-2). 15,676 ops/sec at 4096-size vs ~4,000-8,000 for alternatives. Provides `realTransform()` and `inverseTransform()` needed for frequency-domain cross-correlation. Zero dependencies, 23 releases, MIT license. | MEDIUM |
| Web Audio API (built-in) | N/A | Audio decoding | `AudioContext.decodeAudioData()` decodes audio from ArrayBuffer to AudioBuffer (Float32Array PCM samples). Available in all modern browsers. Alternative to using FFmpeg for audio extraction -- faster for just getting raw PCM data. | HIGH |

**Cross-correlation approach:** Extract audio as PCM Float32Array (via Web Audio API `decodeAudioData` or FFmpeg), downsample to ~8kHz mono (reduce computation), compute FFT-based cross-correlation to find the time offset that maximizes similarity. FFT cross-correlation is O(N log N) vs O(N^2) for naive time-domain correlation.

**Decision: Web Audio API vs FFmpeg for audio extraction.** Use Web Audio API's `decodeAudioData()` for extracting PCM audio data -- it is faster than running an FFmpeg command because the browser's native decoder handles it without WASM overhead. Reserve FFmpeg for the final trim/remux step where you need actual video file manipulation.

### File Output

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| client-zip | ^2.5.0 | ZIP archive generation | 40x faster than legacy JSZip, 2.6 kB gzipped, zero dependencies, streaming API. Constant memory usage (~36 MB) even for multi-GB archives. Perfect for bundling 2-4 synced video files. | MEDIUM |
| file-saver | ^2.0.5 | Trigger browser downloads | 5.1M weekly downloads, battle-tested `saveAs()` for triggering file downloads from Blobs. Simple API: `saveAs(blob, filename)`. | HIGH |

### Infrastructure

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Cloudflare Pages | N/A | Static hosting | Free tier, global CDN, git-based deploys. Supports custom `_headers` file for COOP/COEP. No server-side compute needed. | HIGH |
| Wrangler | latest | CLI for Cloudflare deployment | `npx wrangler pages deploy dist` for manual deploys, or connect git repo for automatic deploys. | HIGH |

### Dev Dependencies

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| @tailwindcss/vite | ^4.2.1 | Tailwind Vite plugin | First-party plugin, replaces PostCSS-based setup. Zero config. | HIGH |
| @types/react | ^19.x | React type definitions | Required for TypeScript + React | HIGH |
| @types/react-dom | ^19.x | React DOM type definitions | Required for TypeScript + React DOM | HIGH |
| ESLint | ^9.x | Linting | Vite scaffolding includes ESLint config out of the box | MEDIUM |

## Critical Configuration: Cross-Origin Isolation

SharedArrayBuffer (required by `@ffmpeg/core-mt`) demands cross-origin isolation headers. Create a `_headers` file in the `public/` directory:

```
/*
  Cross-Origin-Embedder-Policy: require-corp
  Cross-Origin-Opener-Policy: same-origin
```

**Warning:** These headers break embedding of cross-origin resources that don't set `Cross-Origin-Resource-Policy`. This is fine for this app (no external embeds), but be aware if adding analytics scripts or external CDN resources later -- they must support CORP/CORS or be loaded differently.

For local development, Vite's dev server needs these headers too:

```typescript
// vite.config.ts
export default defineConfig({
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
});
```

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Build tool | Vite 7 | Webpack 5 | Slower, more config overhead, Vite is the standard for new React projects |
| Build tool | Vite 7 | Next.js | SSR/SSG framework adds complexity for a pure client-side SPA with no routing needs |
| UI framework | React 19 | Vanilla JS | This app has enough state (file list, progress, offsets, download states) that a component model pays for itself. React is the safest bet for hiring/maintenance. |
| UI framework | React 19 | Svelte 5 | Svelte is excellent but smaller ecosystem. React's ecosystem of drag-drop, progress, and file handling components is deeper. |
| UI framework | React 19 | Vue 3 | Both are fine. React chosen for broader ecosystem and TypeScript-first DX in 2025+. |
| Styling | Tailwind CSS 4 | CSS Modules | Tailwind is faster to build dark-themed UIs, fewer files, better DX with Vite plugin |
| Styling | Tailwind CSS 4 | shadcn/ui | Overkill for a single-page tool. If the UI grows, can add shadcn components on top of Tailwind later. |
| FFT | fft.js | kissfft-js | KissFFT-js is WASM-compiled and theoretically faster, but adds WASM complexity for a non-critical path. fft.js is fast enough for audio correlation on a few minutes of 8kHz mono audio. |
| FFT | fft.js | Web Audio AnalyserNode | AnalyserNode is designed for real-time visualization, not batch cross-correlation of full audio tracks |
| ZIP | client-zip | JSZip 3.10 | JSZip works but is 40% slower on modern versions (40x slower on older versions). client-zip's streaming approach uses constant memory -- critical when zipping multiple video files. |
| ZIP | client-zip | Browser native CompressionStream | Only does gzip/deflate on raw streams, not ZIP archive format |
| Download | file-saver | Native anchor trick | file-saver handles edge cases (large files, Safari quirks) that the `<a download>` trick misses |
| Video processing | @ffmpeg/core-mt | @ffmpeg/core (single-thread) | Multi-thread is 2-4x faster for encode/decode. Single-thread is fallback only for browsers without SharedArrayBuffer. |
| Audio extraction | Web Audio API | FFmpeg audio extraction | Web Audio API's native decoder is faster than WASM for decoding audio to PCM. Use FFmpeg only for the final trim/remux. |

## What NOT to Use

| Technology | Why Not |
|------------|---------|
| Next.js / Remix / Astro | Server framework overhead for a pure client-side SPA. No routing, no SSR, no API routes needed. |
| WebCodecs API | Newer browser API for video encoding/decoding. Limited browser support, complex API, and FFmpeg WASM already handles everything needed. Would be premature optimization. |
| Opus/Vorbis WASM decoders | Unnecessary when Web Audio API handles decoding natively and FFmpeg handles everything else. |
| Web Workers (manual) | FFmpeg WASM already runs in a Web Worker internally. The cross-correlation computation is fast enough on the main thread for 8kHz downsampled audio (a few hundred KB). Only add a worker if profiling shows UI jank. |
| IndexedDB / OPFS | File storage APIs add complexity. Files live in memory (via FFmpeg's virtual filesystem and Blob URLs) for the duration of processing. The 2-4 file limit keeps memory manageable. |
| State management (Redux, Zustand) | React 19's built-in state (`useState`, `useReducer`, context) is sufficient for a single-page tool with straightforward state: file list, processing status, offsets, downloads. |

## Installation

```bash
# Scaffold project
npm create vite@latest sync-multi-cam -- --template react-ts
cd sync-multi-cam

# Core dependencies
npm install @ffmpeg/ffmpeg @ffmpeg/util @ffmpeg/core-mt fft.js client-zip file-saver

# Styling
npm install tailwindcss @tailwindcss/vite

# Type definitions
npm install -D @types/file-saver
```

**Note:** `@ffmpeg/core-mt` WASM and JS files need to be served from the same origin or a CDN with proper CORS. The recommended approach is to use `toBlobURL()` from `@ffmpeg/util` to load core files, which handles CORS by converting to blob URLs:

```typescript
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

const ffmpeg = new FFmpeg();
const baseURL = 'https://unpkg.com/@ffmpeg/core-mt@0.12.10/dist/esm';

await ffmpeg.load({
  coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
  wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript'),
});
```

## Browser Requirements

| Requirement | Why | Browser Support |
|-------------|-----|-----------------|
| WebAssembly | FFmpeg WASM runtime | All modern browsers (Chrome 57+, Firefox 52+, Safari 11+, Edge 16+) |
| SharedArrayBuffer | Multi-threaded FFmpeg core | Chrome 91+, Firefox 79+, Safari 15.2+, Edge 91+ (requires COOP/COEP headers) |
| Web Audio API | Audio decoding for cross-correlation | All modern browsers |
| File API / Drag and Drop | File input | All modern browsers |
| Blob / URL.createObjectURL | File output / downloads | All modern browsers |

**Minimum practical target:** Chrome 91+, Firefox 79+, Safari 15.2+, Edge 91+ (driven by SharedArrayBuffer requirement).

## Sources

- [ffmpeg.wasm GitHub](https://github.com/ffmpegwasm/ffmpeg.wasm) - Official repository, verified v0.12.15 (HIGH confidence)
- [ffmpeg.wasm docs](https://ffmpegwasm.netlify.app/) - Installation and usage patterns (HIGH confidence)
- [@ffmpeg/core-mt npm](https://www.npmjs.com/package/@ffmpeg/core-mt) - v0.12.10 verified (HIGH confidence)
- [fft.js GitHub](https://github.com/indutny/fft.js/) - v4.0.4, benchmarks verified (MEDIUM confidence)
- [Vite Getting Started](https://vite.dev/guide/) - v7.3.1, Node 20.19+ required (HIGH confidence)
- [React v19](https://react.dev/blog/2024/12/05/react-19) - v19.2.4 current stable (HIGH confidence)
- [TypeScript npm](https://www.npmjs.com/package/typescript) - v5.9.3 stable (HIGH confidence)
- [Tailwind CSS v4](https://tailwindcss.com/blog/tailwindcss-v4) - v4.2.1, Vite plugin (HIGH confidence)
- [@tailwindcss/vite npm](https://www.npmjs.com/package/@tailwindcss/vite) - v4.2.1 verified (HIGH confidence)
- [client-zip GitHub](https://github.com/Touffy/client-zip) - v2.5.0, performance claims verified (MEDIUM confidence)
- [file-saver npm](https://www.npmjs.com/package/file-saver) - v2.0.5, 5.1M weekly downloads (HIGH confidence)
- [Cloudflare Pages Headers](https://developers.cloudflare.com/pages/configuration/headers/) - _headers file format verified (HIGH confidence)
- [MDN SharedArrayBuffer](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer) - COOP/COEP requirements (HIGH confidence)
- [MDN decodeAudioData](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData) - Web Audio API for PCM extraction (HIGH confidence)
- [web.dev COOP/COEP](https://web.dev/articles/coop-coep) - Cross-origin isolation guide (HIGH confidence)
