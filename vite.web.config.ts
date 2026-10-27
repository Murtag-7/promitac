import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import { rendererConfig, rootDir } from './config/renderer.shared.ts'

/** Renderer in a plain browser with the mocked API – used for Playwright UI tests and screenshots. */
export default defineConfig(() => {
  const base = rendererConfig()
  return {
    ...base,
    mode: 'web',
    define: { 'import.meta.env.VITE_WEB': JSON.stringify('1') },
    server: { port: 5199, strictPort: true },
    preview: { port: 5199, strictPort: true },
    build: { ...base.build, outDir: resolve(rootDir, 'out/web'), emptyOutDir: true }
  }
})
