import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import { aliases, rendererConfig, rootDir } from './config/renderer.shared.ts'

const supabaseDefines = {
  'process.env.PROMITAC_SUPABASE_URL': JSON.stringify(process.env.PROMITAC_SUPABASE_URL ?? ''),
  'process.env.PROMITAC_SUPABASE_ANON_KEY': JSON.stringify(process.env.PROMITAC_SUPABASE_ANON_KEY ?? '')
}

export default defineConfig({
  main: {
    resolve: { alias: aliases },
    define: supabaseDefines,
    build: {
      outDir: resolve(rootDir, 'out/main'),
      rollupOptions: { input: { index: resolve(rootDir, 'src/main/index.ts') } }
    }
  },
  preload: {
    resolve: { alias: aliases },
    build: {
      outDir: resolve(rootDir, 'out/preload'),
      rollupOptions: {
        input: { index: resolve(rootDir, 'src/preload/index.ts') },
        output: { format: 'cjs', entryFileNames: '[name].cjs' }
      }
    }
  },
  renderer: {
    ...rendererConfig(),
    build: {
      ...rendererConfig().build,
      outDir: resolve(rootDir, 'out/renderer'),
      rollupOptions: { input: { index: resolve(rootDir, 'src/renderer/index.html') } }
    }
  }
})
