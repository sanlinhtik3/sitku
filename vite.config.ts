import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: process.env.VITE_DESKTOP_BUILD === "true" ? "./" : "/",
  server: {
    // Strict loopback bind. The old "::" (= IPv6 0.0.0.0, all interfaces) let
    // any device on the same Wi-Fi reach the dev server at <this-ip>:8080 and
    // read the running app — a real data-leak vector for a local-first app.
    // 127.0.0.1 closes that: the dev server is reachable ONLY from this machine.
    // (The desktop Electron dev script passes --host 127.0.0.1 too, so this just
    // makes the default `npm run dev` equally safe.)
    host: "127.0.0.1",
    port: 8080,
  },
  build: {
    rollupOptions: {
      output: {
        // ponytail: keep almost everything in ONE `vendor` chunk — the old fine-grained
        // splits cycled (recharts/d3 → "ca" TDZ; supabase ↔ react → "f is not a function").
        // The ONLY safe carve-outs are heavy, ROUTE-SPECIFIC libraries pulled out WITH all
        // their own deps into a single self-contained chunk (so there's no cross-chunk cycle),
        // and only used by lazy routes — so they leave the eager first-paint bundle:
        //   • charts = recharts + its d3 family  → only the CFO/finance overlays (lazy)
        //   • editor = codemirror + lezer        → only the markdown editor (lazy)
        // Each imports `vendor` one-directionally; vendor never imports them back → no cycle.
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]node_modules[\\/](recharts|victory-vendor|d3-[a-z]+|internmap|delaunator|robust-predicates)[\\/]/.test(id)) return 'charts';
          if (/[\\/]node_modules[\\/](@codemirror|@lezer|@marijn|crelt|style-mod|w3c-keyname)[\\/]/.test(id)) return 'editor';
          return 'vendor';
        },
      },
    },
    // Enable source maps for production debugging
    sourcemap: 'hidden',
    // Target modern browsers for smaller bundles
    target: 'es2020',
    // Chunk size warnings
    chunkSizeWarningLimit: 500,
  },
  plugins: [
    tailwindcss(),
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['pwa-192x192.png', 'pwa-512x512.png', 'robots.txt'],
      manifest: {
        name: 'Sitku',
        short_name: 'Sitku',
        description: 'A focused AI agent workspace for chat, tools, memory, and automations.',
        theme_color: '#0a0f1e',
        background_color: '#0a0f1e',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/sitku',
        categories: ['productivity', 'utilities'],
        shortcuts: [
          {
            name: 'Sitku',
            short_name: 'Sitku',
            description: 'Open the Sitku agent',
            url: '/sitku',
            icons: [{ src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' }]
          }
        ],
        screenshots: [
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            form_factor: 'narrow'
          }
        ],
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
      // Import custom push service worker
        importScripts: ['/push-sw.js'],
        // Only precache static assets - NOT JS/CSS chunks (prevents stale deploys)
        globPatterns: ['**/*.{ico,png,jpg,jpeg,svg,woff,woff2,gif,webp}'],
        // Clean up old caches
      cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB
        // Prevent caching OAuth redirect routes
        navigateFallbackDenylist: [/^\/~oauth/],
        // Skip waiting to activate new service worker immediately
        skipWaiting: true,
        clientsClaim: true,
        // Runtime caching strategies
        runtimeCaching: [
          {
            // CRITICAL: SSE streams and edge functions must bypass SW completely
            // This MUST come before the general supabase.co rule
            urlPattern: /\/functions\/v1\//i,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 // 24 hours
              },
              cacheableResponse: {
                statuses: [0, 200]
              },
              networkTimeoutSeconds: 10
            }
          },
          {
            urlPattern: /^https:\/\/images\.unsplash\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
              }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              }
            }
          },
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
              }
            }
          },
          {
            urlPattern: ({ request }) => request.destination === 'document',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pages-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 // 24 hours
              }
            }
          },
          {
            // Hashed assets are immutable — CacheFirst for instant loads
            urlPattern: ({ request }) => request.destination === 'script' || request.destination === 'style',
            handler: 'CacheFirst',
            options: {
              cacheName: 'assets-cache',
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days (hash changes on update)
              }
            }
          }
        ]
      },
      devOptions: {
        enabled: false // Disable in development
      }
    })
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Optimize dependencies
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query'],
  },
}));
