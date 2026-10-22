import { defineConfig, devices } from '@playwright/test';

const APP_PORT = 4321;
const BASE_URL = `http://localhost:${APP_PORT}`;

export default defineConfig({
  expect: {
    timeout: 10_000,
  },
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  retries: process.env.CI ? 1 : 0,
  testDir: './e2e',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: BASE_URL,
    launchOptions: {
      args: ['--autoplay-policy=no-user-gesture-required'],
    },
    trace: 'on-first-retry',
  },
  webServer: {
    command: `pnpm exec vite --port ${APP_PORT} --strictPort`,
    reuseExistingServer: !process.env.CI,
    url: BASE_URL,
  },
  workers: 1,
});
