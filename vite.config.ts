import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // Pinned, and made to fail rather than drift. Vite's default is to take the
  // next free port when 5173 is busy, which is easy to miss -- and the Google
  // Maps key is restricted by referrer, so a dev server that quietly came up
  // on 5174 gets its map rejected and renders blank with nothing in the UI to
  // say why. Better to refuse to start and name the conflict.
  server: { port: 5173, strictPort: true },
  plugins: [
    react(),
    tailwindcss(),
    // Phase 9 offline resilience: precache the app shell so an airplane-mode
    // reload serves the UI (which then shows cached feed data) instead of a
    // white screen. The 3D map itself is loaded from Google's CDN at runtime
    // and needs live tiles, so it's never precached -- the feed screens are
    // the ones built to work offline.
    VitePWA({
      // 'prompt', not 'autoUpdate': autoUpdate reloads the page the moment a
      // new service worker installs, which lands mid-gesture if you happen to
      // be dragging a node when a deploy goes out -- the app appearing to
      // reload out of nowhere. The new version installs in the background and
      // takes over on the next load instead.
      registerType: 'prompt',
      injectRegister: 'auto',
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        navigateFallback: '/index.html',
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
      manifest: {
        name: 'Kamogawa Commons',
        // What fits under a home-screen icon -- about twelve characters before
        // it truncates, which is exactly what the nickname is for.
        short_name: 'KamoComo',
        lang: 'ja',
        theme_color: '#2E3A59',
        background_color: '#E9E4D8',
        display: 'standalone',
        icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' }],
      },
    }),
  ],
})
