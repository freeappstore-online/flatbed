import { defineConfig, devices } from '@playwright/test'

// End-to-end tests against the production build (vite preview), so the
// service worker and offline behaviour are the real thing. The camera is a
// fake: e2e/fake-camera.ts feeds a drawn page into getUserMedia.
// E2E_BASE_URL=https://flatbed.freeappstore.online runs them on the live site instead.
const PORT = 4173
const LIVE = process.env.E2E_BASE_URL

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: LIVE ?? `http://localhost:${PORT}`,
    permissions: ['camera'],
    trace: 'retain-on-failure',
    acceptDownloads: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Pixel 7'] } }],
  webServer: LIVE
    ? undefined
    : {
        command: `pnpm build && pnpm preview --port ${PORT} --strictPort`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})
