import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'happy-dom',
    // the suite runs 40+ files in parallel workers; a Primer-heavy render can
    // spend >5s waiting on CPU even though its own work takes ~500ms.
    testTimeout: 15000,
    include: ['src/**/*.test.{ts,tsx}'],
    server: {
      deps: {
        inline: [/@primer\/react/, /@primer\/octicons-react/, /@primer\/live-region-element/],
      },
    },
    coverage: {
      provider: 'v8',
      include: ['src/lib/**'],
      reporter: ['text', 'lcov', 'cobertura', 'json-summary'],
      reportsDirectory: './coverage',
    },
  },
})
