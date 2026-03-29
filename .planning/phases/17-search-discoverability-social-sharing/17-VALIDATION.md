---
phase: 17
slug: search-discoverability-social-sharing
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-29
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual verification (static file phase — no runtime code) |
| **Config file** | none |
| **Quick run command** | `grep -c 'og:title' index.html` |
| **Full suite command** | `grep -c 'og:title\|og:description\|og:image\|twitter:card\|canonical\|application/ld+json' index.html && test -f public/robots.txt && test -f public/sitemap.xml` |
| **Estimated runtime** | ~1 second |

---

## Sampling Rate

- **After every task commit:** Run quick verification grep
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 1 second

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 17-01-01 | 01 | 1 | META-01 | grep | `grep '<title>' index.html` | ✅ | ⬜ pending |
| 17-01-02 | 01 | 1 | META-02 | grep | `grep 'name="description"' index.html` | ✅ | ⬜ pending |
| 17-01-03 | 01 | 1 | META-03 | grep | `grep 'rel="canonical"' index.html` | ✅ | ⬜ pending |
| 17-01-04 | 01 | 1 | META-04 | grep | `grep 'name="theme-color"' index.html` | ✅ | ⬜ pending |
| 17-01-05 | 01 | 1 | SOCIAL-01 | grep | `grep 'og:title' index.html` | ✅ | ⬜ pending |
| 17-01-06 | 01 | 1 | SOCIAL-02 | grep | `grep 'twitter:card' index.html` | ✅ | ⬜ pending |
| 17-01-07 | 01 | 1 | SOCIAL-03 | file | `test -f public/og-image.png` | ❌ W0 | ⬜ pending |
| 17-01-08 | 01 | 1 | SCHEMA-01 | grep | `grep 'WebApplication' index.html` | ✅ | ⬜ pending |
| 17-01-09 | 01 | 1 | CRAWL-01 | file | `test -f public/robots.txt` | ❌ W0 | ⬜ pending |
| 17-01-10 | 01 | 1 | CRAWL-02 | file | `test -f public/sitemap.xml` | ❌ W0 | ⬜ pending |
| 17-01-11 | 01 | 1 | CRAWL-03 | grep | `grep 'og-image.png' public/_headers` | ✅ | ⬜ pending |
| 17-01-12 | 01 | 1 | BRAND-01 | file | `test -f public/favicon.svg && test -f public/favicon.ico` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `public/og-image.png` — 1200x630px placeholder OG image
- [ ] `public/robots.txt` — crawler guidance file
- [ ] `public/sitemap.xml` — single-URL sitemap
- [ ] `public/favicon.svg` — SVG favicon
- [ ] `public/favicon.ico` — ICO favicon (16x16, 32x32)
- [ ] `public/apple-touch-icon.png` — 180x180 touch icon

*These are new static assets created during phase execution.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Social preview renders correctly | SOCIAL-01, SOCIAL-02, SOCIAL-03 | Requires deploying and testing with platform validators (opengraph.xyz, Twitter Card Validator) | Deploy to Cloudflare Pages, paste URL in validator |
| Rich results accepted by Google | SCHEMA-01 | Requires Google Rich Results Test against live URL | Deploy, run Google Rich Results Test |
| Favicon visible in browser tab | BRAND-01 | Visual verification in browser | Open site, verify tab icon is not Vite default |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 1s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
