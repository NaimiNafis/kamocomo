import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import cesium from 'vite-plugin-cesium'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    cesium(),
    // Phase 9 offline resilience: precache the app shell so an airplane-mode
    // reload serves the UI (which then shows cached feed data) instead of a
    // white screen. The large Cesium runtime assets under /cesium/ are left
    // out of the precache -- the globe needs live tiles anyway, and precaching
    // ~15 MB of workers/imagery would bloat install for no offline benefit.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        globIgnores: ['cesium/**'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/cesium\//],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
      manifest: {
        name: 'Virtual Kamogawa',
        short_name: 'Kamogawa',
        lang: 'ja',
        theme_color: '#2E3A59',
        background_color: '#E9E4D8',
        display: 'standalone',
        icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' }],
      },
    }),
  ],
})
