import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin, UserConfig } from 'vite'

/** Repo root – all npm scripts run from here. */
export const rootDir = process.cwd()

export const aliases = {
  '@core': resolve(rootDir, 'src/core'),
  '@shared': resolve(rootDir, 'src/shared'),
  '@': resolve(rootDir, 'src/renderer/src')
}

const CSP = [
  "default-src 'self' app: blob: data:",
  "script-src 'self' app: blob: 'wasm-unsafe-eval'",
  "worker-src 'self' app: blob:",
  "style-src 'self' 'unsafe-inline' app:",
  "img-src 'self' app: blob: data:",
  "media-src 'self' app: blob: data:",
  "font-src 'self' app: data:",
  "connect-src 'self' app: blob: data:"
].join('; ')

/** Production builds get a strict CSP; the dev server needs inline scripts for React refresh. */
function cspPlugin(): Plugin {
  return {
    name: 'promitac-csp',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`)
  }
}

/** Renderer config shared by the Electron build and the plain-browser (web) build. */
export function rendererConfig(): UserConfig {
  return {
    root: resolve(rootDir, 'src/renderer'),
    publicDir: resolve(rootDir, 'src/renderer/public'),
    base: './',
    resolve: { alias: aliases },
    plugins: [react(), tailwindcss(), cspPlugin()],
    worker: { format: 'es' },
    build: {
      target: 'chrome130',
      chunkSizeWarningLimit: 4000
    }
  }
}
