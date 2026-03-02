# Phase 1: Foundation and File Input - Research

**Researched:** 2026-03-01
**Domain:** Vite + React + TypeScript project scaffolding, Tailwind CSS dark theme, drag-and-drop file input, FFmpeg WASM initialization, Cloudflare Pages deployment with COOP/COEP headers
**Confidence:** HIGH

## Summary

Phase 1 is greenfield -- there is no existing code or `package.json`. The entire project must be scaffolded from scratch using `npm create vite@latest` with the `react-ts` template, then augmented with Tailwind CSS v4, FFmpeg WASM packages, and a Cloudflare Pages `_headers` file for cross-origin isolation. The core risk in this phase is COOP/COEP header misconfiguration, which must be validated on a live Cloudflare Pages deployment before any FFmpeg work is written -- a non-negotiable prerequisite from STATE.md.

The file drop zone is a native HTML5 drag-and-drop implementation (no library needed). File validation must check both MIME types and file count (2-4 videos). FFmpeg WASM should be loaded lazily (not on page load) using `toBlobURL()` to fetch the multi-threaded core from a CDN and convert to blob URLs, with a single-threaded fallback if `SharedArrayBuffer` is unavailable.

**Primary recommendation:** Scaffold the Vite project, deploy a skeleton to Cloudflare Pages with COOP/COEP headers first (validate `crossOriginIsolated === true` in the browser console), then build the UI and FFmpeg loading on a confirmed-working foundation.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FILE-01 | User can drag-and-drop video files onto a drop zone with visual feedback | Native HTML5 drag-and-drop API with `onDragOver`, `onDragEnter`, `onDragLeave`, `onDrop` handlers. `isDragging` state for visual feedback (border/background change). No external library needed. |
| FILE-02 | User can browse to select video files as a fallback to drag-and-drop | Hidden `<input type="file" multiple accept="..." />` triggered by a button click. Same validation pipeline as drag-and-drop. |
| FILE-03 | App accepts common video formats (MP4, MOV, MKV, WebM) | Use `accept="video/mp4,video/quicktime,video/x-matroska,video/webm,.mp4,.mov,.mkv,.webm"` on the input element. Validate dropped files against MIME types and extensions (MIME can be empty for MKV in some browsers). |
| FILE-04 | App supports 2-4 video files simultaneously | Validate count on drop/select. Show clear error for <2 or >4 files. Allow incremental adds up to 4. Allow removal of individual files. |
| UX-01 | Dark, modern, professional UI theme | Tailwind CSS v4 with forced dark theme. Use `bg-gray-950`/`bg-gray-900` backgrounds, `text-gray-100` text. No theme toggle needed -- always dark. |
| UX-02 | "Files never leave your browser" privacy messaging | Prominent banner/badge in the UI, visible on initial load and near the drop zone. Use a shield/lock icon + text. |
| UX-03 | App runs entirely client-side with no server dependencies | Verified: all technologies (Vite build output, FFmpeg WASM, Web Audio API) are client-side. No API calls, no backend. FFmpeg core loaded from CDN via `toBlobURL()`. |
| UX-04 | App can be deployed as a static site on Cloudflare Pages | Vite produces static `dist/` directory. `_headers` file in `public/` sets COOP/COEP. Deploy via `npx wrangler pages deploy dist` or git integration. |
| UX-05 | Zero configuration -- smart defaults | No settings UI. File drop zone is the only interaction point. FFmpeg loads automatically when files are added. Reference file auto-selected in later phases. |
</phase_requirements>

## Standard Stack

### Core (Phase 1 scope)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vite | ^7.3.1 | Build tool, dev server | First-class WASM support, Cloudflare Pages integration, fastest HMR. Scaffold with `npm create vite@latest` |
| React | ^19.2.4 | UI framework | Stable release, component model fits file drop zone + progress + results pattern |
| TypeScript | ^5.9.3 | Type safety | Current stable. WASM interop benefits from typed interfaces |
| Tailwind CSS | ^4.2.1 | Utility-first CSS | v4 Vite plugin, zero-config auto-detection, `@import "tailwindcss"` entry |
| @tailwindcss/vite | ^4.2.1 | Tailwind Vite plugin | First-party plugin, replaces PostCSS setup |
| @ffmpeg/ffmpeg | ^0.12.15 | FFmpeg WASM wrapper | Provides `load()`, `writeFile()`, `exec()`, `readFile()` API |
| @ffmpeg/util | ^0.12.x | FFmpeg utilities | `toBlobURL()` for loading core from CDN, `fetchFile()` for file loading |

### Supporting (installed now, used in later phases)

| Library | Version | Purpose | When Used |
|---------|---------|---------|-----------|
| @ffmpeg/core-mt | ^0.12.10 | Multi-threaded WASM core | NOT installed as npm dependency -- loaded at runtime from CDN via `toBlobURL()` |

### Dev Dependencies

| Library | Version | Purpose |
|---------|---------|---------|
| @types/react | ^19.x | TypeScript types for React |
| @types/react-dom | ^19.x | TypeScript types for React DOM |
| ESLint | ^9.x | Linting (included in Vite scaffold) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native drag-and-drop | react-dropzone | Adds 8KB dependency for something achievable with ~30 lines of native code. Only consider if accessibility requirements grow complex. |
| Always-dark theme | Theme toggle (dark/light) | Requirements specify dark professional theme. No toggle needed. Simpler implementation. |
| CDN-loaded FFmpeg core | npm-installed + bundled core | Bundling adds 25MB to the app bundle. CDN + toBlobURL is the documented approach and avoids bloated initial load. |
| `require-corp` COEP | `credentialless` COEP | `credentialless` is not supported in Safari. Since `toBlobURL()` converts CDN resources to blob URLs (same-origin), `require-corp` works fine and has broader browser support. |

**Installation:**

```bash
# Scaffold project
npm create vite@latest . -- --template react-ts

# Core dependencies
npm install @ffmpeg/ffmpeg @ffmpeg/util

# Styling
npm install tailwindcss @tailwindcss/vite
```

Note: `@ffmpeg/core-mt` is NOT installed via npm. It is loaded at runtime from CDN using `toBlobURL()`. This avoids bundling the 25MB WASM files.

## Architecture Patterns

### Recommended Project Structure (Phase 1)

```
src/
  components/
    App.tsx               # Root layout, top-level state
    FileDropZone.tsx      # Drag-and-drop + file browser input
    FileList.tsx          # Display loaded files with remove buttons
    PrivacyBanner.tsx     # "Files never leave your browser" messaging
    FFmpegStatus.tsx      # FFmpeg load state indicator
  lib/
    ffmpeg.ts             # FFmpeg WASM initialization + singleton
    fileValidation.ts     # MIME type and count validation
    constants.ts          # Accepted formats, limits, CDN URLs
  types/
    index.ts              # Shared types (VideoFile, AppState, etc.)
  index.tsx               # Entry point
  index.css               # Tailwind entry (@import "tailwindcss")
public/
  _headers                # Cloudflare Pages COOP/COEP headers
vite.config.ts            # Vite config with COOP/COEP dev headers + optimizeDeps
```

### Pattern 1: Lazy FFmpeg Loading with SharedArrayBuffer Detection

**What:** Do not load FFmpeg on page load. Detect `crossOriginIsolated` at runtime, then lazily load the appropriate FFmpeg core (multi-threaded if SharedArrayBuffer available, single-threaded fallback) only when the user adds files.

**When to use:** Always. The FFmpeg core is 25MB and should never block initial page render.

**Example:**

```typescript
// src/lib/ffmpeg.ts
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

let ffmpegInstance: FFmpeg | null = null;

export async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;

  const ffmpeg = new FFmpeg();

  const isMultiThread = typeof SharedArrayBuffer !== 'undefined';
  const pkg = isMultiThread ? '@ffmpeg/core-mt' : '@ffmpeg/core';
  const baseURL = `https://cdn.jsdelivr.net/npm/${pkg}@0.12.10/dist/esm`;

  const loadConfig: Record<string, string> = {
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  };

  if (isMultiThread) {
    loadConfig.workerURL = await toBlobURL(
      `${baseURL}/ffmpeg-core.worker.js`,
      'text/javascript'
    );
  }

  await ffmpeg.load(loadConfig);
  ffmpegInstance = ffmpeg;
  return ffmpeg;
}
```

### Pattern 2: Native File Drop Zone with Visual Feedback

**What:** Use HTML5 drag-and-drop events directly in a React component. Track `isDragging` state for visual feedback. Prevent default browser behavior (opening the file). Validate files on drop.

**When to use:** For the file input component. No library needed.

**Example:**

```typescript
// src/components/FileDropZone.tsx
import { useState, useCallback, useRef } from 'react';
import { validateFiles } from '../lib/fileValidation';

interface FileDropZoneProps {
  onFilesAccepted: (files: File[]) => void;
  currentFileCount: number;
  maxFiles: number;
}

export function FileDropZone({ onFilesAccepted, currentFileCount, maxFiles }: FileDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;

    const files = Array.from(e.dataTransfer.files);
    const result = validateFiles(files, currentFileCount, maxFiles);
    if (result.error) {
      setError(result.error);
      return;
    }
    setError(null);
    onFilesAccepted(result.validFiles);
  }, [currentFileCount, maxFiles, onFilesAccepted]);

  const handleBrowse = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const result = validateFiles(files, currentFileCount, maxFiles);
    if (result.error) {
      setError(result.error);
      return;
    }
    setError(null);
    onFilesAccepted(result.validFiles);
    // Reset input so same file can be re-selected
    e.target.value = '';
  }, [currentFileCount, maxFiles, onFilesAccepted]);

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors
        ${isDragging
          ? 'border-blue-500 bg-blue-500/10'
          : 'border-gray-600 bg-gray-800/50 hover:border-gray-500'
        }`}
    >
      <p className="text-gray-300 text-lg mb-4">
        Drag and drop 2-4 video files here
      </p>
      <button
        onClick={handleBrowse}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors"
      >
        Browse Files
      </button>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="video/mp4,video/quicktime,video/x-matroska,video/webm,.mp4,.mov,.mkv,.webm"
        onChange={handleFileInput}
        className="hidden"
      />
      {error && <p className="text-red-400 mt-3 text-sm">{error}</p>}
    </div>
  );
}
```

### Pattern 3: File Validation with MIME Type + Extension Fallback

**What:** Validate dropped/selected files against allowed video formats. Check MIME type first, fall back to extension check (MKV files often have empty or `application/octet-stream` MIME type in some browsers).

**Example:**

```typescript
// src/lib/fileValidation.ts
const ALLOWED_MIME_TYPES = new Set([
  'video/mp4',
  'video/quicktime',     // .mov
  'video/x-matroska',    // .mkv
  'video/webm',
]);

const ALLOWED_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.webm']);

function getExtension(filename: string): string {
  const idx = filename.lastIndexOf('.');
  return idx >= 0 ? filename.slice(idx).toLowerCase() : '';
}

function isVideoFile(file: File): boolean {
  if (ALLOWED_MIME_TYPES.has(file.type)) return true;
  // Fallback: check extension (MKV may report as application/octet-stream)
  return ALLOWED_EXTENSIONS.has(getExtension(file.name));
}

export function validateFiles(
  files: File[],
  currentCount: number,
  maxFiles: number
): { validFiles: File[]; error: string | null } {
  const videoFiles = files.filter(isVideoFile);
  const rejected = files.length - videoFiles.length;

  const totalAfterAdd = currentCount + videoFiles.length;

  if (totalAfterAdd > maxFiles) {
    return {
      validFiles: [],
      error: `Maximum ${maxFiles} files allowed. You have ${currentCount}, tried to add ${videoFiles.length}.`,
    };
  }

  if (rejected > 0 && videoFiles.length === 0) {
    return {
      validFiles: [],
      error: 'No supported video files found. Accepted formats: MP4, MOV, MKV, WebM.',
    };
  }

  return { validFiles: videoFiles, error: null };
}
```

### Anti-Patterns to Avoid

- **Bundling FFmpeg WASM core via npm:** Do NOT `npm install @ffmpeg/core-mt` and import it. This adds 25MB to your bundle. Load from CDN via `toBlobURL()`.
- **Loading FFmpeg on page load:** Do NOT call `ffmpeg.load()` in a top-level effect. Wait until the user has added files.
- **Using `onDragLeave` without a counter:** Child elements trigger `dragLeave` events when the cursor moves between children. Use a `dragCounter` ref to prevent flickering.
- **Checking only MIME types for file validation:** MKV files report as `application/octet-stream` or empty in some browsers. Always fall back to extension check.
- **Using `require-corp` without understanding `toBlobURL`:** The `toBlobURL()` function fetches CDN resources and converts them to blob URLs, which are same-origin. This sidesteps CORP requirements entirely, making `require-corp` safe even when loading from CDN.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| FFmpeg WASM loading/initialization | Custom WASM loader | `@ffmpeg/ffmpeg` + `@ffmpeg/util` `toBlobURL()` | Handles CDN fetching, blob URL creation, worker spawning, CORS edge cases |
| CSS utility framework | Custom dark theme CSS | Tailwind CSS v4 | Utility classes are faster to write, consistent, and the Vite plugin is zero-config |
| File type validation MIME database | Custom MIME type map | Simple set-based check + extension fallback | Only 4 formats to support. A MIME database is overkill. |
| Build tooling and HMR | Custom Webpack config | Vite scaffold (`npm create vite@latest`) | React-ts template includes everything: TypeScript, ESLint, HMR, production build |

## Common Pitfalls

### Pitfall 1: COOP/COEP Headers Not Applied on Cloudflare Pages

**What goes wrong:** The `_headers` file is placed in the project root instead of `public/`. Or the build process does not copy it to `dist/`. Headers are not applied, `SharedArrayBuffer` is undefined, FFmpeg multi-threaded core fails.
**Why it happens:** Cloudflare Pages only reads `_headers` from the build output directory. Vite copies `public/` contents to `dist/` during build, but only files IN `public/` -- not the project root.
**How to avoid:** Place `_headers` in `public/`. After building, verify: `ls dist/_headers`. After deploying, verify in browser DevTools (Network tab -> select HTML document -> check Response Headers for COOP/COEP). Also verify `crossOriginIsolated === true` in the browser console.
**Warning signs:** `SharedArrayBuffer is not defined` error. FFmpeg loads in dev but fails in production.

### Pitfall 2: Vite Dev Server Headers Require Full Restart

**What goes wrong:** Developer changes COOP/COEP headers in `vite.config.ts`, but HMR does not re-apply them. Dev server continues serving old headers.
**Why it happens:** HTTP headers are set when the dev server starts and are not updated by hot module replacement.
**How to avoid:** After ANY change to `server.headers` in `vite.config.ts`, stop and restart the dev server completely (`Ctrl+C` then `npm run dev`).
**Warning signs:** Headers look correct in config but browser shows old values.

### Pitfall 3: `optimizeDeps` Pre-bundling Breaks FFmpeg WASM

**What goes wrong:** Vite's dev server pre-bundles dependencies with esbuild. esbuild does not support WASM imports, causing errors when `@ffmpeg/ffmpeg` or `@ffmpeg/util` are pre-bundled.
**Why it happens:** Vite pre-bundles all node_modules by default for faster dev server startup. FFmpeg packages contain WASM references that esbuild cannot process.
**How to avoid:** Add `optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'] }` to `vite.config.ts`. This is documented in the official ffmpeg.wasm Vite example.
**Warning signs:** Cryptic esbuild errors mentioning WASM during `npm run dev`.

### Pitfall 4: Drag-and-Drop `dragLeave` Flickering

**What goes wrong:** The `isDragging` visual feedback flickers rapidly when the user drags a file over the drop zone. The drop zone appears to activate/deactivate randomly.
**Why it happens:** When the cursor moves between child elements inside the drop zone, the browser fires `dragleave` on the parent followed by `dragenter` on the child. Each `dragleave` sets `isDragging = false`.
**How to avoid:** Use a `dragCounter` ref that increments on `dragenter` and decrements on `dragleave`. Only set `isDragging = false` when the counter reaches 0.
**Warning signs:** Visual feedback blinks when dragging over text or icons inside the drop zone.

### Pitfall 5: MKV Files Rejected by MIME Type Check

**What goes wrong:** User drops an MKV file, but it is rejected as "unsupported format" even though MKV is in the accepted formats list.
**Why it happens:** Some browsers report MKV files with MIME type `application/octet-stream` or empty string instead of `video/x-matroska`. A MIME-type-only check rejects them.
**How to avoid:** Check MIME type first, then fall back to file extension check. The extension `.mkv` is reliable even when the MIME type is not.
**Warning signs:** MP4 and WebM files work, but MKV files are silently rejected.

### Pitfall 6: FFmpeg Core 25MB Blocking Initial Load

**What goes wrong:** FFmpeg WASM core is loaded eagerly on page load. User sees a blank page or loading spinner for 5-10 seconds while 25MB of WASM downloads.
**Why it happens:** Developer puts `ffmpeg.load()` in a top-level `useEffect` or module initializer.
**How to avoid:** Lazy-load FFmpeg only when the user adds files. Show the UI immediately. Display an "Initializing FFmpeg..." status only after files are added.
**Warning signs:** Slow initial page load. Lighthouse performance score drops significantly.

## Code Examples

### Vite Configuration for FFmpeg WASM

```typescript
// vite.config.ts
// Source: ffmpeg.wasm official Vite example
// https://github.com/ffmpegwasm/ffmpeg.wasm/blob/main/apps/vue-vite-app/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
```

### Cloudflare Pages Headers File

```
# public/_headers
# Enables SharedArrayBuffer for FFmpeg WASM multi-threaded core
# Source: https://developers.cloudflare.com/pages/configuration/headers/
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
```

### Tailwind CSS v4 Entry Point

```css
/* src/index.css */
/* Source: https://tailwindcss.com/docs */
@import "tailwindcss";
```

No `tailwind.config.js` needed. Tailwind v4 auto-detects template files.

### Dark Theme Root Layout

```typescript
// src/components/App.tsx
export default function App() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight">
            Sync Multi-Cam
          </h1>
          <span className="flex items-center gap-2 text-sm text-gray-400">
            <svg {/* shield/lock icon */} />
            Files never leave your browser
          </span>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-6 py-12">
        {/* FileDropZone, FileList, FFmpegStatus go here */}
      </main>
    </div>
  );
}
```

### SharedArrayBuffer Detection and Fallback

```typescript
// src/lib/ffmpeg.ts
export function isMultiThreadSupported(): boolean {
  return typeof SharedArrayBuffer !== 'undefined';
}

// Use this to show user which mode they are in
export function getFFmpegMode(): 'multi-thread' | 'single-thread' {
  return isMultiThreadSupported() ? 'multi-thread' : 'single-thread';
}
```

### Verifying Cross-Origin Isolation (Browser Console)

```javascript
// Run in browser console after deploy to Cloudflare Pages
console.log('crossOriginIsolated:', crossOriginIsolated);
// Expected: true
// If false: COOP/COEP headers are not applied correctly
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Tailwind v3 + postcss.config.js + tailwind.config.js | Tailwind v4 + `@tailwindcss/vite` plugin + `@import "tailwindcss"` | Jan 2025 (v4 release) | Zero-config, no PostCSS, 5x faster builds |
| Vite 5/6 | Vite 7 (current stable) | 2025 | Node 20.19+ required, performance improvements |
| FFmpeg WASM 0.11 (createFFmpeg API) | FFmpeg WASM 0.12 (class-based FFmpeg API) | 2023 | Breaking API change: `new FFmpeg()` + `ffmpeg.load({...})` replaces `createFFmpeg()` |
| COEP `require-corp` only | COEP `credentialless` option available | Chrome 96, Firefox 119 | `credentialless` does not require CORP headers on cross-origin resources. But NOT supported in Safari. Use `require-corp` + `toBlobURL()` for broadest support. |

**Deprecated/outdated:**
- `createFFmpeg()` / `fetchFFmpeg()` API: Replaced by `new FFmpeg()` + `ffmpeg.load()` in v0.12
- Tailwind `@tailwind base; @tailwind components; @tailwind utilities;` directives: Replaced by `@import "tailwindcss"` in v4
- PostCSS-based Tailwind setup: Replaced by `@tailwindcss/vite` plugin

## Open Questions

1. **FFmpeg CDN choice: jsdelivr vs unpkg?**
   - What we know: Official docs show both `unpkg.com` and `cdn.jsdelivr.net`. Both host `@ffmpeg/core-mt@0.12.10`.
   - What's unclear: Reliability/speed difference in practice. jsdelivr has historically better uptime.
   - Recommendation: Use jsdelivr (`cdn.jsdelivr.net/npm/`). It is the CDN used in the official ffmpeg.wasm usage docs. Can switch later if needed.

2. **Minimum file count enforcement: on drop or on "process" trigger?**
   - What we know: FILE-04 requires 2-4 files. Users may drop 1 file at a time.
   - What's unclear: Should validation reject a single file drop, or allow it and require 2+ before enabling processing?
   - Recommendation: Allow adding files incrementally (1 at a time is fine). Show count indicator ("1 of 2-4 files added"). Disable processing trigger until count >= 2. This is more user-friendly.

3. **Self-hosting FFmpeg core vs CDN loading?**
   - What we know: `require-corp` COEP would block loading from CDN without CORP headers. But `toBlobURL()` fetches via `fetch()` and converts to blob URLs, sidestepping CORP entirely.
   - What's unclear: Whether CDN `fetch()` itself could be blocked by some corporate firewalls/proxies.
   - Recommendation: Start with CDN loading via `toBlobURL()`. If issues arise, self-host by copying WASM files to `public/` and serving from same origin. Document the fallback approach.

## Sources

### Primary (HIGH confidence)
- [Vite Getting Started](https://vite.dev/guide/) - Scaffold command, react-ts template, dev server configuration
- [Tailwind CSS v4 Installation](https://tailwindcss.com/docs) - v4 Vite plugin setup, `@import "tailwindcss"` entry
- [ffmpeg.wasm Usage](https://ffmpegwasm.netlify.app/docs/getting-started/usage/) - `toBlobURL`, load config, multi-thread vs single-thread, CDN URLs
- [ffmpeg.wasm Vite Example](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/main/apps/vue-vite-app/vite.config.ts) - `optimizeDeps.exclude`, dev server headers
- [Cloudflare Pages Headers](https://developers.cloudflare.com/pages/configuration/headers/) - `_headers` file format, placement, limitations
- [MDN SharedArrayBuffer](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer) - COOP/COEP requirements
- [MDN input type=file](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/file) - `accept` attribute, MIME types, limitations
- [MDN COEP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy) - `require-corp` vs `credentialless` semantics

### Secondary (MEDIUM confidence)
- [Can I Use: COEP credentialless](https://caniuse.com/mdn-http_headers_cross-origin-embedder-policy_credentialless) - Browser support: Chrome 96+, Firefox 119+, Safari NOT supported
- [Cloudflare Community: SharedArrayBuffer headers](https://community.cloudflare.com/t/how-could-i-make-the-html-support-sharedarraybuffer/581161) - Community confirmation of `_headers` approach
- [DEV.to: Drag-drop file uploads without libraries](https://dev.to/hexshift/implementing-drag-drop-file-uploads-in-react-without-external-libraries-1d31) - Native implementation pattern

### Tertiary (LOW confidence)
- None -- all findings verified against primary or secondary sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All versions verified against official sources and npm. Scaffold command tested in documentation.
- Architecture: HIGH - Follows official ffmpeg.wasm examples and React best practices. File drop zone pattern is well-documented.
- Pitfalls: HIGH - COOP/COEP pitfalls verified via Cloudflare docs, ffmpeg.wasm GitHub issues, and MDN. Drag-drop flickering is a known browser behavior.
- File validation: HIGH - MIME types verified via MDN. MKV MIME type issue documented across multiple sources.

**Research date:** 2026-03-01
**Valid until:** 2026-04-01 (stable libraries, 30-day window appropriate)
