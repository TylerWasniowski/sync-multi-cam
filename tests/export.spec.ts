import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Test 1: Synthetic videos — creates 2 WebM test videos in-browser via
 * MediaRecorder and runs the full export pipeline (demux -> decode ->
 * composite -> encode -> mux). Fast and dependency-free.
 */
test('export pipeline produces valid MP4 from synthetic WebM inputs', async ({ page }) => {
  const logs: string[] = [];
  page.on('console', (msg) => {
    logs.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', (err) => {
    console.error('  PAGE ERROR:', err.message);
  });

  await page.goto('/test-export.html', { waitUntil: 'domcontentloaded' });

  // Wait for #status to change from RUNNING (up to 90s for export)
  await expect(page.locator('#status')).not.toHaveText('RUNNING', {
    timeout: 90_000,
  });

  const status = await page.locator('#status').textContent();
  const logContent = await page.locator('#log').textContent();

  console.log('\n--- Test Harness Log ---');
  console.log(logContent);
  console.log('--- End Log ---\n');

  if (status !== 'PASS') {
    console.log('\n--- Browser Console ---');
    for (const line of logs) console.log(line);
    console.log('--- End Console ---\n');
  }

  expect(status).toBe('PASS');
});

/**
 * Test 2: Real test videos from test-videos/ directory — uses Playwright's
 * setInputFiles for efficient native file access (no HTTP fetch for large files).
 * Exports 3 seconds at 640x480 to verify HEVC/H.264 demux+decode works.
 *
 * NOTE: Headless Chromium cannot decode HEVC. If all test videos are HEVC,
 * the harness reports SKIP instead of FAIL, and this test still passes.
 */
test('export pipeline produces valid MP4 from real test videos', async ({ page }) => {
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

  // Prefer MP4 files (likely H.264) over MOV (likely HEVC) for headless compatibility.
  // Sort: .mp4 first, then .webm, then .mkv, then .mov
  const codecPriority = (f: string) => {
    const ext = path.extname(f).toLowerCase();
    if (ext === '.mp4') return 0;
    if (ext === '.webm') return 1;
    if (ext === '.mkv') return 2;
    return 3; // .mov (HEVC)
  };
  allFiles.sort((a, b) => codecPriority(a) - codecPriority(b));

  // Use first 2 files after sorting
  const filesToTest = allFiles.slice(0, 2).map(f => path.join(testVideosDir, f));
  console.log('Using test videos:', filesToTest.map(f => path.basename(f)));

  const logs: string[] = [];
  page.on('console', (msg) => {
    logs.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', (err) => {
    console.error('  PAGE ERROR:', err.message);
  });

  await page.goto('/test-export-real.html', { waitUntil: 'domcontentloaded' });

  // Wait for harness to be ready
  await expect(page.locator('#log')).toContainText('Harness ready', { timeout: 10_000 });

  // Set files via native input (efficient, no HTTP transfer)
  await page.locator('#file-input').setInputFiles(filesToTest);

  // Wait for status to leave RUNNING (up to 120s for real videos)
  await expect(page.locator('#status')).not.toHaveText('RUNNING', {
    timeout: 120_000,
  });
  // Also ensure it's not still WAITING
  await expect(page.locator('#status')).not.toHaveText('WAITING', {
    timeout: 5_000,
  });

  const status = await page.locator('#status').textContent();
  const logContent = await page.locator('#log').textContent();

  console.log('\n--- Real Video Test Log ---');
  console.log(logContent);
  console.log('--- End Log ---\n');

  if (status !== 'PASS' && !status?.startsWith('SKIP:')) {
    console.log('\n--- Browser Console ---');
    for (const line of logs) console.log(line);
    console.log('--- End Console ---\n');
  }

  // PASS = full success; SKIP = codec not available (expected in headless for HEVC)
  expect(status).toMatch(/^(PASS|SKIP:)/);
});
