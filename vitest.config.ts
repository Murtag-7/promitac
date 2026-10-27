import { defineConfig } from 'vitest/config'
import { aliases } from './config/renderer.shared.ts'

export default defineConfig({
  resolve: { alias: aliases },
  test: {
    projects: [
      {
        resolve: { alias: aliases },
        test: {
          name: 'unit',
          environment: 'node',
          globals: true,
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.accuracy.test.ts', 'node_modules/**']
        }
      },
      {
        resolve: { alias: aliases },
        test: {
          name: 'ocr',
          environment: 'node',
          globals: true,
          include: ['src/**/*.accuracy.test.ts'],
          testTimeout: 180_000,
          hookTimeout: 180_000
        }
      }
    ]
  }
})
