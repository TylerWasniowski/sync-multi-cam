# Phase 17: Search Discoverability & Social Sharing - Research

**Researched:** 2026-03-29
**Domain:** SEO meta tags, Open Graph, Twitter Cards, Schema.org JSON-LD, crawler infrastructure for a single-URL Vite+React SPA on Cloudflare Pages
**Confidence:** HIGH

## Summary

Phase 17 adds search engine discoverability and social sharing to an existing single-page application. The entire scope is static file edits: modifying `index.html` and `public/_headers`, plus creating new static assets in `public/` (robots.txt, sitemap.xml, og-image.png, favicon files). There are zero new npm dependencies, zero runtime code changes, and zero build pipeline modifications.

The key architectural insight is that this app has one URL, one page, and no client-side routing. This eliminates the entire class of SPA-SEO complexity (react-helmet, prerendering, SSR). Hardcoding all meta tags directly in `index.html` is the correct and only reliable approach -- social crawlers (Facebook, Twitter/X, LinkedIn, Discord, Slack) do NOT execute JavaScript and will see only what is in the static HTML.

The primary project-specific risk is the existing `_headers` file applying `Cross-Origin-Embedder-Policy: require-corp` to all paths. Social media crawlers cannot negotiate CORP/CORS, so they may silently fail to fetch the OG image. The mitigation uses Cloudflare Pages `!` unset syntax to remove COEP/COOP on specific SEO asset paths while preserving SharedArrayBuffer support on the app itself.

**Primary recommendation:** Edit `index.html` with all meta/OG/Twitter/JSON-LD tags, create static assets in `public/`, and update `_headers` with path-specific COEP/COOP unset rules -- all in a single deployment.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Title tag: craft SEO-optimized copy under 60 characters. Should include "Sync Multi-Cam" brand name and key value prop (free, browser-based, multi-camera video sync).
- **D-02:** Meta description: 150-160 characters emphasizing free, no-install, browser-based, multi-cam sync + preview + export. Include differentiators (client-side, no signup).
- **D-03:** Drop `<meta name="keywords">` entirely -- Google ignores since 2009.
- **D-04:** Create a simple 1200x630px placeholder PNG at `public/og-image.png`. Use the app's dark theme colors with "Sync Multi-Cam" text and a brief tagline.
- **D-05:** User will replace with a polished design asset later. Document the path and dimensions in commit message.
- **D-06:** og:image URL must be absolute HTTPS: `https://sync-multi-cam.pages.dev/og-image.png`
- **D-07:** Create a simple SVG favicon representing multi-camera/grid concept in the app's dark color scheme.
- **D-08:** Generate .ico (16x16, 32x32) and apple-touch-icon.png (180x180) from the SVG.
- **D-09:** Remove vite.svg reference from index.html, replace with new favicon references.
- **D-10:** Use Cloudflare Pages path-specific `_headers` rules to unset COOP/COEP on SEO asset paths.
- **D-11:** Unset headers for: `/og-image.png`, `/robots.txt`, `/sitemap.xml`, `/favicon.ico`, `/apple-touch-icon.png`, `/favicon.svg`
- **D-12:** Keep COOP/COEP on `/*` as the default -- only punch holes for static assets that crawlers/social platforms need to fetch.
- **D-13:** Use `WebApplication` (not generic `SoftwareApplication`) as the `@type`.
- **D-14:** Include `applicationCategory: "MultimediaApplication"`, `operatingSystem: "Any"`, `browserRequirements: "Modern browser with WebAssembly and SharedArrayBuffer support"`.
- **D-15:** Include `offers` with `price: "0"` and `isAccessibleForFree: true`. Omit `aggregateRating`.
- **D-16:** Canonical URL is `https://sync-multi-cam.pages.dev/`.
- **D-17:** sitemap.xml URL entry must exactly match the canonical URL.

### Claude's Discretion
- Exact wording of title and description (within the constraints above)
- Favicon visual design details
- Placeholder OG image visual design
- theme-color hex value (should match app's dark background)
- Ordering of meta tags in `<head>`

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| META-01 | Page has descriptive `<title>` replacing the "sync-multi-cam" slug (under 60 chars) | Static HTML edit in index.html; D-01 specifies constraints |
| META-02 | Page has `<meta name="description">` with 150-160 char value prop | Static HTML edit in index.html; D-02 specifies constraints |
| META-03 | Page has `<link rel="canonical">` pointing to production URL | Static HTML edit; D-16 locks URL to `https://sync-multi-cam.pages.dev/` |
| META-04 | Page has `<meta name="theme-color">` matching the dark app theme | Static HTML edit; app uses Tailwind `bg-gray-950` = `#030712` |
| SOCIAL-01 | Page has Open Graph tags (og:title, og:description, og:type, og:url, og:image) in static HTML | Static HTML; D-06 locks og:image to absolute HTTPS URL |
| SOCIAL-02 | Page has `twitter:card` meta tag set to `summary_large_image` | Static HTML; Twitter falls back to OG for other fields |
| SOCIAL-03 | OG preview image placeholder (1200x630px) exists at known public path with absolute HTTPS URL | D-04/D-05 specify dimensions, path, and placeholder strategy |
| SCHEMA-01 | Page has Schema.org WebApplication JSON-LD with required properties | D-13/D-14/D-15 lock type, category, and offers structure |
| CRAWL-01 | `robots.txt` exists at site root allowing all crawlers and referencing sitemap | Static file in `public/`; Vite copies to dist root; Cloudflare serves before SPA fallback |
| CRAWL-02 | `sitemap.xml` exists at site root with single URL entry matching canonical | Static file in `public/`; D-17 locks URL to match canonical |
| CRAWL-03 | `_headers` file updated to unset COOP/COEP on static SEO assets | D-10/D-11/D-12 lock the strategy; `!` unset syntax verified in Cloudflare docs |
| BRAND-01 | App-specific favicon replaces Vite default (.ico, SVG, and apple-touch-icon.png) | D-07/D-08/D-09 specify favicon strategy; replace `public/vite.svg` |
</phase_requirements>

## Standard Stack

### Core
| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| Static HTML meta tags | N/A | All SEO, OG, Twitter Card tags | Social crawlers do NOT execute JS; hardcoded HTML is the only reliable approach for single-URL SPAs |
| Inline JSON-LD | N/A | Schema.org WebApplication structured data | Google's recommended format; static JSON in `<head>` |
| `public/robots.txt` | N/A | Crawler directives + sitemap reference | Vite copies to dist root; Cloudflare serves before SPA fallback |
| `public/sitemap.xml` | N/A | Single-URL sitemap for search engines | 8-line static XML; no generator needed for one URL |
| `public/_headers` (Cloudflare Pages) | N/A | Path-specific COOP/COEP unset rules | `!` unset syntax verified in official Cloudflare docs |

### Supporting
None. Zero new npm dependencies.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hardcoded HTML | react-helmet-async | Adds dependency; invisible to social crawlers; React 19 compatibility issues; solves non-existent problem for single-URL app |
| Hardcoded HTML | vite-plugin-html | Moves static strings to vite.config.ts; adds build dependency; zero benefit for single-page app |
| Handwritten sitemap | vite-plugin-sitemap | Over-engineered for one URL; adds build dependency for 8-line file |
| No SSR | Next.js/Astro SSR | Fundamental architecture change; COOP/COEP makes SSR impractical; app value is 100% client-side |

**Installation:**
```bash
# No packages to install. Zero new dependencies.
```

## Architecture Patterns

### Recommended Project Structure (Changes Only)
```
index.html              # MODIFIED -- full <head> with meta tags, OG, Twitter Card, JSON-LD, favicon refs
public/
  _headers              # MODIFIED -- add path-specific COOP/COEP unset rules for SEO assets
  robots.txt            # NEW -- 4-line crawler directives
  sitemap.xml           # NEW -- 8-line single-URL sitemap
  og-image.png          # NEW -- 1200x630px placeholder social preview image
  favicon.svg           # NEW -- app-specific SVG favicon (replaces vite.svg)
  favicon.ico           # NEW -- 16x16 + 32x32 multi-size ICO
  apple-touch-icon.png  # NEW -- 180x180px Apple touch icon
```

No new source files in `src/`. No build pipeline changes.

### Pattern 1: Static HTML Meta Tags for Single-URL SPA
**What:** All SEO meta tags hardcoded directly in `index.html` `<head>`.
**When to use:** Single-page apps with one URL where meta tag content is known at development time.
**Example:**
```html
<!-- Source: Open Graph Protocol (ogp.me) + Google SEO docs -->
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />

  <!-- Primary Meta Tags -->
  <title>Sync Multi-Cam -- Free Multi-Camera Video Sync</title>
  <meta name="description" content="Sync multiple camera angles by audio in your browser. Preview in a grid, export a composite MP4. Free, private, no install -- runs 100% client-side." />
  <meta name="theme-color" content="#030712" />

  <!-- Canonical URL -->
  <link rel="canonical" href="https://sync-multi-cam.pages.dev/" />

  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://sync-multi-cam.pages.dev/" />
  <meta property="og:title" content="Sync Multi-Cam -- Free Multi-Camera Video Sync" />
  <meta property="og:description" content="Synchronize multiple camera angles by audio in your browser. Preview in a grid, export a composite MP4. Free, private, no install." />
  <meta property="og:image" content="https://sync-multi-cam.pages.dev/og-image.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Sync Multi-Cam -- Free Multi-Camera Video Sync" />
  <meta name="twitter:description" content="Sync multiple camera angles by audio in your browser. Free, private, no install." />
  <meta name="twitter:image" content="https://sync-multi-cam.pages.dev/og-image.png" />

  <!-- Favicon -->
  <link rel="icon" href="/favicon.ico" sizes="32x32" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

  <!-- Structured Data -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "Sync Multi-Cam",
    "description": "Browser-based tool that synchronizes multiple video files by analyzing their audio tracks. Preview all angles in a synced grid player and export a single composited MP4.",
    "url": "https://sync-multi-cam.pages.dev/",
    "applicationCategory": "MultimediaApplication",
    "operatingSystem": "Any",
    "browserRequirements": "Modern browser with WebAssembly and SharedArrayBuffer support",
    "isAccessibleForFree": true,
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD"
    },
    "featureList": [
      "Audio cross-correlation sync for multiple cameras",
      "GPU-accelerated composite MP4 export",
      "Synced multi-angle grid preview",
      "100% client-side processing, no uploads"
    ]
  }
  </script>
</head>
```

### Pattern 2: Cloudflare Pages _headers with Path-Specific Unset
**What:** Use the `!` prefix syntax to remove inherited COOP/COEP headers on specific static asset paths.
**When to use:** When global security headers (needed for SharedArrayBuffer) must NOT apply to files fetched by social crawlers.
**Example:**
```
# Source: Cloudflare Pages Headers docs
# https://developers.cloudflare.com/pages/configuration/headers/

/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp

/og-image.png
  ! Cross-Origin-Opener-Policy
  ! Cross-Origin-Embedder-Policy
  Access-Control-Allow-Origin: *

/robots.txt
  ! Cross-Origin-Opener-Policy
  ! Cross-Origin-Embedder-Policy

/sitemap.xml
  ! Cross-Origin-Opener-Policy
  ! Cross-Origin-Embedder-Policy

/favicon.ico
  ! Cross-Origin-Opener-Policy
  ! Cross-Origin-Embedder-Policy

/apple-touch-icon.png
  ! Cross-Origin-Opener-Policy
  ! Cross-Origin-Embedder-Policy

/favicon.svg
  ! Cross-Origin-Opener-Policy
  ! Cross-Origin-Embedder-Policy
```

### Pattern 3: Static Files in Vite public/ Directory
**What:** Place `robots.txt`, `sitemap.xml`, and image assets in `public/`. Vite copies them unchanged to `dist/` during build. Cloudflare Pages serves known static files before SPA fallback.
**When to use:** Any static file that must be accessible at a fixed root URL path.
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

### Anti-Patterns to Avoid
- **react-helmet-async for a single-URL SPA:** Adds runtime dependency; social crawlers never execute JS so tags are invisible. React 19 compatibility issues documented.
- **Vite plugin for meta tag injection:** Moves static strings from `index.html` to build config for zero benefit.
- **Client-side JSON-LD via React:** Unnecessary for static data on a single page.
- **Relative og:image URL:** OG scraping has no browser context; `/og-image.png` silently fails on all social platforms.
- **Fabricated aggregateRating:** Violates Google quality guidelines; risks manual action penalty that takes months to lift.
- **Removing COOP/COEP globally:** Breaks SharedArrayBuffer and the entire FFmpeg WASM pipeline. Only unset on specific static asset paths.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Meta tag management | React component for meta tags | Hardcoded HTML in `index.html` | Single URL = single set of static tags. Libraries add complexity that solves nothing. |
| Sitemap generation | Build plugin or script | 8-line static XML file | One URL. A generator is absurd overkill. |
| OG image generation | Dynamic image service | Static 1200x630px PNG | One page, one image. Services add cost and latency. |
| Favicon generation pipeline | Complex SVG-to-ICO toolchain | Simple manual conversion or one-time script | Done once at build time, not per-deploy. |
| Structured data validation | Custom JSON-LD validator | Google Rich Results Test (online tool) | Google's own validator is the authoritative source. |

**Key insight:** Every "solution" for SPA SEO assumes multiple routes/pages. This app has one URL. The correct implementation is the simplest: edit two files, create five static assets. No libraries, no plugins, no services.

## Common Pitfalls

### Pitfall 1: Social Crawlers Cannot See Client-Side Meta Tags
**What goes wrong:** Facebook, Twitter/X, LinkedIn, Slack, Discord crawlers do NOT execute JavaScript. They fetch raw HTML and parse it. React-rendered meta tags are invisible.
**Why it happens:** Developers test in a browser (where JS runs), see meta tags in DevTools, and assume crawlers see them too.
**How to avoid:** All meta tags go directly in `index.html` as static HTML. No react-helmet.
**Warning signs:** Facebook Sharing Debugger shows missing OG properties; Twitter Card Validator shows "No card found."

### Pitfall 2: COOP/COEP Headers Block OG Image Fetching
**What goes wrong:** The `_headers` file applies `Cross-Origin-Embedder-Policy: require-corp` to `/*`, including the OG image. Social crawlers cannot negotiate CORP/CORS. Image fetch silently fails, producing previews with no image.
**Why it happens:** The `/*` rule was correct when only the app existed. Now static assets also get these headers.
**How to avoid:** Use Cloudflare Pages `!` syntax to unset COEP/COOP on SEO asset paths. Add `Access-Control-Allow-Origin: *` on the OG image specifically. Ship `_headers` update in the same deployment as OG tags.
**Warning signs:** Facebook Debugger shows "Could not fetch image"; `curl -I` on the image URL shows COEP header present.

### Pitfall 3: og:image Uses Relative URL
**What goes wrong:** Using `/og-image.png` instead of `https://sync-multi-cam.pages.dev/og-image.png` causes every social platform to fail to resolve and fetch the image.
**Why it happens:** Developers use relative paths for all other HTML assets. OG scraping has no browser context and no base URL.
**How to avoid:** Always use full absolute HTTPS URL for `og:image`, `og:url`, `twitter:image`, and canonical.
**Warning signs:** Facebook Debugger shows "Provided og:image URL was not valid."

### Pitfall 4: robots.txt Accidentally Blocks JS/CSS Assets
**What goes wrong:** Overly broad `Disallow` rules block Googlebot from fetching JS/CSS bundles needed to render the page.
**Why it happens:** Copying robots.txt templates with `Disallow: /assets/` patterns. Vite outputs JS/CSS to `/assets/` by default.
**How to avoid:** Keep robots.txt minimal: `User-agent: * / Allow: / / Sitemap: ...`. Do NOT disallow `/assets/`.
**Warning signs:** Google Search Console shows "Page could not be rendered."

### Pitfall 5: Schema.org Without Required Properties for Rich Results
**What goes wrong:** JSON-LD is valid but Google silently ignores it -- no rich result appears.
**Why it happens:** Google requires `aggregateRating` OR `review` for the star rating rich result panel. This app has no reviews.
**How to avoid:** Include honest properties only (`name`, `offers` with `price: "0"`, `applicationCategory`, `browserRequirements`). Do NOT fabricate ratings. Accept that rich results won't trigger star ratings, but the structured data still helps Google understand the page.
**Warning signs:** Rich Results Test shows "no eligible results" -- this is expected and acceptable.

### Pitfall 6: Stale Facebook/Social Cache After OG Changes
**What goes wrong:** After deploying updated OG tags, social platforms still show old previews because they cache aggressively.
**Why it happens:** Facebook caches OG data for hours to days. LinkedIn, Slack, Discord all have independent caches.
**How to avoid:** After deployment, use Facebook Sharing Debugger "Scrape Again", LinkedIn Post Inspector, etc. Purge Cloudflare cache if needed.
**Warning signs:** Old preview shows despite correct tags in source.

## Code Examples

Verified patterns from official sources:

### Complete index.html Head Section
See Pattern 1 above -- the full `<head>` section with all required tags is provided as a single cohesive example.

### Cloudflare Pages _headers with COEP/COOP Unset
See Pattern 2 above -- the complete `_headers` file with path-specific unset rules.

### robots.txt and sitemap.xml
See Pattern 3 above -- minimal static files.

### Favicon HTML References
```html
<!-- Source: MDN favicon best practices -->
<!-- Order: .ico for legacy, .svg for modern, apple-touch-icon for iOS -->
<link rel="icon" href="/favicon.ico" sizes="32x32" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
```

### JSON-LD Validation Command (Post-Deploy)
```bash
# Verify JSON-LD is valid and parseable
curl -s https://sync-multi-cam.pages.dev/ | grep -o '<script type="application/ld+json">.*</script>' | head -1

# Verify COEP/COOP headers are absent on OG image
curl -I https://sync-multi-cam.pages.dev/og-image.png 2>&1 | grep -i "cross-origin"

# Verify robots.txt returns 200 (not SPA fallback)
curl -s -o /dev/null -w "%{http_code}" https://sync-multi-cam.pages.dev/robots.txt
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `<meta name="keywords">` | Drop entirely | Google ignored since 2009 | No SEO value; may signal outdated practices |
| react-helmet for SPAs | Static HTML for single-URL apps | Always true for single-route | Eliminates dependency; guarantees crawler visibility |
| Generic `SoftwareApplication` | `WebApplication` subtype | Schema.org always supported both | More specific; distinguishes browser tools from downloadable apps |

**Deprecated/outdated:**
- `<meta name="keywords">`: Google ignores since 2009 (confirmed by official Google blog post)
- `react-helmet` (original): Unmaintained; `react-helmet-async` has React 19 compatibility issues

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.x (configured in vite.config.ts) |
| Config file | vite.config.ts `test` block |
| Quick run command | `npx vitest run tests/seo-validation.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| META-01 | `<title>` tag exists, under 60 chars, contains "Sync Multi-Cam" | unit (HTML parse) | `npx vitest run src/__tests__/seo.test.ts -t "title"` | Wave 0 |
| META-02 | `<meta name="description">` exists, 150-160 chars | unit (HTML parse) | `npx vitest run src/__tests__/seo.test.ts -t "description"` | Wave 0 |
| META-03 | `<link rel="canonical">` matches production URL | unit (HTML parse) | `npx vitest run src/__tests__/seo.test.ts -t "canonical"` | Wave 0 |
| META-04 | `<meta name="theme-color">` present | unit (HTML parse) | `npx vitest run src/__tests__/seo.test.ts -t "theme-color"` | Wave 0 |
| SOCIAL-01 | All 5 OG tags present with correct values | unit (HTML parse) | `npx vitest run src/__tests__/seo.test.ts -t "open graph"` | Wave 0 |
| SOCIAL-02 | `twitter:card` = `summary_large_image` | unit (HTML parse) | `npx vitest run src/__tests__/seo.test.ts -t "twitter"` | Wave 0 |
| SOCIAL-03 | og-image.png exists at public path, is 1200x630 | unit (file check) | `npx vitest run src/__tests__/seo.test.ts -t "og image"` | Wave 0 |
| SCHEMA-01 | Valid JSON-LD with WebApplication type and required fields | unit (JSON parse) | `npx vitest run src/__tests__/seo.test.ts -t "json-ld"` | Wave 0 |
| CRAWL-01 | robots.txt exists, allows all, references sitemap | unit (file check) | `npx vitest run src/__tests__/seo.test.ts -t "robots"` | Wave 0 |
| CRAWL-02 | sitemap.xml exists, valid XML, URL matches canonical | unit (file check) | `npx vitest run src/__tests__/seo.test.ts -t "sitemap"` | Wave 0 |
| CRAWL-03 | _headers has COEP/COOP unset for SEO asset paths | unit (file check) | `npx vitest run src/__tests__/seo.test.ts -t "headers"` | Wave 0 |
| BRAND-01 | favicon.svg, favicon.ico, apple-touch-icon.png exist; no vite.svg ref in HTML | unit (file check) | `npx vitest run src/__tests__/seo.test.ts -t "favicon"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run src/__tests__/seo.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/__tests__/seo.test.ts` -- covers all 12 requirements via HTML/file parsing
- [ ] Test reads `index.html` and `public/` files directly as text, parses with regex or simple string matching (no DOM library needed for static HTML validation)

### Test Strategy Notes

All tests for this phase are **static file validation** -- they read `index.html` and `public/` files as text and verify content. No browser, no network, no rendering required. This is the simplest possible test type.

Example test approach:
```typescript
import { readFileSync, existsSync } from 'fs';
import { describe, it, expect } from 'vitest';

describe('SEO meta tags', () => {
  const html = readFileSync('index.html', 'utf-8');

  it('has descriptive title under 60 chars', () => {
    const match = html.match(/<title>(.*?)<\/title>/);
    expect(match).toBeTruthy();
    expect(match![1].length).toBeLessThanOrEqual(60);
    expect(match![1]).toContain('Sync Multi-Cam');
    expect(match![1]).not.toBe('sync-multi-cam'); // not the slug
  });

  it('has meta description 150-160 chars', () => {
    const match = html.match(/<meta name="description" content="(.*?)"/);
    expect(match).toBeTruthy();
    expect(match![1].length).toBeGreaterThanOrEqual(150);
    expect(match![1].length).toBeLessThanOrEqual(160);
  });

  it('has canonical URL pointing to production', () => {
    expect(html).toContain('<link rel="canonical" href="https://sync-multi-cam.pages.dev/"');
  });

  it('has all required OG tags with absolute HTTPS URLs', () => {
    expect(html).toMatch(/property="og:title"/);
    expect(html).toMatch(/property="og:description"/);
    expect(html).toMatch(/property="og:type" content="website"/);
    expect(html).toMatch(/property="og:url" content="https:\/\/sync-multi-cam\.pages\.dev\/"/);
    expect(html).toMatch(/property="og:image" content="https:\/\/sync-multi-cam\.pages\.dev\/og-image\.png"/);
  });

  it('has valid JSON-LD with WebApplication type', () => {
    const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    expect(jsonLdMatch).toBeTruthy();
    const jsonLd = JSON.parse(jsonLdMatch![1]);
    expect(jsonLd['@type']).toBe('WebApplication');
    expect(jsonLd.name).toBeTruthy();
    expect(jsonLd.offers.price).toBe('0');
  });
});

describe('Static SEO assets', () => {
  it('robots.txt exists and references sitemap', () => {
    const content = readFileSync('public/robots.txt', 'utf-8');
    expect(content).toContain('Sitemap: https://sync-multi-cam.pages.dev/sitemap.xml');
  });

  it('sitemap.xml exists with canonical URL', () => {
    const content = readFileSync('public/sitemap.xml', 'utf-8');
    expect(content).toContain('<loc>https://sync-multi-cam.pages.dev/</loc>');
  });

  it('favicon files exist', () => {
    expect(existsSync('public/favicon.svg')).toBe(true);
    expect(existsSync('public/favicon.ico')).toBe(true);
    expect(existsSync('public/apple-touch-icon.png')).toBe(true);
  });

  it('og-image.png exists', () => {
    expect(existsSync('public/og-image.png')).toBe(true);
  });

  it('_headers has COEP/COOP unset for og-image', () => {
    const content = readFileSync('public/_headers', 'utf-8');
    expect(content).toContain('/og-image.png');
    expect(content).toContain('! Cross-Origin-Embedder-Policy');
  });

  it('index.html does not reference vite.svg', () => {
    const html = readFileSync('index.html', 'utf-8');
    expect(html).not.toContain('vite.svg');
  });
});
```

## Open Questions

1. **OG image placeholder design**
   - What we know: Must be 1200x630px PNG, under 300KB, dark theme colors (`#030712` background), "Sync Multi-Cam" text, brief tagline.
   - What's unclear: Exact visual design (grid icon? screenshot mockup? abstract pattern?). This is Claude's discretion per CONTEXT.md.
   - Recommendation: Create a minimal programmatic design with text on dark background. User will replace with a polished version later (D-05).

2. **Favicon .ico generation in Node.js environment**
   - What we know: Need to convert SVG to .ico (16x16, 32x32) and .png (180x180).
   - What's unclear: Best approach without external tools. Node.js canvas libraries can do this but add dev dependencies.
   - Recommendation: Create the SVG first. Use a simple inline script or manual conversion. The .ico can be generated as a one-time build step using any available tool. Alternatively, use a minimal PNG-to-ICO approach.

3. **theme-color value**
   - What we know: App uses Tailwind `bg-gray-950`. In Tailwind v4, this is defined in OKLCH; hex equivalent is `#030712`.
   - What's unclear: Whether OKLCH or hex should be used in the meta tag.
   - Recommendation: Use `#030712` (hex). Meta tags use hex universally; OKLCH is not supported in `<meta name="theme-color">`.

## Environment Availability

> This phase is purely code/config changes with static file creation. No external tools, services, or runtimes beyond the existing Vite build pipeline are required.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Vite | Build pipeline (copies public/ to dist/) | Yes | 7.3.1 | -- |
| Vitest | Test validation | Yes | 4.0.18 | -- |
| Node.js fs | Test reads static files | Yes | Built-in | -- |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

## Key Technical Details

### Current index.html State
The existing `index.html` is minimal (13 lines):
- `<meta charset="UTF-8" />`
- `<link rel="icon" type="image/svg+xml" href="/vite.svg" />` -- must be replaced
- `<meta name="viewport" content="width=device-width, initial-scale=1.0" />`
- `<title>sync-multi-cam</title>` -- must be replaced
- `<html lang="en">` -- already correct, preserve it

### Current _headers State
Only global COOP/COEP rules (3 lines):
```
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
```
Must be extended with path-specific unset rules. The `/*` block must remain first.

### Current public/ Directory
Contains only `_headers` and `vite.svg`. All other files (robots.txt, sitemap.xml, og-image.png, favicon files) are new.

### Cloudflare Pages Behavior
- Files in `public/` deploy to `dist/` root and are served as static files BEFORE SPA fallback
- No `_routes.json` needed -- this is the default behavior
- `_headers` file supports path-specific rules with `!` unset syntax (verified in official docs)
- More specific path rules override less specific ones

### Theme Color
- App background: Tailwind `bg-gray-950` = `#030712` (very dark blue-gray, almost black)
- This should be used for `<meta name="theme-color">`

### Google Rich Results Eligibility
- `WebApplication` JSON-LD will be valid structured data
- WITHOUT `aggregateRating` or `review`, Google will NOT show the star rating rich result panel
- This is the correct, honest approach -- fabricating ratings risks Google manual action penalty
- The structured data still helps Google understand what the page is (application category, pricing, requirements)

## Sources

### Primary (HIGH confidence)
- [Cloudflare Pages Headers docs](https://developers.cloudflare.com/pages/configuration/headers/) -- `!` unset syntax, path-specific rules, verified 2026-03-29
- [Open Graph Protocol](https://ogp.me/) -- required OG tags, absolute URL requirement
- [Google: SoftwareApplication Structured Data](https://developers.google.com/search/docs/appearance/structured-data/software-app) -- required properties: name, offers.price, aggregateRating OR review
- [Google: Keywords meta tag not used](https://developers.google.com/search/blog/2009/09/google-does-not-use-keywords-meta-tag) -- official deprecation (2009)
- [Twitter/X Cards Markup](https://developer.twitter.com/en/docs/twitter-for-websites/cards/overview/markup) -- twitter:card requirement, OG fallback
- [Schema.org WebApplication](https://schema.org/WebApplication) -- type definition, browserRequirements property
- [Tailwind CSS Colors](https://tailwindcss.com/docs/colors) -- gray-950 OKLCH definition; hex `#030712` verified via community tools

### Secondary (MEDIUM confidence)
- [Cloudflare Community: robots.txt on Pages](https://community.cloudflare.com/t/robots-txt-cloudflare-page/636861) -- confirmed static files serve before SPA fallback
- [LandingGo: Gray-950 Tailwind Color (#030712)](https://landinggo.com/tailwind-colors/gray-950) -- hex conversion for Tailwind v4 OKLCH gray-950

### Prior Project Research (HIGH confidence -- same project, same day)
- `.planning/research/FEATURES.md` -- feature landscape, anti-features, competitor analysis
- `.planning/research/ARCHITECTURE.md` -- integration approach, static file serving, build pipeline
- `.planning/research/PITFALLS.md` -- COOP/COEP crawler interaction, og:image absolute URL, recovery strategies
- `.planning/research/SUMMARY.md` -- executive summary, confidence assessment, roadmap implications

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- zero-dependency approach verified against Vite docs, Cloudflare Pages docs, and Google's SEO guidance. No libraries to go stale.
- Architecture: HIGH -- single-URL SPA with static HTML is the simplest and most reliable pattern. Cloudflare Pages static serving verified.
- Pitfalls: HIGH -- COOP/COEP interaction is the critical project-specific finding, verified against MDN and Cloudflare docs. Social crawler JS non-execution verified against Twitter/Facebook official docs.

**Research date:** 2026-03-29
**Valid until:** 2026-04-29 (stable domain -- SEO standards, Cloudflare Pages features, and HTML meta tag specs change slowly)
