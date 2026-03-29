# Architecture Research: SEO Integration for Vite React SPA on Cloudflare Pages

**Domain:** SEO for static client-side SPA (single HTML entry point, no SSR)
**Researched:** 2026-03-29
**Confidence:** HIGH

## System Overview

This project is a single-page application with exactly one HTML entry point (`index.html`). There is no routing -- all content lives on one URL. This dramatically simplifies SEO because there is only one page to optimize, no dynamic routes to prerender, and no need for libraries like React Helmet.

The SEO integration splits into two layers: **build-time** (baked into the HTML and static files) and **static assets** (served alongside the SPA from the `public/` directory).

```
BUILD-TIME LAYER (Vite pipeline)
┌──────────────────────────────────────────────────────────────────┐
│                        index.html                                 │
│  ┌──────────────────────────────────────────────────────────┐     │
│  │  <head>                                                   │     │
│  │    <title>                    <- hardcoded in HTML         │     │
│  │    <meta description>        <- hardcoded in HTML         │     │
│  │    <meta keywords>           <- hardcoded in HTML         │     │
│  │    <link rel="canonical">    <- hardcoded in HTML         │     │
│  │    <meta og:*>               <- hardcoded in HTML         │     │
│  │    <meta twitter:*>          <- hardcoded in HTML         │     │
│  │    <script type="ld+json">   <- inline JSON-LD           │     │
│  │  </head>                                                  │     │
│  └──────────────────────────────────────────────────────────┘     │
│  ┌──────────────────────────────────────────────────────────┐     │
│  │  <body>                                                   │     │
│  │    <div id="root"></div>                                  │     │
│  │    <script type="module" src="/src/main.tsx"></script>    │     │
│  │  </body>                                                  │     │
│  └──────────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────────┘

STATIC ASSET LAYER (public/ directory, served as-is)
┌──────────────────────────────────────────────────────────────────┐
│  public/                                                          │
│  ├── robots.txt          <- crawler directives                   │
│  ├── sitemap.xml         <- single-URL sitemap                   │
│  ├── og-image.png        <- social sharing preview image         │
│  ├── _headers            <- COOP/COEP + cache headers (existing) │
│  └── favicon.svg         <- app icon (replace vite.svg)          │
└──────────────────────────────────────────────────────────────────┘
```

### Key Architectural Decision: No Plugins, No Libraries -- Just HTML

For a single-page app with one URL, the correct approach is to hardcode all meta tags directly in `index.html`. This is the simplest, most reliable, and most maintainable approach.

**Why NOT use a Vite plugin:**
- `vite-plugin-html`, `vite-plugin-open-graph`, `vite-plugin-meta-tags` -- these exist for apps with multiple pages or dynamic content that needs build-time injection per route
- This project has ONE page. Moving static strings from `index.html` into `vite.config.ts` adds indirection with zero benefit
- A custom `transformIndexHtml` plugin is equally unnecessary -- the meta tags never change, so they belong in the source HTML

**Why NOT use React Helmet or similar:**
- React Helmet exists for SPAs with client-side routing where each "page" needs different meta tags
- This app has no router. There is one view. The meta tags are always the same
- Client-side meta tag injection is invisible to social media crawlers (Twitter, Facebook, Slack, LinkedIn) that do NOT execute JavaScript. Only Google renders JS
- Build-time HTML is universally visible to all crawlers

**Confidence:** HIGH -- this is directly verified against Vite docs and Google's JavaScript SEO basics documentation. Google confirms meta tags in static HTML are the most reliable approach.

## Component Responsibilities

| Component | Responsibility | New vs Modified | Implementation |
|-----------|----------------|-----------------|----------------|
| `index.html` | All meta tags, canonical URL, OG tags, Twitter Card, JSON-LD structured data | **MODIFIED** | Add tags directly to `<head>` |
| `public/robots.txt` | Crawler directives, sitemap reference | **NEW** | Static text file |
| `public/sitemap.xml` | Single-URL sitemap for search engines | **NEW** | Static XML file |
| `public/og-image.png` | Social sharing preview image (1200x630) | **NEW** | Static image asset |
| `public/_headers` | HTTP headers for COOP/COEP (existing) | **MODIFIED** | Add cache headers for static SEO assets |
| `public/favicon.svg` | App favicon (replace generic Vite icon) | **NEW** | SVG icon |

## Recommended Project Structure (Changes Only)

```
public/
├── _headers            # EXISTING -- add cache-control for SEO assets
├── robots.txt          # NEW -- crawler directives
├── sitemap.xml         # NEW -- single-URL sitemap
├── og-image.png        # NEW -- 1200x630 social preview image
└── favicon.svg         # NEW -- replace vite.svg with app-specific icon

index.html              # MODIFIED -- add full <head> with meta tags + JSON-LD
```

No new source files in `src/`. No new dependencies in `package.json`. No build pipeline changes.

### Structure Rationale

- **`public/` for static assets:** Vite copies `public/` contents to `dist/` root unchanged during build. `robots.txt`, `sitemap.xml`, and `og-image.png` must be at the site root (`/robots.txt`, `/sitemap.xml`). Placing them in `public/` achieves this automatically with zero config
- **`index.html` for meta tags:** Vite uses `index.html` as the build entry point. Tags in `<head>` are present in the production build output. All crawlers see them on first request, before any JavaScript executes

## Architectural Patterns

### Pattern 1: Static HTML Meta Tags (Recommended)

**What:** Place all SEO meta tags directly in `index.html` `<head>` section as static HTML. No build-time generation, no runtime injection.

**When to use:** Single-page apps with one URL, where meta tag content is known at development time and does not change per-route or per-user.

**Trade-offs:**
- PRO: Universally visible to all crawlers (Google, Bing, social media, AI bots)
- PRO: Zero dependencies, zero build complexity
- PRO: Easy to audit -- open `index.html`, see exactly what crawlers see
- CON: If the app later adds multiple routes/pages, this approach does not scale (would need React Helmet or SSR)

**Example -- the target `index.html` `<head>`:**
```html
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />

  <!-- Primary Meta Tags -->
  <title>Sync Multi-Cam - Free Browser-Based Multi-Camera Video Sync Tool</title>
  <meta name="description" content="Synchronize multiple camera angles by audio in your browser. Drop video files, auto-align by audio cross-correlation, preview in a synced grid, and export a single composite MP4. No upload, no install, 100% private." />
  <meta name="keywords" content="multi-camera sync, video synchronization, audio alignment, multicam, video editing, browser tool, free, no upload" />
  <meta name="author" content="Sync Multi-Cam" />

  <!-- Canonical URL -->
  <link rel="canonical" href="https://sync-multi-cam.pages.dev/" />

  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://sync-multi-cam.pages.dev/" />
  <meta property="og:title" content="Sync Multi-Cam - Free Browser-Based Multi-Camera Video Sync Tool" />
  <meta property="og:description" content="Synchronize multiple camera angles by audio in your browser. No upload, no install, 100% private." />
  <meta property="og:image" content="https://sync-multi-cam.pages.dev/og-image.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Sync Multi-Cam - Free Multi-Camera Video Sync" />
  <meta name="twitter:description" content="Sync multiple camera angles by audio in your browser. Free, private, no install." />
  <meta name="twitter:image" content="https://sync-multi-cam.pages.dev/og-image.png" />

  <!-- Favicon -->
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />

  <!-- Structured Data -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "Sync Multi-Cam",
    "description": "Browser-based tool that synchronizes multiple video files by analyzing their audio tracks, then lets users preview all angles in a synced grid player and export a single composited MP4.",
    "url": "https://sync-multi-cam.pages.dev/",
    "applicationCategory": "MultimediaApplication",
    "operatingSystem": "Any (browser-based)",
    "browserRequirements": "Requires modern browser with WebAssembly and SharedArrayBuffer support",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD"
    },
    "featureList": [
      "Audio cross-correlation sync for up to 30 cameras",
      "GPU-accelerated composite MP4 export",
      "Synced multi-angle grid preview",
      "100% client-side, no upload required"
    ]
  }
  </script>
</head>
```

### Pattern 2: Static Files in public/ Directory

**What:** Place `robots.txt`, `sitemap.xml`, and `og-image.png` in Vite's `public/` directory. Vite copies these to `dist/` root during build. Cloudflare Pages serves them as static files at their root paths.

**When to use:** Any static file that must be accessible at a fixed URL path (e.g., `/robots.txt`).

**Trade-offs:**
- PRO: Zero config -- Vite handles the copy automatically
- PRO: Cloudflare Pages serves static files before SPA fallback, so `/robots.txt` returns the actual file, not `index.html`
- CON: Files are not processed by Vite's build pipeline (no hashing, no transforms) -- but that is correct for these files

**Example -- `public/robots.txt`:**
```
User-agent: *
Allow: /

Sitemap: https://sync-multi-cam.pages.dev/sitemap.xml
```

**Example -- `public/sitemap.xml`:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://sync-multi-cam.pages.dev/</loc>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
```

### Pattern 3: Cloudflare Pages _headers for Cache Control

**What:** Extend the existing `_headers` file to set appropriate cache headers for SEO assets. Crawlers re-fetch these files periodically; proper cache headers prevent unnecessary revalidation while ensuring updates propagate.

**When to use:** Always, when deploying SEO assets on Cloudflare Pages.

**Trade-offs:**
- PRO: Crawlers get fast responses for `robots.txt` and `sitemap.xml`
- PRO: OG images get long cache times (they rarely change)
- CON: If you update `og-image.png`, the old cached version may persist in CDN -- but Cloudflare Pages invalidates on deploy

**Example -- extended `public/_headers`:**
```
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp

/robots.txt
  Cache-Control: public, max-age=86400

/sitemap.xml
  Cache-Control: public, max-age=86400

/og-image.png
  Cache-Control: public, max-age=604800
```

## Data Flow

### Crawler Request Flow

```
Crawler (Google/Bing/Social) hits https://sync-multi-cam.pages.dev/
    |
    v
Cloudflare Pages CDN
    |
    +--> /robots.txt    --> public/robots.txt (static file, served directly)
    +--> /sitemap.xml   --> public/sitemap.xml (static file, served directly)
    +--> /              --> dist/index.html (SPA entry point)
              |
              v
         <head> parsed by crawler
              |
              +--> <title>           --> indexed as page title
              +--> <meta description> --> indexed as page snippet
              +--> <link canonical>   --> canonical URL registered
              +--> <meta og:*>       --> used for social sharing cards
              +--> <meta twitter:*>  --> used for Twitter/X cards
              +--> <script ld+json>  --> structured data for rich results
              |
              v
         Google only: renders JS, sees React content
         Social crawlers: STOP HERE (no JS execution)
```

### Build Pipeline Flow

```
vite build
    |
    v
index.html (source)
    |
    +--> Vite processes: injects hashed CSS/JS bundles
    +--> All <head> meta tags pass through unchanged
    +--> Output: dist/index.html
    |
    v
public/ directory
    |
    +--> Copied as-is to dist/
    +--> robots.txt    --> dist/robots.txt
    +--> sitemap.xml   --> dist/sitemap.xml
    +--> og-image.png  --> dist/og-image.png
    +--> _headers      --> dist/_headers (Cloudflare reads this)
    +--> favicon.svg   --> dist/favicon.svg
    |
    v
dist/ deployed to Cloudflare Pages
```

### Key Data Flows

1. **Social sharing preview:** User shares URL on Twitter/Slack/LinkedIn --> crawler fetches `index.html` --> reads `og:title`, `og:description`, `og:image` from static HTML --> fetches `/og-image.png` --> renders preview card. No JavaScript executed.

2. **Google indexing:** Googlebot fetches `index.html` --> reads static meta tags (Phase 1: crawl) --> queues for rendering --> executes JavaScript, sees full React UI (Phase 2: render) --> indexes page with both static meta and rendered content.

3. **Sitemap discovery:** Crawler fetches `/robots.txt` --> finds `Sitemap:` directive --> fetches `/sitemap.xml` --> finds single URL --> crawls/indexes that URL.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1 page (current) | Static meta tags in `index.html`, single-URL sitemap. No plugins, no libraries needed |
| 2-5 pages (future routes) | React Helmet + `vite-plugin-react-meta-map` for per-route meta tags. Or migrate to SSG (Astro, Next.js static export) |
| Dynamic content (user profiles, shared exports) | Requires SSR or Cloudflare Workers for dynamic meta tags. Fundamentally different architecture |

### Scaling Priorities

1. **First upgrade trigger:** Adding client-side routing (React Router). At that point, `react-helmet-async` becomes necessary for per-route meta tags, and `robots.txt`/`sitemap.xml` would need to list all routes
2. **Second upgrade trigger:** User-generated shareable URLs (e.g., shared sync results). This would require server-side rendering or Cloudflare Workers to inject dynamic OG tags per URL

Neither trigger is in scope for v2.4. The current architecture is correct for a single-page tool.

## Anti-Patterns

### Anti-Pattern 1: Using React Helmet for Static Meta Tags

**What people do:** Install `react-helmet-async`, create a `<SEO>` component, render meta tags via React.
**Why it is wrong for this project:** Social media crawlers (Twitter, Facebook, LinkedIn, Slack) do NOT execute JavaScript. They read the raw HTML response. React-rendered meta tags are invisible to them. For a single-page app with no routing, this adds a dependency that solves nothing and breaks social sharing.
**Do this instead:** Put meta tags directly in `index.html` `<head>`.

### Anti-Pattern 2: Using a Vite Plugin to Inject Static Content

**What people do:** Install `vite-plugin-html` or `vite-plugin-open-graph`, configure meta tags in `vite.config.ts`.
**Why it is wrong for this project:** These plugins exist for multi-page apps or apps that need environment-specific meta tags. For static content on a single page, they move hardcoded strings from `index.html` to `vite.config.ts` -- adding a build-time dependency and indirection for zero benefit.
**Do this instead:** Edit `index.html` directly.

### Anti-Pattern 3: Client-Side JSON-LD Injection via dangerouslySetInnerHTML

**What people do:** Create a React component that renders `<script type="application/ld+json">` using `dangerouslySetInnerHTML`.
**Why it is wrong for this project:** Google can read client-side rendered JSON-LD (confirmed in official docs), but placing it in static HTML is simpler, requires no React component, and is guaranteed to be present before any JavaScript runs. For a single page with unchanging structured data, there is no reason to make it dynamic.
**Do this instead:** Inline the `<script type="application/ld+json">` directly in `index.html` `<head>`.

### Anti-Pattern 4: Forgetting the Canonical URL (pages.dev Duplicate Content)

**What people do:** Deploy to Cloudflare Pages without a canonical URL. The site is accessible at both `sync-multi-cam.pages.dev` and potentially a custom domain, creating duplicate content.
**Why it is wrong:** Google may index both URLs and split ranking signals between them.
**Do this instead:** Always include `<link rel="canonical" href="https://sync-multi-cam.pages.dev/" />`. If a custom domain is added later, update the canonical to point to the custom domain and add a redirect from `pages.dev`.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Google Search Console | Submit sitemap URL after deploy | Verify ownership via HTML meta tag or DNS TXT record. Optional but recommended for monitoring |
| Social media card validators | Test OG/Twitter meta tags post-deploy | Facebook Sharing Debugger, Twitter Card Validator. No code integration, just manual verification |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `index.html` <-> `public/` | Vite build copies `public/` to `dist/`; `index.html` references assets via absolute paths (`/og-image.png`) | OG image URL must be absolute (full `https://` URL) in meta tags, but favicon can use root-relative path |
| `_headers` <-> Cloudflare CDN | Cloudflare Pages parses `_headers` and applies rules to matching paths | Existing COOP/COEP headers on `/*` are critical for SharedArrayBuffer; new SEO asset headers are additive |
| `robots.txt` <-> `sitemap.xml` | `robots.txt` contains `Sitemap:` directive pointing to full URL of `sitemap.xml` | Both files reference the production URL, not relative paths |

## Cloudflare Pages Static File Serving Behavior

Cloudflare Pages serves static files that exist in the build output BEFORE falling back to SPA routing. This means:

- `/robots.txt` -> returns `dist/robots.txt` (the actual file)
- `/sitemap.xml` -> returns `dist/sitemap.xml` (the actual file)
- `/og-image.png` -> returns `dist/og-image.png` (the actual file)
- `/nonexistent-path` -> returns `dist/index.html` (SPA fallback)

This is the correct behavior. No `_routes.json` configuration is needed. The existing setup already handles this correctly because Vite copies `public/` to `dist/` and Cloudflare serves known files before SPA fallback.

**Confidence:** HIGH -- verified via Cloudflare Pages documentation and community reports.

## Build Order (Suggested Implementation Sequence)

Given the v2.4 milestone scope, the implementation order should be:

1. **Create OG image** (`public/og-image.png`) -- 1200x630 PNG with app branding. This is a design task, not a code task, and other steps reference it
2. **Create favicon** (`public/favicon.svg`) -- Replace generic Vite icon with app-specific icon
3. **Update `index.html`** -- Add all meta tags, OG tags, Twitter Card tags, canonical URL, JSON-LD structured data, and updated favicon reference. This is the core of the SEO work
4. **Create `public/robots.txt`** -- Crawler directives with Sitemap reference
5. **Create `public/sitemap.xml`** -- Single-URL sitemap
6. **Update `public/_headers`** -- Add cache headers for SEO assets
7. **Verify** -- Build locally, inspect `dist/` output, test with social card validators

Steps 1-2 can happen in parallel. Steps 3-6 can all happen in a single phase since they have no code dependencies between them (just static files). Step 7 is validation.

## Sources

- [Vite Plugin API -- transformIndexHtml](https://vite.dev/guide/api-plugin#transformindexhtml) -- confirms hook shape and default injection behavior
- [Vite Static Asset Handling](https://vite.dev/guide/assets) -- confirms public/ directory behavior
- [Google JavaScript SEO Basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics) -- confirms Google renders JS but recommends static HTML for reliability
- [Cloudflare Pages Headers](https://developers.cloudflare.com/pages/configuration/headers/) -- confirms _headers file behavior
- [Cloudflare Pages Custom Domains](https://developers.cloudflare.com/pages/configuration/custom-domains/) -- confirms pages.dev duplicate content issue
- [schema.org SoftwareApplication](https://schema.org/SoftwareApplication) -- WebApplication type and properties
- [OG Image Size Guide](https://myogimage.com/blog/og-image-size-meta-tags-complete-guide) -- 1200x630 standard for cross-platform compatibility
- [Cloudflare Community: robots.txt on Pages](https://community.cloudflare.com/t/robots-txt-cloudflare-page/636861) -- confirms static file serving before SPA fallback
- [Using robots.txt with Cloudflare Pages](https://dailystuff.nl/blog/2023/using-robots.txt-with-cloudflare-pages) -- confirms public/ directory approach works

---
*Architecture research for: SEO integration into Vite React SPA on Cloudflare Pages*
*Researched: 2026-03-29*
