import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

// Port is fixed (not Vite's 5173 default) because the worker's voting-invite
// email hardcodes VOTE_APP_URL=http://localhost:5174 as its fallback, and the
// backend's CORS origin list expects this app on 5174 specifically — see
// apps/worker/src/processors/votingInvite.ts and apps/backend/src/index.ts.
export default defineConfig({
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss()],
  server: {
    port: 5174,
  },
})
