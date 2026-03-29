# Roadmap: Sync Multi-Cam

## Milestones

- ✅ **v1.0 MVP** — Phases 1-4 (shipped 2026-03-02)
- ✅ **v2.0 Synced Playback & Export** — Phases 5-9 (shipped 2026-03-04)
- ✅ **v2.1 UI Polish** — Phases 10-11 (shipped 2026-03-08)
- ✅ **v2.2 Cursor Fixes & UI Cleanup** — Phases 12-13 (shipped 2026-03-29)
- ✅ **v2.3 Robust Audio Sync** — Phases 14-16 (shipped 2026-03-29)
- 🚧 **v2.4 SEO** — Phase 17 (in progress)

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

<details>
<summary>v1.0 MVP (Phases 1-4) — SHIPPED 2026-03-02</summary>

- [x] Phase 1: Foundation and File Input (3/3 plans) — completed 2026-03-02
- [x] Phase 2: Audio Sync Engine (2/2 plans) — completed 2026-03-02
- [x] Phase 3: Video Trimming and Output (2/2 plans) — completed 2026-03-02
- [x] Phase 4: Waveform Visualization (4/4 plans) — completed 2026-03-02

</details>

<details>
<summary>v2.0 Synced Playback & Export (Phases 5-9) — SHIPPED 2026-03-04</summary>

- [x] Phase 5: Video Grid & Synchronized Playback (3/3 plans) — completed 2026-03-02
- [x] Phase 6: Audio Mixing (1/1 plan) — completed 2026-03-02
- [x] Phase 7: Waveform Scrubbar Integration (2/2 plans) — completed 2026-03-03
- [x] Phase 8: Composite Export (2/2 plans) — completed 2026-03-03
- [x] Phase 9: Polish (1/1 plan) — completed 2026-03-03

</details>

<details>
<summary>v2.1 UI Polish (Phases 10-11) — SHIPPED 2026-03-08</summary>

- [x] Phase 10: Visual Feedback Polish (1/1 plan) — completed 2026-03-07
- [x] Phase 11: Export Bar Redesign (1/1 plan) — completed 2026-03-07

</details>

<details>
<summary>v2.2 Cursor Fixes & UI Cleanup (Phases 12-13) — SHIPPED 2026-03-29</summary>

- [x] Phase 12: Playback Cursor Fixes (1/1 plan) — completed 2026-03-09
- [x] Phase 13: UI Cleanup (1/1 plan) — completed 2026-03-29

</details>

<details>
<summary>v2.3 Robust Audio Sync (Phases 14-16) — SHIPPED 2026-03-29</summary>

- [x] Phase 14: DSP Foundation (1/1 plan) — completed 2026-03-29
- [x] Phase 15: Worker Integration + Pipeline Swap (3/3 plans) — completed 2026-03-29
- [x] Phase 16: Validation + Confidence Tuning (2/2 plans) — completed 2026-03-29

</details>

### v2.4 SEO (In Progress)

**Milestone Goal:** Make the app discoverable via search engines and shareable on social platforms.

- [ ] **Phase 17: Search Discoverability & Social Sharing** - Add all SEO meta tags, social sharing tags, structured data, crawler files, and branded assets to static HTML and public directory

## Phase Details

### Phase 17: Search Discoverability & Social Sharing
**Goal**: The app is fully discoverable by search engines, renders rich link previews on all social platforms, and presents a professional branded identity
**Depends on**: Phase 16
**Requirements**: META-01, META-02, META-03, META-04, SOCIAL-01, SOCIAL-02, SOCIAL-03, SCHEMA-01, CRAWL-01, CRAWL-02, CRAWL-03, BRAND-01
**Success Criteria** (what must be TRUE):
  1. Sharing the app URL on any social platform (Facebook, Twitter/X, LinkedIn, Discord, Slack) shows a rich preview with title, description, and image rather than a bare link
  2. Viewing the page source shows a descriptive title, meta description, canonical URL, and theme-color in the `<head>` -- no Vite defaults remain
  3. Visiting `/robots.txt` and `/sitemap.xml` in a browser returns valid crawler files (not the SPA fallback HTML)
  4. The browser tab shows a custom app favicon, not the Vite default icon
  5. Google's Rich Results Test accepts the page's JSON-LD as valid WebApplication structured data
**Plans:** 2 plans

Plans:
- [ ] 17-01-PLAN.md — Create static SEO assets (robots.txt, sitemap.xml, og-image, favicons) and update _headers
- [ ] 17-02-PLAN.md — Rewrite index.html with all SEO tags and create validation test suite

## Progress

**Execution Order:**
Phases execute in numeric order.

| Phase | Milestone | Plans | Status | Completed |
|-------|-----------|-------|--------|-----------|
| 1. Foundation and File Input | v1.0 | 3/3 | Complete | 2026-03-02 |
| 2. Audio Sync Engine | v1.0 | 2/2 | Complete | 2026-03-02 |
| 3. Video Trimming and Output | v1.0 | 2/2 | Complete | 2026-03-02 |
| 4. Waveform Visualization | v1.0 | 4/4 | Complete | 2026-03-02 |
| 5. Video Grid & Synchronized Playback | v2.0 | 3/3 | Complete | 2026-03-02 |
| 6. Audio Mixing | v2.0 | 1/1 | Complete | 2026-03-02 |
| 7. Waveform Scrubbar Integration | v2.0 | 2/2 | Complete | 2026-03-03 |
| 8. Composite Export | v2.0 | 2/2 | Complete | 2026-03-03 |
| 9. Polish | v2.0 | 1/1 | Complete | 2026-03-03 |
| 10. Visual Feedback Polish | v2.1 | 1/1 | Complete | 2026-03-07 |
| 11. Export Bar Redesign | v2.1 | 1/1 | Complete | 2026-03-07 |
| 12. Playback Cursor Fixes | v2.2 | 1/1 | Complete | 2026-03-09 |
| 13. UI Cleanup | v2.2 | 1/1 | Complete | 2026-03-29 |
| 14. DSP Foundation | v2.3 | 1/1 | Complete | 2026-03-29 |
| 15. Worker Integration + Pipeline Swap | v2.3 | 3/3 | Complete | 2026-03-29 |
| 16. Validation + Confidence Tuning | v2.3 | 2/2 | Complete | 2026-03-29 |
| 17. Search Discoverability & Social Sharing | v2.4 | 0/2 | Not started | - |
