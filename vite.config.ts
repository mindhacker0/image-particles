import { cpSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * `data/` and `imgs/` are referenced at runtime through plain relative paths (by
 * the engine loading sprites, textures and timeline data), so they are shipped
 * verbatim next to the built bundle. `css/` is not copied anymore: it is imported
 * from the module graph and bundled.
 */
const runtimeStaticDirectories = ['data', 'imgs'] as const

function copyRuntimeStaticDirectories(): Plugin {
  let root = process.cwd()

  return {
    name: 'freefall:copy-runtime-static-directories',
    configResolved(config) {
      root = config.root
    },
    closeBundle() {
      const outDir = resolve(root, 'dist')

      for (const directory of runtimeStaticDirectories) {
        const source = resolve(root, directory)
        if (!existsSync(source)) continue
        cpSync(source, resolve(outDir, directory), { recursive: true })
      }
    },
  }
}

export default defineConfig({
  // Relative base keeps the build portable: the original site was served from
  // the `/freefall/` sub-path, while a local preview runs from the root.
  base: './',
  // The engine rewrites the URL path itself (`/random`, `/sphere`, ...), so the
  // SPA fallback is what makes those deep links work locally. Note that a
  // *missing* file is then answered with index.html, which surfaces as a
  // confusing `SyntaxError: Unexpected token '<'` wherever it is loaded.
  plugins: [react(), copyRuntimeStaticDirectories()],
  build: {
    // `assetsInlineLimit: 0` keeps every asset as a separate file, which is what
    // the engine expects (its data URLs and worker scripts are fetched by URL).
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1500,
  },
})
