import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['__tests__/**/*.{test,spec}.ts'],
    globals: true,
    // Files that exercise the Electron runtime use real fs.watch and SQLite
    // locks. Keeping the suite serial makes those integration contracts
    // deterministic without changing the production retry timings.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
