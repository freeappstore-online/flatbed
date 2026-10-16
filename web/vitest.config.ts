import { defineConfig } from 'vitest/config'

// Separate from vite.config.ts so tests don't load the PWA and Tailwind plugins.
// Component tests opt into jsdom with a `// @vitest-environment jsdom` comment.
export default defineConfig({
  test: {
    // Unit and component tests only; e2e/*.spec.ts are Playwright's (pnpm test:e2e).
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
  },
})
