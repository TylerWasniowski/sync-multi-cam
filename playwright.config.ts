import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  use: {
    baseURL: 'http://localhost:5173',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        // WebCodecs requires secure context; localhost is secure by default
        launchOptions: {
          args: [
            '--enable-features=WebCodecs',
            '--autoplay-policy=no-user-gesture-required',
          ],
        },
      },
    },
    {
      name: 'edge-cdp',
      testMatch: /edge-cdp-test|sync-validation/,
      use: {
        // connectOverCDP handled in test file itself
        browserName: 'chromium',
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
