import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons.svg', 'soccer-icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'FM FC',
        short_name: 'FM FC',
        description: 'FM FC 축구 동호회 전용 앱',
        start_url: '/',
        display: 'standalone',
        background_color: '#0f172a',
        theme_color: '#10b981',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '384x384',
            type: 'image/png',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '1024x1024',
            type: 'image/png',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '1024x1024',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
      },
    }),
  ],
})