import { chromium, test, expect } from '@playwright/test';

// Connect to Edge running on Windows via CDP.
// Start Edge first: tests/start-edge.cmd (or it auto-starts below)
const CDP_ENDPOINT = 'http://localhost:9222';

test('export pipeline produces valid MP4 from WebM inputs', async () => {
  // Try to connect to an already-running Edge with CDP
  let browser;
  try {
    browser = await chromium.connectOverCDP(CDP_ENDPOINT);
  } catch {
    // Auto-start Edge with CDP
    console.log('Starting Edge with CDP on port 9222...');
    const { execSync } = await import('child_process');
    execSync(
      `"/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --remote-debugging-port=9222 --headless --disable-gpu --no-first-run --no-default-browser-check --user-data-dir="C:\\Temp\\playwright-edge" &`,
      { stdio: 'ignore', shell: '/bin/bash' },
    );
    // Wait for CDP to be available
    for (let i = 0; i < 20; i++) {
      try {
        const res = await fetch(`${CDP_ENDPOINT}/json/version`);
        if (res.ok) break;
      } catch { /* retry */ }
      await new Promise(r => setTimeout(r, 500));
    }
    browser = await chromium.connectOverCDP(CDP_ENDPOINT);
  }

  const context = await browser.newContext();
  const page = await context.newPage();

  // Collect console logs for debugging
  const logs: string[] = [];
  page.on('console', (msg) => {
    const text = msg.text();
    logs.push(`[${msg.type()}] ${text}`);
    if (msg.type() === 'error') {
      console.error('  BROWSER:', text);
    }
  });

  page.on('pageerror', (err) => {
    console.error('  PAGE ERROR:', err.message);
  });

  try {
    // Navigate to the test harness page
    await page.goto('http://localhost:5173/test-export.html', {
      waitUntil: 'domcontentloaded',
    });

    // Wait for the #status element to change from RUNNING
    await expect(page.locator('#status')).not.toHaveText('RUNNING', {
      timeout: 90_000,
    });

    // Get the final status
    const status = await page.locator('#status').textContent();
    const logContent = await page.locator('#log').textContent();

    // Print full log for debugging
    console.log('\n--- Test Harness Log ---');
    console.log(logContent);
    console.log('--- End Log ---\n');

    // Also print browser console if failed
    if (status !== 'PASS') {
      console.log('\n--- Browser Console ---');
      for (const line of logs) {
        console.log(line);
      }
      console.log('--- End Console ---\n');
    }

    expect(status).toBe('PASS');
  } finally {
    await page.close();
    await context.close();
  }
});
