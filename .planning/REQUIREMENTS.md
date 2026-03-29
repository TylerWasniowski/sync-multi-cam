# Requirements: Sync Multi-Cam

**Defined:** 2026-03-29
**Core Value:** Accurately sync multiple camera angles by audio so users get aligned video files without installing any software

## v2.4 Requirements

Requirements for SEO milestone. Each maps to roadmap phases.

### Search Engine Meta Tags

- [ ] **META-01**: Page has descriptive `<title>` replacing the "sync-multi-cam" slug (under 60 chars)
- [ ] **META-02**: Page has `<meta name="description">` with 150-160 char value prop
- [ ] **META-03**: Page has `<link rel="canonical">` pointing to production URL
- [ ] **META-04**: Page has `<meta name="theme-color">` matching the dark app theme

### Social Sharing

- [ ] **SOCIAL-01**: Page has Open Graph tags (og:title, og:description, og:type, og:url, og:image) in static HTML
- [ ] **SOCIAL-02**: Page has `twitter:card` meta tag set to `summary_large_image`
- [ ] **SOCIAL-03**: OG preview image placeholder (1200x630px) exists at a known public path with absolute HTTPS URL in og:image

### Structured Data

- [ ] **SCHEMA-01**: Page has Schema.org WebApplication JSON-LD with name, description, applicationCategory, offers (price: 0), and browserRequirements

### Crawler Infrastructure

- [ ] **CRAWL-01**: `robots.txt` exists at site root allowing all crawlers and referencing sitemap
- [ ] **CRAWL-02**: `sitemap.xml` exists at site root with single URL entry matching canonical
- [ ] **CRAWL-03**: `_headers` file updated to unset COOP/COEP on static SEO assets (og-image, robots.txt, sitemap.xml) so social crawlers can fetch them

### Branding

- [ ] **BRAND-01**: App-specific favicon replaces Vite default (.ico, SVG, and apple-touch-icon.png)

## Future Requirements

Deferred to future release. Tracked but not in current roadmap.

### Content & Marketing

- **CONTENT-01**: Landing page with descriptive content (what, why, how) for indexable text
- **CONTENT-02**: Blog or changelog page for ongoing SEO content

### Platform

- **PLAT-01**: PWA manifest for installability
- **PLAT-02**: Multi-language support (hreflang tags)

## Out of Scope

| Feature | Reason |
|---------|--------|
| `<meta name="keywords">` | Google ignores since 2009; signals outdated SEO practices |
| react-helmet / dynamic meta tags | Single-route SPA; hardcoded index.html is simpler and more reliable |
| SSR / pre-rendering | Single-route app; adds enormous complexity for zero SEO benefit |
| Pre-rendering service (Prerender.io) | Overkill for single-route app; adds cost and third-party dependency |
| Multiple HTML pages | Out of scope for this milestone; no routing or content creation |
| FAQ/HowTo/VideoObject structured data | App is a tool, not content site; would violate Google structured data policies |
| Google Search Console registration | Post-deploy operational task, not a code feature |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| META-01 | Phase 17 | Pending |
| META-02 | Phase 17 | Pending |
| META-03 | Phase 17 | Pending |
| META-04 | Phase 17 | Pending |
| SOCIAL-01 | Phase 17 | Pending |
| SOCIAL-02 | Phase 17 | Pending |
| SOCIAL-03 | Phase 17 | Pending |
| SCHEMA-01 | Phase 17 | Pending |
| CRAWL-01 | Phase 17 | Pending |
| CRAWL-02 | Phase 17 | Pending |
| CRAWL-03 | Phase 17 | Pending |
| BRAND-01 | Phase 17 | Pending |

**Coverage:**
- v2.4 requirements: 12 total
- Mapped to phases: 12
- Unmapped: 0

---
*Requirements defined: 2026-03-29*
*Last updated: 2026-03-29 after roadmap creation*
