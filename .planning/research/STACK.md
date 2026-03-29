# Stack Research

**Domain:** SEO for Vite React SPA on Cloudflare Pages
**Researched:** 2026-03-29
**Confidence:** HIGH

## Recommended Stack

### Core Approach: Zero New Dependencies

This is a single-page app with one URL and no client-side routing. Every SEO asset can be implemented with static files and direct HTML edits. No libraries needed.

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Static `index.html` meta tags | N/A | SEO meta, OG tags, Twitter Cards | Crawlers (Google, Facebook, Twitter/X, Discord, LinkedIn) read raw HTML before JS executes. For a single-URL SPA, hardcoded tags in `index.html` are the most reliable approach. No JS library can improve on what's already in the static HTML. |
| JSON-LD `<script>` block | Schema.org | Structured data (WebApplication) | Inline JSON-LD in `index.html` is Google's recommended format for structured data. No library needed -- it's a static JSON blob in a `<script type="application/ld+json">` tag. |
| Static `robots.txt` | N/A | Crawler directives | Plain text file in `public/` directory. Vite copies `public/` to `dist/` automatically during build. |
| Static `sitemap.xml` | N/A | URL discovery for crawlers | Single-URL sitemap is a static XML file. No generator needed for one page. |
| Static OG image (PNG) | N/A | Social sharing preview image | 1200x630px PNG in `public/`. Referenced by `og:image` meta tag with absolute URL. |

### Supporting Libraries

**None required.** This is the key finding.

A single-page app with one URL and static content needs zero SEO libraries. All meta tags go directly in `index.html`. All discoverable assets (`robots.txt`, `sitemap.xml`, OG image) go in `public/`.

### Development/Validation Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| [Google Rich Results Test](https://search.google.com/test/rich-results) | Validate JSON-LD structured data produces rich results | Test after deploy. Accepts URL or code snippet. Required properties: `name`, `offers.price`, and either `aggregateRating` or `review`. |
| [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) | Validate OG tags render correctly for Facebook/LinkedIn | Scrapes URL and shows preview. Use to clear Facebook cache after updates. |
| [Twitter Card Validator](https://cards-dev.twitter.com/validator) | Validate Twitter/X Card tags | Twitter/X falls back to OG tags if `twitter:` tags are missing. |
| [Schema.org Validator](https://validator.schema.org/) | Validate structured data JSON-LD syntax | Catches JSON-LD errors before deploy. |
| [opengraph.xyz](https://www.opengraph.xyz/) | Preview OG appearance across platforms | Quick visual check without needing platform accounts. |

---

## What Goes Where

### 1. `index.html` `<head>` Section

The `<head>` currently has only `<meta charset>`, favicon, viewport, and a bare `<title>`. All SEO tags go here as static HTML:

```html
<!-- Basic SEO -->
<title>Sync Multi-Cam -- Free Browser-Based Multi-Camera Video Sync Tool</title>
<meta name="description" content="Synchronize multiple camera angles by audio in your browser. Drop video files, auto-detect sync points, preview in a synced grid, and export a composited MP4. Free, private, no upload required." />
<link rel="canonical" href="https://sync-multi-cam.pages.dev/" />
<meta name="robots" content="index, follow" />

<!-- Open Graph (Facebook, LinkedIn, Discord, Slack, iMessage) -->
<meta property="og:title" content="Sync Multi-Cam -- Free Multi-Camera Video Sync" />
<meta property="og:description" content="Synchronize multiple camera angles by audio in your browser. Free, private, no upload." />
<meta property="og:image" content="https://sync-multi-cam.pages.dev/og-image.png" />
<meta property="og:url" content="https://sync-multi-cam.pages.dev/" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Sync Multi-Cam" />
<meta property="og:locale" content="en_US" />

<!-- Twitter/X Card -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Sync Multi-Cam -- Free Multi-Camera Video Sync" />
<meta name="twitter:description" content="Synchronize multiple camera angles by audio in your browser. Free, private, no upload." />
<meta name="twitter:image" content="https://sync-multi-cam.pages.dev/og-image.png" />

<!-- Structured Data: WebApplication (Schema.org via JSON-LD) -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "Sync Multi-Cam",
  "url": "https://sync-multi-cam.pages.dev/",
  "description": "Synchronize multiple camera angles by audio in your browser. Drop video files, auto-detect sync points, preview in a synced grid, and export a composited MP4. Free, private, no upload required.",
  "applicationCategory": "MultimediaApplication",
  "operatingSystem": "Any",
  "browserRequirements": "Modern browser with WebAssembly and SharedArrayBuffer support (Chrome, Edge, Firefox, Safari 16.4+)",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD"
  }
}
</script>
```

**Notes on tag choices:**
- `og:type` is `website` (not `product` or `article`) -- the Open Graph spec says `website` requires no additional properties beyond the four required tags
- `og:image` uses absolute URL -- required by OG spec, relative paths do not work
- Twitter/X `twitter:card` set to `summary_large_image` for the prominent preview format
- Twitter/X falls back to OG tags, but explicit `twitter:*` tags ensure control over the preview
- JSON-LD uses `WebApplication` (subtype of `SoftwareApplication`) -- Google supports this for rich results and it has the `browserRequirements` property specific to web apps
- Google requires `name` + `offers.price` + (`aggregateRating` OR `review`) for rich result eligibility. Without user reviews/ratings, the structured data still helps understanding but won't generate star ratings in search. This is fine -- adding fake reviews would violate Google guidelines.

### 2. `public/robots.txt`

```
User-agent: *
Allow: /

Sitemap: https://sync-multi-cam.pages.dev/sitemap.xml
```

Simple and permissive. The `Allow: /` is technically redundant (crawlers assume allowed by default) but makes intent explicit. The `Sitemap:` directive helps crawlers discover the sitemap without needing Google Search Console submission.

### 3. `public/sitemap.xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://sync-multi-cam.pages.dev/</loc>
    <lastmod>2026-03-29</lastmod>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
```

A single-URL sitemap. Update `<lastmod>` when deploying content changes. `<changefreq>` and `<priority>` are advisory hints to crawlers (Google says it largely ignores them, but they cost nothing to include).

### 4. `public/og-image.png`

| Property | Value | Rationale |
|----------|-------|-----------|
| Dimensions | 1200 x 630 px | Universal standard. Works on Facebook, LinkedIn, Twitter/X, Discord, Slack, iMessage. |
| Format | PNG | Sharp text and UI elements render better in PNG than JPEG. |
| File size | Under 300 KB | Faster loading. Max allowed is 5 MB (Twitter) / 8 MB (Facebook), but smaller is better. |
| Safe zone | 60-80 px padding on all sides | Platforms crop differently. Keep text/logos away from edges. |
| Content | App name + tagline + visual of multi-cam grid | Should communicate what the tool does at a glance. |
| Twitter crop note | Twitter/X uses 2:1 ratio (crops ~15px top and bottom from 1200x630) | Keep critical content in the center 1200x600 area. |

### 5. `public/_headers` Update (CRITICAL)

The existing `_headers` applies `Cross-Origin-Embedder-Policy: require-corp` to ALL paths (`/*`). Social media crawlers are NOT browsers -- they do not negotiate CORP/CORS. The COEP header on the OG image response may cause social crawlers to fail fetching the image, resulting in link previews with no image.

**Update `_headers` to unset COOP/COEP on static SEO assets:**

```
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp

/og-image.png
  ! Cross-Origin-Embedder-Policy
  ! Cross-Origin-Opener-Policy
  Access-Control-Allow-Origin: *

/robots.txt
  ! Cross-Origin-Embedder-Policy
  ! Cross-Origin-Opener-Policy

/sitemap.xml
  ! Cross-Origin-Embedder-Policy
  ! Cross-Origin-Opener-Policy
```

The `!` syntax in Cloudflare Pages `_headers` unsets a previously set header. `Access-Control-Allow-Origin: *` on the OG image allows any origin to fetch it (the image is public by design). COOP/COEP remain on all other paths (HTML, JS, WASM) to preserve SharedArrayBuffer support.

---

## Installation

```bash
# No packages to install.
# All changes are static file edits:
#
#   1. Edit index.html <head> section (add meta tags + JSON-LD)
#   2. Create public/robots.txt (4 lines)
#   3. Create public/sitemap.xml (8 lines)
#   4. Create/place public/og-image.png (design asset, 1200x630px)
#   5. Update public/_headers (unset COOP/COEP on SEO assets)
#   6. Optionally update public/vite.svg -> proper favicon
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Static `index.html` meta tags | `react-helmet-async` | Only if you add client-side routing with multiple "pages" that need different meta per route. For a single-URL app, it adds ~8 KB of JS to manage tags that crawlers already see in static HTML. Provides zero SEO benefit for this use case. |
| Static `index.html` meta tags | `vite-plugin-html` / `vite-plugin-meta-tags` | Only if you need environment-variable injection into meta tags at build time (e.g., different OG URLs for staging vs. production). Not needed when the canonical URL is fixed. |
| Static `index.html` meta tags | `vite-plugin-react-meta-map` | Only if you have multiple HTML entry points. This app has one page. |
| Hand-written JSON-LD | `schema-dts` (TypeScript types for Schema.org) | Only if generating complex, dynamic structured data programmatically. A static 15-line JSON block is written once and validated with Google's tool. |
| Static `robots.txt` / `sitemap.xml` | `vite-plugin-sitemap` | Only if you have dynamic routes to enumerate at build time. Single-URL sitemap is 8 lines of XML. |
| Static OG image (designed manually) | `@vercel/og` / dynamic OG image generation | Only if you need per-page dynamic images. This app has one page and one static image. |
| Do nothing (current state) | Full SSR migration (Next.js/Remix) | Never for this app. SharedArrayBuffer requires COOP/COEP headers, which complicate SSR. WASM processing is inherently client-side. SSR adds server cost for zero benefit -- the tool has no server-rendered content. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `react-helmet` (original, deprecated) | Unmaintained. Not safe with React 19 concurrent rendering. Last significant update was years ago. | Static HTML meta tags (no library needed for single page) |
| `react-helmet-async` | Adds runtime JS to dynamically manage `<head>` for what is a static, single-page app. Social crawlers and Googlebot read raw HTML -- they do not execute React. The tags must be in the static HTML regardless, making the library redundant. | Static meta tags in `index.html` |
| `<meta name="keywords">` | Google officially stopped using keywords meta tag in 2009. Bing may treat it as a spam signal. Wastes bytes and signals outdated SEO practices. | Omit entirely. Focus on title, description, and structured data. |
| Any SSR/SSG framework (Next.js, Remix, Astro) | Massive architectural change. SharedArrayBuffer + COOP/COEP headers required for WASM make SSR impractical. Adds server-side compute costs (breaks Cloudflare Pages static hosting). The app's value is 100% client-side processing. | Static meta tags + JSON-LD. Google crawls JS-rendered content (just slower), and the static HTML provides everything crawlers need. |
| `prerender.io` / `react-snap` | Pre-rendering services that generate static HTML snapshots for crawlers. Unnecessary because the `index.html` already IS the static HTML -- there is no dynamic content that needs pre-rendering for SEO. The app content (video sync) is user-generated at runtime, not indexable content. | Direct `index.html` edits |
| `next-seo` | Next.js-specific library. Not compatible with Vite + React. | Static meta tags |
| Vite meta tag generator plugins | Add build-time dependency for tags that never change. Static text does not need a build plugin. Adds fragility (plugin version bumps, breaking changes) for zero benefit. | Hand-written meta tags in `index.html` |
| `llms.txt` | Emerging AI crawling standard, but no major AI platform has confirmed reading it. Unratified community proposal. Not relevant for a tool app (no content library for LLMs to index). | Not applicable -- skip entirely |

---

## Cloudflare Pages Integration

### How Static Files Deploy

Vite's `public/` directory is copied to `dist/` root as-is during build. Cloudflare Pages serves everything in `dist/`. This means:

- `public/robots.txt` -> `dist/robots.txt` -> `https://sync-multi-cam.pages.dev/robots.txt`
- `public/sitemap.xml` -> `dist/sitemap.xml` -> `https://sync-multi-cam.pages.dev/sitemap.xml`
- `public/og-image.png` -> `dist/og-image.png` -> `https://sync-multi-cam.pages.dev/og-image.png`
- `public/_headers` -> `dist/_headers` (Cloudflare reads this for header rules)

### Configuration Changes

| Config File | Change Needed | Why |
|-------------|---------------|-----|
| `vite.config.ts` | None | Static files in `public/` are handled by default Vite behavior |
| `package.json` | None | No new dependencies. Build/deploy scripts unchanged. |
| `public/_headers` | **YES** -- unset COOP/COEP on SEO asset paths | Social crawlers cannot negotiate CORP/CORS. COEP `require-corp` on OG image may block crawlers from fetching it. See `_headers` update section above. |
| Deploy command | None | `npm run build && npx wrangler pages deploy dist` still works |

### OG Image Absolute URL Requirement

The `og:image` tag MUST use an absolute URL with protocol:
```html
<!-- CORRECT -->
<meta property="og:image" content="https://sync-multi-cam.pages.dev/og-image.png" />

<!-- WRONG - will not work for social crawlers -->
<meta property="og:image" content="/og-image.png" />
```

This is per the Open Graph protocol specification. Relative URLs are not resolved by social media crawlers.

---

## Version Compatibility

No new packages means no compatibility concerns:

| Existing Package | Impact | Notes |
|------------------|--------|-------|
| Vite ^7.3.1 | None | `public/` directory copy behavior unchanged since Vite 2.x |
| React ^19.2.0 | None | No React-level SEO library added |
| TypeScript ~5.9.3 | None | No type definitions needed |
| Cloudflare Pages | None | Static files deploy alongside `_headers` with no special config |
| `@tailwindcss/vite` ^4.2.1 | None | CSS processing unaffected |

---

## Summary: Total Scope of Changes

| Change | Type | Lines (est.) |
|--------|------|-------------|
| `index.html` `<head>` additions | Edit existing file | ~30 lines added |
| `public/robots.txt` | New static file | 4 lines |
| `public/sitemap.xml` | New static file | 8 lines |
| `public/og-image.png` | New design asset | 1 file (1200x630px) |
| `public/_headers` update | Edit existing file | ~12 lines added (path-specific COOP/COEP unset) |
| Favicon update (optional) | Replace `public/vite.svg` | 1 file |

**Total: ~54 lines of code/config + 1-2 image assets. Zero new npm dependencies.**

---

## Sources

### HIGH Confidence (official specifications and documentation)

- [Open Graph Protocol (ogp.me)](https://ogp.me/) -- Required OG tags: `og:title`, `og:type`, `og:image`, `og:url`. `og:type: website` needs no additional properties.
- [Google SoftwareApplication Structured Data](https://developers.google.com/search/docs/appearance/structured-data/software-app) -- Required JSON-LD properties: `name`, `offers.price`, and `aggregateRating` or `review`. Google supports `WebApplication` type.
- [Schema.org WebApplication](https://schema.org/WebApplication) -- Subtype of SoftwareApplication. Unique property: `browserRequirements` (Text).
- [Twitter/X Cards Markup Docs](https://developer.twitter.com/en/docs/twitter-for-websites/cards/overview/markup) -- `twitter:card` is the only required tag. Falls back to OG tags for title/description/image.
- [Vite Static Asset Handling](https://vite.dev/guide/assets) -- `public/` directory contents copied to `dist/` root as-is during build. Default behavior, no config needed.
- [Cloudflare Pages Headers](https://developers.cloudflare.com/pages/configuration/headers/) -- Path-specific header rules, `!` unset syntax for removing inherited headers.

### MEDIUM Confidence (community sources, cross-verified)

- [OG Image Dimensions Guide (og-image.org)](https://og-image.org/learn/og-image-size) -- 1200x630px universal standard. Twitter crops to 2:1.
- [Cloudflare Pages robots.txt Community Thread](https://community.cloudflare.com/t/robots-txt-cloudflare-page/636861) -- Confirmed: files in `public/` deploy and serve correctly on Cloudflare Pages.
- [DEV Community: SEO for React + Vite](https://dev.to/ali_dz/optimizing-seo-in-a-react-vite-project-the-ultimate-guide-3mbh) -- General best practices for SPA SEO. Confirms static HTML approach.
- [DigitalOcean: Twitter Card and Open Graph](https://www.digitalocean.com/community/tutorials/how-to-add-twitter-card-and-open-graph-social-metadata-to-your-webpage-with-html) -- Practical implementation guide for OG + Twitter meta tags.
- [Google: Keywords meta tag not used since 2009](https://developers.google.com/search/blog/2009/09/google-does-not-use-keywords-meta-tag) -- Official confirmation.

---
*Stack research for: v2.4 SEO milestone (meta tags, Open Graph, structured data, sitemap, robots.txt)*
*Researched: 2026-03-29*
