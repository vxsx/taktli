import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure' },
  webServer: {
    command: 'pnpm build && pnpm exec vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: 'iphone-webkit', use: { ...devices['iPhone 14 landscape'] } },
    {
      name: 'android-chromium',
      use: { ...devices['Pixel 7 landscape'], launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } },
    },
    // Desktop runs only the tests tagged @desktop (the rest rely on touch).
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, grep: /@desktop/ },
  ],
});
