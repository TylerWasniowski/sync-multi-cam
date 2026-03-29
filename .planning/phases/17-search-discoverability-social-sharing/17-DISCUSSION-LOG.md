# Phase 17: Search Discoverability & Social Sharing - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-29
**Phase:** 17-search-discoverability-social-sharing
**Areas discussed:** Page copy, OG image strategy, Favicon design, COOP/COEP headers
**Mode:** --auto (all decisions auto-selected)

---

## Page Title & Description Copy

| Option | Description | Selected |
|--------|-------------|----------|
| Claude's Discretion | Craft SEO-optimized copy based on app purpose and research | ✓ |
| User provides copy | User writes title and description | |

**User's choice:** [auto] Claude's Discretion (recommended default)
**Notes:** User stated they don't know anything about SEO. Research provides clear guidance: title under 60 chars with brand + value prop, description 150-160 chars. Keywords meta tag explicitly dropped per research.

---

## OG Image Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Placeholder with instructions | Create simple placeholder, document path for user to replace | ✓ |
| Skip until user provides | Leave og:image tag empty | |
| Auto-generate from screenshot | Capture app UI as preview | |

**User's choice:** [auto] Placeholder with instructions (recommended default)
**Notes:** User confirmed they'll prepare an image and asked to be told where to put it. Placeholder ensures OG tags work immediately on deploy while user prepares final asset.

---

## Favicon Design

| Option | Description | Selected |
|--------|-------------|----------|
| Claude's Discretion | Create SVG favicon matching dark theme | ✓ |
| User provides design | Wait for user to supply favicon assets | |

**User's choice:** [auto] Claude's Discretion (recommended default)
**Notes:** No existing brand mark. App uses dark theme. Multi-camera/grid icon concept fits the tool's purpose.

---

## COOP/COEP Header Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Path-specific unset rules | Unset COOP/COEP for specific SEO asset paths | ✓ |
| Broad unset for /public/ | Unset for all static assets | |
| No header changes | Hope crawlers handle COOP/COEP | |

**User's choice:** [auto] Path-specific unset rules (recommended default)
**Notes:** Research identified COOP/COEP as critical blocker for social crawler OG image fetching. Surgical path-specific rules maintain security for the app while allowing crawlers to access SEO assets.

---

## Claude's Discretion

- Exact title and description wording
- Favicon visual design
- Placeholder OG image design
- theme-color hex value
- Meta tag ordering in `<head>`

## Deferred Ideas

None — discussion stayed within phase scope.
