/**
 * Edge CDP sync validation tests for real multi-camera recordings.
 *
 * Connects to a running Edge instance via CDP, loads test videos from
 * subdirectories, runs the full sync pipeline through the test harness,
 * and verifies offset/confidence values.
 *
 * Prerequisites:
 *   Edge: cmd.exe /c 'start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --remote-debugging-port=9222 --user-data-dir="C:\temp\edge-test-profile"'
 *   Dev server: http://localhost:5173
 *   Test videos: test-videos/Taylor Switft Concert/ and test-videos/Playing with Bruno/
 *
 * Run: npx playwright test tests/sync-validation.spec.ts --project=edge-cdp
 */
import { test, expect, chromium } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Discovery values: update after first successful run
const EXPECTED_TAYLOR_OFFSET = 0; // Discovery value: update after first successful run
const EXPECTED_BRUNO_OFFSET = 0; // Discovery value: update after first successful run

interface SyncResultEntry {
  fileName: string;
  offsetSeconds: number;
  offsetSamples: number;
  confidence: number;
  isReference: boolean;
  confidenceLevel: string;
}

test('Taylor Swift concert videos sync correctly', async () => {
  test.setTimeout(300_000);

  const dir = path.resolve(__dirname, '..', 'test-videos', 'Taylor Switft Concert');
  if (!fs.existsSync(dir)) {
    test.skip(true, 'Taylor Swift test videos not found at test-videos/Taylor Switft Concert/');
    return;
  }

  const fileNames = fs.readdirSync(dir).filter(f => /\.(mp4|mov)$/i.test(f));
  if (fileNames.length < 2) {
    test.skip(true, 'Need at least 2 video files in Taylor Switft Concert directory');
    return;
  }

  console.log('Taylor Swift test videos:', fileNames);

  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = await browser.newContext();
  const page = await context.newPage();

  // Capture browser console for debugging
  const logs: string[] = [];
  page.on('console', msg => {
    const text = `[${msg.type()}] ${msg.text()}`;
    logs.push(text);
    console.log('[browser]', text);
  });
  page.on('pageerror', err => console.error('[page-error]', err.message));

  try {
    await page.goto('http://localhost:5173/test-sync-real.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#log')).toContainText('Harness ready', { timeout: 10_000 });

    // Load files via in-browser fetch (bypasses 50MB CDP limit)
    // Encode subdirectory and filenames separately per Pitfall 6
    await page.evaluate(async (names: string[]) => {
      const files: File[] = [];
      for (const name of names) {
        const url = `/test-videos/Taylor%20Switft%20Concert/${encodeURIComponent(name)}`;
        console.log(`[sync-test] Fetching ${url}...`);
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`Failed to fetch ${name}: ${resp.status}`);
        const blob = await resp.blob();
        files.push(new File([blob], name, { type: blob.type || 'video/mp4' }));
        console.log(`[sync-test] Fetched ${name}: ${(blob.size / 1024 / 1024).toFixed(1)}MB`);
      }

      const input = document.getElementById('file-input') as HTMLInputElement;
      const dt = new DataTransfer();
      for (const f of files) dt.items.add(f);
      input.files = dt.files;
      input.dispatchEvent(new Event('change'));
    }, fileNames);

    // Wait for sync to complete (generous timeout for FFmpeg extraction + GCC-PHAT)
    await expect(page.locator('#status')).toHaveText('COMPLETE', { timeout: 300_000 });

    // Extract results
    const resultsJson = await page.locator('#results').textContent();
    const warningsJson = await page.locator('#warnings').textContent();
    const logContent = await page.locator('#log').textContent();

    console.log('\n--- Taylor Swift Test Log ---');
    console.log(logContent);
    console.log('--- End Log ---\n');

    const results: SyncResultEntry[] = JSON.parse(resultsJson!);
    const warnings = JSON.parse(warningsJson!);

    // Discovery logging
    console.log('DISCOVERY:', JSON.stringify(results, null, 2));
    console.log('DISCOVERY WARNINGS:', JSON.stringify(warnings, null, 2));

    // Assertions (per D-10: 500ms tolerance)
    expect(results).toHaveLength(2);

    const refResults = results.filter(r => r.isReference);
    expect(refResults).toHaveLength(1);

    const nonRef = results.find(r => !r.isReference)!;
    expect(nonRef).toBeDefined();
    expect(Number.isFinite(nonRef.offsetSeconds)).toBe(true);

    // Offset regression check with 500ms tolerance (D-10)
    expect(Math.abs(nonRef.offsetSeconds - EXPECTED_TAYLOR_OFFSET)).toBeLessThan(0.5);

    // Log confidence for discovery - no hard assertion for Taylor Swift
    // since repetitive music content may naturally produce lower confidence
    console.log(`Taylor Swift confidence: ${nonRef.confidence} (${nonRef.confidenceLevel})`);
  } finally {
    await page.close();
    await context.close();
  }
});

test('Playing with Bruno videos sync correctly', async () => {
  test.setTimeout(300_000);

  const dir = path.resolve(__dirname, '..', 'test-videos', 'Playing with Bruno');
  if (!fs.existsSync(dir)) {
    test.skip(true, 'Playing with Bruno test videos not found at test-videos/Playing with Bruno/');
    return;
  }

  const allFiles = fs.readdirSync(dir).filter(f => /\.(mp4|mov)$/i.test(f));
  if (allFiles.length < 2) {
    test.skip(true, 'Need at least 2 video files in Playing with Bruno directory');
    return;
  }

  // Use the 2 smallest files to keep memory reasonable (per anti-pattern)
  // The two smallest are IMG_9950.MOV (262MB) and IMG_7908.MOV (331MB)
  const filesWithSize = allFiles.map(f => ({
    name: f,
    size: fs.statSync(path.join(dir, f)).size,
  }));
  filesWithSize.sort((a, b) => a.size - b.size);
  const filesToTest = filesWithSize.slice(0, 2);
  const fileNames = filesToTest.map(f => f.name);

  console.log('Bruno test videos:', filesToTest.map(f => `${f.name} (${(f.size / 1024 / 1024).toFixed(0)}MB)`));

  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = await browser.newContext();
  const page = await context.newPage();

  // Capture browser console for debugging
  const logs: string[] = [];
  page.on('console', msg => {
    const text = `[${msg.type()}] ${msg.text()}`;
    logs.push(text);
    console.log('[browser]', text);
  });
  page.on('pageerror', err => console.error('[page-error]', err.message));

  try {
    await page.goto('http://localhost:5173/test-sync-real.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#log')).toContainText('Harness ready', { timeout: 10_000 });

    // Load files via in-browser fetch (bypasses 50MB CDP limit)
    // Encode subdirectory and filenames separately per Pitfall 6
    await page.evaluate(async (names: string[]) => {
      const files: File[] = [];
      for (const name of names) {
        const url = `/test-videos/Playing%20with%20Bruno/${encodeURIComponent(name)}`;
        console.log(`[sync-test] Fetching ${url}...`);
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`Failed to fetch ${name}: ${resp.status}`);
        const blob = await resp.blob();
        files.push(new File([blob], name, { type: blob.type || 'video/mp4' }));
        console.log(`[sync-test] Fetched ${name}: ${(blob.size / 1024 / 1024).toFixed(1)}MB`);
      }

      const input = document.getElementById('file-input') as HTMLInputElement;
      const dt = new DataTransfer();
      for (const f of files) dt.items.add(f);
      input.files = dt.files;
      input.dispatchEvent(new Event('change'));
    }, fileNames);

    // Wait for sync to complete (generous timeout for larger files)
    await expect(page.locator('#status')).toHaveText('COMPLETE', { timeout: 300_000 });

    // Extract results
    const resultsJson = await page.locator('#results').textContent();
    const warningsJson = await page.locator('#warnings').textContent();
    const logContent = await page.locator('#log').textContent();

    console.log('\n--- Playing with Bruno Test Log ---');
    console.log(logContent);
    console.log('--- End Log ---\n');

    const results: SyncResultEntry[] = JSON.parse(resultsJson!);
    const warnings = JSON.parse(warningsJson!);

    // Discovery logging
    console.log('DISCOVERY:', JSON.stringify(results, null, 2));
    console.log('DISCOVERY WARNINGS:', JSON.stringify(warnings, null, 2));

    // Assertions (per D-09: 100ms tolerance)
    expect(results).toHaveLength(2);

    const refResults = results.filter(r => r.isReference);
    expect(refResults).toHaveLength(1);

    const nonRef = results.find(r => !r.isReference)!;
    expect(nonRef).toBeDefined();
    expect(Number.isFinite(nonRef.offsetSeconds)).toBe(true);

    // Offset regression check with 100ms tolerance (D-09)
    expect(Math.abs(nonRef.offsetSeconds - EXPECTED_BRUNO_OFFSET)).toBeLessThan(0.1);

    // Confidence assertion (D-11): clear dialogue should produce >50
    expect(nonRef.confidence).toBeGreaterThan(50);

    console.log(`Bruno confidence: ${nonRef.confidence} (${nonRef.confidenceLevel})`);
  } finally {
    await page.close();
    await context.close();
  }
});
