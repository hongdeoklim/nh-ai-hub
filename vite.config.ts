import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'pwa-192x192.png', 'pwa-512x512.png'],
      manifest: {
        name: 'NH-AX-HUB',
        short_name: 'NH-AX-HUB',
        description: 'NH AI Inside Hub — 사내 AI 업무 포털',
        theme_color: '#020617',
        background_color: '#020617',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        lang: 'ko-KR',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,woff,webmanifest}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/functions\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.hostname.includes('supabase.co'),
            handler: 'NetworkOnly',
            options: {
              cacheName: 'supabase-network-only',
            },
          },
          {
            urlPattern: ({ url }) =>
              url.pathname.includes('/functions/v1/') ||
              url.pathname.includes('/auth/v1/') ||
              url.pathname.includes('/rest/v1/') ||
              url.pathname.includes('/realtime/v1/'),
            handler: 'NetworkOnly',
            options: {
              cacheName: 'supabase-path-network-only',
            },
          },
          {
            urlPattern: ({ request }) => request.method !== 'GET',
            handler: 'NetworkOnly',
            options: {
              cacheName: 'non-get-network-only',
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            if (id.includes('/src/pages/admin/')) return 'page-admin'
            if (
              id.includes('/src/pages/ReferenceRoom') ||
              id.includes('/src/pages/WorkspaceIntegrationsPage')
            ) {
              return 'page-workspace'
            }
            if (
              id.includes('/src/pages/TeamsPage') ||
              id.includes('/src/pages/TeamDetailPage') ||
              id.includes('/src/pages/TeamSharedChatPage')
            ) {
              return 'page-teams'
            }
            return undefined
          }

          if (id.includes('@supabase')) return 'vendor-supabase'
          if (id.includes('react-router')) return 'vendor-router'
          if (
            id.includes('@ai-sdk') ||
            id.includes('/ai/') ||
            id.includes('\\ai\\')
          ) {
            return 'vendor-ai'
          }
          if (id.includes('react-dom') || id.includes('/react/')) {
            return 'vendor-react'
          }
          return 'vendor'
        },
      },
    },
  },
})
