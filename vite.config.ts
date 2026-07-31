import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Phase 9 offline resilience: precache the app shell so an airplane-mode
    // reload serves the UI (which then shows cached feed data) instead of a
    // white screen. The 3D map itself is loaded from Google's CDN at runtime
    // and needs live tiles, so it's never precached -- the feed screens are
    // the ones built to work offline.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        navigateFallback: '/index.html',
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
