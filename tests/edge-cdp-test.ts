/**
 * Edge CDP test: connects to a running Edge instance for real HEVC/H.264
 * decoding and full WebCodecs pipeline validation.
 *
 * Uses in-browser fetch() to load test videos from the dev server, bypassing
 * Playwright's 50MB CDP file transfer limit.
 *
 * Prerequisites:
 *   Edge: --remote-debugging-port=9222
 *   Dev server: http://localhost:5173
 *   Test videos: test-videos/ with 2+ video files
 *
 * Run: npx playwright test tests/edge-cdp-test.ts --project=edge-cdp
 */
import { test, expect, chromium } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('real video export via Edge CDP', async () => {
  const testVideosDir = path.resolve(__dirname, '..', 'test-videos');
  if (!fs.existsSync(testVideosDir)) {
    test.skip(true, 'test-videos/ directory not found');
    return;
  }
  const allFiles = fs.readdirSync(testVideosDir)
    .filter(f => /\.(mp4|mov|mkv|webm)$/i.test(f));
  if (allFiles.length < 2) {
    test.skip(true, 'Need at least 2 video files in test-videos/');
    return;
  }

  // Use the two smallest files to keep it fast
  const filesWithSize = allFiles.map(f => ({
    name: f,
    size: fs.statSync(path.join(testVideosDir, f)).size,
  }));
  filesWithSize.sort((a, b) => a.size - b.size);
  const filesToTest = filesWithSize.slice(0, 2);

  console.log('Using test videos:', filesToTest.map(f => `${f.name} (${(f.size / 1024 / 1024).toFixed(0)}MB)`));

  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = await browser.newContext();
  const page = await context.newPage();

  const logs: string[] = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => console.error('  PAGE ERROR:', err.message));

  await page.goto('http://localhost:5173/test-export-real.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#log')).toContainText('Harness ready', { timeout: 10_000 });

  // Bypass 50MB CDP file transfer limit: fetch files from dev server in-browser
  const fileNames = filesToTest.map(f => f.name);
  console.log('Fetching files in-browser from dev server...');

  await page.evaluate(async (names: string[]) => {
    const files: File[] = [];
    for (const name of names) {
      console.log(`[edge-test] Fetching /test-videos/${name}...`);
      const resp = await fetch(`/test-videos/${encodeURIComponent(name)}`);
      if (!resp.ok) throw new Error(`Failed to fetch ${name}: ${resp.status}`);
      const blob = await resp.blob();
      files.push(new File([blob], name, { type: blob.type || 'video/mp4' }));
      console.log(`[edge-test] Fetched ${name}: ${(blob.size / 1024 / 1024).toFixed(1)}MB`);
    }

    // Trigger harness by setting files on the hidden input + dispatching change
    const input = document.getElementById('file-input') as HTMLInputElement;
    const dt = new DataTransfer();
    for (const f of files) dt.items.add(f);
    input.files = dt.files;
    input.dispatchEvent(new Event('change'));
  }, fileNames);

  // Wait for completion (up to 5 min for real video decode+encode)
  await expect(page.locator('#status')).not.toHaveText('RUNNING', { timeout: 300_000 });
  await expect(page.locator('#status')).not.toHaveText('WAITING', { timeout: 5_000 });

  const status = await page.locator('#status').textContent();
  const logContent = await page.locator('#log').textContent();

  console.log('\n--- Real Video Test Log ---');
  console.log(logContent);
  console.log('--- End Log ---\n');

  if (status !== 'PASS') {
    console.log('\n--- Browser Console ---');
    for (const line of logs) console.log(line);
    console.log('--- End Console ---\n');
  }

  await page.close();
  await context.close();

  expect(status).toBe('PASS');
});
