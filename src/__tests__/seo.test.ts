import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf-8');

describe('SEO: Primary Meta Tags', () => {
  it('META-01: has descriptive title under 60 chars containing "Sync Multi-Cam"', () => {
    const match = html.match(/<title>(.*?)<\/title>/);
    expect(match).toBeTruthy();
    const title = match![1];
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title.length).toBeGreaterThan(10);
    expect(title).toContain('Sync Multi-Cam');
    expect(title).not.toBe('sync-multi-cam');
  });

  it('META-02: has meta description between 150-160 chars', () => {
    const match = html.match(/<meta name="description" content="(.*?)"/);
    expect(match).toBeTruthy();
    const desc = match![1];
    expect(desc.length).toBeGreaterThanOrEqual(150);
    expect(desc.length).toBeLessThanOrEqual(160);
  });

  it('META-03: has canonical URL pointing to production', () => {
    expect(html).toContain('<link rel="canonical" href="https://sync-multi-cam.pages.dev/"');
  });

  it('META-04: has theme-color matching dark app theme', () => {
    expect(html).toContain('<meta name="theme-color" content="#030712"');
  });
});

describe('SEO: Open Graph Tags', () => {
  it('SOCIAL-01: has all 5 required OG tags with correct values', () => {
    expect(html).toMatch(/property="og:type" content="website"/);
    expect(html).toMatch(/property="og:url" content="https:\/\/sync-multi-cam\.pages\.dev\/"/);
    expect(html).toMatch(/property="og:title"/);
    expect(html).toMatch(/property="og:description"/);
    expect(html).toMatch(/property="og:image" content="https:\/\/sync-multi-cam\.pages\.dev\/og-image\.png"/);
  });

  it('SOCIAL-01: og:image includes width and height', () => {
    expect(html).toMatch(/property="og:image:width" content="1200"/);
    expect(html).toMatch(/property="og:image:height" content="630"/);
  });
});

describe('SEO: Twitter Card', () => {
  it('SOCIAL-02: has twitter:card set to summary_large_image', () => {
    expect(html).toMatch(/name="twitter:card" content="summary_large_image"/);
  });

  it('SOCIAL-02: twitter:image uses absolute HTTPS URL', () => {
    expect(html).toMatch(/name="twitter:image" content="https:\/\/sync-multi-cam\.pages\.dev\/og-image\.png"/);
  });
});

describe('SEO: OG Image Asset', () => {
  it('SOCIAL-03: og-image.png exists in public directory', () => {
    expect(existsSync(resolve(__dirname, '../../public/og-image.png'))).toBe(true);
  });

  it('SOCIAL-03: og-image.png is a valid PNG', () => {
    const buffer = readFileSync(resolve(__dirname, '../../public/og-image.png'));
    // PNG magic bytes: 137 80 78 71 (hex: 89 50 4E 47)
    expect(buffer[0]).toBe(0x89);
    expect(buffer[1]).toBe(0x50);
    expect(buffer[2]).toBe(0x4e);
    expect(buffer[3]).toBe(0x47);
  });
});

describe('SEO: JSON-LD Structured Data', () => {
  it('SCHEMA-01: has valid JSON-LD with WebApplication type', () => {
    const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    expect(jsonLdMatch).toBeTruthy();
    const jsonLd = JSON.parse(jsonLdMatch![1]);
    expect(jsonLd['@context']).toBe('https://schema.org');
    expect(jsonLd['@type']).toBe('WebApplication');
    expect(jsonLd.name).toBeTruthy();
    expect(jsonLd.description).toBeTruthy();
    expect(jsonLd.url).toBe('https://sync-multi-cam.pages.dev/');
  });

  it('SCHEMA-01: JSON-LD has required application properties', () => {
    const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    const jsonLd = JSON.parse(jsonLdMatch![1]);
    expect(jsonLd.applicationCategory).toBe('MultimediaApplication');
    expect(jsonLd.operatingSystem).toBe('Any');
    expect(jsonLd.browserRequirements).toContain('WebAssembly');
    expect(jsonLd.browserRequirements).toContain('SharedArrayBuffer');
  });

  it('SCHEMA-01: JSON-LD has free pricing offer', () => {
    const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    const jsonLd = JSON.parse(jsonLdMatch![1]);
    expect(jsonLd.isAccessibleForFree).toBe(true);
    expect(jsonLd.offers).toBeTruthy();
    expect(jsonLd.offers.price).toBe('0');
    expect(jsonLd.offers.priceCurrency).toBe('USD');
  });
});

describe('SEO: Crawler Infrastructure', () => {
  it('CRAWL-01: robots.txt exists and allows all crawlers', () => {
    const content = readFileSync(resolve(__dirname, '../../public/robots.txt'), 'utf-8');
    expect(content).toContain('User-agent: *');
    expect(content).toContain('Allow: /');
    expect(content).toContain('Sitemap: https://sync-multi-cam.pages.dev/sitemap.xml');
  });

  it('CRAWL-02: sitemap.xml exists with canonical URL', () => {
    const content = readFileSync(resolve(__dirname, '../../public/sitemap.xml'), 'utf-8');
    expect(content).toContain('<?xml version');
    expect(content).toContain('<loc>https://sync-multi-cam.pages.dev/</loc>');
  });

  it('CRAWL-03: _headers has COEP/COOP unset for SEO assets', () => {
    const content = readFileSync(resolve(__dirname, '../../public/_headers'), 'utf-8');
    // Global rules still present
    expect(content).toContain('Cross-Origin-Opener-Policy: same-origin');
    expect(content).toContain('Cross-Origin-Embedder-Policy: require-corp');
    // Unset rules for each SEO asset
    const paths = ['/og-image.png', '/robots.txt', '/sitemap.xml', '/favicon.ico', '/apple-touch-icon.png', '/favicon.svg'];
    for (const path of paths) {
      expect(content).toContain(path);
    }
    // Verify unset syntax is used
    expect(content).toContain('! Cross-Origin-Embedder-Policy');
    expect(content).toContain('! Cross-Origin-Opener-Policy');
    // OG image has CORS header
    const ogSection = content.split('/og-image.png')[1]?.split(/\n\/[a-z]/)[0] ?? '';
    expect(ogSection).toContain('Access-Control-Allow-Origin: *');
  });
});

describe('SEO: Favicon & Branding', () => {
  it('BRAND-01: favicon.svg exists and is valid SVG', () => {
    const content = readFileSync(resolve(__dirname, '../../public/favicon.svg'), 'utf-8');
    expect(content).toContain('<svg');
    expect(content).toContain('viewBox');
  });

  it('BRAND-01: favicon.ico exists and is valid ICO', () => {
    const buffer = readFileSync(resolve(__dirname, '../../public/favicon.ico'));
    // ICO magic bytes: 00 00 01 00
    expect(buffer[0]).toBe(0x00);
    expect(buffer[1]).toBe(0x00);
    expect(buffer[2]).toBe(0x01);
    expect(buffer[3]).toBe(0x00);
  });

  it('BRAND-01: apple-touch-icon.png exists and is valid PNG', () => {
    const buffer = readFileSync(resolve(__dirname, '../../public/apple-touch-icon.png'));
    expect(buffer[0]).toBe(0x89);
    expect(buffer[1]).toBe(0x50);
    expect(buffer[2]).toBe(0x4e);
    expect(buffer[3]).toBe(0x47);
  });

  it('BRAND-01: index.html references new favicons, not vite.svg', () => {
    expect(html).not.toContain('vite.svg');
    expect(html).toContain('href="/favicon.ico"');
    expect(html).toContain('href="/favicon.svg"');
    expect(html).toContain('href="/apple-touch-icon.png"');
  });
});

describe('SEO: Anti-patterns excluded', () => {
  it('D-03: no keywords meta tag', () => {
    expect(html).not.toMatch(/name="keywords"/);
  });

  it('no relative og:image URL', () => {
    // og:image must use absolute HTTPS, never relative
    const ogImage = html.match(/property="og:image" content="(.*?)"/);
    expect(ogImage).toBeTruthy();
    expect(ogImage![1]).toMatch(/^https:\/\//);
  });
});
