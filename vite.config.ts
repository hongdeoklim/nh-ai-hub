/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  test: {
    // 기본은 node. 컴포넌트 테스트(*.test.tsx)는 파일 첫 줄 `// @vitest-environment jsdom` 으로 DOM 을 켠다.
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png', 'pwa-maskable-512.png'],
      manifest: {
        id: '/',
        name: 'NH-AX-HUB',
        short_name: 'NH-AX-HUB',
        description: 'NH-AX-HUB — 농협네트웍스 임직원 전용 생성형 AI 업무 포털',
        theme_color: '#f5f7f4',
        background_color: '#f5f7f4',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        // 태블릿·데스크톱 PWA 에서 가로 모드를 막지 않는다
        orientation: 'any',
        scope: '/',
        start_url: '/',
        lang: 'ko-KR',
        categories: ['business', 'productivity'],
        // 홈 화면 아이콘 길게 누르기 / 작업 표시줄 점프 리스트
        shortcuts: [
          {
            name: '새 채팅',
            short_name: '채팅',
            url: '/',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }],
          },
          {
            name: '사내 자료실',
            short_name: '자료실',
            url: '/reference-room',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }],
          },
          {
            name: '자동화 스튜디오',
            short_name: '자동화',
            url: '/automation-studio',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }],
          },
          {
            name: '노트북 워크스페이스',
            short_name: '노트북',
            url: '/notebook',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }],
          },
        ],
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
            // 안전 영역(중앙 80%) 안에 로고가 들어가도록 별도 제작
            src: 'pwa-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,woff,webmanifest}'],
        // 무거운 편집기/관리자 청크는 설치 시 프리캐시하지 않고 첫 사용 때 런타임 캐시한다
        // (프리캐시 21MB → 셸 중심으로 축소: 설치·업데이트 다운로드 감소)
        globIgnores: [
          '**/vendor-univer-*.js',
          '**/vendor-mermaid-*.js',
          '**/vendor-graph3d-*.js',
          '**/vendor-d3-*.js',
          '**/vendor-xlsx-*.js',
          '**/page-admin-*.js',
          '**/page-workspace-*.js',
          '**/page-teams-*.js',
        ],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/functions\//],
        runtimeCaching: [
          {
            // 해시가 붙은 빌드 산출물은 불변 → 첫 사용 후 캐시 우선
            urlPattern: ({ url, request }) =>
              url.origin === self.location.origin &&
              url.pathname.startsWith('/assets/') &&
              (request.destination === 'script' || request.destination === 'style'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'app-assets-on-demand',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
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

          // 무거운 라우트 전용 라이브러리는 별도 청크로 분리해 초기 로드에서 제외
          // (전부 lazy 라우트에서만 import 됨: Univer=시트/슬라이드/오피스,
          //  three/force-graph=지식 그래프, mermaid=플래너, xlsx=시트/내보내기).
          if (id.includes('@univerjs') || /[\\/]univer/i.test(id)) return 'vendor-univer'
          // d3 is shared by both mermaid and the 3D graph — keep it separate so
          // the planner (mermaid) doesn't drag in three/force-graph and vice versa.
          if (id.includes('/d3-') || id.includes('\\d3-') || id.includes('/d3/') || id.includes('\\d3\\')) {
            return 'vendor-d3'
          }
          if (
            id.includes('three') ||
            id.includes('force-graph') ||
            id.includes('kapsule')
          ) {
            return 'vendor-graph3d'
          }
          if (
            id.includes('mermaid') ||
            id.includes('dagre') ||
            id.includes('cytoscape') ||
            id.includes('khroma') ||
            id.includes('elkjs')
          ) {
            return 'vendor-mermaid'
          }
          if (id.includes('xlsx')) return 'vendor-xlsx'

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
