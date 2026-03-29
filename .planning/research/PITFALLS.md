# Pitfalls Research

**Domain:** Adding SEO (meta tags, OG, structured data, sitemap, robots.txt) to an existing Vite + React 19 SPA on Cloudflare Pages
**Researched:** 2026-03-29
**Confidence:** HIGH (verified against Google official docs, Cloudflare Pages docs, Facebook/Twitter developer docs, react-helmet-async GitHub issues, and community post-mortems)

> **Scope:** This document covers v2.4 SEO pitfalls specific to adding discoverability features to the existing sync-multi-cam SPA. The app is a single-URL SPA (no router, no routes) with COOP/COEP headers for SharedArrayBuffer support, deployed as a static site on Cloudflare Pages at `sync-multi-cam.pages.dev`.

---

## Critical Pitfalls

Mistakes that cause SEO features to silently fail -- crawlers see nothing, social previews are blank, or structured data is invalid.

### Pitfall 1: Social Media Crawlers Cannot See Client-Side Meta Tags

**What goes wrong:**
Facebook, Twitter/X, LinkedIn, Slack, Discord, and iMessage link preview crawlers do **not execute JavaScript**. They fetch the raw HTML response and parse it for OG/Twitter Card meta tags. If meta tags are injected by React (via react-helmet-async or any other client-side library), social crawlers see an empty `<head>` with only the Vite boilerplate `<title>sync-multi-cam</title>`. Result: blank or broken link previews on every social platform.

**Why it happens:**
Developers install react-helmet-async, add `<Helmet>` components, test in a browser (where JS runs), see the meta tags in DevTools, and assume crawlers see the same thing. They do not. Facebook's `facebookexternalhit` user agent, Twitter's `Twitterbot`, and LinkedIn's `LinkedInBot` all make a single HTTP GET request and parse the static HTML. No JavaScript is executed, period.

**How to avoid:**
For a single-URL SPA with no routing, **put all meta tags directly in `index.html`**. This is the simplest and most reliable approach. Since there is only one page, there is no need for dynamic meta tag management. Every OG tag, Twitter Card tag, description, and title should be hardcoded in the HTML `<head>` section of `index.html`. No react-helmet-async needed.

**Warning signs:**
- Facebook Sharing Debugger (https://developers.facebook.com/tools/debug/) shows missing or default OG properties
- Twitter Card Validator shows "No card found"
- Pasting the URL in Slack/Discord shows a bare link with no preview

**Phase to address:**
Phase 1 -- the very first thing implemented. All meta tags must be in `index.html` before any other SEO work.

---

### Pitfall 2: COOP/COEP Headers Block OG Image Fetching by Social Crawlers

**What goes wrong:**
The app currently serves `Cross-Origin-Embedder-Policy: require-corp` and `Cross-Origin-Opener-Policy: same-origin` on **all responses** via `public/_headers`. These headers are required for SharedArrayBuffer (used by FFmpeg WASM). However, when a social media crawler fetches the page and then tries to fetch the `og:image`, the COEP `require-corp` header on the image response tells the crawler's HTTP client that the resource requires CORP authorization. Social crawlers are not browsers -- they do not understand or negotiate CORP/CORS. The image fetch may silently fail, resulting in link previews with no image.

Additionally, the `og:image` must point to an image served from the same domain (or a domain that responds with appropriate CORS headers). If the image is served with COEP `require-corp`, external scrapers may be unable to load it.

**Why it happens:**
The `_headers` file applies COOP/COEP to `/*` (all paths). This was the correct approach when the only content was the app itself. But now static assets like `og-image.png`, `robots.txt`, and `sitemap.xml` also get these headers, which is unnecessary and potentially harmful for crawlers.

**How to avoid:**
Use Cloudflare Pages `_headers` path-specific rules with the `!` (unset) syntax to remove COOP/COEP from static SEO assets:

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

**Warning signs:**
- Facebook Debugger shows "Could not fetch image" or no image preview
- Twitter Card Validator shows card with missing image
- `curl -I https://sync-multi-cam.pages.dev/og-image.png` shows COEP/COOP headers on the image

**Phase to address:**
Phase 1 -- must be addressed when adding OG image. The `_headers` file modification is a prerequisite for social sharing to work.

---

### Pitfall 3: Duplicate Content from pages.dev and Custom Domain

**What goes wrong:**
Cloudflare Pages exposes every deployment at `project-name.pages.dev` AND any custom domain. Google indexes both, treating them as duplicate content. This dilutes link equity and can cause "Duplicate without user-selected canonical" warnings in Google Search Console. Worse: the `pages.dev` URL cannot be disabled.

**Why it happens:**
Cloudflare Pages always serves the `pages.dev` subdomain. Developers add a custom domain but forget to tell search engines which URL is authoritative. Without a canonical tag or `X-Robots-Tag: noindex` on the `pages.dev` domain, both URLs compete for ranking.

**How to avoid:**
Two-pronged approach (do both):

1. Add `<link rel="canonical" href="https://sync-multi-cam.pages.dev/" />` in `index.html` (use whatever the primary domain is). This is critical even if no custom domain exists yet -- it establishes the canonical URL upfront.

2. If a custom domain is added later, add `X-Robots-Tag: noindex` to `_headers` for the pages.dev subdomain:
   ```
   https://sync-multi-cam.pages.dev/*
     X-Robots-Tag: noindex
   ```
   This prevents the pages.dev version from being indexed while the custom domain version remains indexable.

**Warning signs:**
- Google Search Console shows "Duplicate without user-selected canonical" for URLs
- Both `pages.dev` and custom domain appear in Google search results
- Link equity split across two URLs

**Phase to address:**
Phase 1 -- canonical tag goes in `index.html` alongside other meta tags.

---

### Pitfall 4: Schema.org SoftwareApplication Missing Required Properties

**What goes wrong:**
Google's Rich Results for SoftwareApplication require specific properties to be eligible for the software app rich result panel. If `name`, `offers` (with `price`), and either `aggregateRating` or `review` are missing, the structured data is valid JSON-LD but Google silently ignores it -- no rich result appears, and developers wonder why.

**Why it happens:**
Developers copy a basic Schema.org SoftwareApplication example from the schema.org website (which lists all properties as optional) without checking Google's stricter rich results requirements. Google requires `aggregateRating` OR `review` -- but this app has no user reviews or ratings system. Adding fabricated ratings violates Google's guidelines and risks a manual action penalty.

**How to avoid:**
Use `WebApplication` (subtype of SoftwareApplication) with honest properties:
- `name`: "Sync Multi-Cam"
- `applicationCategory`: "MultimediaApplication"
- `operatingSystem`: "Any" (browser-based)
- `offers`: `{ "@type": "Offer", "price": "0", "priceCurrency": "USD" }`

For `aggregateRating`: **Do NOT include it** unless there are real reviews. Google explicitly warns against fabricated ratings. The structured data will still be valid and provide some search signal, but will not qualify for the rich result panel with star ratings. This is acceptable -- better than a manual penalty.

Consider using `WebApplication` as the `@type` instead of generic `SoftwareApplication`, since this is a browser-based tool accessed via URL, not a downloadable application.

**Warning signs:**
- Google Rich Results Test (https://search.google.com/test/rich-results) shows "missing field" errors
- Schema Markup Validator shows valid JSON-LD but Rich Results Test shows no eligible results
- Adding fake `aggregateRating` with `ratingCount: 0` triggers quality violation

**Phase to address:**
Phase 2 (structured data phase) -- after basic meta tags are in place.

---

### Pitfall 5: robots.txt Accidentally Blocks JavaScript/CSS Assets

**What goes wrong:**
A robots.txt with overly broad `Disallow` rules blocks Googlebot from fetching the JavaScript bundle and CSS files needed to render the page. Since Google uses a two-phase indexing system (fetch HTML first, then render JS), blocking JS/CSS assets means Google's renderer cannot build the page DOM. The page appears blank to Google even though the HTML itself was crawled successfully.

**Why it happens:**
Developers copy robots.txt templates that include `Disallow: /assets/` or `Disallow: /*.js` patterns intended for other purposes. Vite outputs JS/CSS to `/assets/` by default. Blocking this path means Googlebot cannot render the page.

**How to avoid:**
Keep robots.txt minimal. For a single-URL SPA:
```
User-agent: *
Allow: /

Sitemap: https://sync-multi-cam.pages.dev/sitemap.xml
```

Do NOT disallow `/assets/`, `/static/`, or any path containing JS/CSS bundles. The only things worth disallowing are truly private paths (none exist in this static SPA).

**Warning signs:**
- Google Search Console "URL Inspection" shows "Page could not be rendered"
- Google Search Console "robots.txt Tester" shows JS/CSS files blocked
- Google's cached version of the page shows blank content

**Phase to address:**
Phase 1 -- robots.txt is created alongside other static files.

---

### Pitfall 6: og:image Uses Relative URL Instead of Absolute URL

**What goes wrong:**
Open Graph requires absolute URLs with protocol (`https://`) for `og:image`. Using a relative URL like `/og-image.png` or a protocol-relative URL like `//sync-multi-cam.pages.dev/og-image.png` causes Facebook, Twitter, and all other social platforms to fail to resolve and fetch the image. The link preview renders with no image.

**Why it happens:**
Developers are accustomed to using relative paths for all other HTML assets (scripts, stylesheets, images) and use the same pattern for OG tags. Vite's asset pipeline also encourages relative paths. But OG scraping happens outside the context of a browser with a base URL -- scrapers need the full, absolute URL to fetch the image.

**How to avoid:**
Always use the full absolute URL:
```html
<meta property="og:image" content="https://sync-multi-cam.pages.dev/og-image.png" />
```

Same rule applies to `og:url`, `og:image:url`, and `twitter:image`.

**Warning signs:**
- Facebook Debugger shows "Provided og:image URL was not valid"
- Image path starts with `/` or `//` instead of `https://`

**Phase to address:**
Phase 1 -- when adding OG tags to `index.html`.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Using react-helmet-async for a single-page app with no routes | Feels "React-like" | Adds dependency, tags invisible to social crawlers, React 19 compatibility complications (`prioritizeSeoTags` broken, `htmlAttributes`/`bodyAttributes` use DOM manipulation) | Never for this project -- hardcode in `index.html` |
| Generating sitemap.xml dynamically with a plugin | Auto-discovers routes | Over-engineered for a single-URL app; adds build dependency for a file with one entry | Never for this project -- write the 8-line XML by hand |
| Using `vite-plugin-html` to inject meta tags at build time | Feels cleaner than editing raw HTML | Adds a build dependency, obscures what's in the HTML, harder to debug when OG tags break | Acceptable only if the app grows to have multiple pages |
| Skipping `og:image` to ship faster | One less asset to create | Social sharing produces ugly bare-link previews indefinitely; first impressions matter | Never -- OG image is table stakes for shareability |
| Adding fake aggregateRating to get rich results | Gets star ratings in Google SERPs immediately | Violates Google quality guidelines, risks manual penalty, loss of all rich results | Never |

## Integration Gotchas

Common mistakes when interacting with external services and crawlers.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Facebook Sharing Debugger | Testing only once, not realizing Facebook aggressively caches OG data | After any OG change, use the debugger to "Scrape Again" to force cache refresh. Facebook caches OG data for hours/days. |
| Twitter Card Validator | Not setting `twitter:card` to `summary_large_image` | Without explicit `twitter:card` meta tag, Twitter defaults to `summary` (small image) or no card at all. Always specify `summary_large_image` for visual tools. |
| Google Search Console | Expecting instant indexing after deploying meta tags | Google's two-phase indexing can take days to weeks. Use "Request Indexing" in URL Inspection for faster pickup. Structured data changes take even longer. |
| Google Rich Results Test | Assuming valid JSON-LD = rich result eligibility | Google's Rich Results Test is separate from the Schema.org validator. Valid JSON-LD does not mean Google will show a rich result. Check the Rich Results Test specifically. |
| Slack/Discord link previews | Assuming OG tags are enough | Slack and Discord also look for `twitter:card` tags as fallback, and have their own caching behavior. Test by posting the URL in a DM to yourself. |
| Cloudflare caching | Deploying OG changes but seeing old previews | Cloudflare caches HTML responses. After deploying OG changes, purge the cache via Cloudflare dashboard or API. Social media platforms also cache independently. |
| LinkedIn post inspector | Not using the LinkedIn Post Inspector tool | LinkedIn has its own OG scraper with its own cache. Use https://www.linkedin.com/post-inspector/ to force re-scrape after changes. |

## Performance Traps

Patterns that impact page load, crawl efficiency, or Core Web Vitals.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| OG image too large (>1MB) | Social preview loads slowly or times out; Facebook may fail to fetch | Keep OG image under 300KB. Use JPEG or WebP at 1200x630px. Compress with quality 80-85%. | Facebook times out fetching images >5MB; all platforms sluggish with >1MB |
| JSON-LD script tag blocks parsing | Extremely large JSON-LD blocks in `<head>` add to HTML parse time | Keep JSON-LD minimal -- only required properties. For a single-page tool, the JSON-LD will be small (<1KB). | Not a real concern at this project's scale |
| Missing `width`/`height` on OG image | Social platforms make extra HEAD request to determine image dimensions, adding latency to preview generation | Include `og:image:width` and `og:image:height` meta tags to let platforms know dimensions upfront | Noticeable on platforms with aggressive timeout for image dimension detection |
| Sitemap with wrong lastmod dates | Googlebot treats stale lastmod dates as unreliable and may deprioritize crawling | Use actual deployment date for `<lastmod>`. For a static site, update this value in the build process or manually on each release. | Google documentation explicitly warns against inaccurate lastmod |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Removing COOP/COEP globally to fix social sharing | SharedArrayBuffer stops working, breaking FFmpeg WASM and the entire sync pipeline | Only remove COOP/COEP from specific static asset paths (og-image, robots.txt, sitemap.xml), never from the root HTML or JS bundles |
| Exposing internal paths in sitemap.xml | Information disclosure about app structure | Only include the single canonical URL in sitemap.xml. No internal/admin/debug paths exist in this app, but the principle applies. |
| Using `Access-Control-Allow-Origin: *` on HTML pages | Allows any origin to embed or read the page content | Only add `Access-Control-Allow-Origin: *` to the OG image file, not to HTML or JS. The OG image is public by design. |

## UX Pitfalls

Common user experience mistakes when implementing SEO for a tool-type SPA.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Generic title like "sync-multi-cam" | Users cannot distinguish the page in browser tabs; Google shows unhelpful SERP listing | Use a descriptive title: "Sync Multi-Cam - Free Browser-Based Multi-Camera Video Sync Tool" |
| OG description that is too technical | Social shares look intimidating to non-technical users; lower click-through rate | Write the OG description for the target user: "Sync multiple camera angles by audio, preview in a grid, and export a single composite video. Runs entirely in your browser -- no uploads, no installs." |
| Missing OG image entirely | Social shares look like spam links with no visual; dramatically lower engagement | Create a branded OG image showing the app UI or a visual representation of multi-cam sync. 1200x630px, JPEG/PNG. |
| `<meta name="description">` duplicates `og:description` exactly | Missed opportunity -- Google meta description and social preview have different optimal lengths and tones | Write them separately. Meta description: 150-160 chars for SERP. OG description: can be longer, more conversational for social context. |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Title tag:** Verify it appears in `<title>` element AND in `og:title` AND in `twitter:title` -- all three are needed and should match (or be intentionally different)
- [ ] **OG image URL:** Verify it is an absolute HTTPS URL, not relative. `curl -I` the exact URL to confirm it resolves and returns 200.
- [ ] **OG image dimensions:** Verify `og:image:width` (1200) and `og:image:height` (630) meta tags are present alongside `og:image`
- [ ] **OG image COEP headers:** Verify the image response does NOT include `Cross-Origin-Embedder-Policy: require-corp` by curling the image URL and checking response headers
- [ ] **Canonical URL:** Verify `<link rel="canonical">` uses absolute URL with protocol, matches `og:url`, and points to the primary domain
- [ ] **robots.txt accessibility:** Verify `https://sync-multi-cam.pages.dev/robots.txt` returns 200 (not 404, not a redirect to index.html)
- [ ] **sitemap.xml accessibility:** Verify `https://sync-multi-cam.pages.dev/sitemap.xml` returns 200 with correct `Content-Type: application/xml`
- [ ] **Schema.org validation:** Test JSON-LD with BOTH Google's Rich Results Test AND Schema.org Validator -- they check different things
- [ ] **Facebook scrape test:** Use Facebook Sharing Debugger to scrape the live URL and verify all OG properties appear
- [ ] **Twitter card test:** Paste URL in a tweet draft (or use Card Validator) to confirm `summary_large_image` card renders
- [ ] **pages.dev noindex:** If using a custom domain, verify `X-Robots-Tag: noindex` header is present on `*.pages.dev` responses but NOT on custom domain responses
- [ ] **robots.txt does NOT block assets:** Verify `/assets/` path is not disallowed -- Googlebot needs JS/CSS to render the SPA
- [ ] **HTML lang attribute:** Verify `<html lang="en">` is present (already there, but confirm it survives changes)
- [ ] **Viewport meta tag:** Verify `<meta name="viewport">` is present (already there, critical for mobile indexing)

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Social crawlers see blank OG tags | LOW | Move meta tags from React components to `index.html`. Re-scrape via Facebook Debugger / Twitter Card Validator. Social caches refresh within hours. |
| COOP/COEP blocking OG image | LOW | Update `_headers` file to unset headers on image path. Deploy. Purge Cloudflare cache. Re-scrape via social debuggers. |
| Duplicate content (pages.dev + custom domain) | MEDIUM | Add canonical tag and X-Robots-Tag noindex on pages.dev. Request re-indexing via Google Search Console. Deduplication may take weeks. |
| Invalid Schema.org structured data | LOW | Fix JSON-LD, validate with Rich Results Test, deploy. Rich results can take days-weeks to appear after fix. |
| robots.txt blocking JS assets | MEDIUM | Fix robots.txt, deploy. Use Google Search Console "robots.txt Tester" to verify. Request re-indexing. Google re-renders on its own schedule (days-weeks). |
| Fake aggregateRating penalized | HIGH | Remove fabricated rating immediately. Submit reconsideration request to Google. Manual action penalties can take months to lift. |
| OG image relative URL | LOW | Change to absolute URL in `index.html`. Deploy. Re-scrape via Facebook Debugger. |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Social crawlers can't see JS meta tags | Phase 1 (HTML meta tags) | Facebook Sharing Debugger shows all OG properties from live URL |
| COOP/COEP blocks OG image | Phase 1 (OG tags + _headers update) | `curl -I` og-image URL shows no COEP header; Facebook Debugger shows image |
| pages.dev duplicate content | Phase 1 (canonical tag) | Canonical tag in HTML source matches primary domain URL |
| Schema.org missing required fields | Phase 2 (structured data) | Google Rich Results Test shows no errors for required fields |
| robots.txt blocks assets | Phase 1 (robots.txt creation) | Google Search Console robots.txt Tester shows no blocked resources |
| og:image relative URL | Phase 1 (OG tags) | View source confirms absolute `https://` URL for og:image |
| Generic/missing title | Phase 1 (meta tags) | `<title>` contains descriptive product name and value prop |
| OG image too large | Phase 1 (OG image creation) | Image file is <300KB, 1200x630px, JPEG or PNG |
| Fake aggregateRating | Phase 2 (structured data) | JSON-LD has no aggregateRating unless real reviews exist |
| Stale sitemap lastmod | Phase 1 (sitemap creation) | `<lastmod>` date matches or is close to deployment date |

## Platform-Specific Gotchas

Differences in how major platforms handle OG/meta tags.

| Platform | Gotcha | Mitigation |
|----------|--------|------------|
| Facebook | Caches OG data aggressively (hours to days). Requires `og:image` minimum 200x200px (600x314px recommended). Does not execute JS. | Always test with Sharing Debugger. Use "Scrape Again" after deploys. |
| Twitter/X | Requires explicit `twitter:card` meta tag. Falls back to OG tags for title/description/image if `twitter:*` equivalents missing. Minimum image 300x157px for large card. | Always include `twitter:card` with value `summary_large_image`. |
| LinkedIn | Has its own scraper and cache, separate from Facebook. Requires `og:image` to be >1200px wide for full-width display. | Test with LinkedIn Post Inspector. |
| Slack | Reads OG tags and also `twitter:card` as fallback. Caches previews per-workspace. | No way to force cache clear in Slack. Wait for expiry or append a query parameter. |
| Discord | Reads OG tags. Caches aggressively per-server. Shows `og:description` and `og:image`. | Similar to Slack. Append `?v=2` to URL to bust cache for testing. |
| iMessage | Reads OG tags from the initial HTML. Very simple scraper. | If it works for Facebook, it works for iMessage. |
| Google | Executes JavaScript (headless Chromium) but in a delayed second wave. Respects canonical, robots.txt, sitemap. | Meta tags in HTML are still better for instant first-wave indexing. |
| AI crawlers (GPTBot, ClaudeBot) | Do NOT execute JavaScript. Read only static HTML. | Static meta tags in `index.html` are the only way these crawlers see content. |

## Sources

- [Google: JavaScript SEO Basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
- [Google: SoftwareApplication Structured Data](https://developers.google.com/search/docs/appearance/structured-data/software-app)
- [Google: Canonical URLs](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [Cloudflare Pages: Custom Headers](https://developers.cloudflare.com/pages/configuration/headers/)
- [Cloudflare Pages: Preview Deployments (noindex)](https://developers.cloudflare.com/pages/configuration/preview-deployments/)
- [Facebook: Sharing Webmasters Guide](https://developers.facebook.com/docs/sharing/webmasters/)
- [Twitter/X: Summary Card with Large Image](https://developer.x.com/en/docs/x-for-websites/cards/overview/summary-card-with-large-image)
- [MDN: Cross-Origin-Embedder-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy)
- [web.dev: Making your website cross-origin isolated (COOP/COEP)](https://web.dev/articles/coop-coep)
- [react-helmet-async: React 19 support issues](https://github.com/staylor/react-helmet-async/issues/238)
- [Cloudflare Community: X-Robots-Tag noindex on pages.dev](https://community.cloudflare.com/t/add-x-robots-tag-noindex-to-deafult-pages-dev-subdomain-for-hugo-website/337232)
- [Open Graph Facebook Client-Side Rendering](https://whatabout.dev/open-graph-facebook-and-client-side-rendering/)
- [Dynamic Social Previews for SPA with HTMLRewriter](https://medium.com/@_jonas/dynamic-social-previews-for-your-spa-and-htmlrewriter-8423cdebd7e6)

---
*Pitfalls research for: Adding SEO to existing Vite + React 19 SPA on Cloudflare Pages*
*Researched: 2026-03-29*
