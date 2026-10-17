import process from 'node:process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      devOptions: {
        enabled: true, // enables SW in dev for testing
      },
      workbox: {
        runtimeCaching: [
          // ====== GET APIs ======

          // Items and locations: network-first so prices, retired items and
          // renamed locations are current whenever there is a connection.
          // The cached copy is only used offline or on a very slow network.
          {
            urlPattern: /\/api\/items(\?|$)/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-items',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 1, maxAgeSeconds: 60 * 60 * 24 }, // 1 day
            },
          },
          // Unfiltered locations list (used for dropdowns)
          {
            urlPattern: ({ url }) => url.pathname === '/api/locations' && !url.searchParams.get('q'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-locations',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 1, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          // Boxes by location (network-first so we get fresh when online)
          {
            urlPattern: /\/api\/boxes\?location=.*/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-boxes-by-location',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          // Visit detail (so the visit screen opens offline after 1st load)
          {
            urlPattern: /\/api\/visits\/[a-fA-F0-9]{24}$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-visit',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 },
            },
          },

          // POST/PATCH requests are deliberately NOT handled here. Failed writes are
          // queued by the app itself (client/src/offline.js); a second Workbox
          // backgroundSync queue would replay them again and create duplicates.
        ],
      },
      manifest: {
        name: 'IC Supply Delivery',
        short_name: 'IC Supply', // home-screen label: the full name gets cut off on most phones
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#222222',
        icons: [
          { src: '/logo.png', sizes: '192x192', type: 'image/png' },
          { src: '/logo.png', sizes: '512x512', type: 'image/png' }
        ]
      }
    })
  ],
  server: {
    proxy: {
      // DEMO_API=http://localhost:4790 points the dev server at the demo sandbox (server: npm run demo)
      '/api': process.env.DEMO_API || 'http://localhost:4000'
    }
  }
})






// import { defineConfig } from 'vite'
// import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// export default defineConfig({
//   plugins: [react()],
//     server: {
//     proxy: {
//       '/api': 'http://localhost:4000'
//     }
//   }
// })


// export default defineConfig({
//   plugins: [react()],
//   server: {
//     proxy: {
//       '/api': 'http://localhost:4000'
//     }
//   }
// })
