# Project Research Summary

**Project:** Sync Multi-Cam — v2.4 SEO Milestone
**Domain:** SEO and social sharing for a single-URL client-side SPA on Cloudflare Pages
**Researched:** 2026-03-29
**Confidence:** HIGH

## Executive Summary

v2.4 adds search engine discoverability and social sharing to an existing single-page application. This is the simplest milestone in the project's history: zero new npm dependencies, zero runtime code changes, zero build pipeline modifications. The entire scope is editing two existing files and creating three new static files in `public/` plus one design asset. The key architectural insight from all four research streams is that this app has one URL, one page, and no client-side routing — which eliminates the entire class of SPA-SEO complexity (react-helmet, prerendering, SSR) that dominates SEO guides for React apps. Hardcoding all meta tags directly in `index.html` is not a shortcut; it is the correct and only reliable approach for this use case.

The recommended approach executes in two tight phases: first, add all meta tags and create required static assets (title, description, canonical, Open Graph, Twitter Card, robots.txt, sitemap.xml, favicon, OG image); second, add Schema.org structured data and run post-deployment validation against platform-specific tools. The only non-trivial work item is creating the OG image (1200x630px design asset) — everything else is static text totaling approximately 54 lines across five files. Social crawlers (Facebook, Twitter/X, LinkedIn, Discord, Slack, AI bots) do NOT execute JavaScript and will see only what is hardcoded in `index.html`, so that is where all tags go.

The primary risk is project-specific and non-obvious: the existing `_headers` file applies `Cross-Origin-Embedder-Policy: require-corp` to all paths (required for SharedArrayBuffer/FFmpeg WASM). Social media crawlers are not browsers and cannot negotiate CORP/CORS, so they may silently fail to fetch the OG image. The mitigation is to unset COEP/COOP on the specific SEO asset paths (`/og-image.png`, `/robots.txt`, `/sitemap.xml`) using Cloudflare Pages path-specific `!` unset syntax — preserving SharedArrayBuffer support on the app while making SEO assets crawler-accessible. This `_headers` update must ship in the same deployment as the OG image.

## Key Findings

### Recommended Stack

No new dependencies. All SEO assets are implemented as static files and direct HTML edits. This is not a simplification — it is the architecturally correct approach for a single-URL SPA. Adding any library (react-helmet, vite-plugin-html, schema-dts) would move static strings into JavaScript or build configuration, adding complexity without improving what crawlers see. Crawlers read raw HTML; the tags must exist in `index.html` regardless of any runtime library.

**Core "technologies" (all static, no packages):**
- Static `index.html` meta tags — all SEO, OG, Twitter Card tags — social crawlers read raw HTML only, no JS executes
- Inline JSON-LD `<script type="application/ld+json">` in `<head>` — Schema.org structured data — Google's recommended format; static JSON for a single-page tool
- `public/robots.txt` — 4 lines, crawler directives with sitemap reference — Vite copies to dist root automatically
- `public/sitemap.xml` — 8-line XML for single URL — no generator needed
- `public/og-image.png` — 1200x630px PNG — the only design asset in this milestone; under 300KB target
- `public/_headers` modification — unset COOP/COEP on SEO asset paths, preserve on app HTML/JS/WASM — project-critical, non-obvious

**What NOT to add:**
- `react-helmet-async` — adds runtime dependency to solve a non-existent problem; React 19 has documented compatibility issues with it; tags must be in static HTML regardless
- Any Vite meta tag plugin — moves static strings out of HTML into build config; adds fragility with zero benefit
- Any SSR/SSG framework — SharedArrayBuffer + COOP/COEP makes SSR impractical; app value is 100% client-side
- `<meta name="keywords">` — Google ignores since 2009; documented as potentially treated as spam signal by Bing

### Expected Features

**Must have (table stakes) — ship in v2.4:**
- Descriptive `<title>` tag — current "sync-multi-cam" is a project slug, not a product name; direct ranking signal
- `<meta name="description">` — enables SERP snippet text; currently absent
- `<link rel="canonical">` — establishes authoritative URL; prevents pages.dev duplicate content issues if custom domain added later
- Open Graph tags (`og:title`, `og:description`, `og:type`, `og:url`, `og:image`) — required for any link preview on any social platform
- OG preview image (1200x630px PNG) — the only item requiring design work; competitors like Syncaila are missing `og:image`, making this a differentiator
- `twitter:card` meta tag set to `summary_large_image` — required for Twitter/X large image card; without it, previews default to small or nothing
- `robots.txt` — allows all, references sitemap; minimal and permissive
- `sitemap.xml` — single URL entry
- App-specific favicon — replaces generic Vite default (`vite.svg`)
- `_headers` COOP/COEP update — unset headers on OG image, robots.txt, sitemap paths; add `Access-Control-Allow-Origin: *` on OG image

**Should have (competitive differentiators) — include in v2.4:**
- Schema.org `WebApplication` JSON-LD — more specific than competitors (Syncaila uses generic `WebPage` schema); includes `browserRequirements`, `featureList`, `offers` for free tool
- `og:image:width` / `og:image:height` meta tags — prevents extra HEAD requests by platforms to detect image dimensions
- `<meta name="theme-color">` — aligns mobile browser chrome color with app's dark theme; low effort cosmetic touch

**Post-deployment operational tasks (v2.4, but not code):**
- Google Search Console registration and sitemap submission — accelerates initial indexing
- Facebook Sharing Debugger scrape and Twitter Card Validator check — verify previews render correctly on live URL

**Defer to v3+:**
- Landing page with descriptive content — adds indexable text beyond app shell; out of scope for this milestone
- PWA manifest — installability could conflict with COOP/COEP requirements
- Multi-language hreflang tags — not relevant until international audience established

**Drop entirely (anti-features):**
- `<meta name="keywords">` — listed in PROJECT.md as a target; research recommends dropping it; Google ignores, Bing may penalize
- Fake `aggregateRating` — violates Google quality guidelines; risks manual action penalty; omit unless real reviews exist

### Architecture Approach

The SEO integration splits into two static layers with no new source files in `src/` and no changes to the build pipeline. The build-time layer is `index.html` — all meta tags, OG tags, Twitter Card, canonical URL, and JSON-LD go directly in `<head>` as static HTML, hardcoded at development time. The static asset layer is the `public/` directory — Vite copies it to `dist/` root unchanged during `vite build`, and Cloudflare Pages serves those files before the SPA fallback, meaning `/robots.txt` returns the actual file rather than `index.html`. No `_routes.json` configuration needed; this behavior is the Cloudflare Pages default.

**Major components:**
1. `index.html` (modified) — the single source of truth for all crawler-visible metadata; title, description, canonical, OG tags, Twitter Card, JSON-LD; must be static HTML
2. `public/og-image.png` (new) — 1200x630px design asset; only file requiring non-code work; under 300KB; referenced via absolute HTTPS URL in OG tags
3. `public/robots.txt` + `public/sitemap.xml` (new) — 4-line and 8-line static text files; sitemap URL must match canonical exactly
4. `public/_headers` (modified) — path-specific COOP/COEP rules; unsets headers on `/og-image.png`, `/robots.txt`, `/sitemap.xml`; preserves headers on `/*` for SharedArrayBuffer
5. `public/favicon.svg` (new) — replaces generic Vite icon; referenced in `index.html` as root-relative `/favicon.svg` (not absolute HTTPS)

### Critical Pitfalls

1. **Social crawlers never execute JavaScript** — Facebook, Twitter, LinkedIn, Slack, Discord, and all AI crawlers (GPTBot, ClaudeBot) make one HTTP GET and parse raw HTML. Client-side meta tag injection via react-helmet is invisible to them. For this single-URL app, all tags must be hardcoded in `index.html`. Test with Facebook Sharing Debugger after deployment.

2. **COOP/COEP headers block OG image fetching by social crawlers** — The existing `_headers` applies `Cross-Origin-Embedder-Policy: require-corp` to `/*`, including the OG image. Social crawlers cannot negotiate CORP/CORS. Use Cloudflare Pages `!` syntax to unset COEP/COOP on `/og-image.png` and add `Access-Control-Allow-Origin: *`. Critical: do NOT remove COEP globally — SharedArrayBuffer and FFmpeg WASM would stop working. This must ship in the same deployment as OG tag addition.

3. **`og:image` must use absolute HTTPS URL** — OG scraping has no browser context and no base URL resolution. Using `/og-image.png` silently fails on every social platform. Use `https://sync-multi-cam.pages.dev/og-image.png`. Same rule applies to `og:url` and `twitter:image`. Relative paths work for favicon but not for OG tags.

4. **Canonical URL must be established immediately** — Even without a custom domain today, `<link rel="canonical" href="https://sync-multi-cam.pages.dev/" />` must go in Phase 1. Cloudflare Pages exposes every project at both `pages.dev` and any custom domain; without canonical, Google may index both and split ranking signals. Recovery from duplicate content indexing takes weeks.

5. **Schema.org rich results require reviews this app does not have** — Google's `SoftwareApplication` rich result panel requires `aggregateRating` or `review`. This app has no review system. Do NOT add fabricated ratings — this violates Google's quality guidelines and risks a manual action penalty that can take months to lift. The structured data is still valid and useful for Google's understanding without rich result eligibility.

## Implications for Roadmap

Based on research, this milestone fits cleanly into two phases. The total code change is small enough that a single phase is also viable — see alternative note below.

### Phase 1: Core Meta Tags and Static SEO Assets

**Rationale:** All table-stakes features are static file changes with no code dependencies between them. They belong together in a single phase. The `_headers` COOP/COEP update is tightly coupled to OG image creation — both must ship together to prevent broken social previews. The OG image is a design dependency that gates the OG tags, so it comes first.

**Delivers:** Full discoverability and social shareability — correct SERP listing, link previews on all platforms (Facebook, Twitter/X, LinkedIn, Discord, Slack, iMessage), canonical URL established, crawler guidance in place.

**Addresses features from FEATURES.md:**
- Descriptive title tag, meta description, canonical URL
- All five Open Graph required tags
- OG preview image (1200x630px)
- `twitter:card` meta tag
- `robots.txt` and `sitemap.xml`
- App-specific favicon
- `_headers` COOP/COEP unset on SEO asset paths

**Avoids pitfalls from PITFALLS.md:**
- Social crawlers ignoring JS — by using static HTML only, no react-helmet
- COOP/COEP blocking OG image — by updating `_headers` in same deployment
- og:image relative URL — by using absolute HTTPS URL
- Missing canonical URL — by adding it alongside other meta tags
- robots.txt blocking JS assets — by using minimal permissive robots.txt (Allow: / only)

**Implementation order within phase (dependencies matter):**
1. Create OG image design asset (other steps reference it)
2. Create favicon SVG (replace vite.svg)
3. Update `index.html` — add all meta tags, OG tags, Twitter Card, canonical, JSON-LD
4. Create `public/robots.txt`
5. Create `public/sitemap.xml`
6. Update `public/_headers` — unset COOP/COEP on SEO asset paths, add CORS on OG image

### Phase 2: Structured Data Verification and Post-Deploy Validation

**Rationale:** Schema.org JSON-LD can be written in Phase 1 (it goes in `index.html`), but validation with Google's Rich Results Test requires a live deployed URL. Grouping validator testing and Google Search Console setup with a post-deployment pass creates a natural quality checkpoint. This phase is primarily operational with minor code tweaks if validators surface issues.

**Delivers:** Verified structured data, confirmed social preview rendering across all major platforms, Google Search Console monitoring active, any discovered issues from Phase 1 corrected.

**Addresses features from FEATURES.md:**
- Schema.org WebApplication JSON-LD verification (code ships in Phase 1, confirmed in Phase 2)
- `og:image:width` / `og:image:height` meta tags (if not included in Phase 1)
- `<meta name="theme-color">` (low priority, fits here)
- Post-deployment operational tasks: Google Search Console, Facebook Debugger, Twitter Card Validator, LinkedIn Post Inspector

**Avoids pitfalls from PITFALLS.md:**
- Schema.org missing required properties — validate with Google Rich Results Test
- COOP/COEP blocking OG image — verify with `curl -I` and Facebook Sharing Debugger
- Full "Looks Done But Isn't" checklist from PITFALLS.md

### Alternative: Single Phase

Given the scope (~54 lines of code/config + 1-2 image assets), this milestone could reasonably be a single phase. The two-phase split is recommended only if:
- OG image design takes time and delays code work
- Structured data validation is treated as a mandatory gate before milestone close

If the OG image is ready early, everything including JSON-LD can ship together.

### Phase Ordering Rationale

- Static file changes have no code dependencies between them — they all belong in Phase 1 rather than split across phases
- The `_headers` COOP/COEP update MUST be in the same deployment as the OG image — shipping OG tags without the headers fix causes broken social previews in production immediately
- OG image design gates OG tags; it is the critical path item
- Structured data validation cannot precede deployment; Phase 2 is logically post-Phase 1
- The JSON-LD `name` and `description` should align with `<title>` and `<meta description>` — Phase 1 establishes the canonical copy, Phase 2 validates it

### Research Flags

Phases with standard patterns — no additional research needed during planning:
- **Phase 1:** All implementation details are fully specified in STACK.md and ARCHITECTURE.md with exact file contents, tag values, and `_headers` syntax provided verbatim. Execute directly against research output.
- **Phase 2:** Validation tool URLs and procedures are documented in PITFALLS.md with specific checklist items. Google Search Console setup follows official documentation. No research needed.

No phases require `/gsd:research-phase` during planning. Research is complete and implementation-ready for direct execution.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Zero-dependency approach verified against Vite docs, Cloudflare Pages docs, and Google's official SPA SEO guidance. Alternatives considered and rejected with documented rationale. |
| Features | HIGH | SEO tag specifications are official standards (OG protocol, Twitter developer docs, Google Structured Data docs). keywords meta tag deprecation confirmed by official Google statement since 2009. Competitor analysis of Syncaila verified by direct inspection. |
| Architecture | HIGH | Vite public/ directory behavior, Cloudflare Pages static serving order before SPA fallback, and `_headers` `!` unset syntax all verified against official documentation. |
| Pitfalls | HIGH | COOP/COEP interaction with social crawlers is the non-obvious project-specific finding, verified against MDN, Cloudflare Pages docs, and Facebook developer docs. Social crawler JS non-execution verified against Twitter/Facebook official developer documentation. |

**Overall confidence:** HIGH

### Gaps to Address

- **OG image design content:** Research specifies dimensions (1200x630px), format (PNG), file size target (<300KB), safe zone (60-80px padding), and content guidance (app name + tagline + multi-cam grid visual). The actual visual design requires human creative input. Not a technical gap — an execution dependency with clear constraints.

- **COOP/COEP `!` unset syntax confirmation:** The Cloudflare Pages `!` header unset syntax is documented in official Cloudflare docs but should be verified to work as expected after the first deployment. Use `curl -I https://sync-multi-cam.pages.dev/og-image.png` to confirm the header is absent. Recovery is straightforward if it does not work as expected.

- **Rich result eligibility without reviews:** The structured data will be valid but will not generate star ratings without `aggregateRating`. This is an intentional informed decision. The gap is acceptable; fabricating ratings to gain rich results would risk a manual penalty.

- **Custom domain future-proofing:** If a custom domain is added after this milestone, canonical URL, OG URLs, sitemap URLs, and `_headers` noindex on `pages.dev` all need updating. PITFALLS.md documents the exact changes required. Flag for any future custom domain milestone.

## Sources

### Primary (HIGH confidence — official specifications)

- [Open Graph Protocol (ogp.me)](https://ogp.me/) — required OG tags, type definitions, absolute URL requirement for og:image
- [Google: SoftwareApplication Structured Data](https://developers.google.com/search/docs/appearance/structured-data/software-app) — required properties for rich results, aggregateRating requirement
- [Google: JavaScript SEO Basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics) — Googlebot rendering behavior, recommendation for static HTML
- [Google: Keywords meta tag not used](https://developers.google.com/search/blog/2009/09/google-does-not-use-keywords-meta-tag) — official deprecation statement (2009)
- [Twitter/X Cards Markup](https://developer.twitter.com/en/docs/twitter-for-websites/cards/overview/markup) — twitter:card requirement, OG fallback behavior
- [Vite Static Asset Handling](https://vite.dev/guide/assets) — public/ directory copy behavior, no config required
- [Cloudflare Pages Headers](https://developers.cloudflare.com/pages/configuration/headers/) — path-specific header rules, `!` unset syntax for inherited headers
- [Schema.org WebApplication](https://schema.org/WebApplication) — WebApplication as SoftwareApplication subtype, browserRequirements property
- [MDN: Cross-Origin-Embedder-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy) — COEP behavior and scope, does not apply to non-browser HTTP clients
- [Facebook: Sharing Webmasters Guide](https://developers.facebook.com/docs/sharing/webmasters/) — OG requirements, crawler behavior, caching

### Secondary (MEDIUM confidence — community sources, cross-verified)

- [OG Image Dimensions Guide (og-image.org)](https://og-image.org/learn/og-image-size) — 1200x630px universal standard, Twitter 2:1 crop note
- [Cloudflare Pages robots.txt Community Thread](https://community.cloudflare.com/t/robots-txt-cloudflare-page/636861) — confirmed: files in public/ deploy and serve correctly at root
- [DEV Community: SEO for React + Vite](https://dev.to/ali_dz/optimizing-seo-in-a-react-vite-project-the-ultimate-guide-3mbh) — general SPA SEO best practices, confirms static HTML approach
- Syncaila.com direct inspection — competitor SEO implementation; missing og:image, uses generic WebPage schema rather than WebApplication

---
*Research completed: 2026-03-29*
*Ready for roadmap: yes*
