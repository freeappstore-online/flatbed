import { defineConfig } from 'vitest/config'

// Separate from vite.config.ts so tests don't load the PWA and Tailwind plugins.
// Component tests opt into jsdom with a `// @vitest-environment jsdom` comment.
export default defineConfig({
  test: {
    setupFiles: ['./src/test/setup.ts'],
  },
})
