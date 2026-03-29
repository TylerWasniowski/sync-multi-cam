# Phase 17: Search Discoverability & Social Sharing - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Add all SEO meta tags, Open Graph/Twitter Card social sharing tags, Schema.org WebApplication JSON-LD structured data, crawler infrastructure files (robots.txt, sitemap.xml), and branded favicon assets to the static HTML and public directory. No runtime code changes, no UI changes, no new npm dependencies. Everything is static file edits.

</domain>

<decisions>
## Implementation Decisions

### Page Title & Description Copy
- **D-01:** Title tag: craft SEO-optimized copy under 60 characters. Should include "Sync Multi-Cam" brand name and key value prop (free, browser-based, multi-camera video sync).
- **D-02:** Meta description: 150-160 characters emphasizing free, no-install, browser-based, multi-cam sync + preview + export. Include differentiators (client-side, no signup).
- **D-03:** Drop `<meta name="keywords">` entirely — Google ignores since 2009.

### OG Image Strategy
- **D-04:** Create a simple 1200x630px placeholder PNG at `public/og-image.png`. Use the app's dark theme colors with "Sync Multi-Cam" text and a brief tagline.
- **D-05:** User will replace with a polished design asset later. Document the path and dimensions in commit message.
- **D-06:** og:image URL must be absolute HTTPS: `https://sync-multi-cam.pages.dev/og-image.png`

### Favicon Design
- **D-07:** Create a simple SVG favicon representing multi-camera/grid concept in the app's dark color scheme.
- **D-08:** Generate .ico (16x16, 32x32) and apple-touch-icon.png (180x180) from the SVG.
- **D-09:** Remove vite.svg reference from index.html, replace with new favicon references.

### COOP/COEP Header Strategy
- **D-10:** Use Cloudflare Pages path-specific `_headers` rules to unset COOP/COEP on SEO asset paths.
- **D-11:** Unset headers for: `/og-image.png`, `/robots.txt`, `/sitemap.xml`, `/favicon.ico`, `/apple-touch-icon.png`, `/favicon.svg`
- **D-12:** Keep COOP/COEP on `/*` as the default — only punch holes for static assets that crawlers/social platforms need to fetch.

### Structured Data
- **D-13:** Use `WebApplication` (not generic `SoftwareApplication`) as the `@type` — it's the correct Schema.org subtype for browser-based tools.
- **D-14:** Include `applicationCategory: "MultimediaApplication"`, `operatingSystem: "Any"`, `browserRequirements: "Modern browser with WebAssembly and SharedArrayBuffer support"`.
- **D-15:** Include `offers` with `price: "0"` and `isAccessibleForFree: true`. Omit `aggregateRating` (no review system — fabricating ratings risks Google penalty).

### Canonical URL
- **D-16:** Canonical URL is `https://sync-multi-cam.pages.dev/` — the current production domain.
- **D-17:** sitemap.xml URL entry must exactly match the canonical URL.

### Claude's Discretion
- Exact wording of title and description (within the constraints above)
- Favicon visual design details
- Placeholder OG image visual design
- theme-color hex value (should match app's dark background)
- Ordering of meta tags in `<head>`

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing files to modify
- `index.html` — Current bare HTML with only charset, viewport, vite.svg favicon, and "sync-multi-cam" title
- `public/_headers` — Current COOP/COEP rules applying to `/*`
- `public/vite.svg` — Current default favicon to be replaced

### Research files (implementation guidance)
- `.planning/research/FEATURES.md` — Feature landscape, anti-features, file changes summary, competitor analysis
- `.planning/research/ARCHITECTURE.md` — Integration approach, static file serving on Cloudflare Pages
- `.planning/research/PITFALLS.md` — COOP/COEP social crawler interaction, og:image absolute URL requirement
- `.planning/research/SUMMARY.md` — Executive summary with key findings and roadmap implications

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — this phase creates new static assets, doesn't modify runtime code

### Established Patterns
- `public/` directory: Vite copies contents to `dist/` root unchanged. Cloudflare Pages serves known static files before SPA fallback.
- `_headers` file: Already uses Cloudflare Pages header syntax with `/*` glob pattern.
- `index.html`: Standard Vite React entry point. All new meta tags go in `<head>`.

### Integration Points
- `index.html` `<head>` section — add meta tags, OG tags, Twitter Card, canonical link, JSON-LD script, favicon references
- `public/` directory — add robots.txt, sitemap.xml, og-image.png, favicon files
- `public/_headers` — extend with path-specific COOP/COEP unset rules

</code_context>

<specifics>
## Specific Ideas

- User will provide final OG image later — set up placeholder with documented path and dimensions
- User is new to SEO — all decisions are Claude's discretion guided by research findings
- Production URL is `https://sync-multi-cam.pages.dev/`

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 17-search-discoverability-social-sharing*
*Context gathered: 2026-03-29*
