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

          // Items: stale-while-revalidate (fast, then refresh)
          {
            urlPattern: /\/api\/items(\?|$)/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'api-items',
              expiration: { maxEntries: 1, maxAgeSeconds: 60 * 60 * 24 }, // 1 day
            },
          },
          // Unfiltered locations list (used for dropdowns)
          {
            urlPattern: /\/api\/locations(\?|$)/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'api-locations',
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

          // ====== POST/PATCH APIs (Background Sync Queues) ======

          {
            urlPattern: ({ url }) => url.pathname === '/api/visits',
            handler: 'NetworkOnly',
            method: 'POST',
            options: {
              backgroundSync: {
                name: 'queue-visits',
                options: { maxRetentionTime: 24 * 60 },
              },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname === '/api/deliveries',
            handler: 'NetworkOnly',
            method: 'POST',
            options: {
              backgroundSync: {
                name: 'queue-deliveries',
                options: { maxRetentionTime: 24 * 60 },
              },
            },
          },
          {
            urlPattern: ({ url }) => /^\/api\/visits\/[^/]+\/submit$/.test(url.pathname),
            handler: 'NetworkOnly',
            method: 'POST',
            options: {
              backgroundSync: {
                name: 'queue-visit-submit',
                options: { maxRetentionTime: 24 * 60 },
              },
            },
          },
          {
            urlPattern: ({ url }) => /^\/api\/visits\/[^/]+(?:\/note)?$/.test(url.pathname),
            handler: 'NetworkOnly',
            method: 'PATCH',
            options: {
              backgroundSync: {
                name: 'queue-visit-patch',
                options: { maxRetentionTime: 24 * 60 },
              },
            },
          },
          {
            urlPattern: ({ url }) => /^\/api\/deliveries\/[^/]+$/.test(url.pathname),
            handler: 'NetworkOnly',
            method: 'PATCH',
            options: {
              backgroundSync: {
                name: 'queue-delivery-patch',
                options: { maxRetentionTime: 24 * 60 },
              },
            },
          },
        ],
      },
      manifest: {
        name: 'FirstAid Refill',
        short_name: 'Refill',
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
      '/api': 'http://localhost:4000'
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
