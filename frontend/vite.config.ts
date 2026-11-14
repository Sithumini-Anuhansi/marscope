import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

/**
 * CesiumJS loads its web workers, textures and third-party scripts at runtime
 * from CESIUM_BASE_URL, so those folders must be served as static files.
 * - dev:   served by vite-plugin-static-copy under /cesium
 * - build: copied to dist/cesium
 * Cesium's own CSS (widgets.css) is imported from JS and bundled normally.
 */
const CESIUM_BASE_URL = '/cesium'
const CESIUM_BUILD = 'node_modules/cesium/Build/Cesium'

export default defineConfig({
  define: {
    CESIUM_BASE_URL: JSON.stringify(CESIUM_BASE_URL),
  },
  plugins: [
    react(),
    tailwindcss(),
    viteStaticCopy({
      targets: [
        { src: `${CESIUM_BUILD}/Workers`, dest: 'cesium' },
        { src: `${CESIUM_BUILD}/ThirdParty`, dest: 'cesium' },
        { src: `${CESIUM_BUILD}/Assets`, dest: 'cesium' },
      ],
    }),
  ],
  build: {
    // Cesium is large; it is code-split into the lazy-loaded Mars Explorer route.
    chunkSizeWarningLimit: 6000,
  },
  server: {
    port: 5173,
  },
})
