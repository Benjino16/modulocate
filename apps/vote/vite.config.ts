import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

// Served under /voting behind Traefik (see compose.dev.yaml, compose.yaml and
// infra/traefik/dynamic.yml), so base matches the router's basepath in
// main.tsx. host: true so the dev server listens on all interfaces inside
// the container, not just its own loopback. hmr.clientPort points the
// browser's HMR websocket back at Traefik's public entrypoint instead of
// the container's internal port; no hmr.host, so it defaults to whatever
// hostname/IP the browser actually used (modulocate.localhost, a LAN IP,
// <hostname>.local via mDNS) — Traefik's routing isn't Host-restricted
// either, so any of those works for LAN/phone testing. The dev server port
// itself is no longer externally load-bearing (purely internal to the
// Docker network now).
export default defineConfig({
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss()],
  base: '/voting/',
  server: {
    host: true,
    port: 5174,
    hmr: {
      clientPort: 80,
    },
  },
})
